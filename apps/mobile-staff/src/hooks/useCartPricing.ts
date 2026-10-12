import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart.store';
import { useStoreConfig } from '@/stores/storeConfig.store';
import { computeTotals, resolveDiscounts, maxRedeemablePoints } from '@/lib/pricing';
import { evaluatePromotion, isLive, type PromoCartItem, type PromoEvaluation } from '@/lib/promotions';
import type { Order, Promotion } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';

/** The one place the cart's money is worked out, so the cart panel, the discount/member sheets and
 * the payment modal all quote the same numbers the server will compute.
 *
 * `order` is the running bill when paying/looking at an open dine-in tab; the bill's subtotal and
 * lines then count alongside any still-unsent cart items. */
export function useCartPricing(order?: Order | null) {
  const customer = useCart((s) => s.customer);
  const items = useCart((s) => s.items);
  const manualDiscount = useCart((s) => s.manualDiscount);
  const promotion = useCart((s) => s.promotion);
  const pointsToRedeem = useCart((s) => s.pointsToRedeem);
  const redemption = useCart((s) => s.redemption);
  const useStampRewardFlag = useCart((s) => s.useStampReward);
  const cachedConfig = useStoreConfig((s) => s.config);

  const { data: store } = useQuery({
    queryKey: ['store-me'],
    queryFn: async () => (await api.get('/stores/me')).data as StoreSettings,
  });

  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions'],
    queryFn: async () => (await api.get('/promotions')).data as Promotion[],
    staleTime: 60_000,
  });

  const taxConfig = store ?? cachedConfig;
  const pointValue = Number(store?.pointValue ?? 1);
  const minRedeemPoints = store?.minRedeemPoints ?? 0;
  const pointsEnabled = !!store && (store.loyaltyMode === 'POINTS' || store.loyaltyMode === 'BOTH');

  const stampsEnabled = !!store && (store.loyaltyMode === 'STAMPS' || store.loyaltyMode === 'BOTH');
  const stampsPerReward = store?.stampsPerReward ?? 0;
  const stampRewardValue = Number(store?.stampRewardValue ?? 0);
  const stampRewardName = store?.stampRewardName || 'รางวัลบัตรสะสม';
  /** The attached member holds a full card (server re-checks and rejects otherwise). */
  const stampRewardAvailable = stampsEnabled && !!customer && stampsPerReward > 0 && customer.stamps >= stampsPerReward;
  const stampRewardActive = stampRewardAvailable && useStampRewardFlag;

  const unsentSubtotal = useMemo(() => items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [items]);
  const baseSubtotal = (order ? Number(order.subtotal) : 0) + unsentSubtotal;

  const promoItems = useMemo<PromoCartItem[]>(() => {
    const fromCart = items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, categoryId: i.categoryId }));
    const fromOrder = (order?.items ?? [])
      .filter((i) => i.quantity - (i.refundedQty || 0) > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity - (i.refundedQty || 0),
        unitPrice: Number(i.unitPrice),
        categoryId: i.product?.categoryId ?? undefined,
      }));
    return [...fromOrder, ...fromCart];
  }, [items, order]);

  /** Every live promotion, priced against the current bill. */
  const evaluations = useMemo<PromoEvaluation[]>(
    () =>
      promotions
        .filter((p) => isLive(p))
        .map((p) => evaluatePromotion(p, { items: promoItems, subtotal: baseSubtotal, hasCustomer: !!customer }))
        .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discount - a.discount),
    [promotions, promoItems, baseSubtotal, customer]
  );

  // Re-price the applied promotion on every change (cart edits, member change). When the promotions
  // list isn't available (offline) fall back to the amount it was last priced at.
  const appliedPromo = useMemo(() => {
    if (!promotion) return null;
    const found = promotions.find((p) => p.id === promotion.id);
    if (!found) return promotions.length === 0 ? { id: promotion.id, name: promotion.name, amount: promotion.amount, stale: false } : null;
    const ev = evaluatePromotion(found, { items: promoItems, subtotal: baseSubtotal, hasCustomer: !!customer });
    return ev.eligible ? { id: found.id, name: ev.label, amount: ev.discount, stale: false } : { id: found.id, name: found.name, amount: 0, stale: true };
  }, [promotion, promotions, promoItems, baseSubtotal, customer]);

  const discounts = useMemo(
    () =>
      resolveDiscounts({
        subtotal: baseSubtotal,
        manual: manualDiscount,
        promoAmount: appliedPromo?.amount ?? 0,
        rewardAmount: redemption?.kind === 'DISCOUNT' ? redemption.discountAmount : 0,
        stampAmount: stampRewardActive ? stampRewardValue : 0,
        points: pointsEnabled && customer ? Math.min(pointsToRedeem, customer.points) : 0,
        pointValue,
        minRedeemPoints,
      }),
    [baseSubtotal, manualDiscount, appliedPromo, redemption, stampRewardActive, stampRewardValue, pointsEnabled, customer, pointsToRedeem, pointValue, minRedeemPoints]
  );

  const totals = taxConfig ? computeTotals(baseSubtotal, taxConfig, discounts.total) : null;

  /** Most points that could still be redeemed given the other discounts. */
  const maxPoints = useMemo(() => {
    if (!pointsEnabled || !customer) return 0;
    const others = discounts.manual + discounts.promo + discounts.reward + discounts.stamp;
    return maxRedeemablePoints(Math.max(0, baseSubtotal - others), customer.points, pointValue, minRedeemPoints);
  }, [pointsEnabled, customer, discounts, baseSubtotal, pointValue, minRedeemPoints]);

  /** Discount-related fields every order path sends (create / settle). Zero values are omitted. */
  const adjustmentFields = {
    discount: discounts.manual,
    ...(customer ? { customerId: customer.id } : {}),
    ...(discounts.points > 0 ? { pointsToRedeem: discounts.points } : {}),
    ...(appliedPromo && appliedPromo.amount > 0
      ? { promotionId: appliedPromo.id, promotionDiscount: appliedPromo.amount, promotionName: appliedPromo.name }
      : {}),
    ...(redemption ? { redemptionCode: redemption.code } : {}),
    ...(stampRewardActive ? { useStampReward: true } : {}),
  };

  return {
    store,
    taxConfig,
    baseSubtotal,
    unsentSubtotal,
    discounts,
    totals,
    maxPoints,
    pointValue,
    minRedeemPoints,
    pointsEnabled,
    stampsEnabled,
    stampsPerReward,
    stampRewardValue,
    stampRewardName,
    stampRewardAvailable,
    stampRewardActive,
    promotions,
    evaluations,
    appliedPromo,
    adjustmentFields,
  };
}
