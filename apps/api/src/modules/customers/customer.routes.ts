import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';

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
