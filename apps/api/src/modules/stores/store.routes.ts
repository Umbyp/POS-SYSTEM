import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(authMiddleware);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  currency: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  priceIncludesTax: z.boolean().optional(),
  serviceCharge: z.number().min(0).max(100).optional(),
  promptpayId: z.string().optional().nullable(),
  invoicePrefix: z.string().optional().nullable(),
  branchCode: z.string().optional().nullable(),
  dailyTarget: z.number().nonnegative().optional(),
  monthlyTarget: z.number().nonnegative().optional(),
  // ระบบสะสมแต้ม
  loyaltyMode: z.enum(['OFF', 'POINTS', 'STAMPS', 'BOTH']).optional(),
  pointsEarnBaht: z.number().int().nonnegative().optional(),
  pointValue: z.number().nonnegative().optional(),
  minRedeemPoints: z.number().int().nonnegative().optional(),
  stampsPerReward: z.number().int().positive().optional(),
  stampRewardValue: z.number().nonnegative().optional(),
  stampRewardName: z.string().optional().nullable(),
});

// GET /api/stores/me - ข้อมูลร้านของ user ปัจจุบัน
router.get('/me', async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
    });
    res.json(store);
  } catch (e) { next(e); }
});

// GET /api/stores/mine - รายการ stores ทั้งหมดที่ user เป็นสมาชิก
router.get('/mine', async (req, res, next) => {
  try {
    const members = await prisma.storeMember.findMany({
      where: { userId: req.user!.id },
      include: { store: true },
    });
    // รวม store ปัจจุบันที่อาจยังไม่ได้ใน StoreMember (legacy users)
    const current = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
    });
    const stores = members.map((m) => ({
      ...m.store,
      role: m.role,
      isCurrent: m.storeId === req.user!.storeId,
    }));
    if (current && !stores.find((s) => s.id === current.id)) {
      stores.unshift({ ...current, role: req.user!.role, isCurrent: true } as any);
    }
    res.json(stores);
  } catch (e) { next(e); }
});

// POST /api/stores/switch - สลับ active store + ได้ JWT ใหม่
import { signToken } from '../../utils/jwt';
const switchSchema = z.object({ storeId: z.string() });
router.post('/switch', validate(switchSchema), async (req, res, next) => {
  try {
    const member = await prisma.storeMember.findUnique({
      where: { userId_storeId: { userId: req.user!.id, storeId: req.body.storeId } },
    });
    if (!member) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงร้านนี้' });

    // อัปเดท User.storeId เป็นร้านใหม่ (last-used)
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { storeId: req.body.storeId, role: member.role },
    });

    // ออก JWT ใหม่
    const token = signToken({
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      storeId: updatedUser.storeId,
    });

    res.json({
      token,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        storeId: updatedUser.storeId,
      },
    });
  } catch (e) { next(e); }
});

// POST /api/stores - สร้าง store ใหม่ + เพิ่มเป็น OWNER
const createStoreSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});
router.post('/', validate(createStoreSchema), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: req.body.name,
          address: req.body.address,
          phone: req.body.phone,
          currency: 'THB',
          taxRate: 7,
          priceIncludesTax: true,
        },
      });
      await tx.storeMember.create({
        data: { userId: req.user!.id, storeId: store.id, role: 'OWNER' },
      });
      return store;
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// POST /api/stores/:id/members - เพิ่มสมาชิกเข้า store (เจ้าของร้าน invite)
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'CASHIER', 'KITCHEN']).default('ADMIN'),
});
router.post('/:id/members', rbac('OWNER'), validate(addMemberSchema), async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!target) return res.status(404).json({ error: 'ไม่พบ user — ให้สมัครก่อน' });

    const member = await prisma.storeMember.upsert({
      where: { userId_storeId: { userId: target.id, storeId: req.params.id } },
      update: { role: req.body.role },
      create: {
        userId: target.id,
        storeId: req.params.id,
        role: req.body.role,
      },
    });
    res.json(member);
  } catch (e) { next(e); }
});

// PATCH /api/stores/me - แก้ไขข้อมูลร้าน (OWNER/ADMIN เท่านั้น)
router.patch(
  '/me',
  rbac('OWNER', 'ADMIN'),
  validate(updateSchema),
  async (req, res, next) => {
    try {
      const store = await prisma.store.update({
        where: { id: req.user!.storeId },
        data: req.body,
      });

      // emit realtime ให้ device อื่น ๆ
      const io = req.app.get('io');
      io?.to(`store:${store.id}`).emit('store:updated', store);

      res.json(store);
    } catch (e) { next(e); }
  }
);

export default router;
