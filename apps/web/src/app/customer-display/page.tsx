'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Store } from 'lucide-react';
import { useCustomerDisplayMessages, type CartLineMsg } from '@/lib/customerDisplay';
import { PromptPayQR } from '@/components/pos/PromptPayQR';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';

type Phase =
  | { kind: 'idle' }
  | { kind: 'cart'; storeName?: string; items: CartLineMsg[]; subtotal: number; discount?: number; total: number }
  | { kind: 'qr'; amount: number; qrImageUrl?: string | null; promptpayId?: string; merchantName?: string }
  | { kind: 'success'; total: number; orderNumber: string };

const SUCCESS_DISPLAY_MS = 6000;

/**
 * Customer-facing screen. Two ways to open it:
 *  - Same machine as the till: a second window dragged onto a customer
 *    monitor. Works via BroadcastChannel alone, no URL params needed.
 *  - A separate device (tablet/phone on the same network): open the
 *    store-specific link (?store=<storeId>, from "Copy display link" in the
 *    topbar) — relayed over the unauthenticated /display socket namespace.
 * Either way it has no login and shows nothing sensitive on its own.
 *
 * Sized to run anywhere from a phone held by a counter customer up to a
 * large landscape monitor — breakpoints scale type/spacing rather than
 * assuming one fixed screen size.
 */
export default function CustomerDisplayPage() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Read once on mount — this page never needs to react to the URL changing.
  const [storeId] = useState<string | undefined>(() =>
    typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search).get('store') || undefined
  );
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
  }, storeId);

  // A quiet clock on the idle screen — mainly reassures staff walking past
  // that the display is live, not frozen.
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6 sm:p-10 lg:p-16">
      <AnimatePresence mode="wait">
        {phase.kind === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <div className="inline-flex mb-6 sm:mb-8">
              <Store className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 xl:w-28 xl:h-28 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold mb-2 sm:mb-3 tracking-tight">
              {t('display.welcome')}
            </h1>
            <p className="text-muted-foreground text-base sm:text-xl lg:text-2xl xl:text-3xl">
              {t('display.idleHint')}
            </p>
            {now && (
              <p className="text-muted-foreground/60 text-sm sm:text-base xl:text-lg mt-8 sm:mt-12 tabular-nums">
                {now}
              </p>
            )}
          </motion.div>
        )}

        {phase.kind === 'cart' && (
          <motion.div
            key="cart"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl"
          >
            {phase.storeName && (
              <div className="text-center text-muted-foreground mb-3 sm:mb-5 text-base sm:text-xl xl:text-2xl">
                {phase.storeName}
              </div>
            )}
            <div className="bg-card border border-border rounded-2xl sm:rounded-3xl shadow-card p-5 sm:p-8 lg:p-10 xl:p-12">
              <div className="flex items-baseline justify-between mb-3 sm:mb-5">
                <span className="text-xs sm:text-sm xl:text-base font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('display.yourOrder')}
                </span>
                <span className="text-xs sm:text-sm xl:text-base text-muted-foreground tabular-nums">
                  {phase.items.reduce((n, i) => n + i.qty, 0)} {t('display.items')}
                </span>
              </div>
              <div className="space-y-2.5 sm:space-y-4 max-h-[45dvh] sm:max-h-[50dvh] overflow-y-auto scrollbar-thin">
                <AnimatePresence initial={false}>
                  {phase.items.map((it, i) => (
                    <motion.div
                      key={`${it.name}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex justify-between items-baseline gap-3"
                    >
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-base sm:text-xl xl:text-2xl font-bold tabular-nums text-primary shrink-0">
                          {it.qty}×
                        </span>
                        <span className="text-base sm:text-xl xl:text-2xl truncate">{it.name}</span>
                      </div>
                      <span className="text-base sm:text-xl xl:text-2xl font-semibold tabular-nums shrink-0">
                        {formatCurrency(it.unitPrice * it.qty)}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="border-t border-border mt-4 sm:mt-6 pt-3 sm:pt-4 space-y-1 sm:space-y-1.5">
                <div className="flex justify-between items-center text-muted-foreground text-sm sm:text-base xl:text-lg">
                  <span>{t('cart.subtotal')}</span>
                  <span className="tabular-nums">{formatCurrency(phase.subtotal)}</span>
                </div>
                {!!phase.discount && phase.discount > 0 && (
                  <div className="flex justify-between items-center text-primary text-sm sm:text-base xl:text-lg">
                    <span>{t('cart.discount')}</span>
                    <span className="tabular-nums">-{formatCurrency(phase.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 sm:pt-3">
                  <span className="text-lg sm:text-2xl xl:text-3xl font-semibold">{t('display.total')}</span>
                  <span className="text-2xl sm:text-4xl xl:text-5xl font-bold text-primary tabular-nums">
                    {formatCurrency(phase.total)}
                  </span>
                </div>
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
            transition={{ duration: 0.3 }}
            className="text-center w-full max-w-xs sm:max-w-sm md:max-w-md xl:max-w-lg"
          >
            <h2 className="text-xl sm:text-3xl xl:text-4xl font-bold mb-1 sm:mb-2">{t('display.scanToPay')}</h2>
            {phase.qrImageUrl ? (
              <>
                <p className="text-muted-foreground text-base sm:text-xl mb-4 sm:mb-6 tabular-nums">
                  {formatCurrency(phase.amount)}
                </p>
                <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 inline-block">
                  <img
                    src={phase.qrImageUrl}
                    alt="PromptPay QR"
                    className="w-56 sm:w-72 lg:w-80 xl:w-96 aspect-square object-contain"
                  />
                </div>
              </>
            ) : phase.promptpayId ? (
              <div className="mt-3 sm:mt-4">
                <PromptPayQR promptpayId={phase.promptpayId} amount={phase.amount} merchantName={phase.merchantName} />
              </div>
            ) : null}
          </motion.div>
        )}

        {phase.kind === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            >
              <CheckCircle2 className="w-16 h-16 sm:w-24 sm:h-24 lg:w-28 lg:h-28 xl:w-36 xl:h-36 text-success mx-auto mb-3 sm:mb-5" />
            </motion.div>
            <h2 className="text-2xl sm:text-4xl xl:text-5xl font-bold mb-2 sm:mb-3">{t('display.thankYou')}</h2>
            <p className="text-muted-foreground text-sm sm:text-lg xl:text-xl mb-1">{t('display.paidAmount')}</p>
            <p className="text-3xl sm:text-5xl xl:text-6xl font-bold text-primary tabular-nums">
              {formatCurrency(phase.total)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
