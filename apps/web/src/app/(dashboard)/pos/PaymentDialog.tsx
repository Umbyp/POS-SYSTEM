'use client';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Banknote, CreditCard, QrCode, Building2, CheckCircle2, Loader2, Printer, ArrowLeft } from 'lucide-react';
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
import { PromptPayQR } from '@/components/pos/PromptPayQR';
import { Receipt } from '@/components/pos/Receipt';
import { SlipVerifier, type SlipVerifyResult } from '@/components/pos/SlipVerifier';

type Method = 'CASH' | 'PROMPTPAY' | 'CREDIT_CARD' | 'BANK_TRANSFER';

const METHODS: { id: Method; label: string; icon: any; color: string }[] = [
  { id: 'CASH', label: 'Cash', icon: Banknote, color: 'bg-success' },
  { id: 'PROMPTPAY', label: 'PromptPay', icon: QrCode, color: 'bg-primary' },
  { id: 'CREDIT_CARD', label: 'Credit Card', icon: CreditCard, color: 'bg-accent' },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Building2, color: 'bg-warning' },
];

export function PaymentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const cart = useCart();

  // ดึงข้อมูลร้านมาใช้ PromptPay ID
  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    enabled: open,
  });

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
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [showingReceipt, setShowingReceipt] = useState(false);
  const [verifiedSlip, setVerifiedSlip] = useState<SlipVerifyResult | null>(null);
  // ข้อมูลลูกค้าสำหรับใบกำกับเต็ม
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const change = useMemo(() => {
    const r = parseFloat(received || '0');
    return method === 'CASH' ? Math.max(0, r - total) : 0;
  }, [received, total, method]);

  // PromptPay/โอน/บัตร: ถ้าตั้ง EasySlip ไว้ → require verified slip ก่อน confirm
  // (CASH ไม่ต้อง)
  const requiresSlip = method === 'PROMPTPAY' || method === 'BANK_TRANSFER';
  const canPay =
    method === 'CASH'
      ? parseFloat(received || '0') >= total
      : requiresSlip
      ? !!verifiedSlip || !!reference // ผ่านสลิปแล้ว หรือ override ด้วย reference
      : true;

  const submit = async () => {
    setLoading(true);
    try {
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
            reference: verifiedSlip?.transRef || reference || undefined,
            slipTransRef: verifiedSlip?.transRef,
            slipPayload: verifiedSlip?.payload,
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
        // cha-ching sound on payment success
        playCashRegister();
        cart.clear();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setSuccess(null);
    setShowingReceipt(false);
    setReceived('');
    setReference('');
    setVerifiedSlip(null);
    setShowCustomerInfo(false);
    setCustomerName('');
    setCustomerTaxId('');
    setCustomerAddress('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className={`${
          showingReceipt ? 'max-w-md' : 'max-w-md'
        } max-h-[90vh] overflow-y-auto scrollbar-thin`}
      >
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
                      onClick={() => setMethod(m.id)}
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

            {/* PROMPTPAY — แสดง QR + ตรวจสลิป */}
            {method === 'PROMPTPAY' && (
              <div className="space-y-3">
                {store?.promptpayId ? (
                  <PromptPayQR
                    promptpayId={store.promptpayId}
                    amount={total}
                    merchantName={store.name}
                  />
                ) : (
                  <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm">
                    ⚠️ PromptPay ID not configured — go to <strong>Settings</strong> to set it up
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium mb-1.5 flex items-center gap-1">
                    <span>🔐 Auto-verify slip</span>
                  </div>
                  <SlipVerifier
                    expectedAmount={total}
                    onVerified={setVerifiedSlip}
                    onCleared={() => setVerifiedSlip(null)}
                  />
                </div>

                {!verifiedSlip && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Or enter reference manually (skip slip verification)
                    </label>
                    <Input
                      placeholder="Slip reference number"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* BANK TRANSFER — auto-verify slip */}
            {method === 'BANK_TRANSFER' && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium mb-1.5">🔐 Auto-verify slip</div>
                  <SlipVerifier
                    expectedAmount={total}
                    onVerified={setVerifiedSlip}
                    onCleared={() => setVerifiedSlip(null)}
                  />
                </div>
                {!verifiedSlip && (
                  <Input
                    placeholder="Or enter reference manually (skip verification)"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                )}
              </div>
            )}

            {/* CREDIT CARD */}
            {method === 'CREDIT_CARD' && (
              <Input
                placeholder="Reference / Slip number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
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

            <Button size="xl" className="w-full" disabled={!canPay || loading} onClick={submit}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm payment ${formatCurrency(total)}`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
