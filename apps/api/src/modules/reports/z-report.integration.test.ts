/**
 * Z-report: day window (Asia/Bangkok), sold/refund attribution, method reconciliation, RBAC, tenant isolation.
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { errorMiddleware } from '../../middleware/error.middleware';
import reportRoutes from './report.routes';

describe('z-report (integration)', () => {
  let server: http.Server; let base: string;
  let storeId: string, otherStoreId: string, cashierId: string, cashier2Id: string, ownerId: string, otherOwnerId: string;
  let tCashier: string, tOwner: string, tOther: string, productId: string, otherProductId: string;
  const stamp = Date.now();
  const D = '2030-06-15', D1 = '2030-06-16', Dm1 = '2030-06-14';
  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`);
  const get = async (tok: string, q: string) => {
    const r = await fetch(`${base}/reports/z-report${q}`, { headers: { authorization: `Bearer ${tok}` } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  let seq = 0;
  const mkOrder = async (sid: string, cid: string, pid: string, o: {
    total: number; status?: any; payments: [string, number, Date][]; day?: Date; discount?: number; promo?: number;
    items?: { qty: number; price: number; discount?: number; refunded?: number }[]; tax?: number; sc?: number;
  }) => prisma.order.create({
    data: {
      orderNumber: `Z${stamp}-${++seq}`, storeId: sid, cashierId: cid, status: o.status ?? 'COMPLETED',
      subtotal: o.total, discount: o.discount ?? 0, promotionDiscount: o.promo ?? 0, tax: o.tax ?? 0, serviceCharge: o.sc ?? 0,
      total: o.total, createdAt: o.day ?? o.payments[0]?.[2] ?? at(D, '09:00'),
      items: { create: (o.items ?? [{ qty: 1, price: o.total }]).map((i) => ({ productId: pid, quantity: i.qty, unitPrice: i.price, discount: i.discount ?? 0, refundedQty: i.refunded ?? 0 })) },
      payments: { create: o.payments.map(([method, amount, createdAt]) => ({ method: method as any, amount, createdAt })) },
    },
  });
  const log = (userId: string, orderId: string, createdAt: Date, amount?: number) =>
    prisma.activityLog.create({ data: { userId, action: amount == null ? 'REFUND' : 'PARTIAL_REFUND', metadata: amount == null ? { orderId } : { orderId, refundedAmount: amount }, createdAt } });

  beforeAll(async () => {
    storeId = (await prisma.store.create({ data: { name: 'TEST_STORE_zr' } })).id;
    otherStoreId = (await prisma.store.create({ data: { name: 'TEST_STORE_zr_other' } })).id;
    const mk = (sid: string, role: any, n: string) => prisma.user.create({ data: { email: `zr-${n}-${stamp}@test.local`, name: n, role, storeId: sid } });
    const [c, c2, o, oo] = [await mk(storeId, 'CASHIER', 'c'), await mk(storeId, 'CASHIER', 'c2'), await mk(storeId, 'OWNER', 'o'), await mk(otherStoreId, 'OWNER', 'oo')];
    cashierId = c.id; cashier2Id = c2.id; ownerId = o.id; otherOwnerId = oo.id;
    const tok = (u: any) => signToken({ id: u.id, email: u.email, role: u.role, storeId: u.storeId });
    [tCashier, tOwner, tOther] = [await tok(c), await tok(o), await tok(oo)];
    const cat = await prisma.category.create({ data: { name: 'C', storeId } });
    productId = (await prisma.product.create({ data: { name: 'Latte', sku: `ZR-${stamp}`, costPrice: 30, sellingPrice: 100, categoryId: cat.id, storeId } })).id;
    const cat2 = await prisma.category.create({ data: { name: 'C2', storeId: otherStoreId } });
    otherProductId = (await prisma.product.create({ data: { name: 'Other', sku: `ZR2-${stamp}`, costPrice: 1, sellingPrice: 100, categoryId: cat2.id, storeId: otherStoreId } })).id;

    // A: 100 bill, 200 cash tendered (100 change) @10:00
    await mkOrder(storeId, cashierId, productId, { total: 100, payments: [['CASH', 200, at(D, '10:00')]], tax: 6.54 });
    // B: 200 bill (discounts 20 + promo 5 + line 10), PromptPay 100 + cash 100 @14:00, partial refund 25 on D
    const B = await mkOrder(storeId, cashierId, productId, { total: 200, payments: [['PROMPTPAY', 100, at(D, '14:00')], ['CASH', 100, at(D, '14:00')]], discount: 20, promo: 5, sc: 10, items: [{ qty: 2, price: 100, discount: 10 }] });
    await log(ownerId, B.id, at(D, '15:00'), 25);
    // C: 300 card, fully refunded the same day (legacy log, no amount)
    const C = await mkOrder(storeId, cashier2Id, productId, { total: 300, status: 'REFUNDED', payments: [['CREDIT_CARD', 300, at(D, '14:30')]], items: [{ qty: 3, price: 100, refunded: 3 }] });
    await log(ownerId, C.id, at(D, '16:00'));
    // D: 100 cash, partial refund of 40 the NEXT day
    const Dd = await mkOrder(storeId, cashierId, productId, { total: 100, payments: [['CASH', 100, at(D, '23:30')]] });
    await log(ownerId, Dd.id, at(D1, '09:00'), 40);
    // E: sold the day BEFORE (23:59 Bangkok), 50 refunded on D
    const E = await mkOrder(storeId, cashierId, productId, { total: 100, payments: [['CASH', 100, at(Dm1, '23:59')]] });
    await log(ownerId, E.id, at(D, '11:00'), 50);
    // not counted: cancelled, open tab (no payments), draft, other store
    await mkOrder(storeId, cashierId, productId, { total: 999, status: 'CANCELLED', payments: [], day: at(D, '12:00') });
    await mkOrder(storeId, cashierId, productId, { total: 999, status: 'PENDING', payments: [], day: at(D, '12:05') });
    await mkOrder(otherStoreId, otherOwnerId, otherProductId, { total: 5000, payments: [['CASH', 5000, at(D, '12:00')]] });
    // shifts: one closed (counted 800), one still open
    await prisma.shift.create({ data: { userId: cashierId, openingCash: 500, closingCash: 800, startTime: at(D, '08:00'), endTime: at(D, '18:00') } });
    await prisma.shift.create({ data: { userId: cashier2Id, openingCash: 300, startTime: at(D, '19:00') } });

    const app = express();
    app.use(express.json());
    app.use('/reports', reportRoutes);
    app.use(errorMiddleware);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterAll(async () => {
    server?.close();
    const ids = [storeId, otherStoreId];
    const users = [cashierId, cashier2Id, ownerId, otherOwnerId];
    await prisma.shift.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { order: { storeId: { in: ids } } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.product.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.category.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.store.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('rejects cashiers (403) and bad dates (400)', async () => {
    expect((await get(tCashier, `?date=${D}`)).status).toBe(403);
    expect((await get(tOwner, '?date=15-06-2030')).status).toBe(400);
  });

  it('computes sales, discounts, refunds by refund day, and reconciles methods to net sales', async () => {
    const r = await get(tOwner, `?date=${D}`);
    expect(r.status).toBe(200);
    const s = r.body.sales;
    expect(s.orderCount).toBe(4);                 // A, B, C, D — not E (sold day before), cancelled, open, other store
    expect(s.grossSales).toBe(700);
    expect(s.discountTotal).toBe(35);             // 20 + 5 promo + 10 line
    expect(s.serviceCharge).toBe(10);
    expect(s.tax).toBe(6.54);
    expect(s.refunds).toEqual({ count: 3, amount: 375 }); // C 300 (legacy) + B 25 + E 50; D's 40 is tomorrow
    expect(s.netSales).toBe(325);
    expect(s.avgBill).toBe(175);
    const m = Object.fromEntries(r.body.byMethod.map((x: any) => [x.method, x.amount]));
    expect(m.CASH).toBe(237.5);                   // 100 + 100 + 100 net of change − 12.5 − 50
    expect(m.PROMPTPAY).toBe(87.5);
    expect(m.CREDIT_CARD).toBe(0);
    expect(r.body.byMethod.reduce((a: number, x: any) => a + x.amount, 0)).toBeCloseTo(s.netSales, 2);
    expect(r.body.cancelled.count).toBe(1);
  });

  it('breaks down hours, items (net of refunded qty), cashiers', async () => {
    const r = (await get(tOwner, `?date=${D}`)).body;
    expect(r.byHour).toHaveLength(24);
    expect(r.byHour[10]).toEqual({ hour: 10, orders: 1, sales: 100 });
    expect(r.byHour[14]).toEqual({ hour: 14, orders: 2, sales: 500 });
    expect(r.byHour[23]).toEqual({ hour: 23, orders: 1, sales: 100 });
    expect(r.topItems[0]).toMatchObject({ name: 'Latte', quantity: 4 }); // 1 + 2 + 0 (3 refunded) + 1
    expect(r.topItems[0].revenue).toBe(100 + 190 + 100);
    expect(r.byCashier.find((c: any) => c.name === 'c')).toMatchObject({ orders: 3, sales: 400 });
    expect(r.byCashier.find((c: any) => c.name === 'c2')).toMatchObject({ orders: 1, sales: 300 });
  });

  it('lists shifts and the cash drawer difference (open shifts excluded from totals)', async () => {
    const r = (await get(tOwner, `?date=${D}`)).body;
    expect(r.shifts).toHaveLength(2);
    const closed = r.shifts.find((x: any) => x.closingCash != null);
    const open = r.shifts.find((x: any) => x.closingCash == null);
    expect(closed.openingCash).toBe(500);
    // cashier c: shift 08-18 sees cash net A 100 + B 100 = 200 (D is 23:30); refunds in window by owner on c's orders: B 25*.5 + E 50 (cash) = 62.5 → 500+200−62.5
    expect(closed.expectedCash).toBe(637.5);
    expect(closed.difference).toBe(162.5);
    expect(open.difference).toBeNull();
    expect(r.cashDrawer).toMatchObject({ expectedTotal: 637.5, countedTotal: 800, differenceTotal: 162.5, openShifts: 1 });
  });

  it('attributes a later-day refund to the day it happened', async () => {
    const r = (await get(tOwner, `?date=${D1}`)).body;
    expect(r.sales.orderCount).toBe(0);
    expect(r.sales.refunds).toEqual({ count: 1, amount: 40 });
    expect(r.sales.netSales).toBe(-40);
    expect(r.byMethod.reduce((a: number, x: any) => a + x.amount, 0)).toBeCloseTo(-40, 2);
    expect(r.byMethod.find((x: any) => x.method === 'CASH').amount).toBe(-40);
  });

  it('isolates tenants', async () => {
    const r = (await get(tOther, `?date=${D}`)).body;
    expect(r.sales.orderCount).toBe(1);
    expect(r.sales.grossSales).toBe(5000);
    expect(r.sales.refunds.count).toBe(0);
    expect(r.shifts).toHaveLength(0);
  });
});
