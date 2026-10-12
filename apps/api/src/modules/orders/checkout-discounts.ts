/**
 * Checkout discounts: the one place that decides how much comes off a bill.
 *
 *  - manual (cashier) discount   → capped to the subtotal
 *  - promotion                   → RE-DERIVED on the server from the promotion
 *                                  row + the order's real lines; the client's
 *                                  `promotionDiscount` is never trusted
 *  - loyalty reward redemption   → ACTIVE RewardRedemption code, claimed
 *                                  atomically in the order's transaction
 *  - stamp / points discounts    → computed by the caller, passed through here
 *
 * The result feeds the SAME computeTotals() math (VAT / service charge) that
 * every order path already uses, so totals, receipts and reports agree.
 */
import { Prisma } from '@prisma/client';
import { BadRequest } from '../../utils/errors';
import { evaluatePromotion, type CartItemInput } from '../promotions/promotion.service';

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const ZERO = D(0);

export interface DiscountParts {
  manual: Prisma.Decimal;
  promo: Prisma.Decimal;
  reward: Prisma.Decimal;
  stamp: Prisma.Decimal;
  points: Prisma.Decimal;
}

/**
 * Applies the parts in priority order (manual → promotion → reward → stamps →
 * points), each capped to what is still left of the subtotal, so the combined
 * discount can never exceed the bill. Pure.
 */
export function allocateDiscounts(
  subtotal: Prisma.Decimal,
  parts: Partial<DiscountParts>,
): { applied: DiscountParts; total: Prisma.Decimal } {
  let remaining = Prisma.Decimal.max(ZERO, subtotal);
  const take = (want?: Prisma.Decimal) => {
    const w = Prisma.Decimal.max(ZERO, want ?? ZERO);
    const got = Prisma.Decimal.min(w, remaining);
    remaining = remaining.minus(got);
    return got;
  };
  const applied: DiscountParts = {
    manual: take(parts.manual),
    promo: take(parts.promo),
    reward: take(parts.reward),
    stamp: take(parts.stamp),
    points: take(parts.points),
  };
  const total = applied.manual.plus(applied.promo).plus(applied.reward).plus(applied.stamp).plus(applied.points);
  return { applied, total };
}

/** A line discount can't exceed the line's gross value. */
export function capLineDiscount(gross: Prisma.Decimal, discount: number | undefined): Prisma.Decimal {
  return Prisma.Decimal.min(Prisma.Decimal.max(ZERO, D(discount || 0)), Prisma.Decimal.max(ZERO, gross));
}

// ---------------------------------------------------------------- promotions

export interface ResolvedPromotion {
  promotionId: string;
  promotionName: string;
  discount: Prisma.Decimal;
}

/**
 * Server-side promotion resolution. `promotionId` selects WHICH promotion; the
 * amount always comes from evaluatePromotion() over the real order lines.
 * A `promotionDiscount` with no `promotionId` is rejected (can't invent one).
 */
export async function resolvePromotion(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string;
    promotionId?: string;
    promotionDiscount?: number;
    items: CartItemInput[];
    subtotal: Prisma.Decimal;
    customerId?: string;
  },
): Promise<ResolvedPromotion | null> {
  if (!args.promotionId) {
    if (args.promotionDiscount && args.promotionDiscount > 0) {
      throw BadRequest('ต้องระบุโปรโมชั่น (promotionId) เมื่อใช้ส่วนลดโปรโมชั่น', 'PROMOTION_REQUIRED');
    }
    return null;
  }
  const promo = await tx.promotion.findFirst({ where: { id: args.promotionId, storeId: args.storeId } });
  if (!promo || !promo.isActive) {
    throw BadRequest('ไม่พบโปรโมชั่นนี้หรือปิดใช้งานแล้ว', 'PROMOTION_INVALID');
  }
  const result = evaluatePromotion(
    promo,
    { items: args.items, subtotal: args.subtotal.toNumber(), customerId: args.customerId },
    undefined,
    new Date(),
    false, // staff pick from the list — no code to type
  );
  if (!result) {
    throw BadRequest(`โปรโมชั่น "${promo.name}" ใช้กับบิลนี้ไม่ได้ (เงื่อนไขไม่ครบ/หมดเวลา/ครบจำนวนสิทธิ์)`, 'PROMOTION_NOT_APPLICABLE');
  }
  return { promotionId: promo.id, promotionName: result.promotionName, discount: D(result.discountAmount) };
}

/** Atomically takes one use of a promotion (honours usageLimit under concurrency). */
export async function consumePromotionUse(tx: Prisma.TransactionClient, promotionId: string): Promise<void> {
  const n = await tx.$executeRaw`
    UPDATE "Promotion" SET "usageCount" = "usageCount" + 1
    WHERE id = ${promotionId} AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
  if (n === 0) throw BadRequest('โปรโมชั่นนี้ครบจำนวนสิทธิ์แล้ว', 'PROMOTION_EXHAUSTED');
}

// ------------------------------------------------------- reward redemptions

export interface ClaimedRedemption {
  id: string;
  code: string;
  rewardName: string;
  kind: 'DISCOUNT' | 'FREE_ITEM';
  /** Baht the reward is worth before capping (0 for FREE_ITEM). */
  amount: Prisma.Decimal;
}

export const normalizeRedemptionCode = (code: string) => code.trim().toUpperCase();

/**
 * Loads the ACTIVE redemption for this store and claims it (ACTIVE → USED) in
 * one conditional UPDATE. Because that UPDATE only matches status = ACTIVE,
 * two concurrent orders using one code serialise on the row lock and exactly
 * one wins; the loser gets count 0 and its whole transaction rolls back.
 * Must be called inside the order's transaction.
 */
export async function claimRedemption(
  tx: Prisma.TransactionClient,
  storeId: string,
  rawCode: string,
): Promise<ClaimedRedemption> {
  const code = normalizeRedemptionCode(rawCode);
  // Scoped by storeId: another store's code looks exactly like an unknown one.
  const r = await tx.rewardRedemption.findFirst({
    where: { storeId, code },
    include: { reward: { select: { name: true, kind: true, discountAmount: true } } },
  });
  if (!r) throw BadRequest('ไม่พบโค้ดรางวัลนี้', 'REDEMPTION_NOT_FOUND');
  if (r.status === 'USED') throw BadRequest('โค้ดรางวัลนี้ถูกใช้ไปแล้ว', 'REDEMPTION_USED');
  if (r.status === 'CANCELLED') throw BadRequest('โค้ดรางวัลนี้ถูกยกเลิกแล้ว', 'REDEMPTION_CANCELLED');

  const claimed = await tx.rewardRedemption.updateMany({
    where: { id: r.id, storeId, status: 'ACTIVE' },
    data: { status: 'USED', usedAt: new Date() },
  });
  if (claimed.count === 0) {
    // Lost the race to a concurrent order.
    throw BadRequest('โค้ดรางวัลนี้ถูกใช้ไปแล้ว', 'REDEMPTION_USED');
  }
  return {
    id: r.id,
    code: r.code,
    rewardName: r.reward.name,
    kind: r.reward.kind,
    amount: r.reward.kind === 'DISCOUNT' ? D(r.reward.discountAmount) : ZERO,
  };
}

/** Links the claimed redemption to the order that consumed it. */
export async function attachRedemptionToOrder(tx: Prisma.TransactionClient, redemptionId: string, orderId: string) {
  await tx.rewardRedemption.update({ where: { id: redemptionId }, data: { orderId } });
}

/** Note line recorded on the order for a redeemed reward (also covers FREE_ITEM, which has no money value). */
export function redemptionNote(c: ClaimedRedemption, applied: Prisma.Decimal): string {
  return c.kind === 'FREE_ITEM'
    ? `🎁 รางวัล: ${c.rewardName} (${c.code}) — แถมฟรี`
    : `🎁 รางวัล: ${c.rewardName} (${c.code}) — ลด ${applied.toFixed(2)} บาท`;
}

export function joinNotes(...parts: (string | null | undefined)[]): string | undefined {
  const s = parts.filter((p) => p && p.trim()).join(' | ');
  return s || undefined;
}

/** What the API returns alongside the order so clients can show "reward applied". */
export function appliedRewardView(c: ClaimedRedemption | null, applied: Prisma.Decimal) {
  return c
    ? { code: c.code, name: c.rewardName, kind: c.kind, discountApplied: applied.toNumber() }
    : null;
}
