'use client';
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Store } from 'lucide-react';
import { useCustomerDisplayMessages, type CartLineMsg } from '@/lib/customerDisplay';
import { PromptPayQR } from '@/components/pos/PromptPayQR';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';

type Phase =
  | { kind: 'idle' }
  | { kind: 'cart'; storeName?: string; items: CartLineMsg[]; subtotal: number; total: number }
  | { kind: 'qr'; amount: number; qrImageUrl?: string | null; promptpayId?: string; merchantName?: string }
  | { kind: 'success'; total: number; orderNumber: string };

const SUCCESS_DISPLAY_MS = 6000;

/**
 * Customer-facing screen: open this route as a second browser tab/window on
 * the same machine and drag it onto the customer-facing monitor. It has no
 * login and shows nothing sensitive on its own — it's entirely driven by
 * BroadcastChannel messages from the cashier's POS tab (same browser only).
 */
export default function CustomerDisplayPage() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // While the thank-you screen is showing, ignore the cart/idle messages that
  // naturally follow clearing the cart — otherwise they'd cut the moment short.
  const successLock = useRef(false);

  useCustomerDisplayMessages((msg) => {
    if (successLock.current && (msg.type === 'idle' || msg.type === 'cart')) return;

    if (msg.type === 'idle') setPhase({ kind: 'idle' });
    else if (msg.type === 'cart') setPhase({ kind: 'cart', ...msg });
    else if (msg.type === 'qr') setPhase({ kind: 'qr', ...msg });
    else if (msg.type === 'success') {
      successLock.current = true;
      setPhase({ kind: 'success', total: msg.total, orderNumber: msg.orderNumber });
      setTimeout(() => {
        successLock.current = false;
        setPhase({ kind: 'idle' });
      }, SUCCESS_DISPLAY_MS);
    }
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <AnimatePresence mode="wait">
        {phase.kind === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <Store className="w-16 h-16 text-primary mx-auto mb-6" />
            <h1 className="text-4xl font-bold mb-2">{t('display.welcome')}</h1>
            <p className="text-muted-foreground text-lg">{t('display.idleHint')}</p>
          </motion.div>
        )}

        {phase.kind === 'cart' && (
          <motion.div
            key="cart"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-lg"
          >
            {phase.storeName && (
              <div className="text-center text-muted-foreground mb-4 text-lg">{phase.storeName}</div>
            )}
            <div className="bg-card border border-border rounded-2xl shadow-card p-6">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                {t('display.yourOrder')}
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto scrollbar-thin">
                {phase.items.map((it, i) => (
                  <div key={i} className="flex justify-between items-baseline gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-lg font-bold tabular-nums text-primary shrink-0">{it.qty}×</span>
                      <span className="text-lg truncate">{it.name}</span>
                    </div>
                    <span className="text-lg font-semibold tabular-nums shrink-0">
                      {formatCurrency(it.unitPrice * it.qty)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-4 pt-4 flex justify-between items-center">
                <span className="text-xl font-semibold">{t('display.total')}</span>
                <span className="text-3xl font-bold text-primary tabular-nums">
                  {formatCurrency(phase.total)}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {phase.kind === 'qr' && (
          <motion.div
            key="qr"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="text-center"
          >
            <h2 className="text-2xl font-bold mb-1">{t('display.scanToPay')}</h2>
            <p className="text-muted-foreground text-lg mb-6 tabular-nums">{formatCurrency(phase.amount)}</p>
            {phase.qrImageUrl ? (
              <div className="bg-white rounded-2xl p-6 inline-block">
                <img src={phase.qrImageUrl} alt="PromptPay QR" className="w-72 h-72 object-contain" />
              </div>
            ) : phase.promptpayId ? (
              <PromptPayQR promptpayId={phase.promptpayId} amount={phase.amount} merchantName={phase.merchantName} />
            ) : null}
          </motion.div>
        )}

        {phase.kind === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <CheckCircle2 className="w-24 h-24 text-success mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2">{t('display.thankYou')}</h2>
            <p className="text-muted-foreground mb-1">{t('display.paidAmount')}</p>
            <p className="text-4xl font-bold text-primary tabular-nums">{formatCurrency(phase.total)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
