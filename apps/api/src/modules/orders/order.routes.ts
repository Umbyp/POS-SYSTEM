import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as service from './order.service';
import * as tabService from './order-tab.service';
import { BadRequest } from '../../utils/errors';
import { buildReceiptESCPOS, sendToPrinter } from './escpos';

const router = Router();

const createSchema = z.object({
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
    discount: z.number().nonnegative().optional(),
    variants: z.array(z.object({
      name: z.string(),
      priceDelta: z.number(),
    })).optional(),
  })).min(1),
  discount: z.number().nonnegative().optional(),
  pointsToRedeem: z.number().int().nonnegative().optional(),
  useStampReward: z.boolean().optional(),
  promotionId: z.string().optional(),
  promotionDiscount: z.number().nonnegative().optional(),
  promotionName: z.string().optional(),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'PROMPTPAY', 'CREDIT_CARD', 'BANK_TRANSFER']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
  // 🆕 ข้อมูลลูกค้าสำหรับใบกำกับเต็ม
  customerName: z.string().optional(),
  customerTaxId: z.string().optional(),
  customerAddress: z.string().optional(),
});

router.use(authMiddleware);

router.post('/', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(createSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const order = await service.create(
      { ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id },
      io
    );
    res.status(201).json(order);
  } catch (e) { next(e); }
});

// ===== Park / Parked orders =====
const parkSchema = z.object({
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
    discount: z.number().nonnegative().optional(),
    variants: z.array(z.object({
      name: z.string(),
      priceDelta: z.number(),
    })).optional(),
  })).min(1),
  discount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

router.post('/park', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(parkSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const order = await service.parkOrder(
      { ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id },
      io
    );
    res.status(201).json(order);
  } catch (e) { next(e); }
});

router.get('/parked', async (req, res, next) => {
  try {
    res.json(await service.listParked(req.user!.storeId));
  } catch (e) { next(e); }
});

router.delete('/parked/:id', rbac('OWNER', 'ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    res.json(await service.deleteParked(req.params.id, req.user!.id, io));
  } catch (e) { next(e); }
});

// ===== Open tab (dine-in running bill) =====
const tabItems = z.array(z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  discount: z.number().nonnegative().optional(),
  variants: z.array(z.object({ name: z.string(), priceDelta: z.number() })).optional(),
})).min(1);

const openTabSchema = z.object({
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  items: tabItems,
  discount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const roundSchema = z.object({ items: tabItems, notes: z.string().optional() });

const settleSchema = z.object({
  payments: z.array(z.object({
    method: z.enum(['CASH', 'PROMPTPAY', 'CREDIT_CARD', 'BANK_TRANSFER']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
  })).min(1),
  discount: z.number().nonnegative().optional(),
  pointsToRedeem: z.number().int().nonnegative().optional(),
  useStampReward: z.boolean().optional(),
  customerId: z.string().optional(),
  promotionId: z.string().optional(),
  promotionDiscount: z.number().nonnegative().optional(),
  promotionName: z.string().optional(),
  customerName: z.string().optional(),
  customerTaxId: z.string().optional(),
  customerAddress: z.string().optional(),
});

// Open a new bill and fire round 1 to the kitchen
router.post('/open', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(openTabSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const order = await tabService.openTab(
      { ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id },
      io
    );
    res.status(201).json(order);
  } catch (e) { next(e); }
});

// List all open bills for the store
router.get('/open', async (req, res, next) => {
  try {
    res.json(await tabService.listOpen(req.user!.storeId));
  } catch (e) { next(e); }
});

// The open bill for a specific table (or null)
router.get('/open/by-table/:tableId', async (req, res, next) => {
  try {
    res.json(await tabService.getOpenByTable(req.user!.storeId, req.params.tableId));
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.list(req.user!.storeId, req.query));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id));
  } catch (e) { next(e); }
});

// The status went straight to Prisma before, so a typo from a client came back
// as a 500 (Prisma validation error) instead of telling the caller what's wrong.
const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
});

router.patch(
  '/:id/status',
  rbac('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN'),
  validate(updateStatusSchema),
  async (req, res, next) => {
    try {
      const io = req.app.get('io');
      res.json(await service.updateStatus(req.params.id, req.body.status, io));
    } catch (e) { next(e); }
  },
);

// Append another round to an open bill and fire it to the kitchen
router.post('/:id/items', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(roundSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const order = await tabService.addRound(
      req.params.id,
      { storeId: req.user!.storeId, cashierId: req.user!.id, items: req.body.items, notes: req.body.notes },
      io
    );
    res.json(order);
  } catch (e) { next(e); }
});

// Void (remove) some/all of an item's qty from an unpaid open bill — restocks
// and shrinks the bill total, unlike the post-payment /refund-items route.
const voidItemSchema = z.object({
  qty: z.number().int().positive(),
  reason: z.string().min(1),
});

router.post(
  '/:id/items/:itemId/void',
  rbac('OWNER', 'ADMIN', 'CASHIER'),
  validate(voidItemSchema),
  async (req, res, next) => {
    try {
      const io = req.app.get('io');
      const order = await tabService.voidItem(
        req.params.id,
        {
          storeId: req.user!.storeId,
          cashierId: req.user!.id,
          orderItemId: req.params.itemId,
          qty: req.body.qty,
          reason: req.body.reason,
        },
        io
      );
      res.json(order);
    } catch (e) { next(e); }
  }
);

// Take payment on an open bill → complete + free table
router.post('/:id/settle', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(settleSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const order = await tabService.settleTab(
      req.params.id,
      { ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id },
      io
    );
    res.json(order);
  } catch (e) { next(e); }
});

// Refunds the WHOLE bill. It takes no body, and used to ignore one silently —
// so a caller aiming at /refund-items but landing here (the names differ by a
// word) got a full refund and a full restock, with a 200 to say it went fine.
router.post('/:id/refund', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object' && 'items' in req.body) {
      throw BadRequest(
        'This endpoint refunds the entire bill and takes no items. Use POST /orders/:id/refund-items to refund selected lines.',
        'FULL_REFUND_ONLY',
      );
    }
    const io = req.app.get('io');
    res.json(await service.refund(req.params.id, req.user!.id, io));
  } catch (e) { next(e); }
});

// คืนเงินบางรายการ
const refundItemsSchema = z.object({
  items: z.array(z.object({
    orderItemId: z.string(),
    qty: z.number().int().positive(),
    reason: z.string().optional(),
  })).min(1),
});

router.post(
  '/:id/refund-items',
  rbac('OWNER', 'ADMIN'),
  validate(refundItemsSchema),
  async (req, res, next) => {
    try {
      const io = req.app.get('io');
      res.json(await service.refundItems(req.params.id, req.user!.id, req.body, io));
    } catch (e) { next(e); }
  }
);

// 🆕 PATCH /:id - แก้ไขข้อมูลลูกค้า (สำหรับ ออกใบกำกับเต็มย้อนหลัง)
router.patch('/:id', rbac('OWNER', 'ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        customerName: req.body.customerName,
        customerTaxId: req.body.customerTaxId,
        customerAddress: req.body.customerAddress,
        notes: req.body.notes,
      },
    });
    res.json(order);
  } catch (e) { next(e); }
});

// 🆕 POST /:id/print/escpos - ส่ง ESC/POS ไปยัง network thermal printer
// ต้องตั้ง env: PRINTER_IP, PRINTER_PORT (default 9100)
router.post('/:id/print/escpos', async (req, res, next) => {
  try {
    const printerIp = process.env.PRINTER_IP;
    if (!printerIp) {
      throw BadRequest('Network printer not configured. Set PRINTER_IP env var.');
    }

    const order = await service.getById(req.params.id);
    const store = await prisma.store.findUnique({ where: { id: req.user!.storeId } });
    if (!store) throw BadRequest('Store not found');

    // Generate ESC/POS bytes and send to printer over TCP socket (port 9100)
    const bytes = buildReceiptESCPOS(store, order);
    const port = Number(process.env.PRINTER_PORT || 9100);
    await sendToPrinter(bytes, printerIp, port);

    res.json({ ok: true, message: `ส่งใบเสร็จไปยัง printer ${printerIp} แล้ว` });
  } catch (e) { next(e); }
});

export default router;
