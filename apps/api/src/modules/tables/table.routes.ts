import { Router } from 'express';
import crypto from 'crypto';
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

const TABLE_STATUSES = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'BILLING', 'DIRTY'] as const;

router.patch('/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!TABLE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid table status' });
    }

    const current = await prisma.table.findUnique({ where: { id: req.params.id } });
    const data: { status: string; occupiedAt?: Date | null } = { status };

    // occupiedAt drives the elapsed-time badge:
    // - set it when guests first sit down (fresh OCCUPIED, not a re-sync)
    // - keep it through BILLING (still seated)
    // - clear it once the table frees up or is being cleaned
    if (status === 'OCCUPIED') {
      if (current?.status !== 'OCCUPIED' && current?.status !== 'BILLING') {
        data.occupiedAt = new Date();
      }
    } else if (status !== 'BILLING') {
      data.occupiedAt = null;
    }

    const table = await prisma.table.update({
      where: { id: req.params.id },
      data,
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

// Self-order QR link — lazily generate the table's opaque token on first
// request so existing tables (created before this feature) still work.
router.get('/:id/qr', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    let table = await prisma.table.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });

    if (!table.qrCode) {
      table = await prisma.table.update({
        where: { id: table.id },
        data: { qrCode: crypto.randomBytes(9).toString('base64url') },
      });
    }
    res.json({ qrCode: table.qrCode });
  } catch (e) { next(e); }
});

// Issue a fresh token, invalidating any previously printed/shared QR/link.
router.post('/:id/qr/regenerate', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.table.findFirst({
      where: { id: req.params.id, storeId: req.user!.storeId },
    });
    if (!existing) return res.status(404).json({ error: 'Table not found' });

    const table = await prisma.table.update({
      where: { id: existing.id },
      data: { qrCode: crypto.randomBytes(9).toString('base64url') },
    });
    res.json({ qrCode: table.qrCode });
  } catch (e) { next(e); }
});

router.delete('/:id', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.table.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
