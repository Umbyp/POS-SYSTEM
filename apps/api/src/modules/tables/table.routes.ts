import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const tables = await prisma.table.findMany({
      where: { storeId: req.user!.storeId },
      orderBy: { number: 'asc' },
    });
    res.json(tables);
  } catch (e) { next(e); }
});

router.post('/', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const table = await prisma.table.create({
      data: { ...req.body, storeId: req.user!.storeId },
    });
    res.status(201).json(table);
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const table = await prisma.table.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    const io = req.app.get('io');
    io.to(`store:${req.user!.storeId}`).emit('table:updated', table);
    res.json(table);
  } catch (e) { next(e); }
});

// Edit table details (number, capacity, size)
router.patch('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { number, capacity, size } = req.body;
    const data: any = {};
    if (number !== undefined) data.number = number;
    if (capacity !== undefined) data.capacity = Number(capacity);
    if (size !== undefined && ['SMALL', 'MEDIUM', 'LARGE'].includes(size)) data.size = size;
    const table = await prisma.table.update({
      where: { id: req.params.id },
      data,
    });
    const io = req.app.get('io');
    io.to(`store:${req.user!.storeId}`).emit('table:updated', table);
    res.json(table);
  } catch (e) { next(e); }
});

router.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.table.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
