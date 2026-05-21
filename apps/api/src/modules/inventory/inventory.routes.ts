import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';

const router = Router();
router.use(authMiddleware);

// GET /inventory - inventory list with product info
router.get('/', async (req, res, next) => {
  try {
    const data = await prisma.inventory.findMany({
      where: { product: { storeId: req.user!.storeId } },
      include: { product: { include: { category: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /inventory/low-stock
router.get('/low-stock', async (req, res, next) => {
  try {
    const all = await prisma.inventory.findMany({
      where: { product: { storeId: req.user!.storeId, isActive: true } },
      include: { product: true },
    });
    const lowStock = all.filter((i) => i.quantity <= i.lowStockAt);
    res.json(lowStock);
  } catch (e) { next(e); }
});

// GET /inventory/movements
router.get('/movements', async (req, res, next) => {
  try {
    const data = await prisma.stockMovement.findMany({
      where: { inventory: { product: { storeId: req.user!.storeId } } },
      include: { inventory: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(data);
  } catch (e) { next(e); }
});

// POST /inventory/:productId/adjust
const adjustSchema = z.object({
  quantity: z.number().int(),
  reason: z.string().min(1),
  type: z.enum(['PURCHASE', 'ADJUSTMENT', 'WASTE', 'RETURN']).optional(),
});
router.post(
  '/:productId/adjust',
  rbac('OWNER', 'ADMIN'),
  validate(adjustSchema),
  async (req, res, next) => {
    try {
      const inv = await prisma.inventory.findUnique({ where: { productId: req.params.productId } });
      if (!inv) throw NotFound('Inventory not found');
      const newQty = inv.quantity + req.body.quantity;
      if (newQty < 0) throw BadRequest('Resulting quantity cannot be negative');

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: newQty },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: inv.id,
            type: req.body.type || 'ADJUSTMENT',
            quantity: req.body.quantity,
            reason: req.body.reason,
            userId: req.user!.id,
          },
        });
        return updated;
      });

      const io = req.app.get('io');
      io.to(`store:${req.user!.storeId}`).emit('stock:updated', { productIds: [req.params.productId] });

      // log activity
      prisma.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'STOCK_ADJUST',
          metadata: {
            productId: req.params.productId,
            type: req.body.type || 'ADJUSTMENT',
            quantity: req.body.quantity,
            reason: req.body.reason,
          },
        },
      }).catch(() => {});

      res.json(result);
    } catch (e) { next(e); }
  }
);

// POST /inventory/:productId/set - ตั้งค่าสต็อกเป็นค่าใหม่ตรงๆ (count adjustment)
const setSchema = z.object({
  quantity: z.number().int().nonnegative(),
  reason: z.string().min(1),
});
router.post(
  '/:productId/set',
  rbac('OWNER', 'ADMIN'),
  validate(setSchema),
  async (req, res, next) => {
    try {
      const inv = await prisma.inventory.findUnique({ where: { productId: req.params.productId } });
      if (!inv) throw NotFound('Inventory not found');
      const delta = req.body.quantity - inv.quantity;

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: req.body.quantity },
        });
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              inventoryId: inv.id,
              type: 'ADJUSTMENT',
              quantity: delta,
              reason: `[Count] ${req.body.reason} (${inv.quantity} → ${req.body.quantity})`,
              userId: req.user!.id,
            },
          });
        }
        return updated;
      });

      const io = req.app.get('io');
      io.to(`store:${req.user!.storeId}`).emit('stock:updated', { productIds: [req.params.productId] });

      res.json(result);
    } catch (e) { next(e); }
  }
);

export default router;
