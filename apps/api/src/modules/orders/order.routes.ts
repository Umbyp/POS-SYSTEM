import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as service from './order.service';
import * as tabService from './order-tab.service';
import * as billOps from './order-bill-ops.service';
import { BadRequest } from '../../utils/errors';
import { readIdempotencyKey, runIdempotent, addRoundScope, settleScope, moveScope, mergeScope, splitScope } from './idempotency';
import { buildReceiptESCPOS, sendToPrinter, isKitchenPrinterConfigured } from './escpos';

const router = Router();

const guestCount = z.number().int().min(1).max(99).optional();
// Optional retry key (alternative to the Idempotency-Key header).
const clientRequestId = z.string().min(8).max(128).optional();
const redemptionCode = z.string().trim().min(1).max(32).optional();

// A payment line optionally carries a Slip2Go verification result the
// frontend already fetched via POST /payments/verify-slip before the cashier
// confirmed — see order.service.ts's CreateOrderInput doc comment.
const paymentLineSchema = z.object({
  method: z.enum(['CASH', 'PROMPTPAY', 'CREDIT_CARD', 'BANK_TRANSFER']),
  amount: z.number().nonnegative(),
  reference: z.string().optional(),
  slipVerified: z.boolean().optional(),
  slipTransRef: z.string().optional(),
  slipPayload: z.string().optional(),
});

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
  redemptionCode,
  clientRequestId,
  payments: z.array(paymentLineSchema).min(1),
  notes: z.string().optional(),
  guestCount,
  // 🆕 ข้อมูลลูกค้าสำหรับใบกำกับเต็ม
  customerName: z.string().optional(),
  customerTaxId: z.string().optional(),
  customerAddress: z.string().optional(),
});

router.use(authMiddleware);

// Lets the POS know whether the server already auto-prints kitchen tickets
// via a real network printer, so it can turn off its own older browser-print
// auto-print toggle instead of the two double-printing every round.
router.get('/print-config', (_req, res) => {
  res.json({ kitchenAutoPrintConfigured: isKitchenPrinterConfigured() });
});

router.post('/', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(createSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const key = readIdempotencyKey(req);
    const { order, replay } = await runIdempotent(req.user!.storeId, 'orders:create', key, (k) =>
      service.create({ ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id, idempotencyKey: k }, io));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
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
    res.json(await service.deleteParked(req.params.id, req.user!.id, io, req.user!.storeId));
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
  guestCount,
  clientRequestId,
});

const roundSchema = z.object({ items: tabItems, notes: z.string().optional(), guestCount, clientRequestId });

const settleSchema = z.object({
  payments: z.array(paymentLineSchema).min(1),
  discount: z.number().nonnegative().optional(),
  pointsToRedeem: z.number().int().nonnegative().optional(),
  useStampReward: z.boolean().optional(),
  customerId: z.string().optional(),
  promotionId: z.string().optional(),
  promotionDiscount: z.number().nonnegative().optional(),
  promotionName: z.string().optional(),
  redemptionCode,
  customerName: z.string().optional(),
  customerTaxId: z.string().optional(),
  customerAddress: z.string().optional(),
  notes: z.string().trim().max(200).optional(), // discount reason; appended to order.notes
  clientRequestId,
});

// Open a new bill and fire round 1 to the kitchen
router.post('/open', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(openTabSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const key = readIdempotencyKey(req);
    const { order, replay } = await runIdempotent(req.user!.storeId, 'orders:open', key, (k) =>
      tabService.openTab({ ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id, idempotencyKey: k }, io));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
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

// Every open bill at a table (several exist after a split), oldest first
router.get('/open/by-table/:tableId/all', async (req, res, next) => {
  try {
    res.json(await tabService.listOpenByTable(req.user!.storeId, req.params.tableId));
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.list(req.user!.storeId, req.query));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id, req.user!.storeId));
  } catch (e) { next(e); }
});

// The status went straight to Prisma before, so a typo from a client came back
// as a 500 (Prisma validation error) instead of telling the caller what's wrong.
const updateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
  reason: z.string().max(200).optional(), // recorded in the activity log when status = CANCELLED
});

router.patch(
  '/:id/status',
  rbac('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN'),
  validate(updateStatusSchema),
  async (req, res, next) => {
    try {
      const io = req.app.get('io');
      if (req.body.status === 'CANCELLED') {
        res.json(await tabService.cancelOrder(req.params.id, {
          storeId: req.user!.storeId, userId: req.user!.id, reason: req.body.reason,
        }, io));
      } else {
        res.json(await service.updateStatus(req.params.id, req.body.status, io, req.user!.storeId));
      }
    } catch (e) { next(e); }
  },
);

// Append another round to an open bill and fire it to the kitchen
router.post('/:id/items', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(roundSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const key = readIdempotencyKey(req);
    const { order, replay } = await runIdempotent(req.user!.storeId, addRoundScope(req.params.id), key, (k) =>
      tabService.addRound(
        req.params.id,
        { storeId: req.user!.storeId, cashierId: req.user!.id, items: req.body.items, notes: req.body.notes, guestCount: req.body.guestCount, idempotencyKey: k },
        io,
      ));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
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

// ===== Table bill operations on open bills =====
const moveSchema = z.object({ tableId: z.string().min(1), clientRequestId });
const mergeSchema = z.object({
  sourceOrderId: z.string().min(1).optional(),
  sourceOrderIds: z.array(z.string().min(1)).min(1).max(20).optional(),
  clientRequestId,
}).refine((b) => b.sourceOrderId || b.sourceOrderIds?.length, { message: 'ต้องระบุ sourceOrderId หรือ sourceOrderIds' });
const splitSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().min(1), qty: z.number().int().positive() })).min(1),
  tableId: z.string().min(1).optional(),
  clientRequestId,
});

router.post('/:id/move-table', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(moveSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { order, replay } = await runIdempotent(req.user!.storeId, moveScope(req.params.id), readIdempotencyKey(req), (k) =>
      billOps.moveTable(req.params.id, { storeId: req.user!.storeId, userId: req.user!.id, tableId: req.body.tableId, idempotencyKey: k }, io));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
    res.json(order);
  } catch (e) { next(e); }
});

router.post('/:id/merge', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(mergeSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const sourceOrderIds: string[] = req.body.sourceOrderIds ?? [req.body.sourceOrderId];
    const { order, replay } = await runIdempotent(req.user!.storeId, mergeScope(req.params.id), readIdempotencyKey(req), (k) =>
      billOps.mergeOrders(req.params.id, { storeId: req.user!.storeId, userId: req.user!.id, sourceOrderIds, idempotencyKey: k }, io));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
    res.json(order);
  } catch (e) { next(e); }
});

router.post('/:id/split', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(splitSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const { order: created, replay } = await runIdempotent(req.user!.storeId, splitScope(req.params.id), readIdempotencyKey(req), (k) =>
      billOps.splitOrder(req.params.id, {
        storeId: req.user!.storeId, userId: req.user!.id, items: req.body.items, tableId: req.body.tableId, idempotencyKey: k,
      }, io));
    if (!replay) return res.status(201).json(created);
    // Replay: the key row points at the new bill; return both bills as they are now.
    res.setHeader('Idempotent-Replay', 'true');
    const newOrder = created as any;
    res.status(201).json({ order: await service.getById(req.params.id, req.user!.storeId), newOrder });
  } catch (e) { next(e); }
});

// Take payment on an open bill → complete + free table
router.post('/:id/settle', rbac('OWNER', 'ADMIN', 'CASHIER'), validate(settleSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const key = readIdempotencyKey(req);
    const { order, replay } = await runIdempotent(req.user!.storeId, settleScope(req.params.id), key, (k) =>
      tabService.settleTab(
        req.params.id,
        { ...req.body, storeId: req.user!.storeId, cashierId: req.user!.id, idempotencyKey: k },
        io,
      ));
    if (replay) res.setHeader('Idempotent-Replay', 'true');
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
    res.json(await service.refund(req.params.id, req.user!.id, io, req.user!.storeId));
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
      res.json(await service.refundItems(req.params.id, req.user!.id, req.body, io, req.user!.storeId));
    } catch (e) { next(e); }
  }
);

// 🆕 PATCH /:id - แก้ไขข้อมูลลูกค้า (สำหรับ ออกใบกำกับเต็มย้อนหลัง)
router.patch('/:id', rbac('OWNER', 'ADMIN', 'CASHIER'), async (req, res, next) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, storeId: req.user!.storeId },
      data: {
        customerName: req.body.customerName,
        customerTaxId: req.body.customerTaxId,
        customerAddress: req.body.customerAddress,
        notes: req.body.notes,
        ...(req.body.guestCount !== undefined ? { guestCount: req.body.guestCount } : {}),
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

    const order = await service.getById(req.params.id, req.user!.storeId);
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
