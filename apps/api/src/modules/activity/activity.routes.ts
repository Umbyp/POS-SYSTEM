import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(authMiddleware);

// GET /api/activity-logs - ดู audit trail
router.get('/', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const where: any = {
      user: { storeId: req.user!.storeId },
    };
    if (req.query.action) where.action = req.query.action as string;
    if (req.query.userId) where.userId = req.query.userId as string;

    const take = Math.min(Number(req.query.limit) || 100, 500);
    const skip = Number(req.query.offset) || 0;

    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({ data, total, limit: take, offset: skip });
  } catch (e) { next(e); }
});

export default router;
