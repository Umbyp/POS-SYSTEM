import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as service from './promotion.service';

const router = Router();
router.use(authMiddleware);

const promotionSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  type: z.enum(['PERCENT_OFF', 'FIXED_OFF', 'BUY_X_GET_Y', 'FIXED_PRICE']),
  scope: z.enum(['ALL_ORDER', 'CATEGORY', 'PRODUCT']).default('ALL_ORDER'),
  value: z.number().nonnegative(),
  buyQty: z.number().int().positive().optional().nullable(),
  getQty: z.number().int().positive().optional().nullable(),
  productIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  minSpend: z.number().nonnegative().optional().nullable(),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  hourStart: z.number().int().min(0).max(23).optional().nullable(),
  hourEnd: z.number().int().min(0).max(23).optional().nullable(),
  memberOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
  usageLimit: z.number().int().positive().optional().nullable(),
});

// GET /promotions
router.get('/', async (req, res, next) => {
  try {
    const data = await prisma.promotion.findMany({
      where: { storeId: req.user!.storeId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(data);
  } catch (e) { next(e); }
});

// POST /promotions/apply — preview ส่วนลดจาก cart ปัจจุบัน (ไม่ commit)
const applySchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    categoryId: z.string().optional(),
  })),
  subtotal: z.number().nonnegative(),
  customerId: z.string().optional(),
  code: z.string().optional(),
});
router.post('/apply', validate(applySchema), async (req, res, next) => {
  try {
    const result = await service.applyBestPromotion(
      req.user!.storeId,
      {
        items: req.body.items,
        subtotal: req.body.subtotal,
        customerId: req.body.customerId,
      },
      req.body.code
    );
    res.json(result);
  } catch (e) { next(e); }
});

// POST /promotions
router.post('/', rbac('OWNER', 'ADMIN'), validate(promotionSchema), async (req, res, next) => {
  try {
    const data = { ...req.body, storeId: req.user!.storeId };
    if (data.startAt) data.startAt = new Date(data.startAt);
    if (data.endAt) data.endAt = new Date(data.endAt);
    const p = await prisma.promotion.create({ data });
    res.status(201).json(p);
  } catch (e) { next(e); }
});

// PATCH /promotions/:id
router.patch('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.startAt) data.startAt = new Date(data.startAt);
    if (data.endAt) data.endAt = new Date(data.endAt);
    delete data.id;
    delete data.storeId;
    delete data.createdAt;
    delete data.usageCount;
    const p = await prisma.promotion.update({
      where: { id: req.params.id },
      data,
    });
    res.json(p);
  } catch (e) { next(e); }
});

// DELETE /promotions/:id
router.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.promotion.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
