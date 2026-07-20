'use client';
import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ShoppingCart, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/stores/cart.store';
import { formatCurrency } from '@/lib/format';
import { computePricing, DEFAULT_TAX_CONFIG } from '@/lib/pricing';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Cart } from './Cart';

/**
 * Mobile/Tablet cart UI:
 *   1. Sticky floating button at bottom — shows item count + total
 *   2. Tapping opens a bottom sheet (~92vh) that contains the full Cart
 *
 * Only renders below `lg` breakpoint (< 1024px). On desktop the regular
 * sidebar cart in pos/page.tsx is shown instead.
 */
export function MobileCartSheet({ onCheckout }: { onCheckout: () => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal);
  const discount = useCart((s) => s.discount);
  const promotion = useCart((s) => s.promotion);
  const pointsToRedeem = useCart((s) => s.pointsToRedeem);

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: () => api.get('/stores/me').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const cfg = {
    taxRate: store?.taxRate ?? DEFAULT_TAX_CONFIG.taxRate,
    priceIncludesTax: store?.priceIncludesTax ?? DEFAULT_TAX_CONFIG.priceIncludesTax,
    serviceCharge: store?.serviceCharge ?? DEFAULT_TAX_CONFIG.serviceCharge,
  };

  const sub = subtotal();
  const promoDiscount = promotion?.discountAmount || 0;
  const breakdown = computePricing(sub, discount + pointsToRedeem + promoDiscount, cfg);
  const total = breakdown.total;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const hasItems = items.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* Floating action button — only render when there are items, and only
          visible below the lg breakpoint. Using conditional render (not
          inline `display:none`) so Tailwind's `lg:hidden` is not overridden */}
      {hasItems && (
        <DialogPrimitive.Trigger asChild>
          <button
            className="lg:hidden fixed bottom-4 left-4 right-4 z-30 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.98] transition-transform flex items-center justify-between px-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {itemCount}
                </span>
              </div>
              <span className="font-medium">{t('cart.viewCart')}</span>
            </div>
            <span className="text-lg font-bold tabular-nums">{formatCurrency(total)}</span>
          </button>
        </DialogPrimitive.Trigger>
      )}

      <DialogPrimitive.Portal>
        <AnimatePresence>
          {open && (
            <>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
                />
              </DialogPrimitive.Overlay>

              <DialogPrimitive.Content
                asChild
                forceMount
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-card rounded-t-3xl shadow-2xl border-t border-border flex flex-col"
                  style={{ height: '92dvh' }}
                >
                  {/* Drag handle */}
                  <div className="pt-2 pb-1 flex flex-col items-center shrink-0">
                    <button
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="w-12 h-1.5 rounded-full bg-border hover:bg-muted-foreground transition-colors"
                    />
                  </div>

                  {/* Title row */}
                  <div className="flex items-center justify-between px-4 pb-2 shrink-0">
                    <DialogPrimitive.Title className="sr-only">{t('cart.basket')}</DialogPrimitive.Title>
                    <span className="text-sm text-muted-foreground">
                      {itemCount} {t('cart.items')}
                    </span>
                    <button
                      onClick={() => setOpen(false)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                      aria-label="Close"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Cart content — Cart component already handles its own scroll */}
                  <div className="flex-1 min-h-0 px-4 pb-[env(safe-area-inset-bottom)] overflow-hidden">
                    <Cart
                      onCheckout={() => {
                        setOpen(false);
                        onCheckout();
                      }}
                    />
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Empty-cart placeholder shown on mobile when cart has no items
 * (replaces the floating button which is hidden when empty).
 */
export function MobileCartEmptyHint() {
  const itemCount = useCart((s) => s.items.length);
  const t = useT();
  if (itemCount > 0) return null;
  return (
    <div className="lg:hidden fixed bottom-4 left-4 right-4 z-20 h-12 rounded-2xl bg-muted/80 backdrop-blur-sm border border-border text-muted-foreground text-sm flex items-center justify-center gap-2 pointer-events-none">
      <ShoppingCart className="w-4 h-4" />
      {t('cart.empty')}
    </div>
  );
}
