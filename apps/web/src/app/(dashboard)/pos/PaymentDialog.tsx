'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Banknote, QrCode, CheckCircle2, Loader2, Printer, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useCart } from '@/stores/cart.store';
import { submitOrderWithFallback } from '@/hooks/useOfflineQueue';
import { formatCurrency } from '@/lib/format';
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

type Method = 'CASH' | 'PROMPTPAY';

const METHODS: { id: Method; label: string; icon: any; color: string }[] = [
  { id: 'CASH', label: 'Cash', icon: Banknote, color: 'bg-success' },
  { id: 'PROMPTPAY', label: 'PromptPay', icon: QrCode, color: 'bg-primary' },
];

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

  const sub = cart.subtotal();
  const breakdown = computePricing(sub, cart.discount, cfg);
  const total = breakdown.total;

  const [method, setMethod] = useState<Method>('CASH');
  const [received, setReceived] = useState<string>('');
  const [reference, setReference] = useState(''); // manual fallback reference
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [showingReceipt, setShowingReceipt] = useState(false);

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
    return method === 'CASH' ? Math.max(0, r - total) : 0;
  }, [received, total, method]);

  const canPay =
    method === 'CASH'
      ? parseFloat(received || '0') >= total
      : ppStatus === 'paid' || !!reference.trim();

  // Confirm button: ซ่อนระหว่างขั้นตอน Stripe PromptPay (สร้าง QR / รอจ่าย / auto-submit)
  // โชว์เฉพาะเงินสด, กรณี Stripe ปิด, หรือใส่เลขอ้างอิงเองเพื่อยืนยันด้วยมือ
  const showConfirm = method === 'CASH' || !stripeEnabled || !!reference.trim();

  // ---- Stripe PromptPay: generate QR ----
  const generateQr = async () => {
    setPpError('');
    setPpStatus('creating');
    try {
      const r = await api.post('/payments/promptpay/intent', {
        amount: Number(total.toFixed(2)),
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
  };

  const changeMethod = (m: Method) => {
    if (m !== 'PROMPTPAY') resetPromptPay();
    setMethod(m);
  };

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
        promotionId: cart.promotion?.promotionId,
        promotionDiscount: cart.promotion?.discountAmount,
        promotionName: cart.promotion?.promotionName,
        payments: [
          {
            method,
            amount: method === 'CASH' ? parseFloat(received) : total,
            reference: promptpayRef,
          },
        ],
        notes: cart.customerNote,
      };

      if (showCustomerInfo) {
        payload.customerName = customerName || undefined;
        payload.customerTaxId = customerTaxId || undefined;
        payload.customerAddress = customerAddress || undefined;
      }

      const result = await submitOrderWithFallback(payload);

      if (result.offline) {
        toast.success('Saved offline — will sync when online');
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
      toast.error(err.response?.data?.error || 'Payment failed');
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
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                Receipt
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-lg overflow-hidden border border-border">
              <Receipt order={success} store={store} format="thermal" />
            </div>

            <div className="flex gap-2 no-print sticky bottom-0 bg-card pt-2">
              <Button variant="outline" className="flex-1" onClick={close}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print
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
            <h3 className="text-2xl font-bold mb-2">Payment successful</h3>
            <p className="text-muted-foreground mb-1">Order number</p>
            <p className="text-lg font-mono mb-4">{success.orderNumber}</p>
            <p className="text-3xl font-bold text-primary mb-6">
              {formatCurrency(success.total)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={close}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => setShowingReceipt(true)}>
                <Printer className="w-4 h-4 mr-1" /> View receipt
              </Button>
            </div>
            <button
              onClick={() => window.open(`/orders/${success.id}/receipt`, '_blank')}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Open in new tab (for A4 / full invoice)
            </button>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Payment</DialogTitle>
            </DialogHeader>

            <div className="bg-muted rounded-xl p-4 text-center">
              <div className="text-sm text-muted-foreground">Amount due</div>
              <div className="text-4xl font-bold text-accent tabular-nums">{formatCurrency(total)}</div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Payment method</label>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => changeMethod(m.id)}
                      className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                        active ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg ${m.color}/20 flex items-center justify-center`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CASH */}
            {method === 'CASH' && (
              <div>
                <label className="text-sm font-medium mb-2 block">Cash received</label>
                <Input
                  type="number" inputMode="decimal" placeholder="0.00"
                  value={received} onChange={(e) => setReceived(e.target.value)}
                  className="text-2xl h-14 text-right tabular-nums"
                />
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {[100, 500, 1000, total].map((amt) => (
                    <Button key={amt} variant="outline" size="sm" onClick={() => setReceived(String(amt))}>
                      {amt === total ? 'Exact' : `฿${amt}`}
                    </Button>
                  ))}
                </div>
                {received && parseFloat(received) >= total && (
                  <div className="mt-3 p-3 bg-success/10 rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Change</div>
                    <div className="text-2xl font-bold text-success">{formatCurrency(change)}</div>
                  </div>
                )}
              </div>
            )}

            {/* PROMPTPAY via Stripe */}
            {method === 'PROMPTPAY' && (
              <div className="space-y-3">
                {!stripeEnabled ? (
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm">
                    ⚠️ ยังไม่ได้ตั้งค่า Stripe — ใส่ <code className="font-mono">STRIPE_SECRET_KEY</code> ใน
                    <strong> apps/api/.env</strong> หรือยืนยันการรับเงินด้วยตนเองด้านล่าง
                  </div>
                ) : ppStatus === 'idle' || ppStatus === 'error' ? (
                  <div className="text-center">
                    <Button onClick={generateQr} className="w-full" size="lg">
                      <QrCode className="w-4 h-4 mr-2" /> สร้าง QR พร้อมเพย์ {formatCurrency(total)}
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
                        ให้ลูกค้าสแกนเพื่อจ่าย <strong>{formatCurrency(total)}</strong>
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
                        placeholder="เลขอ้างอิง / เลขสลิป (ข้ามการตรวจสอบ Stripe)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Customer info toggle */}
            <div>
              <button
                onClick={() => setShowCustomerInfo(!showCustomerInfo)}
                className="text-sm text-primary hover:underline"
              >
                {showCustomerInfo ? '▼' : '▶'} Issue full tax invoice
              </button>
              {showCustomerInfo && (
                <div className="mt-2 space-y-2 p-3 bg-muted rounded-lg">
                  <Input
                    placeholder="Customer / Company name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <Input
                    placeholder="Tax ID (13 digits)"
                    value={customerTaxId}
                    onChange={(e) => setCustomerTaxId(e.target.value)}
                    maxLength={13}
                  />
                  <textarea
                    placeholder="Address"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                </div>
              )}
            </div>

            {/* Confirm — hidden during PromptPay auto-flow (handled automatically once paid) */}
            {showConfirm && (
              <Button size="xl" className="w-full" disabled={!canPay || loading} onClick={submit}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm payment ${formatCurrency(total)}`}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
