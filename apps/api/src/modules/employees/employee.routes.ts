import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import { computeShiftSummary } from './shift-summary';
import { isValidPin, hashPin } from '../auth/pin.logic';

const router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'CASHIER', 'KITCHEN']),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN ต้องเป็นตัวเลข 4-6 หลัก').optional(),
});

router.get('/', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { storeId: req.user!.storeId },
      select: {
        id: true, email: true, name: true, role: true, avatar: true,
        isActive: true, createdAt: true, pinHash: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users.map(({ pinHash, ...u }) => ({ ...u, hasPin: !!pinHash })));
  } catch (e) { next(e); }
});

router.post(
  '/',
  rbac('OWNER', 'ADMIN'),
  validate(createSchema),
  async (req, res, next) => {
    try {
      const password = await bcrypt.hash(req.body.password, 10);
      const user = await prisma.user.create({
        data: {
          email: req.body.email,
          password,
          name: req.body.name,
          role: req.body.role,
          pinHash: req.body.pin ? await hashPin(req.body.pin) : undefined,
          storeId: req.user!.storeId,
        },
        select: { id: true, email: true, name: true, role: true },
      });
      res.status(201).json(user);
    } catch (e) { next(e); }
  }
);

router.patch('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    // ต้องเป็นพนักงานในร้านตัวเองเท่านั้น (กันแก้ข้ามร้าน)
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
    });
    if (!target) return res.status(404).json({ error: 'ไม่พบพนักงาน' });

    // whitelist ฟิลด์ — กัน mass-assignment (เช่น ย้าย storeId หรือปลอม field อื่น)
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.role !== undefined && ['OWNER', 'ADMIN', 'CASHIER', 'KITCHEN'].includes(req.body.role)) {
      data.role = req.body.role;
    }
    if (req.body.password) data.password = await bcrypt.hash(req.body.password, 10);
    if (req.body.pin !== undefined) {
      if (req.body.pin === null || req.body.pin === '') data.pinHash = null;
      else if (isValidPin(req.body.pin)) data.pinHash = await hashPin(req.body.pin);
      else return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (e) { next(e); }
});

// Shifts
// GET /shifts/active - ดูกะที่ user ปัจจุบันเปิดอยู่
router.get('/shifts/active', async (req, res, next) => {
  try {
    const shift = await prisma.shift.findFirst({
      where: { userId: req.user!.id, endTime: null },
      orderBy: { startTime: 'desc' },
    });
    res.json(shift);
  } catch (e) { next(e); }
});

// GET /shifts - history
router.get('/shifts', async (req, res, next) => {
  try {
    // จำกัดเฉพาะกะของพนักงานในร้านตัวเอง (กันดูข้ามร้านผ่าน ?userId=)
    const where: any = { user: { storeId: req.user!.storeId } };
    if (req.query.userId) where.userId = req.query.userId;
    else where.userId = req.user!.id;

    const shifts = await prisma.shift.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { startTime: 'desc' },
      take: 50,
    });
    res.json(shifts);
  } catch (e) { next(e); }
});

router.post('/shifts/open', async (req, res, next) => {
  try {
    // ป้องกันเปิดกะซ้อน
    const existing = await prisma.shift.findFirst({
      where: { userId: req.user!.id, endTime: null },
    });
    if (existing) {
      return res.status(400).json({ error: 'มีกะที่ยังไม่ปิดอยู่แล้ว' });
    }
    const shift = await prisma.shift.create({
      data: {
        userId: req.user!.id,
        openingCash: req.body.openingCash || 0,
      },
    });
    res.status(201).json(shift);
  } catch (e) { next(e); }
});

/** A shift in this store; a cashier may only see/close their OWN, OWNER/ADMIN any. */
async function loadShiftFor(req: any, res: any) {
  const shift = await prisma.shift.findFirst({
    where: { id: req.params.id, user: { storeId: req.user!.storeId } },
  });
  if (!shift) { res.status(404).json({ error: 'ไม่พบกะ' }); return null; }
  if (shift.userId !== req.user!.id && !['OWNER', 'ADMIN'].includes(req.user!.role)) {
    res.status(403).json({ error: 'ปิด/ดูกะของคนอื่นได้เฉพาะเจ้าของหรือแอดมิน', code: 'SHIFT_NOT_YOURS' });
    return null;
  }
  return shift;
}

// GET /shifts/:id/summary - cash reconciliation (works for open and closed shifts)
router.get('/shifts/:id/summary', async (req, res, next) => {
  try {
    const shift = await loadShiftFor(req, res);
    if (!shift) return;
    res.json(await computeShiftSummary(shift, req.user!.storeId));
  } catch (e) { next(e); }
});

const closeSchema = z.object({
  closingCash: z.coerce.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

router.post('/shifts/:id/close', validate(closeSchema), async (req, res, next) => {
  try {
    const shift = await loadShiftFor(req, res);
    if (!shift) return;
    if (shift.endTime) return res.status(400).json({ error: 'กะนี้ปิดไปแล้ว' });

    const endTime = new Date();
    const calc = await computeShiftSummary({ ...shift, endTime, closingCash: req.body.closingCash }, req.user!.storeId);
    // cashSales is stored NET of change (cash that actually stayed in the drawer).
    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        endTime, closingCash: req.body.closingCash, cashSales: calc.cashSales,
        totalSales: calc.totalSales, notes: req.body.notes,
      },
    });
    res.json({ ...updated, summary: calc });
  } catch (e) { next(e); }
});

export default router;
