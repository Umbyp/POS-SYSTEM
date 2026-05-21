import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as service from './product.service';
import { prisma } from '../../config/prisma';

const router = Router();

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  categoryId: z.string(),
  trackStock: z.boolean().optional(),
  isIngredient: z.boolean().optional(),
  isCombo: z.boolean().optional(),
  initialStock: z.number().int().nonnegative().optional(),
  lowStockAt: z.number().int().nonnegative().optional(),
  variants: z.array(z.object({
    name: z.string(),
    priceDelta: z.number(),
    sku: z.string().optional(),
  })).optional(),
});

router.use(authMiddleware);

// GET /products/categories - list categories
router.get('/categories', async (req, res, next) => {
  try {
    const cats = await prisma.category.findMany({
      where: { storeId: req.user!.storeId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(cats);
  } catch (e) { next(e); }
});

// POST /products/categories
router.post('/categories', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const cat = await prisma.category.create({
      data: { ...req.body, storeId: req.user!.storeId },
    });
    res.status(201).json(cat);
  } catch (e) { next(e); }
});

// PATCH /products/categories/:id
router.patch('/categories/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(cat);
  } catch (e) { next(e); }
});

// DELETE /products/categories/:id - บล็อกถ้ายังมีสินค้าผูกอยู่
router.delete('/categories/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const count = await prisma.product.count({
      where: { categoryId: req.params.id, isActive: true },
    });
    if (count > 0) {
      return res.status(400).json({
        error: `ลบไม่ได้ — ยังมีสินค้า ${count} รายการอยู่ในหมวดนี้`,
      });
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /products - list/search
router.get('/', async (req, res, next) => {
  try {
    const data = await service.list(req.user!.storeId, {
      q: req.query.q as string,
      categoryId: req.query.categoryId as string,
      includeIngredients: req.query.includeIngredients === '1',
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /products/:id/recipe
router.get('/:id/recipe', async (req, res, next) => {
  try {
    const items = await service.getRecipe(req.params.id);
    const computed = await service.calculateRecipeCost(req.params.id);
    res.json({ items, computedCost: computed });
  } catch (e) { next(e); }
});

// PUT /products/:id/recipe
const recipeSchema = z.object({
  items: z.array(z.object({
    ingredientId: z.string(),
    quantity: z.number().positive(),
    unit: z.string().optional(),
    notes: z.string().optional(),
  })),
});
router.put('/:id/recipe', rbac('OWNER', 'ADMIN'), validate(recipeSchema), async (req, res, next) => {
  try {
    const items = await service.setRecipe(req.params.id, req.body.items);
    const computed = await service.calculateRecipeCost(req.params.id);
    prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'UPDATE_RECIPE',
        metadata: { productId: req.params.id, ingredientCount: req.body.items.length },
      },
    }).catch(() => {});
    res.json({ items, computedCost: computed });
  } catch (e) { next(e); }
});

// GET /products/barcode/:code
router.get('/barcode/:code', async (req, res, next) => {
  try {
    res.json(await service.findByBarcode(req.user!.storeId, req.params.code));
  } catch (e) { next(e); }
});

// GET /products/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id));
  } catch (e) { next(e); }
});

// POST /products
router.post('/', rbac('OWNER', 'ADMIN'), validate(productSchema), async (req, res, next) => {
  try {
    const product = await service.create(req.user!.storeId, req.body);
    prisma.activityLog.create({
      data: { userId: req.user!.id, action: 'CREATE_PRODUCT', metadata: { productId: product.id, name: product.name } },
    }).catch(() => {});
    res.status(201).json(product);
  } catch (e) { next(e); }
});

// PUT /products/:id
router.put('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const product = await service.update(req.params.id, req.body);
    prisma.activityLog.create({
      data: { userId: req.user!.id, action: 'UPDATE_PRODUCT', metadata: { productId: product.id, name: product.name } },
    }).catch(() => {});
    res.json(product);
  } catch (e) { next(e); }
});

// DELETE /products/:id
router.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await service.remove(req.params.id);
    prisma.activityLog.create({
      data: { userId: req.user!.id, action: 'DELETE_PRODUCT', metadata: { productId: req.params.id } },
    }).catch(() => {});
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
