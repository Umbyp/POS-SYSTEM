'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, X, ShoppingBag, Trash2, UserPlus, Sparkles, PauseCircle, Loader2, Tag } from 'lucide-react';
import { useCart } from '@/stores/cart.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { computePricing, DEFAULT_TAX_CONFIG } from '@/lib/pricing';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { CustomerPicker } from '@/components/customers/CustomerPicker';

export function Cart({ onCheckout }: { onCheckout: () => void }) {
  const {
    items,
    discount,
    pointsToRedeem,
    promotion,
    promoCode,
    type,
    tableId,
    customer,
    setType,
    setTable,
    setDiscount,
    setPointsToRedeem,
    setPromotion,
    setPromoCode,
    setCustomer,
    updateQty,
    removeItem,
    clear,
    subtotal,
  } = useCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const qc = useQueryClient();

  const park = useMutation({
    mutationFn: (payload: any) => api.post('/orders/park', payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('Order parked');
      qc.invalidateQueries({ queryKey: ['parked-orders'] });
      qc.invalidateQueries({ queryKey: ['parked-count'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      clear();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to park order'),
  });

  const handlePark = () => {
    if (items.length === 0) return;
    park.mutate({
      type,
      tableId,
      customerId: customer?.id,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes,
        variants: i.variants,
      })),
      discount,
    });
  };

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

  const sub = subtotal();
  const pointDiscount = pointsToRedeem; // 1pt = 1 บาท
  const promoDiscount = promotion?.discountAmount || 0;
  const breakdown = computePricing(sub, discount + pointDiscount + promoDiscount, cfg);

  // Auto-apply promotion เมื่อ cart/customer/code เปลี่ยน
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
        // ignore — โปรเงียบๆ
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
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPickerOpen(true)}
          className="mb-3 w-full px-3 py-2 rounded-md border border-dashed border-border hover:border-primary hover:bg-card-hover text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Select customer
        </button>
      )}

      {/* Order type — flat tabs */}
      <div className="grid grid-cols-3 gap-1 mb-3 text-xs border border-border rounded-md p-0.5">
        {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`py-1.5 rounded-sm transition-colors ${
              type === t
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'DINE_IN' ? 'Dine-in' : t === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
          </button>
        ))}
      </div>

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
              className="w-full h-9 bg-card border border-border rounded-lg px-3 text-sm"
            >
              <option value="">Select table (optional)</option>
              {selectable.map((t: any) => (
                <option key={t.id} value={t.id}>
                  Table {t.number} · {t.capacity} seats
                  {t.status === 'RESERVED' ? ' · (Reserved)' : ''}
                  {t.status === 'OCCUPIED' ? ' · (Occupied)' : ''}
                </option>
              ))}
            </select>
            {hiddenCount > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1 px-1">
                {hiddenCount} occupied table{hiddenCount !== 1 ? 's' : ''} hidden
              </div>
            )}
          </div>
        );
      })()}

      {/* Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin -mx-2 px-2 space-y-2">
        <AnimatePresence>
          {items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              No items in cart yet
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
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center border border-border rounded-md">
                    <button
                      onClick={() => updateQty(item.productId, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-card-hover text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.productId, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-card-hover text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
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
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(sub)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Discount</span>
          <input
            type="number"
            min={0}
            value={discount || ''}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            className="w-24 h-7 bg-input border border-border rounded px-2 text-right tabular-nums text-sm"
            placeholder="0"
          />
        </div>

        {/* Promotion auto-applied */}
        {promotion && (
          <div className="flex items-center justify-between text-success text-xs">
            <span className="truncate">{promotion.promotionName}</span>
            <span className="tabular-nums font-medium">
              -{formatCurrency(promotion.discountAmount)}
            </span>
          </div>
        )}

        {/* Promo code input */}
        <div className="flex items-center gap-1 text-xs">
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Promo code (optional)"
            className="flex-1 h-7 bg-card border border-border rounded px-2 font-mono uppercase text-xs"
          />
        </div>

        {/* Redeem points */}
        {customer && (customer.points ?? 0) > 0 && (
          <div className="bg-primary/5 border border-primary/30 rounded-lg p-2 -mx-1">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" />
                Redeem points (you have {customer.points} pts)
              </span>
              {pointsToRedeem > 0 && (
                <button
                  onClick={() => setPointsToRedeem(0)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
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
                Use max
              </button>
            </div>
            {pointsToRedeem > 0 && (
              <div className="text-[10px] text-primary mt-1">
                -{formatCurrency(pointDiscount)} · {customer.points! - pointsToRedeem} pts remaining
              </div>
            )}
          </div>
        )}
        {breakdown.serviceCharge > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Service charge ({cfg.serviceCharge}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.serviceCharge)}</span>
          </div>
        )}
        {/* VAT-exclusive */}
        {!cfg.priceIncludesTax && cfg.taxRate > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>VAT ({cfg.taxRate}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.tax)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-2 mt-1 border-t border-border">
          <span>Total</span>
          <span className="tabular-nums text-primary">{formatCurrency(breakdown.total)}</span>
        </div>
        {cfg.priceIncludesTax && cfg.taxRate > 0 && breakdown.tax > 0 && (
          <div className="flex justify-between text-[10px] text-muted-foreground/60">
            <span>(incl. VAT {cfg.taxRate}%)</span>
            <span className="tabular-nums">{formatCurrency(breakdown.tax)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Button
          variant="outline"
          disabled={items.length === 0 || park.isPending}
          onClick={handlePark}
          className="col-span-1"
        >
          {park.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <PauseCircle className="w-4 h-4 mr-1" /> Park
            </>
          )}
        </Button>
        <Button
          size="lg"
          className="col-span-2"
          disabled={items.length === 0}
          onClick={onCheckout}
        >
          Pay {formatCurrency(breakdown.total)}
        </Button>
      </div>

      <CustomerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={setCustomer}
      />
    </div>
  );
}
