'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Banknote, QrCode, CheckCircle2, Loader2, Printer, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useCart } from '@/stores/cart.store';
import { submitOrderWithFallback, submitSettleWithFallback } from '@/hooks/useOfflineQueue';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { sendToCustomerDisplay } from '@/lib/customerDisplay';
import { computePricing, DEFAULT_TAX_CONFIG } from '@/lib/pricing';
import { playCashRegister } from '@/lib/sounds';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt } from '@/components/pos/Receipt';
import { PromptPayQR } from '@/components/pos/PromptPayQR';

type Method = 'CASH' | 'PROMPTPAY';
// Extra split-tender lines can be any backend payment method — a card
// terminal or bank transfer isn't wired up live like PromptPay, so those
// just record the amount + an optional reference the cashier types in.
type ExtraMethod = 'CASH' | 'PROMPTPAY' | 'CREDIT_CARD' | 'BANK_TRANSFER';

const METHOD_ICON: Record<Method, any> = { CASH: Banknote, PROMPTPAY: QrCode };
const METHOD_COLOR: Record<Method, string> = { CASH: 'bg-success', PROMPTPAY: 'bg-primary' };

type PpStatus = 'idle' | 'creating' | 'waiting' | 'paid' | 'error';
interface PpIntent {
  paymentIntentId: string;
  qrImageUrl: string | null;
  qrData: string | null;
  hostedUrl: string | null;
  amount: number;
}

export function PaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const cart = useCart();
  const t = useT();
  const METHOD_LABEL: Record<Method, string> = { CASH: t('pay.cash'), PROMPTPAY: t('pay.promptpay') };
  const EXTRA_METHOD_LABEL: Record<ExtraMethod, string> = {
    CASH: t('pay.cash'),
    PROMPTPAY: t('pay.promptpay'),
    CREDIT_CARD: t('pay.creditCard'),
    BANK_TRANSFER: t('pay.bankTransfer'),
  };

  // Fetch store data (for receipt/tax config)
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    enabled: open,
  });

  // Is Stripe configured on the backend?
  const { data: payCfg } = useQuery({
    queryKey: ['pay-config'],
    queryFn: () => api.get('/payments/config').then((r) => r.data),
    enabled: open,
  });
  const stripeEnabled: boolean = payCfg?.stripeEnabled ?? false;
  const testMode: boolean = payCfg?.testMode ?? false;

  const cfg = {
    taxRate: store?.taxRate ?? DEFAULT_TAX_CONFIG.taxRate,
    priceIncludesTax: store?.priceIncludesTax ?? DEFAULT_TAX_CONFIG.priceIncludesTax,
    serviceCharge: store?.serviceCharge ?? DEFAULT_TAX_CONFIG.serviceCharge,
  };

  // Settle mode: paying an existing open (dine-in) bill instead of creating one.
  // Items were already cleared from the cart when they were sent to the
  // kitchen, so the subtotal must come from the server's running bill —
  // cart.subtotal() would read as 0 here.
  const settleId = cart.openOrderId;
  const { data: settleOrder } = useQuery({
    queryKey: ['settle-order', settleId],
    queryFn: () => api.get(`/orders/${settleId}`).then((r) => r.data),
    enabled: open && !!settleId,
  });
  const settleNotReady = !!settleId && !settleOrder;

  const sub = settleId ? Number(settleOrder?.subtotal ?? 0) : cart.subtotal();
  // 1 point = 1 baht, matching Cart.tsx's own redeem logic
  const pointDiscount = cart.pointsToRedeem || 0;
  // Stamp-card reward discount — only if enabled, a member is selected, and
  // they hold enough stamps (mirror of Cart.tsx's guard, re-checked here so the
  // amount due matches what the backend will compute).
  const stampsPerReward = Number(store?.stampsPerReward ?? 10);
  const stampsEnabled = store?.loyaltyMode === 'STAMPS' || store?.loyaltyMode === 'BOTH';
  const useStampReward =
    !!cart.useStampReward && stampsEnabled && stampsPerReward > 0 &&
    (cart.customer?.stamps ?? 0) >= stampsPerReward;
  const stampDiscount = useStampReward ? Number(store?.stampRewardValue ?? 0) : 0;
  const promoDiscount = cart.promotion?.discountAmount || 0;
  const breakdown = computePricing(sub, cart.discount + pointDiscount + stampDiscount + promoDiscount, cfg);
  const total = breakdown.total;

  const [method, setMethod] = useState<Method>('CASH');
  const [received, setReceived] = useState<string>('');
  const [reference, setReference] = useState(''); // manual fallback reference
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [showingReceipt, setShowingReceipt] = useState(false);

  // Split tender — extra payment lines on top of the primary method below
  // (e.g. ฿300 cash + remainder on a card). Each line records its own
  // amount/reference; the primary CASH/PromptPay flow only has to cover
  // whatever's left after these.
  const [extraPayments, setExtraPayments] = useState<
    { method: ExtraMethod; amount: string; reference: string }[]
  >([]);
  const addExtraPayment = () =>
    setExtraPayments((p) => [...p, { method: 'CASH', amount: '', reference: '' }]);
  const updateExtraPayment = (i: number, patch: Partial<{ method: ExtraMethod; amount: string; reference: string }>) =>
    setExtraPayments((p) => p.map((line, idx) => (idx === i ? { ...line, ...patch } : line)));
  const removeExtraPayment = (i: number) =>
    setExtraPayments((p) => p.filter((_, idx) => idx !== i));
  const extraTotal = extraPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  // What the primary method still needs to cover, after split-tender lines
  const remaining = Math.max(0, Math.round((total - extraTotal) * 100) / 100);

  // Split evenly by N people — fills in (N-1) equal cash lines and leaves the
  // last share to the primary method below, which also absorbs any rounding
  // remainder (each share is rounded down so the shares never overpay).
  const [splitCount, setSplitCount] = useState(2);
  const applySplitEvenly = () => {
    const n = Math.max(2, Math.min(20, splitCount));
    const share = Math.floor((total / n) * 100) / 100;
    setExtraPayments(
      Array.from({ length: n - 1 }, () => ({ method: 'CASH' as ExtraMethod, amount: share.toFixed(2), reference: '' }))
    );
  };

  // Stripe PromptPay state
  const [ppIntent, setPpIntent] = useState<PpIntent | null>(null);
  const [ppStatus, setPpStatus] = useState<PpStatus>('idle');
  const [ppError, setPpError] = useState('');

  // Customer info for full tax invoice
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const change = useMemo(() => {
    const r = parseFloat(received || '0');
    return method === 'CASH' ? Math.max(0, r - remaining) : 0;
  }, [received, remaining, method]);

  const canPay =
    !settleNotReady &&
    (remaining <= 0
      ? true // split-tender lines already cover the full bill
      : method === 'CASH'
      ? parseFloat(received || '0') >= remaining
      : !stripeEnabled
      ? true // โหมด QR พร้อมเพย์ตรง — แคชเชียร์กดยืนยันเองหลังลูกค้าจ่าย
      : ppStatus === 'paid' || !!reference.trim());

  // Confirm button: ซ่อนระหว่างขั้นตอน Stripe PromptPay (สร้าง QR / รอจ่าย / auto-submit)
  // โชว์เฉพาะเงินสด, กรณี Stripe ปิด, หรือใส่เลขอ้างอิงเองเพื่อยืนยันด้วยมือ
  const showConfirm = method === 'CASH' || !stripeEnabled || !!reference.trim();

  // Revert the customer display back to the live cart (or idle, in settle
  // mode where there's no local item list) — used whenever a QR is
  // cancelled/left without completing payment.
  const broadcastCurrentCart = () => {
    if (settleId) {
      sendToCustomerDisplay({ type: 'idle' });
    } else {
      sendToCustomerDisplay({
        type: 'cart',
        storeName: store?.name,
        items: cart.items.map((i) => ({ name: i.name, qty: i.quantity, unitPrice: i.unitPrice })),
        subtotal: sub,
        discount: breakdown.discount,
        total,
      });
    }
  };

  // ---- Stripe PromptPay: generate QR ----
  const generateQr = async () => {
    setPpError('');
    setPpStatus('creating');
    try {
      const r = await api.post('/payments/promptpay/intent', {
        amount: Number(remaining.toFixed(2)),
        orderRef: cart.tableId || undefined,
      });
      setPpIntent(r.data);
      setPpStatus('waiting');
    } catch (e: any) {
      setPpError(e.response?.data?.error || 'สร้าง QR ไม่สำเร็จ');
      setPpStatus('error');
    }
  };

  const resetPromptPay = () => {
    if (ppIntent?.paymentIntentId && ppStatus !== 'paid') {
      api.post(`/payments/promptpay/cancel/${ppIntent.paymentIntentId}`).catch(() => {});
    }
    setPpIntent(null);
    setPpStatus('idle');
    setPpError('');
    broadcastCurrentCart();
  };

  const changeMethod = (m: Method) => {
    if (m !== 'PROMPTPAY') resetPromptPay();
    setMethod(m);
  };

  // ---- Mirror the PromptPay QR to the customer display ----
  // Direct-merchant QR (no Stripe) renders immediately — no button press needed.
  useEffect(() => {
    if (method === 'PROMPTPAY' && !stripeEnabled && store?.promptpayId && remaining > 0) {
      sendToCustomerDisplay({
        type: 'qr',
        amount: remaining,
        promptpayId: store.promptpayId,
        merchantName: store.name,
      });
    }
  }, [method, stripeEnabled, store?.promptpayId, store?.name, remaining]);

  // Stripe-hosted QR — mirror once the intent is created.
  useEffect(() => {
    if (method === 'PROMPTPAY' && stripeEnabled && ppIntent && (ppStatus === 'waiting' || ppStatus === 'paid')) {
      sendToCustomerDisplay({ type: 'qr', amount: remaining, qrImageUrl: ppIntent.qrImageUrl });
    }
  }, [method, stripeEnabled, ppIntent, ppStatus, remaining]);

  // Payment confirmed — show the thank-you screen on the customer display.
  useEffect(() => {
    if (success) {
      sendToCustomerDisplay({ type: 'success', total: Number(success.total), orderNumber: success.orderNumber });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  // ---- Poll Stripe for payment status while waiting ----
  useEffect(() => {
    if (ppStatus !== 'waiting' || !ppIntent?.paymentIntentId) return;
    let active = true;
    const check = async () => {
      try {
        const r = await api.get(`/payments/promptpay/status/${ppIntent.paymentIntentId}`);
        if (active && r.data?.paid) setPpStatus('paid');
      } catch {
        /* keep polling */
      }
    };
    const iv = setInterval(check, 3000);
    check();
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [ppStatus, ppIntent?.paymentIntentId]);

  // ---- Auto-finalize order once PromptPay is paid ----
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (ppStatus === 'paid' && !success && !loading && !autoSubmitted.current) {
      autoSubmitted.current = true;
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppStatus]);

  const submit = async () => {
    setLoading(true);
    try {
      const promptpayRef =
        method === 'PROMPTPAY'
          ? ppStatus === 'paid' && ppIntent
            ? ppIntent.paymentIntentId
            : reference || undefined
          : undefined;

      // Split-tender lines first, then the primary method for whatever's left
      // (skipped entirely if the extra lines already cover the full bill).
      const payments: { method: string; amount: number; reference?: string }[] = extraPayments
        .filter((p) => (parseFloat(p.amount) || 0) > 0)
        .map((p) => ({ method: p.method, amount: parseFloat(p.amount), reference: p.reference || undefined }));
      if (remaining > 0 || payments.length === 0) {
        payments.push({
          method,
          amount: method === 'CASH' ? parseFloat(received || '0') : remaining,
          reference: promptpayRef,
        });
      }

      // Settle mode: pay an existing open bill (dine-in) — order already exists,
      // items already fired. Queues for retry if the connection drops right
      // at checkout, same safety net as the create-order flow below.
      if (settleId) {
        const settlePayload: any = {
          payments,
          discount: cart.discount,
          pointsToRedeem: cart.pointsToRedeem || undefined,
          useStampReward: useStampReward || undefined,
          customerId: cart.customer?.id,
          promotionId: cart.promotion?.promotionId,
          promotionDiscount: cart.promotion?.discountAmount,
          promotionName: cart.promotion?.promotionName,
        };
        if (showCustomerInfo) {
          settlePayload.customerName = customerName || undefined;
          settlePayload.customerTaxId = customerTaxId || undefined;
          settlePayload.customerAddress = customerAddress || undefined;
        }

        const result = await submitSettleWithFallback(settleId, settlePayload);

        if (result.offline) {
          toast.success(t('pay.offlineSaved'));
          cart.clear();
          onClose();
          return;
        }

        setSuccess(result.data);
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['tables'] });
        qc.invalidateQueries({ queryKey: ['open-bill'] });
        playCashRegister();
        cart.clear();
        return;
      }

      const payload: any = {
        type: cart.type,
        tableId: cart.tableId,
        customerId: cart.customer?.id,
        items: cart.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes,
          variants: i.variants,
        })),
        discount: cart.discount,
        pointsToRedeem: cart.pointsToRedeem || undefined,
        useStampReward: useStampReward || undefined,
        promotionId: cart.promotion?.promotionId,
        promotionDiscount: cart.promotion?.discountAmount,
        promotionName: cart.promotion?.promotionName,
        payments,
        notes: cart.customerNote,
      };

      if (showCustomerInfo) {
        payload.customerName = customerName || undefined;
        payload.customerTaxId = customerTaxId || undefined;
        payload.customerAddress = customerAddress || undefined;
      }

      const result = await submitOrderWithFallback(payload);

      if (result.offline) {
        toast.success(t('pay.offlineSaved'));
        cart.clear();
        onClose();
      } else {
        setSuccess(result.data);
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['products'] });
        playCashRegister();
        cart.clear();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('pay.failed'));
      // ปล่อยให้แคชเชียร์ลองใหม่ได้ (กรณี auto-submit ล้มเหลว)
      autoSubmitted.current = false;
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    resetPromptPay();
    autoSubmitted.current = false;
    setSuccess(null);
    setShowingReceipt(false);
    setReceived('');
    setReference('');
    setShowManual(false);
    setMethod('CASH');
    setShowCustomerInfo(false);
    setCustomerName('');
    setCustomerTaxId('');
    setCustomerAddress('');
    setExtraPayments([]);
    setSplitCount(2);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
        {success && showingReceipt ? (
          // ✅ Embedded receipt preview
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 no-print">
                <button
                  onClick={() => setShowingReceipt(false)}
                  className="p-1 rounded hover:bg-muted"
                  aria-label={t('pay.back')}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                {t('pay.receiptTitle')}
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-lg overflow-hidden border border-border">
              <Receipt order={success} store={store} format="thermal" />
            </div>

            <div className="flex gap-2 no-print sticky bottom-0 bg-card pt-2">
              <Button variant="outline" className="flex-1" onClick={close}>
                {t('pay.close')}
              </Button>
              <Button className="flex-1" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> {t('pay.print')}
              </Button>
            </div>
          </div>
        ) : success ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-6"
          >
            <CheckCircle2 className="w-20 h-20 text-success mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">{t('pay.success')}</h3>
            <p className="text-muted-foreground mb-1">{t('pay.orderNumber')}</p>
            <p className="text-lg font-mono mb-4">{success.orderNumber}</p>
            <p className="text-3xl font-bold text-primary mb-6">
              {formatCurrency(success.total)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>
                {t('pay.close')}
              </Button>
              <Button className="flex-1" onClick={() => setShowingReceipt(true)}>
                <Printer className="w-4 h-4 mr-1" /> {t('pay.viewReceipt')}
              </Button>
            </div>
            <button
              onClick={() => window.open(`/orders/${success.id}/receipt`, '_blank')}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
            >
              {t('pay.openFullInvoice')}
            </button>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('pay.title')}</DialogTitle>
            </DialogHeader>

            <div className="bg-muted rounded-xl p-4 text-center">
              <div className="text-sm text-muted-foreground">{t('pay.amountDue')}</div>
              <div className="text-4xl font-bold text-accent tabular-nums">{formatCurrency(total)}</div>
              {extraPayments.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t('pay.remaining')}:{' '}
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(remaining)}</span>
                </div>
              )}
            </div>

            {/* Split evenly by N people — quick-fills the split-tender lines below */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">{t('pay.splitEvenly')}</span>
              <Input
                type="number" min={2} max={20} inputMode="numeric"
                value={splitCount}
                onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                className="w-14 h-8 text-center tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0">{t('pay.people')}</span>
              <Button type="button" variant="outline" size="sm" onClick={applySplitEvenly}>
                {t('pay.splitApply')}
              </Button>
              {splitCount >= 2 && (
                <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                  {formatCurrency(Math.floor((total / Math.max(2, Math.min(20, splitCount))) * 100) / 100)} {t('pay.perPerson')}
                </span>
              )}
            </div>

            {/* Split tender — extra payment lines on top of the primary method below */}
            <div className="space-y-1.5">
              {extraPayments.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={p.method}
                    onChange={(e) => updateExtraPayment(i, { method: e.target.value as ExtraMethod })}
                    className="h-9 flex-1 bg-input border border-border rounded-md px-2 text-sm"
                  >
                    {(['CASH', 'PROMPTPAY', 'CREDIT_CARD', 'BANK_TRANSFER'] as ExtraMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {EXTRA_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number" inputMode="decimal" placeholder="0.00"
                    value={p.amount}
                    onChange={(e) => updateExtraPayment(i, { amount: e.target.value })}
                    className="w-24 h-9 text-right tabular-nums"
                  />
                  <button
                    onClick={() => removeExtraPayment(i)}
                    aria-label={t('pay.remove')}
                    className="p-1.5 text-muted-foreground hover:text-danger shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addExtraPayment} className="text-xs text-primary hover:underline">
                {t('pay.addPaymentLine')}
              </button>
            </div>

            {remaining <= 0 ? (
              <div className="p-4 bg-success/10 rounded-lg text-center text-sm font-medium text-success">
                {t('pay.fullyPaid')}
              </div>
            ) : (
              <>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('pay.methodLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'PROMPTPAY'] as Method[]).map((m) => {
                  const Icon = METHOD_ICON[m];
                  const active = method === m;
                  return (
                    <button
                      key={m}
                      onClick={() => changeMethod(m)}
                      className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                        active ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg ${METHOD_COLOR[m]}/20 flex items-center justify-center`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium">{METHOD_LABEL[m]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CASH */}
            {method === 'CASH' && (
              <div>
                <label className="text-sm font-medium mb-2 block">{t('pay.cashReceived')}</label>
                <Input
                  type="number" inputMode="decimal" placeholder="0.00"
                  value={received} onChange={(e) => setReceived(e.target.value)}
                  className="text-2xl h-14 text-right tabular-nums"
                />
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {[100, 500, 1000, remaining].map((amt) => (
                    <Button key={amt} variant="outline" size="sm" onClick={() => setReceived(String(amt))}>
                      {amt === remaining ? t('pay.exact') : `฿${amt}`}
                    </Button>
                  ))}
                </div>
                {received && parseFloat(received) >= remaining && (
                  <div className="mt-3 p-3 bg-success/10 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">{t('pay.change')}</div>
                    <div className="text-2xl font-bold text-success">{formatCurrency(change)}</div>
                  </div>
                )}
              </div>
            )}

            {/* PROMPTPAY via Stripe */}
            {method === 'PROMPTPAY' && (
              <div className="space-y-3">
                {!stripeEnabled ? (
                  // ยังไม่ได้เปิด Stripe (เช่น รอ Stripe live อนุมัติ) → ใช้ QR พร้อมเพย์ตรงของร้านชั่วคราว
                  store?.promptpayId ? (
                    <div className="space-y-2">
                      <PromptPayQR promptpayId={store.promptpayId} amount={remaining} merchantName={store.name} />
                      <p className="text-xs text-center text-muted-foreground">
                        ให้ลูกค้าสแกนจ่ายเข้าบัญชีร้าน แล้วกด “Confirm payment” เมื่อได้รับเงิน (เช็คจากแอปธนาคาร/SMS)
                      </p>
                    </div>
                  ) : (
                    <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm">
                      ⚠️ ยังไม่ได้ตั้ง <strong>PromptPay ID</strong> — ไปที่ <strong>{t('nav.settings')}</strong> เพื่อตั้งค่าก่อน
                      หรือยืนยันการรับเงินด้วยตนเองด้านล่าง
                    </div>
                  )
                ) : ppStatus === 'idle' || ppStatus === 'error' ? (
                  <div className="text-center">
                    <Button onClick={generateQr} className="w-full" size="lg">
                      <QrCode className="w-4 h-4 mr-2" /> สร้าง QR พร้อมเพย์ {formatCurrency(remaining)}
                    </Button>
                    {ppError && <p className="text-xs text-danger mt-2">{ppError}</p>}
                  </div>
                ) : ppStatus === 'creating' ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mb-2" />
                    กำลังสร้าง QR…
                  </div>
                ) : ppStatus === 'paid' ? (
                  <div className="flex flex-col items-center justify-center py-8 text-success">
                    <CheckCircle2 className="w-14 h-14 mb-2" />
                    <div className="font-semibold">ได้รับเงินแล้ว</div>
                    <div className="text-xs text-muted-foreground mt-1">กำลังบันทึกออเดอร์…</div>
                  </div>
                ) : (
                  // waiting
                  <div className="text-center space-y-3">
                    <div className="rounded-xl border border-border p-4 bg-white">
                      {ppIntent?.qrImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ppIntent.qrImageUrl}
                          alt="PromptPay QR"
                          className="w-56 h-56 mx-auto object-contain"
                        />
                      ) : (
                        <div className="w-56 h-56 mx-auto flex items-center justify-center text-muted-foreground">
                          ไม่มีภาพ QR
                        </div>
                      )}
                      <p className="text-sm mt-2">
                        ให้ลูกค้าสแกนเพื่อจ่าย <strong>{formatCurrency(remaining)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-sm text-primary">
                      <Loader2 className="w-4 h-4 animate-spin" /> กำลังรอชำระเงิน…
                    </div>

                    {testMode ? (
                      <div className="bg-warning/10 border border-warning/40 rounded-lg p-3 text-left text-xs space-y-2">
                        <div className="font-semibold text-warning">
                          ⚠️ โหมดทดสอบ — สแกน QR นี้ด้วยแอปธนาคารจริงไม่ได้
                        </div>
                        <div className="text-muted-foreground">
                          ใช้ test key (sk_test) QR จึงเป็นของจำลอง กดปุ่มด้านล่างเพื่อจำลองการจ่ายเงิน
                          ระบบจะปิดบิลให้อัตโนมัติ
                        </div>
                        {ppIntent?.hostedUrl && (
                          <a
                            href={ppIntent.hostedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-full bg-warning text-white rounded-md px-3 py-2 font-medium hover:opacity-90"
                          >
                            จำลองการชำระเงิน (เปิดหน้า Stripe) →
                          </a>
                        )}
                      </div>
                    ) : (
                      ppIntent?.hostedUrl && (
                        <a
                          href={ppIntent.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          มีปัญหาในการสแกน? เปิดหน้า Stripe →
                        </a>
                      )
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={resetPromptPay}>
                        <X className="w-3.5 h-3.5 mr-1" /> ยกเลิก QR
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={generateQr}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> สร้างใหม่
                      </Button>
                    </div>
                  </div>
                )}

                {/* Manual fallback (e.g. Stripe down / paid via other app) */}
                {ppStatus !== 'paid' && (
                  <div>
                    <button
                      onClick={() => setShowManual(!showManual)}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      {showManual ? '▼' : '▶'} ยืนยันการรับเงินด้วยตนเอง
                    </button>
                    {showManual && (
                      <Input
                        className="mt-2"
                        placeholder={t('pay.refPlaceholder')}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
              </>
            )}

            {/* Customer info toggle */}
            <div>
              <button
                onClick={() => setShowCustomerInfo(!showCustomerInfo)}
                className="text-sm text-primary hover:underline"
              >
                {showCustomerInfo ? '▼' : '▶'} {t('pay.issueTaxInvoice')}
              </button>
              {showCustomerInfo && (
                <div className="mt-2 space-y-2 p-3 bg-muted rounded-lg">
                  <Input
                    placeholder={t('pay.customerName')}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <Input
                    placeholder={t('pay.taxId')}
                    value={customerTaxId}
                    onChange={(e) => setCustomerTaxId(e.target.value)}
                    maxLength={13}
                  />
                  <textarea
                    placeholder={t('pay.address')}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
              )}
            </div>

            {/* Confirm — hidden during PromptPay auto-flow (handled automatically once paid).
                Settling an open table bill reads as "collect & close" rather than a
                generic "confirm payment", matching the self-order → pay-at-table flow. */}
            {showConfirm && (
              <Button size="xl" className="w-full" disabled={!canPay || loading} onClick={submit}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `${settleId ? t('pay.receiveAndCloseBill') : t('pay.confirmPayment')} ${formatCurrency(total)}`
                )}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
