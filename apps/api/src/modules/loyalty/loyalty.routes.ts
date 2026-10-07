import { Router } from 'express';
import { z } from 'zod';
import { RedemptionStatus } from '@prisma/client';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import {
  listTiers, expireDuePoints, findRedemptionByCode, markRedemptionUsed,
  cancelRedemption, shapeRedemption,
} from './loyalty.service';

const router = Router();
router.use(authMiddleware);
const admin = rbac('OWNER', 'ADMIN');

// ------------------------------------------------------------------ tiers ----
const tierSchema = z.object({
  name: z.string().trim().min(1).max(40),
  minSpent: z.number().nonnegative(),
  color: z.string().max(20).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// GET /loyalty/tiers (seeds TEAM/SILVER/GOLD on first call)
router.get('/tiers', async (req, res, next) => {
  try { res.json(await listTiers(req.user!.storeId)); } catch (e) { next(e); }
});

router.post('/tiers', admin, validate(tierSchema), async (req, res, next) => {
  try {
    const tier = await prisma.memberTier.create({ data: { ...req.body, storeId: req.user!.storeId } });
    res.status(201).json({ ...tier, minSpent: Number(tier.minSpent) });
  } catch (e) { next(e); }
});

router.patch('/tiers/:id', admin, validate(tierSchema.partial()), async (req, res, next) => {
  try {
    const exists = await prisma.memberTier.findFirst({ where: { id: req.params.id, storeId: req.user!.storeId } });
    if (!exists) throw NotFound('ไม่พบระดับสมาชิก');
    const tier = await prisma.memberTier.update({ where: { id: exists.id }, data: req.body });
    res.json({ ...tier, minSpent: Number(tier.minSpent) });
  } catch (e) { next(e); }
});

router.delete('/tiers/:id', admin, async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const exists = await prisma.memberTier.findFirst({ where: { id: req.params.id, storeId } });
    if (!exists) throw NotFound('ไม่พบระดับสมาชิก');
    if ((await prisma.memberTier.count({ where: { storeId } })) <= 1) {
      throw BadRequest('ต้องมีอย่างน้อย 1 ระดับ');
    }
    await prisma.$transaction([
      prisma.reward.updateMany({ where: { storeId, minTier: exists.id }, data: { minTier: null } }),
      prisma.memberTier.delete({ where: { id: exists.id } }),
    ]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- rewards ----
const rewardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  kind: z.enum(['DISCOUNT', 'FREE_ITEM']).optional(),
  pointsCost: z.number().int().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
  minTier: z.string().optional().nullable(),
  validFrom: z.coerce.date().optional().nullable(),
  validTo: z.coerce.date().optional().nullable(),
  isActive: z.boolean().optional(),
});

const shapeReward = (r: any) => ({ ...r, discountAmount: Number(r.discountAmount) });

router.get('/rewards', async (req, res, next) => {
  try {
    const rewards = await prisma.reward.findMany({
      where: { storeId: req.user!.storeId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(rewards.map(shapeReward));
  } catch (e) { next(e); }
});

async function assertTierBelongs(storeId: string, tierId?: string | null) {
  if (!tierId) return;
  const t = await prisma.memberTier.findFirst({ where: { id: tierId, storeId }, select: { id: true } });
  if (!t) throw BadRequest('ไม่พบระดับสมาชิกที่เลือก');
}

router.post('/rewards', admin, validate(rewardSchema), async (req, res, next) => {
  try {
    await assertTierBelongs(req.user!.storeId, req.body.minTier);
    const r = await prisma.reward.create({ data: { ...req.body, storeId: req.user!.storeId } });
    res.status(201).json(shapeReward(r));
  } catch (e) { next(e); }
});

router.patch('/rewards/:id', admin, validate(rewardSchema.partial()), async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const exists = await prisma.reward.findFirst({ where: { id: req.params.id, storeId } });
    if (!exists) throw NotFound('ไม่พบรางวัล');
    await assertTierBelongs(storeId, req.body.minTier);
    res.json(shapeReward(await prisma.reward.update({ where: { id: exists.id }, data: req.body })));
  } catch (e) { next(e); }
});

// Delete = hard delete only if never redeemed; otherwise just deactivate (keeps history).
router.delete('/rewards/:id', admin, async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const exists = await prisma.reward.findFirst({ where: { id: req.params.id, storeId } });
    if (!exists) throw NotFound('ไม่พบรางวัล');
    const used = await prisma.rewardRedemption.count({ where: { rewardId: exists.id } });
    if (used > 0) {
      await prisma.reward.update({ where: { id: exists.id }, data: { isActive: false } });
      return res.json({ deactivated: true });
    }
    await prisma.reward.delete({ where: { id: exists.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ------------------------------------------------------------ redemptions ----
// GET /loyalty/redemptions?status=ACTIVE&customerId=
router.get('/redemptions', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await prisma.rewardRedemption.findMany({
      where: {
        storeId: req.user!.storeId,
        ...(status && status in RedemptionStatus ? { status: status as RedemptionStatus } : {}),
        ...(req.query.customerId ? { customerId: String(req.query.customerId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 50, 200),
      include: {
        reward: { select: { id: true, name: true, kind: true, discountAmount: true, imageUrl: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    res.json(rows.map(shapeRedemption));
  } catch (e) { next(e); }
});

// GET /loyalty/redemptions/code/:code — cashier looks up a customer's code
router.get('/redemptions/code/:code', async (req, res, next) => {
  try { res.json(await findRedemptionByCode(req.user!.storeId, req.params.code)); } catch (e) { next(e); }
});

const useSchema = z.object({ orderId: z.string().optional() });
router.post('/redemptions/:id/use', validate(useSchema), async (req, res, next) => {
  try { res.json(await markRedemptionUsed(req.user!.storeId, req.params.id, req.body.orderId)); } catch (e) { next(e); }
});

router.post('/redemptions/:id/cancel', admin, async (req, res, next) => {
  try { res.json(await cancelRedemption(req.user!.storeId, req.params.id, req.user!.id)); } catch (e) { next(e); }
});

// POST /loyalty/expire-now — manual trigger of the daily sweep for this store
router.post('/expire-now', admin, async (req, res, next) => {
  try { res.json(await expireDuePoints(req.user!.storeId)); } catch (e) { next(e); }
});

export default router;
