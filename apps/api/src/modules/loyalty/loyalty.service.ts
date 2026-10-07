import { Prisma, PointTxType, RedemptionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { BadRequest, Forbidden, NotFound } from '../../utils/errors';
import { recordPoints, pointsEnabled } from '../orders/points.service';
import {
  DEFAULT_TIERS, EXPIRING_SOON_DAYS, calcDueExpiry, calcExpiringSoon, describeTier,
  generateRedemptionCode, meetsTier, remainingLots, rewardCategory, sortTiers,
  type TierLike,
} from './loyalty.math';

const STAMP_TYPES = [PointTxType.STAMP_EARN, PointTxType.STAMP_REDEEM, PointTxType.STAMP_ADJUST];

// ----------------------------------------------------------------- tiers ----

const toTier = (t: { id: string; name: string; minSpent: Prisma.Decimal; color: string | null; sortOrder: number }): TierLike => ({
  id: t.id, name: t.name, minSpent: Number(t.minSpent), color: t.color, sortOrder: t.sortOrder,
});

/** Tiers of a store, ascending by minSpent. Seeds TEAM/SILVER/GOLD the first time. */
export async function listTiers(storeId: string): Promise<TierLike[]> {
  let rows = await prisma.memberTier.findMany({ where: { storeId } });
  if (rows.length === 0) {
    await prisma.memberTier.createMany({
      data: DEFAULT_TIERS.map((t) => ({ ...t, storeId })),
    });
    rows = await prisma.memberTier.findMany({ where: { storeId } });
  }
  return sortTiers(rows.map(toTier));
}

export async function tierFor(storeId: string, totalSpent: number | Prisma.Decimal) {
  const tiers = await listTiers(storeId);
  return { tiers, ...describeTier(Number(totalSpent), tiers) };
}

// ---------------------------------------------------------------- expiry ----

async function loadLots(db: Prisma.TransactionClient | typeof prisma, customerId: string) {
  const txs = await db.pointTransaction.findMany({
    where: { customerId, type: { notIn: STAMP_TYPES } },
    select: { type: true, points: true, expiresAt: true, createdAt: true },
  });
  return remainingLots(txs);
}

/** Points expiring in the next 30 days (0 when the store has expiry off). */
export async function getExpiringSoon(customer: { id: string; points: number }, expiryMonths: number) {
  if (expiryMonths <= 0 || customer.points <= 0) return { points: 0, date: null as Date | null };
  const lots = await loadLots(prisma, customer.id);
  return calcExpiringSoon(lots, customer.points, new Date(), EXPIRING_SOON_DAYS);
}

/**
 * Write off one customer's lapsed points as an EXPIRE row. Idempotent: lots
 * already written off are consumed by earlier EXPIRE rows (see remainingLots).
 * Locks the customer row so the lazy lookup and the daily job can't both write.
 */
export async function expireCustomerPoints(customerId: string, now = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    const customer = await tx.customer.findUnique({
      where: { id: customerId }, select: { id: true, storeId: true, points: true },
    });
    if (!customer || customer.points <= 0) return 0;
    const lots = await loadLots(tx, customerId);
    const amount = calcDueExpiry(lots, customer.points, now);
    if (amount <= 0) return 0;
    await recordPoints(tx, {
      storeId: customer.storeId, customerId, type: PointTxType.EXPIRE,
      points: -amount, note: 'แต้มหมดอายุ',
    });
    return amount;
  });
}

/** Daily sweep (and on demand). Skips stores with expiry turned off. */
export async function expireDuePoints(storeId?: string, now = new Date()) {
  const stores = await prisma.store.findMany({
    where: { pointsExpiryMonths: { gt: 0 }, ...(storeId ? { id: storeId } : {}) },
    select: { id: true },
  });
  if (stores.length === 0) return { customers: 0, points: 0 };

  const candidates = await prisma.pointTransaction.findMany({
    where: {
      storeId: { in: stores.map((s) => s.id) },
      type: PointTxType.EARN,
      expiresAt: { lte: now },
      customer: { points: { gt: 0 } },
    },
    distinct: ['customerId'],
    select: { customerId: true },
  });

  let customers = 0;
  let points = 0;
  for (const { customerId } of candidates) {
    try {
      const n = await expireCustomerPoints(customerId, now);
      if (n > 0) { customers++; points += n; }
    } catch (err) {
      logger.error({ err, customerId }, 'expire points failed');
    }
  }
  return { customers, points };
}

// --------------------------------------------------------- member profile ----

/** Public/staff-facing member snapshot: balances + tier + expiry. Expires lapsed points first. */
export async function buildMemberProfile(storeId: string, customerId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId }, select: { pointsExpiryMonths: true },
  });
  const months = store?.pointsExpiryMonths ?? 0;
  if (months > 0) {
    try { await expireCustomerPoints(customerId); } catch (err) { logger.error({ err }, 'lazy expire failed'); }
  }
  const c = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    select: { id: true, name: true, phone: true, points: true, stamps: true, totalSpent: true },
  });
  if (!c) return null;
  const [{ current, next, progress }, expiring] = await Promise.all([
    tierFor(storeId, c.totalSpent),
    getExpiringSoon(c, months),
  ]);
  return {
    id: c.id, name: c.name, phone: c.phone, points: c.points, stamps: c.stamps,
    totalSpent: Number(c.totalSpent),
    tier: current, nextTier: next, tierProgress: progress,
    expiringPoints: expiring.points, expiringDate: expiring.date,
    pointsExpiryMonths: months,
  };
}

// --------------------------------------------------------------- rewards ----

function isValidNow(r: { validFrom: Date | null; validTo: Date | null }, now: Date) {
  return (!r.validFrom || r.validFrom <= now) && (!r.validTo || r.validTo >= now);
}

/** Rewards this member can see, with affordability. Public (phone-identified). */
export async function listRewardsForMember(storeId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, isActive: true },
    select: { points: true, totalSpent: true },
  });
  if (!customer) throw NotFound('ไม่พบสมาชิก');
  const [tiers, rewards] = await Promise.all([
    listTiers(storeId),
    prisma.reward.findMany({ where: { storeId, isActive: true }, orderBy: [{ pointsCost: 'asc' }, { createdAt: 'desc' }] }),
  ]);
  const now = new Date();
  const spent = Number(customer.totalSpent);
  return rewards
    .filter((r) => isValidNow(r, now) && meetsTier(spent, tiers, r.minTier))
    .map((r) => ({
      id: r.id, name: r.name, description: r.description, imageUrl: r.imageUrl,
      kind: r.kind, pointsCost: r.pointsCost, discountAmount: Number(r.discountAmount),
      minTier: r.minTier, validFrom: r.validFrom, validTo: r.validTo,
      category: rewardCategory(r),
      canRedeem: customer.points >= r.pointsCost,
      shortfall: Math.max(0, r.pointsCost - customer.points),
    }));
}

async function uniqueCode(tx: Prisma.TransactionClient) {
  for (let i = 0; i < 8; i++) {
    const code = generateRedemptionCode();
    if (!(await tx.rewardRedemption.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw BadRequest('สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่');
}

/** Spend points on a reward: ledger REDEEM + RewardRedemption(ACTIVE) in one transaction. */
export async function redeemReward(storeId: string, customerId: string, rewardId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    const [store, customer, reward] = await Promise.all([
      tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { loyaltyMode: true } }),
      tx.customer.findFirst({ where: { id: customerId, storeId, isActive: true } }),
      tx.reward.findFirst({ where: { id: rewardId, storeId } }),
    ]);
    if (!customer) throw NotFound('ไม่พบสมาชิก');
    if (!reward || !reward.isActive) throw NotFound('ไม่พบรางวัลนี้');
    const now = new Date();
    if (!isValidNow(reward, now)) throw BadRequest('รางวัลนี้หมดเวลาแลกแล้ว', 'REWARD_EXPIRED');
    if (reward.pointsCost > 0 && !pointsEnabled(store.loyaltyMode)) {
      throw BadRequest('ร้านนี้ไม่ได้เปิดใช้แต้มสะสม');
    }
    const tiers = await listTiers(storeId);
    if (!meetsTier(Number(customer.totalSpent), tiers, reward.minTier)) {
      throw Forbidden('ระดับสมาชิกยังไม่ถึงเกณฑ์ของรางวัลนี้');
    }
    if (customer.points < reward.pointsCost) {
      throw BadRequest(`แต้มไม่พอ ขาดอีก ${reward.pointsCost - customer.points} แต้ม`, 'INSUFFICIENT_POINTS');
    }

    let balanceAfter = customer.points;
    if (reward.pointsCost > 0) {
      balanceAfter = await recordPoints(tx, {
        storeId, customerId, type: PointTxType.REDEEM, points: -reward.pointsCost,
        note: `แลกรางวัล: ${reward.name}`,
      });
      if (balanceAfter < 0) throw BadRequest('แต้มไม่พอ', 'INSUFFICIENT_POINTS');
    }
    const redemption = await tx.rewardRedemption.create({
      data: {
        storeId, customerId, rewardId, code: await uniqueCode(tx),
        pointsSpent: reward.pointsCost,
      },
    });
    return {
      redemption: { id: redemption.id, code: redemption.code, status: redemption.status, createdAt: redemption.createdAt },
      reward: { id: reward.id, name: reward.name, kind: reward.kind, discountAmount: Number(reward.discountAmount) },
      balanceAfter,
    };
  });
}

const redemptionInclude = {
  reward: { select: { id: true, name: true, kind: true, discountAmount: true, imageUrl: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.RewardRedemptionInclude;

export const shapeRedemption = (r: any) => ({
  ...r,
  reward: r.reward && { ...r.reward, discountAmount: Number(r.reward.discountAmount) },
});

export async function findRedemptionByCode(storeId: string, code: string) {
  const r = await prisma.rewardRedemption.findFirst({
    where: { storeId, code: code.trim().toUpperCase() },
    include: redemptionInclude,
  });
  if (!r) throw NotFound('ไม่พบโค้ดนี้');
  return shapeRedemption(r);
}

export async function markRedemptionUsed(storeId: string, id: string, orderId?: string) {
  // Conditional update → two cashiers scanning at once can't both succeed.
  const res = await prisma.rewardRedemption.updateMany({
    where: { id, storeId, status: RedemptionStatus.ACTIVE },
    data: { status: RedemptionStatus.USED, usedAt: new Date(), orderId: orderId ?? null },
  });
  if (res.count === 0) {
    const r = await prisma.rewardRedemption.findFirst({ where: { id, storeId }, select: { status: true } });
    if (!r) throw NotFound('ไม่พบรายการแลก');
    throw BadRequest(r.status === 'USED' ? 'โค้ดนี้ถูกใช้ไปแล้ว' : 'โค้ดนี้ถูกยกเลิกแล้ว', 'NOT_ACTIVE');
  }
  const r = await prisma.rewardRedemption.findUniqueOrThrow({ where: { id }, include: redemptionInclude });
  return shapeRedemption(r);
}

/** Cancel an unused redemption and give the points back. */
export async function cancelRedemption(storeId: string, id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.rewardRedemption.updateMany({
      where: { id, storeId, status: RedemptionStatus.ACTIVE },
      data: { status: RedemptionStatus.CANCELLED },
    });
    if (res.count === 0) throw BadRequest('ยกเลิกไม่ได้ — โค้ดถูกใช้หรือยกเลิกไปแล้ว', 'NOT_ACTIVE');
    const r = await tx.rewardRedemption.findUniqueOrThrow({ where: { id }, include: redemptionInclude });
    if (r.pointsSpent > 0) {
      await recordPoints(tx, {
        storeId, customerId: r.customerId, type: PointTxType.REFUND_REVERSAL,
        points: r.pointsSpent, note: `คืนแต้มจากการยกเลิกรางวัล: ${r.reward.name}`, createdBy: userId,
      });
    }
    return shapeRedemption(r);
  });
}
