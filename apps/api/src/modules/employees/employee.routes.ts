import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'CASHIER', 'KITCHEN']),
});

router.get('/', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { storeId: req.user!.storeId },
      select: {
        id: true, email: true, name: true, role: true, avatar: true,
        isActive: true, createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
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

router.post('/shifts/:id/close', async (req, res, next) => {
  try {
    // คำนวณยอดขาย/cash ระหว่างกะ
    // ต้องเป็นกะของพนักงานในร้านตัวเองเท่านั้น (กันปิดกะข้ามร้าน)
    const shift = await prisma.shift.findFirst({
      where: { id: req.params.id, user: { storeId: req.user!.storeId } },
    });
    if (!shift) return res.status(404).json({ error: 'ไม่พบกะ' });
    if (shift.endTime) return res.status(400).json({ error: 'กะนี้ปิดไปแล้ว' });

    // นับเงินสดที่รับใน shift นี้
    const orders = await prisma.order.findMany({
      where: {
        cashierId: shift.userId,
        createdAt: { gte: shift.startTime },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      include: { payments: true },
    });
    const cashSales = orders.reduce((sum, o) => {
      const cash = o.payments
        .filter((p) => p.method === 'CASH')
        .reduce((s, p) => s + Number(p.amount), 0);
      return sum + cash;
    }, 0);
    const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);

    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data: {
        endTime: new Date(),
        closingCash: req.body.closingCash,
        cashSales,
        totalSales,
        notes: req.body.notes,
      },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
