import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';

// Store World customisation (character looks, decorations). Purely cosmetic and only OWNER/ADMIN may see or
// change it. The shape is validated loosely on purpose: the 3D view owns the details and ignores unknowns.
const router = Router();
router.use(authMiddleware, rbac('OWNER', 'ADMIN'));

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const person = z
  .object({
    nick: z.string().max(24).optional(),
    style: z.string().max(16).optional(),
    skin: hex.optional(),
    hair: hex.optional(),
    top: hex.optional(),
    accent: hex.optional(),
    pattern: z.enum(['plain', 'stripes', 'dots', 'stars']).optional(),
    bow: hex.optional(),
    extra: z.string().max(16).optional(),
    height: z.number().min(0.8).max(1.25).optional(),
    girth: z.number().min(0.85).max(1.2).optional(),
  })
  .strict();

const configSchema = z
  .object({
    v: z.literal(1),
    preset: z.string().max(24),
    paint: z.object({ wall: hex.optional(), floor: hex.optional(), accent: hex.optional() }).strict(),
    items: z
      .array(
        z
          .object({
            id: z.string().max(40),
            type: z.string().max(24),
            x: z.number().min(-400).max(400),
            z: z.number().min(-400).max(400),
            rot: z.number().int().min(0).max(3),
          })
          .strict(),
      )
      .max(200),
    people: z.record(z.string().max(64), person),
  })
  .strict();

// GET /api/world-config -> { data: config | null }
router.get('/', async (req, res, next) => {
  try {
    const row = await prisma.worldConfig.findUnique({ where: { storeId: req.user!.storeId } });
    res.json({ data: row?.data ?? null, updatedAt: row?.updatedAt ?? null });
  } catch (e) {
    next(e);
  }
});

// PUT /api/world-config -> replaces the whole config
router.put('/', validate(configSchema), async (req, res, next) => {
  try {
    const storeId = req.user!.storeId;
    const row = await prisma.worldConfig.upsert({
      where: { storeId },
      create: { storeId, data: req.body },
      update: { data: req.body },
    });
    res.json({ data: row.data, updatedAt: row.updatedAt });
  } catch (e) {
    next(e);
  }
});

export default router;
