import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import { PointTxType } from '@prisma/client';
import { recordPoints, recordStamps } from '../orders/points.service';

const router = Router();
router.use(authMiddleware);

const upsertSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /customers - list + search
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string)?.trim();
    const where: any = { storeId: req.user!.storeId, isActive: true };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const take = Math.min(Number(req.query.limit) || 50, 200);
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
      take,
    });
    res.json(customers);
  } catch (e) { next(e); }
});

// GET /customers/:id - รายละเอียด + ประวัติออเดอร์
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: { include: { product: { select: { name: true } } } } },
        },
      },
    });
    if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });
    res.json(customer);
  } catch (e) { next(e); }
});

// GET /customers/:id/points - ประวัติแต้ม (ledger)
router.get('/:id/points', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
      select: { id: true, name: true, points: true },
    });
    if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });

    const take = Math.min(Number(req.query.limit) || 50, 200);
    const transactions = await prisma.pointTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json({ customer, transactions });
  } catch (e) { next(e); }
});

// POST /customers/:id/adjust - ปรับแต้ม/ดวงเอง (บันทึกลง ledger)
const adjustSchema = z.object({
  kind: z.enum(['points', 'stamps']),
  delta: z.number().int().refine((n) => n !== 0, 'ต้องไม่เป็น 0'),
  note: z.string().optional(),
});
router.post('/:id/adjust', rbac('OWNER', 'ADMIN'), validate(adjustSchema), async (req, res, next) => {
  try {
    const { kind, delta, note } = req.body as { kind: 'points' | 'stamps'; delta: number; note?: string };
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
      select: { id: true, points: true, stamps: true },
    });
    if (!customer) return res.status(404).json({ error: 'ไม่พบลูกค้า' });

    const current = kind === 'points' ? customer.points : customer.stamps;
    if (current + delta < 0) {
      return res.status(400).json({ error: `ปรับแล้วติดลบไม่ได้ (คงเหลือ ${current})` });
    }

    const balanceAfter = await prisma.$transaction((tx) =>
      kind === 'points'
        ? recordPoints(tx, {
            storeId: req.user!.storeId, customerId: customer.id,
            type: PointTxType.MANUAL_ADJUST, points: delta,
            note: note || 'ปรับโดยพนักงาน', createdBy: req.user!.id,
          })
        : recordStamps(tx, {
            storeId: req.user!.storeId, customerId: customer.id,
            type: PointTxType.STAMP_ADJUST, stamps: delta,
            note: note || 'ปรับโดยพนักงาน', createdBy: req.user!.id,
          })
    );
    res.json({ id: customer.id, kind, balanceAfter });
  } catch (e) { next(e); }
});

// POST /customers
router.post('/', validate(upsertSchema), async (req, res, next) => {
  try {
    const data: any = { ...req.body, storeId: req.user!.storeId };
    if (data.email === '') data.email = null;
    const customer = await prisma.customer.create({ data });
    res.status(201).json(customer);
  } catch (e) { next(e); }
});

// PATCH /customers/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const data: any = { ...req.body };
    if (data.email === '') data.email = null;
    delete data.points; // ไม่ให้แก้คะแนนตรงๆ
    delete data.totalSpent;
    delete data.visitCount;

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data,
    });
    res.json(customer);
  } catch (e) { next(e); }
});

// DELETE /customers/:id (soft)
router.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.customer.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
