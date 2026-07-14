'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, X, ShoppingBag, Trash2, UserPlus, Sparkles, Tag, Bike, ChevronDown, Send, Loader2, Ban } from 'lucide-react';
import { useCart } from '@/stores/cart.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { computePricing, DEFAULT_TAX_CONFIG } from '@/lib/pricing';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { VoidItemDialog } from '@/components/pos/VoidItemDialog';
import { sendToCustomerDisplay } from '@/lib/customerDisplay';

export function Cart({ onCheckout }: { onCheckout: () => void }) {
  const {
    items,
    discount,
    pointsToRedeem,
    useStampReward,
    promotion,
    promoCode,
    type,
    tableId,
    customer,
    gpFeePct,
    setType,
    setGpFeePct,
    setTable,
    setDiscount,
    setPointsToRedeem,
    setUseStampReward,
    setPromotion,
    setPromoCode,
    setCustomer,
    openOrderId,
    setOpenOrder,
    updateQty,
    removeItem,
    clearItems,
    clear,
    subtotal,
  } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false); // discounts & promotions section
  const t = useT();
  const qc = useQueryClient();

  // Restaurant "open tab": for dine-in with a table, the bill lives on the
  // server and builds up over rounds. Fetch the table's running bill.
  const isDineInTable = type === 'DINE_IN' && !!tableId;
  const { data: openBill } = useQuery({
    queryKey: ['open-bill', tableId],
    queryFn: () => api.get(`/orders/open/by-table/${tableId}`).then((r) => r.data),
    enabled: isDineInTable,
    refetchOnWindowFocus: true,
  });
  // Keep the store's openOrderId in sync so PaymentDialog knows to settle vs create.
  useEffect(() => {
    setOpenOrder(isDineInTable ? openBill?.id : undefined);
  }, [isDineInTable, openBill?.id, setOpenOrder]);

  const send = useMutation({
    mutationFn: () => {
      const payloadItems = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes,
        variants: i.variants,
      }));
      if (openBill?.id) {
        return api.post(`/orders/${openBill.id}/items`, { items: payloadItems }).then((r) => r.data);
      }
      return api
        .post('/orders/open', { tableId, type, customerId: customer?.id, items: payloadItems })
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast.success(t('cart.sentToKitchen'));
      clearItems();
      qc.invalidateQueries({ queryKey: ['open-bill', tableId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('cart.sendFailed')),
  });

  // Void an already-fired item on the running bill (mistaken order, comp, etc.)
  const [voidingItem, setVoidingItem] = useState<{ id: string; name: string; maxQty: number } | null>(null);
  const voidItem = useMutation({
    mutationFn: ({ qty, reason }: { qty: number; reason: string }) =>
      api
        .post(`/orders/${openBill.id}/items/${voidingItem!.id}/void`, { qty, reason })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(t('void.success'));
      setVoidingItem(null);
      qc.invalidateQueries({ queryKey: ['open-bill', tableId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || t('void.failed')),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/tables').then((r) => r.data),
  });

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

  // Loyalty config for the stamp-card reward toggle
  const loyaltyMode: string = store?.loyaltyMode ?? 'BOTH';
  const stampsEnabled = loyaltyMode === 'STAMPS' || loyaltyMode === 'BOTH';
  const stampsPerReward = Number(store?.stampsPerReward ?? 10);
  const stampRewardValue = Number(store?.stampRewardValue ?? 0);
  const canRedeemStamp =
    stampsEnabled && !!customer && stampsPerReward > 0 &&
    (customer.stamps ?? 0) >= stampsPerReward;
  const stampReward = useStampReward && canRedeemStamp;

  const sub = subtotal();
  const pointDiscount = pointsToRedeem; // 1pt = 1 baht
  const stampDiscount = stampReward ? stampRewardValue : 0;
  const promoDiscount = promotion?.discountAmount || 0;
  const breakdown = computePricing(sub, discount + pointDiscount + stampDiscount + promoDiscount, cfg);

  // Delivery P&L — platform commission (GP fee) eats into the bill, so the
  // owner sees their true take-home the moment they pick the Delivery channel.
  const gpFee = type === 'DELIVERY' ? breakdown.total * (gpFeePct / 100) : 0;
  const netProfit = breakdown.total - gpFee;

  // Mirror the current (unsent) round to the customer-facing display, if one
  // is open. Scoped to the active cart only — once items are sent to the
  // kitchen for an open table bill, this goes back to idle (the checkout QR
  // still works for that flow; only the live line-item mirror doesn't apply).
  useEffect(() => {
    if (items.length === 0) {
      sendToCustomerDisplay({ type: 'idle' });
    } else {
      sendToCustomerDisplay({
        type: 'cart',
        storeName: store?.name,
        items: items.map((i) => ({ name: i.name, qty: i.quantity, unitPrice: i.unitPrice })),
        subtotal: sub,
        discount: breakdown.discount,
        total: breakdown.total,
      });
    }
  }, [items, sub, breakdown.total, store?.name]);

  // Auto-apply promotion when cart/customer/code changes
  const { data: products = [] } = useQuery({
    queryKey: ['products-meta-promo'],
    queryFn: () => api.get('/products').then((r) => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (items.length === 0) {
      setPromotion(undefined);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const enriched = items.map((i) => {
          const p = products.find((x: any) => x.id === i.productId);
          return {
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            categoryId: p?.categoryId,
          };
        });
        const { data } = await api.post('/promotions/apply', {
          items: enriched,
          subtotal: sub,
          customerId: customer?.id,
          code: promoCode || undefined,
        });
        if (data && data.discountAmount > 0) {
          setPromotion({
            promotionId: data.promotionId,
            promotionName: data.promotionName,
            discountAmount: data.discountAmount,
          });
        } else {
          setPromotion(undefined);
        }
      } catch {
        // ignore — fail silently
      }
    }, 400);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items), sub, customer?.id, promoCode, products.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium tracking-wider uppercase text-muted-foreground">
            Cart
          </h2>
          <div className="text-2xl font-semibold tabular-nums mt-0.5">
            {items.length}{' '}
            <span className="text-sm text-muted-foreground font-normal">item{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {items.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-muted-foreground hover:text-danger transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Customer — flat */}
      {customer ? (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded-md bg-card-hover border border-border">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{customer.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {customer.phone}
              {(customer.points ?? 0) > 0 && (
                <span className="text-foreground ml-2">{customer.points} pts</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setCustomer(undefined)}
            className="text-muted-foreground hover:text-foreground p-2 -m-1 touch-manipulation"
            aria-label={t('cart.aria.removeCustomer')}
          >
            <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPickerOpen(true)}
          className="mb-3 w-full h-10 lg:h-auto lg:py-2 px-3 rounded-md border border-dashed border-border hover:border-primary hover:bg-card-hover text-sm lg:text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
        >
          {t('cart.selectCustomer')}
        </button>
      )}

      {/* Order type — flat tabs */}
      <div className="grid grid-cols-3 gap-1 mb-3 text-sm lg:text-xs border border-border rounded-md p-0.5">
        {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).map((tt) => (
          <button
            key={tt}
            onClick={() => setType(tt)}
            className={`py-2.5 lg:py-1.5 rounded-sm transition-colors touch-manipulation ${
              type === tt
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tt === 'DINE_IN' ? t('cart.dineIn') : tt === 'TAKEAWAY' ? t('cart.takeaway') : t('cart.delivery')}
          </button>
        ))}
      </div>

      {/* Delivery net profit — GP fee visualizer (O-VERSE style).
          When Delivery is picked, show the platform commission and the real
          take-home so the owner sees actual earnings instantly. */}
      <AnimatePresence>
        {type === 'DELIVERY' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Bike className="w-3.5 h-3.5 text-primary" />
                  {t('cart.deliveryNetProfit')}
                </span>
                <div className="flex items-center gap-1">
                  {[25, 30, 35].map((p) => (
                    <button
                      key={p}
                      onClick={() => setGpFeePct(p)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums transition-colors ${
                        gpFeePct === p
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="decimal"
                      value={gpFeePct || ''}
                      onChange={(e) => setGpFeePct(Number(e.target.value) || 0)}
                      className="w-12 h-6 bg-card border border-border rounded pl-1.5 pr-4 text-right tabular-nums text-[11px]"
                      aria-label={t('cart.aria.gpFeePercent')}
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('cart.revenue')}</span>
                  <span className="tabular-nums">{formatCurrency(breakdown.total)}</span>
                </div>
                <div className="flex justify-between text-danger">
                  <span>{t('cart.gpFee')} ({gpFeePct}%)</span>
                  <span className="tabular-nums">-{formatCurrency(gpFee)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1 mt-1 border-t border-primary/20">
                  <span className="text-foreground">{t('cart.netProfit')}</span>
                  <span className="tabular-nums text-success">{formatCurrency(netProfit)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table select */}
      {type === 'DINE_IN' && (() => {
        const selectable = (tables as any[]).filter(
          (t) => t.status !== 'OCCUPIED' || t.id === tableId
        );
        const hiddenCount = (tables as any[]).length - selectable.length;
        return (
          <div className="mb-3">
            <select
              value={tableId || ''}
              onChange={(e) => setTable(e.target.value || undefined)}
              className="w-full h-11 lg:h-9 bg-card border border-border rounded-lg px-3 text-base lg:text-sm touch-manipulation"
            >
              <option value="">{t('cart.selectTable')}</option>
              {selectable.map((tb: any) => (
                <option key={tb.id} value={tb.id}>
                  {t('cart.tableWord')} {tb.number} · {tb.capacity} {t('cart.seats')}
                  {tb.status === 'RESERVED' ? ` · (${t('cart.reserved')})` : ''}
                  {tb.status === 'OCCUPIED' ? ` · (${t('cart.occupied')})` : ''}
                </option>
              ))}
            </select>
            {hiddenCount > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1 px-1">
                {hiddenCount} {t('cart.tablesHidden')}
              </div>
            )}
          </div>
        );
      })()}

      {/* Running bill — items already sent to the kitchen for this table */}
      {isDineInTable && openBill && openBill.items?.length > 0 && (
        <div className="mb-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {t('cart.runningBill')}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{openBill.orderNumber}</span>
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
            {openBill.items.map((it: any) => {
              const remainingQty = it.quantity - (it.refundedQty || 0);
              if (remainingQty <= 0) return null; // fully voided — nothing left to show
              return (
                <div key={it.id} className="flex justify-between items-center text-xs">
                  <span className="truncate pr-2">
                    <span className="text-muted-foreground tabular-nums">{remainingQty}×</span>{' '}
                    {it.product?.name || 'สินค้า'}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="tabular-nums">{formatCurrency(Number(it.unitPrice) * remainingQty)}</span>
                    <button
                      onClick={() =>
                        setVoidingItem({ id: it.id, name: it.product?.name || 'สินค้า', maxQty: remainingQty })
                      }
                      className="p-1 -m-1 text-muted-foreground/60 hover:text-danger touch-manipulation"
                      title={t('void.title')}
                    >
                      <Ban className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-sm font-semibold mt-1.5 pt-1.5 border-t border-border">
            <span>{t('cart.total')}</span>
            <span className="tabular-nums text-primary">{formatCurrency(openBill.total)}</span>
          </div>
        </div>
      )}

      {isDineInTable && openBill && items.length > 0 && (
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          {t('cart.newRound')}
        </div>
      )}

      {/* Items — min-h-0 lets this scroll inside a flex parent (otherwise children push it taller than the container) */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mx-2 px-2 space-y-2">
        <AnimatePresence>
          {items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              {t('cart.empty')}
            </div>
          ) : (
            items.map((item) => (
              <motion.div
                key={item.productId}
                layout
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="border-b border-border last:border-b-0 py-2.5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {formatCurrency(item.unitPrice)}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-muted-foreground hover:text-foreground p-2 lg:p-0.5 -m-2 lg:m-0 touch-manipulation"
                    aria-label={t('cart.aria.removeFromCart')}
                  >
                    <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  {/* Touch-friendly +/- on tablet/mobile; compact on desktop to fit narrow sidebar */}
                  <div className="flex items-center border border-border rounded-md">
                    <button
                      onClick={() => updateQty(item.productId, item.quantity - 1)}
                      className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center hover:bg-card-hover active:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                      aria-label={t('cart.aria.decreaseQty')}
                    >
                      <Minus className="w-4 h-4 lg:w-3 lg:h-3" />
                    </button>
                    <span className="w-10 lg:w-8 text-center text-base lg:text-sm font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.productId, item.quantity + 1)}
                      className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center hover:bg-card-hover active:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                      aria-label={t('cart.aria.increaseQty')}
                    >
                      <Plus className="w-4 h-4 lg:w-3 lg:h-3" />
                    </button>
                  </div>
                  <div className="text-base lg:text-sm font-semibold tabular-nums">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Summary */}
      <div className="border-t border-border pt-3 mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{t('cart.subtotal')}</span>
          <span className="tabular-nums">{formatCurrency(sub)}</span>
        </div>
        {/* Promotion auto-applied — always visible */}
        {promotion && (
          <div className="flex items-center justify-between text-success text-xs">
            <span className="truncate">{promotion.promotionName}</span>
            <span className="tabular-nums font-medium">
              -{formatCurrency(promotion.discountAmount)}
            </span>
          </div>
        )}

        {/* Discounts & promotions — collapsed by default to keep the cart clean */}
        <button
          type="button"
          onClick={() => setAdvOpen((v) => !v)}
          className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground py-1 touch-manipulation"
        >
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            {t('cart.discountsPromos')}
            {(discount > 0 || pointsToRedeem > 0 || promoCode) && !advOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Applied" />
            )}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${advOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Collapsed: still show applied manual discount / points so totals stay clear */}
        {!advOpen && discount > 0 && (
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>{t('cart.discount')}</span>
            <span className="tabular-nums">-{formatCurrency(discount)}</span>
          </div>
        )}
        {!advOpen && pointsToRedeem > 0 && (
          <div className="flex justify-between text-primary text-xs">
            <span>{t('cart.pointsRedeemed')}</span>
            <span className="tabular-nums">-{formatCurrency(pointDiscount)}</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {advOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden space-y-1.5"
            >
              {/* Discount input */}
              <div className="flex items-center justify-between text-muted-foreground pt-1">
                <span>{t('cart.discount')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="w-24 h-9 lg:h-7 bg-input border border-border rounded px-2 text-right tabular-nums text-base lg:text-sm"
                  placeholder="0"
                />
              </div>

              {/* Promo code input */}
              <div className="flex items-center gap-1">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder={t('cart.promoPlaceholder')}
                  className="flex-1 h-9 lg:h-7 bg-card border border-border rounded px-2 font-mono uppercase text-sm lg:text-xs"
                />
              </div>

              {/* Redeem points */}
              {customer && (customer.points ?? 0) > 0 && (
                <div className="bg-primary/5 border border-primary/30 rounded-lg p-2 -mx-1">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" />
                      {t('cart.redeemPoints')} ({t('cart.pointsYouHave')} {customer.points} {t('cart.points')})
                    </span>
                    {pointsToRedeem > 0 && (
                      <button
                        onClick={() => setPointsToRedeem(0)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {t('cart.clear')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={Math.min(customer.points!, Math.floor(sub - discount))}
                      value={pointsToRedeem || ''}
                      onChange={(e) => {
                        const maxRedeem = Math.min(
                          customer.points!,
                          Math.max(0, Math.floor(sub - discount))
                        );
                        setPointsToRedeem(
                          Math.min(maxRedeem, Math.max(0, parseInt(e.target.value) || 0))
                        );
                      }}
                      className="flex-1 h-8 bg-card border border-border rounded px-2 text-right tabular-nums text-sm"
                      placeholder="0"
                    />
                    <button
                      onClick={() => {
                        const maxRedeem = Math.min(
                          customer.points!,
                          Math.max(0, Math.floor(sub - discount))
                        );
                        setPointsToRedeem(maxRedeem);
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-primary/15 text-primary font-medium hover:bg-primary/25"
                    >
                      {t('cart.useMax')}
                    </button>
                  </div>
                  {pointsToRedeem > 0 && (
                    <div className="text-[10px] text-primary mt-1">
                      -{formatCurrency(pointDiscount)} · {customer.points! - pointsToRedeem} {t('cart.pointsRemaining')}
                    </div>
                  )}
                </div>
              )}

              {/* Stamp-card reward */}
              {canRedeemStamp && (
                <label className="flex items-center gap-2 bg-indigo-500/5 border border-indigo-500/30 rounded-lg p-2 -mx-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stampReward}
                    onChange={(e) => setUseStampReward(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-medium">
                      ใช้รางวัลบัตรสะสม{store?.stampRewardName ? ` · ${store.stampRewardName}` : ''}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      มี {customer!.stamps} ดวง · แลก {stampsPerReward} ดวง = ส่วนลด {formatCurrency(stampRewardValue)}
                    </div>
                  </div>
                </label>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {breakdown.serviceCharge > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t('cart.serviceCharge')} ({cfg.serviceCharge}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.serviceCharge)}</span>
          </div>
        )}
        {/* VAT-exclusive */}
        {!cfg.priceIncludesTax && cfg.taxRate > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t('cart.vat')} ({cfg.taxRate}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.tax)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-2 mt-1 border-t border-border">
          <span>{t('cart.total')}</span>
          <span className="tabular-nums text-primary">{formatCurrency(breakdown.total)}</span>
        </div>
        {cfg.priceIncludesTax && cfg.taxRate > 0 && breakdown.tax > 0 && (
          <div className="flex justify-between text-[10px] text-muted-foreground/60">
            <span>({t('cart.inclVat')} {cfg.taxRate}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.tax)}</span>
          </div>
        )}
      </div>

      {/* Action buttons — sticky to the bottom of the cart container */}
      <div className="mt-3 pt-3 border-t border-border lg:border-0 lg:pt-0 shrink-0">
        {isDineInTable ? (
          // Restaurant flow: send rounds to the kitchen, settle the bill at the end
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-12 lg:h-10 font-semibold touch-manipulation"
              disabled={items.length === 0 || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" /> {t('cart.sendKitchen')}
                </>
              )}
            </Button>
            <Button
              size="lg"
              className="h-12 lg:h-10 text-base lg:text-sm font-semibold touch-manipulation"
              // With no bill open yet, Pay goes straight through (create + pay +
              // fire to kitchen in one step) — no separate "ส่งครัว" required,
              // for guests who are paying right away. Once a bill IS open, new
              // unsent items must still be sent before settling it.
              disabled={openBill ? items.length > 0 : items.length === 0}
              title={openBill && items.length > 0 ? t('cart.sendFirst') : undefined}
              onClick={onCheckout}
            >
              {t('cart.pay')} {formatCurrency(openBill ? Number(openBill.total) : breakdown.total)}
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full h-12 lg:h-10 text-base lg:text-sm font-semibold touch-manipulation"
            disabled={items.length === 0}
            onClick={onCheckout}
          >
            {t('cart.pay')} {formatCurrency(breakdown.total)}
          </Button>
        )}
      </div>

      <CustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setCustomer}
      />

      <VoidItemDialog
        item={voidingItem}
        loading={voidItem.isPending}
        onClose={() => setVoidingItem(null)}
        onConfirm={(qty, reason) => voidItem.mutate({ qty, reason })}
      />
    </div>
  );
}
