import { Router } from 'express';
import { z } from 'zod';
import * as net from 'net';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as service from './order.service';
import { BadRequest } from '../../utils/errors';

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
  promotionId: z.string().optional(),
  promotionDiscount: z.number().nonnegative().optional(),
  promotionName: z.string().optional(),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'PROMPTPAY', 'CREDIT_CARD', 'BANK_TRANSFER']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
    slipTransRef: z.string().optional(),
    slipPayload: z.string().optional(),
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

router.patch('/:id/status', rbac('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN'), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    res.json(await service.updateStatus(req.params.id, req.body.status, io));
  } catch (e) { next(e); }
});

router.post('/:id/refund', rbac('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
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

    // Generate ESC/POS bytes
    const bytes = buildReceiptESCPOS(store, order);

    // Send to printer over TCP socket (port 9100)
    await new Promise<void>((resolve, reject) => {
      const client = new net.Socket();
      const port = Number(process.env.PRINTER_PORT || 9100);
      client.connect(port, printerIp, () => {
        client.write(Buffer.from(bytes), () => {
          client.end();
        });
      });
      client.on('close', () => resolve());
      client.on('error', (err) => reject(err));
      client.setTimeout(5000, () => {
        client.destroy();
        reject(new Error('Printer timeout'));
      });
    });

    res.json({ ok: true, message: `ส่งใบเสร็จไปยัง printer ${printerIp} แล้ว` });
  } catch (e) { next(e); }
});

export default router;

// ============ ESC/POS Builder (server-side) ============
// Mirror ของ frontend escpos.ts — เก็บใน file เดียวกันเพื่อความง่าย

function tis620Byte(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e01 + 0xa1;
  return 0x3f;
}

function encodeText(text: string): number[] {
  return Array.from(text).map(tis620Byte);
}

function buildReceiptESCPOS(store: any, order: any): Uint8Array {
  const out: number[] = [];
  const W = 32;

  const line = (t = '') => { out.push(...encodeText(t), 0x0a); };
  const twoCol = (l: string, r: string) => {
    const space = Math.max(1, W - l.length - r.length);
    line(l + ' '.repeat(space) + r);
  };

  out.push(0x1b, 0x40);                       // init
  out.push(0x1b, 0x74, 21);                   // charset TIS-620

  out.push(0x1b, 0x61, 1);                    // center
  out.push(0x1d, 0x21, 0x11);                 // double size
  line(store.name);
  out.push(0x1d, 0x21, 0x00);                 // normal size

  if (store.address) line(store.address);
  if (store.phone) line(`โทร. ${store.phone}`);
  if (store.taxId) line(`TAX ID: ${store.taxId}`);
  line('--------------------------------');

  out.push(0x1b, 0x61, 0);                    // left
  line(`เลขที่: ${order.orderNumber}`);
  line(`วันที่: ${new Date(order.createdAt).toLocaleString('th-TH')}`);
  if (order.cashier) line(`พนักงาน: ${order.cashier.name}`);
  if (order.table) line(`โต๊ะ: ${order.table.number}`);
  line('--------------------------------');

  for (const it of order.items) {
    line(it.product.name);
    twoCol(`  ${it.quantity} x ${Number(it.unitPrice).toFixed(2)}`,
           (Number(it.unitPrice) * it.quantity).toFixed(2));
  }
  line('--------------------------------');

  twoCol('ยอดรวม', Number(order.subtotal).toFixed(2));
  if (Number(order.discount) > 0)
    twoCol('ส่วนลด', `-${Number(order.discount).toFixed(2)}`);
  if (Number(order.tax) > 0)
    twoCol('VAT 7%', Number(order.tax).toFixed(2));

  out.push(0x1d, 0x21, 0x10);                 // double width
  twoCol('รวมทั้งสิ้น', Number(order.total).toFixed(2));
  out.push(0x1d, 0x21, 0x00);
  line('--------------------------------');

  for (const p of order.payments) {
    const label = p.method === 'CASH' ? 'เงินสด'
                : p.method === 'PROMPTPAY' ? 'พร้อมเพย์'
                : p.method === 'CREDIT_CARD' ? 'บัตรเครดิต'
                : 'โอนธนาคาร';
    twoCol(label, Number(p.amount).toFixed(2));
  }

  out.push(0x0a);
  out.push(0x1b, 0x61, 1);                    // center
  line('*** ขอบคุณที่ใช้บริการ ***');
  out.push(0x0a, 0x0a, 0x0a);
  out.push(0x1d, 0x56, 1);                    // cut

  return new Uint8Array(out);
}
