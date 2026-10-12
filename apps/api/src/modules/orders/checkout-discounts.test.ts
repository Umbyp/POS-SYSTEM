import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { allocateDiscounts, capLineDiscount, redemptionNote } from './checkout-discounts';
import { computeTotals } from './order-tab.service';
import { evaluatePromotion } from '../promotions/promotion.service';

const d = (n: number) => new Prisma.Decimal(n);
const store = { taxRate: 7, serviceCharge: 0, priceIncludesTax: false };

describe('allocateDiscounts', () => {
  it('sums parts when they fit inside the subtotal', () => {
    const { applied, total } = allocateDiscounts(d(200), { manual: d(20), promo: d(30), reward: d(50) });
    expect(applied.manual.toNumber()).toBe(20);
    expect(applied.promo.toNumber()).toBe(30);
    expect(applied.reward.toNumber()).toBe(50);
    expect(total.toNumber()).toBe(100);
  });

  it('caps the combined discount at the subtotal, in priority order', () => {
    const { applied, total } = allocateDiscounts(d(100), { manual: d(60), promo: d(30), reward: d(50), points: d(10) });
    expect(applied.manual.toNumber()).toBe(60);
    expect(applied.promo.toNumber()).toBe(30);
    expect(applied.reward.toNumber()).toBe(10); // only what's left
    expect(applied.points.toNumber()).toBe(0);
    expect(total.toNumber()).toBe(100);
  });

  it('caps a manual discount larger than the bill', () => {
    const { total } = allocateDiscounts(d(80), { manual: d(9999) });
    expect(total.toNumber()).toBe(80);
  });

  it('ignores negative / missing parts', () => {
    const { total } = allocateDiscounts(d(50), { manual: d(-5) });
    expect(total.toNumber()).toBe(0);
  });

  it('feeds computeTotals so VAT is taken on the discounted amount', () => {
    const { total: disc } = allocateDiscounts(d(200), { reward: d(50) });
    const { tax, total } = computeTotals(d(200), disc, store);
    expect(tax.toNumber()).toBeCloseTo(10.5, 5); // 7% of 150
    expect(total.toNumber()).toBeCloseTo(160.5, 5);
  });

  it('a fully discounted bill totals zero', () => {
    const { total: disc } = allocateDiscounts(d(60), { reward: d(500) });
    expect(computeTotals(d(60), disc, store).total.toNumber()).toBe(0);
  });
});

describe('capLineDiscount', () => {
  it('never exceeds the line gross', () => {
    expect(capLineDiscount(d(120), 500).toNumber()).toBe(120);
    expect(capLineDiscount(d(120), 20).toNumber()).toBe(20);
    expect(capLineDiscount(d(120), undefined).toNumber()).toBe(0);
  });
});

describe('redemptionNote', () => {
  it('records FREE_ITEM rewards by name with no money', () => {
    const n = redemptionNote({ id: 'x', code: 'ABC123', rewardName: 'ชาไทยฟรี', kind: 'FREE_ITEM', amount: d(0) }, d(0));
    expect(n).toContain('ชาไทยฟรี');
    expect(n).toContain('ABC123');
  });
});

describe('evaluatePromotion (server-side promotion recompute)', () => {
  const base: any = {
    id: 'p1', name: 'ลด 10%', isActive: true, type: 'PERCENT_OFF', scope: 'ALL_ORDER', value: 10,
    code: null, memberOnly: false, minSpend: null, daysOfWeek: [], hourStart: null, hourEnd: null,
    startAt: null, endAt: null, usageLimit: null, usageCount: 0, productIds: [], categoryIds: [],
  };
  const cart = { items: [{ productId: 'a', quantity: 2, unitPrice: 100 }], subtotal: 200 };

  it('computes the amount itself', () => {
    expect(evaluatePromotion(base, cart)?.discountAmount).toBe(20);
  });
  it('rejects when min spend is not met, inactive, expired, exhausted or member-only', () => {
    expect(evaluatePromotion({ ...base, minSpend: 500 }, cart)).toBeNull();
    expect(evaluatePromotion({ ...base, isActive: false }, cart)).toBeNull();
    expect(evaluatePromotion({ ...base, endAt: new Date(Date.now() - 1000) }, cart)).toBeNull();
    expect(evaluatePromotion({ ...base, usageLimit: 5, usageCount: 5 }, cart)).toBeNull();
    expect(evaluatePromotion({ ...base, memberOnly: true }, cart)).toBeNull();
  });
  it('code-gated promotion needs the code unless checkCode=false (staff pick)', () => {
    const p = { ...base, code: 'SAVE' };
    expect(evaluatePromotion(p, cart)).toBeNull();
    expect(evaluatePromotion(p, cart, 'SAVE')?.discountAmount).toBe(20);
    expect(evaluatePromotion(p, cart, undefined, new Date(), false)?.discountAmount).toBe(20);
  });
  it('never discounts more than the subtotal', () => {
    const p = { ...base, type: 'FIXED_OFF', value: 9999 };
    expect(evaluatePromotion(p, cart)?.discountAmount).toBe(200);
  });
});
