interface TaxConfig {
  taxRate: number;
  serviceCharge: number;
  priceIncludesTax: boolean;
}

/** Mirrors apps/api's order-tab.service.ts computeTotals (and order.service.ts create()) —
 * `discount` is the TOTAL order discount (manual + promotion + points + reward). The server
 * recomputes and is authoritative; this keeps the quoted amount equal to the server's total. */
export function computeTotals(subtotal: number, store: TaxConfig, discount = 0) {
  const afterDiscount = Math.max(0, subtotal - discount);
  const serviceCharge = (afterDiscount * store.serviceCharge) / 100;
  const tax = store.priceIncludesTax
    ? (afterDiscount * store.taxRate) / (store.taxRate + 100)
    : (afterDiscount * store.taxRate) / 100;
  const total = store.priceIncludesTax ? afterDiscount + serviceCharge : afterDiscount + tax + serviceCharge;
  return { tax, serviceCharge, total };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ManualDiscount {
  mode: 'AMOUNT' | 'PERCENT';
  value: number;
  reason: string;
}

/** Manual discount in baht, never above `base` (the subtotal). Percent is capped at 100. */
export function manualDiscountAmount(d: ManualDiscount | undefined, base: number): number {
  if (!d || !(d.value > 0) || base <= 0) return 0;
  const raw = d.mode === 'PERCENT' ? (base * Math.min(100, d.value)) / 100 : d.value;
  return round2(Math.min(base, Math.max(0, raw)));
}

export interface DiscountInput {
  subtotal: number;
  manual?: ManualDiscount;
  promoAmount?: number;
  rewardAmount?: number;
  /** Stamp-card reward value (the store's stampRewardValue) when the cashier redeems a full card. */
  stampAmount?: number;
  /** Points the cashier asked to redeem. */
  points?: number;
  pointValue?: number;
  minRedeemPoints?: number;
}

export interface DiscountBreakdown {
  manual: number;
  promo: number;
  reward: number;
  stamp: number;
  /** Points actually applied (after clamping to what the remaining bill can absorb). */
  points: number;
  pointsAmount: number;
  total: number;
}

/** Highest whole number of points the bill can still absorb (1 point = pointValue baht). */
export function maxRedeemablePoints(remaining: number, balance: number, pointValue: number, minRedeem = 0) {
  if (!(pointValue > 0) || remaining <= 0) return 0;
  const m = Math.min(balance, Math.floor(remaining / pointValue + 1e-9));
  return m < minRedeem ? 0 : Math.max(0, m);
}

/** Applies discounts in a fixed order (manual → promotion → reward code → stamps → points, same as the server's allocateDiscounts) so their sum can
 * never exceed the subtotal. The amounts sent to the server are exactly these. */
export function resolveDiscounts(i: DiscountInput): DiscountBreakdown {
  const manual = manualDiscountAmount(i.manual, i.subtotal);
  let remaining = Math.max(0, i.subtotal - manual);
  const promo = round2(Math.min(remaining, Math.max(0, i.promoAmount ?? 0)));
  remaining -= promo;
  const reward = round2(Math.min(remaining, Math.max(0, i.rewardAmount ?? 0)));
  remaining -= reward;
  const stamp = round2(Math.min(remaining, Math.max(0, i.stampAmount ?? 0)));
  remaining -= stamp;
  const pv = i.pointValue ?? 0;
  const points = (i.points ?? 0) > 0 ? Math.min(i.points!, maxRedeemablePoints(remaining, i.points!, pv, i.minRedeemPoints ?? 0)) : 0;
  const pointsAmount = round2(points * pv);
  return { manual, promo, reward, stamp, points, pointsAmount, total: round2(manual + promo + reward + stamp + pointsAmount) };
}
