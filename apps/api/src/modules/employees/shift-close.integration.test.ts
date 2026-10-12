/**
 * Shift close / summary: cash net of change, per-method sales, refunds, access rules.
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { errorMiddleware } from '../../middleware/error.middleware';
import employeeRoutes from './employee.routes';
import * as tabService from '../orders/order-tab.service';
import * as orderService from '../orders/order.service';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;

describe('shift close & summary (integration)', () => {
  let server: http.Server; let base: string;
  let storeId: string, otherStoreId: string, cashierId: string, cashier2Id: string, ownerId: string, otherOwnerId: string;
  let tCashier: string, tCashier2: string, tOwner: string, tOther: string;
  let productId: string, inventoryId: string;
  const stamp = Date.now();
  const call = async (tok: string, method: string, path: string, body?: any) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  beforeAll(async () => {
    storeId = (await prisma.store.create({ data: { name: 'TEST_STORE_shift', taxRate: 0, priceIncludesTax: false, serviceCharge: 0 } })).id;
    otherStoreId = (await prisma.store.create({ data: { name: 'TEST_STORE_shift_other', taxRate: 0 } })).id;
    const mk = (sid: string, role: any, n: string) => prisma.user.create({ data: { email: `sh-${n}-${stamp}@test.local`, name: n, role, storeId: sid } });
    const [c, c2, o, oo] = [await mk(storeId, 'CASHIER', 'c'), await mk(storeId, 'CASHIER', 'c2'), await mk(storeId, 'OWNER', 'o'), await mk(otherStoreId, 'OWNER', 'oo')];
    cashierId = c.id; cashier2Id = c2.id; ownerId = o.id; otherOwnerId = oo.id;
    const tok = (u: any) => signToken({ id: u.id, email: u.email, role: u.role, storeId: u.storeId });
    [tCashier, tCashier2, tOwner, tOther] = [await tok(c), await tok(c2), await tok(o), await tok(oo)];
    const cat = await prisma.category.create({ data: { name: 'C', storeId } });
    productId = (await prisma.product.create({ data: { name: 'Latte', sku: `SH-${stamp}`, costPrice: 30, sellingPrice: 60, categoryId: cat.id, storeId, trackStock: true } })).id;
    inventoryId = (await prisma.inventory.create({ data: { productId, quantity: 1000 } })).id;
    const app = express();
    app.use(express.json());
    app.use('/employees', employeeRoutes);
    app.use(errorMiddleware);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterAll(async () => {
    server?.close();
    const ids = [storeId, otherStoreId];
    const users = [cashierId, cashier2Id, ownerId, otherOwnerId];
    await prisma.shift.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { order: { storeId } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
    await prisma.stockMovement.deleteMany({ where: { inventoryId } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.inventory.deleteMany({ where: { id: inventoryId } });
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.category.deleteMany({ where: { storeId } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.store.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('nets change out of cash, splits methods, subtracts refunds, and reports the difference', async () => {
    const shift = await prisma.shift.create({ data: { userId: cashierId, openingCash: 500, startTime: new Date(Date.now() - 1000) } });
    const mk = (qty: number, payments: any[], extra: any = {}) =>
      orderService.create({ storeId, cashierId, type: 'TAKEAWAY', items: [{ productId, quantity: qty, ...extra }], payments } as any, fakeIo);

    await mk(1, [{ method: 'CASH', amount: 100 }]);                                   // 60 bill, 100 tendered → 60 net
    await mk(2, [{ method: 'PROMPTPAY', amount: 120 }]);                              // 120 promptpay
    await mk(1, [{ method: 'CASH', amount: 30 }, { method: 'CREDIT_CARD', amount: 30 }]); // 60 bill: 30 cash + 30 card
    const refunded = await mk(1, [{ method: 'CASH', amount: 60 }], { discount: 10 }); // total 50, tendered 60 → 50 net cash
    // an open tab (not settled) and a cancelled order must not count
    await tabService.openTab({ storeId, cashierId, type: 'TAKEAWAY', items: [{ productId, quantity: 1 }] }, fakeIo);
    // a settle on a tab: 60 bill paid with 200 cash
    const tab = await tabService.openTab({ storeId, cashierId, type: 'TAKEAWAY', items: [{ productId, quantity: 1 }] }, fakeIo);
    await tabService.settleTab(tab.id, { storeId, cashierId, payments: [{ method: 'CASH', amount: 200 }] }, fakeIo);
    // partial refund by the owner of 1 unit of the 4th order (unitPrice 60)
    await orderService.refundItems(refunded.id, ownerId, { items: [{ orderItemId: refunded.items[0].id, qty: 1 }] }, fakeIo, storeId);

    const r = await call(tCashier, 'GET', `/employees/shifts/${shift.id}/summary`);
    expect(r.status).toBe(200);
    expect(r.body.orderCount).toBe(5);
    expect(r.body.cashTendered).toBe(100 + 30 + 60 + 200);
    expect(r.body.changeGiven).toBe(40 + 0 + 10 + 140);
    expect(r.body.cashSales).toBe(60 + 30 + 50 + 60);        // 200
    expect(r.body.promptpaySales).toBe(120);
    expect(r.body.cardSales).toBe(30);
    expect(r.body.transferSales).toBe(0);
    expect(r.body.discountTotal).toBe(10);
    expect(r.body.totalSales).toBe(60 + 120 + 60 + 50 + 60);
    expect(r.body.refundsTotal).toBe(60);
    expect(r.body.cashRefunds).toBe(60);                      // 4th order was all cash
    expect(r.body.expectedCash).toBe(500 + 200 - 60);
    expect(r.body.difference).toBeNull();                     // still open

    // another cashier can't see/close it; other store can't find it; owner can
    expect((await call(tCashier2, 'GET', `/employees/shifts/${shift.id}/summary`)).status).toBe(403);
    expect((await call(tCashier2, 'POST', `/employees/shifts/${shift.id}/close`, { closingCash: 1 })).status).toBe(403);
    expect((await call(tOther, 'POST', `/employees/shifts/${shift.id}/close`, { closingCash: 1 })).status).toBe(404);
    expect((await call(tCashier, 'POST', `/employees/shifts/${shift.id}/close`, {})).status).toBe(400);

    const closed = await call(tOwner, 'POST', `/employees/shifts/${shift.id}/close`, { closingCash: 635.5, notes: 'ok' });
    expect(closed.status).toBe(200);
    expect(Number(closed.body.cashSales)).toBe(200);
    expect(Number(closed.body.closingCash)).toBe(635.5);
    expect(closed.body.summary.expectedCash).toBe(640);
    expect(closed.body.summary.difference).toBe(-4.5);
    expect((await call(tCashier, 'POST', `/employees/shifts/${shift.id}/close`, { closingCash: 1 })).status).toBe(400); // already closed

    // summary of the closed shift is frozen to its window and shows the difference
    const again = await call(tCashier, 'GET', `/employees/shifts/${shift.id}/summary`);
    expect(again.body.difference).toBe(-4.5);
  });
});
