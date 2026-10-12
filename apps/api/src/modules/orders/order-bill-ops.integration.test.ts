/**
 * Integration tests for move-table / merge / split on open bills, exercised
 * through the real routers (JWT + rbac + idempotency) on a throwaway express app.
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { signToken } from '../../utils/jwt';
import { errorMiddleware } from '../../middleware/error.middleware';
import orderRoutes from './order.routes';
import * as tabService from './order-tab.service';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;

describe('table bill operations (integration)', () => {
  let server: http.Server; let base: string;
  let storeId: string, otherStoreId: string, cashierId: string, otherUserId: string, kitchenId: string;
  let cashierTok: string, otherTok: string, kitchenTok: string;
  let productId: string, otherProductId: string; let inventoryId: string;
  const tables: Record<string, string> = {};
  let otherTable: string;
  const stamp = Date.now();

  const call = async (tok: string, method: string, path: string, body?: any, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}`, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const open = (tableId: string, items: { productId: string; quantity: number; discount?: number }[], extra: any = {}) =>
    tabService.openTab({ storeId, cashierId, tableId, type: 'DINE_IN', items, ...extra }, fakeIo);
  const table = (id: string) => prisma.table.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const store = await prisma.store.create({ data: { name: 'TEST_STORE_billops', taxRate: 7, priceIncludesTax: false, serviceCharge: 0 } });
    const other = await prisma.store.create({ data: { name: 'TEST_STORE_billops_other', taxRate: 7, priceIncludesTax: false, serviceCharge: 0 } });
    storeId = store.id; otherStoreId = other.id;
    const mk = (storeId: string, role: any, n: string) => prisma.user.create({ data: { email: `bo-${n}-${stamp}@test.local`, name: n, role, storeId } });
    const [c, o, k] = [await mk(storeId, 'CASHIER', 'c'), await mk(otherStoreId, 'OWNER', 'o'), await mk(storeId, 'KITCHEN', 'k')];
    cashierId = c.id; otherUserId = o.id; kitchenId = k.id;
    const tok = (u: any) => signToken({ id: u.id, email: u.email, role: u.role, storeId: u.storeId });
    cashierTok = await tok(c); otherTok = await tok(o); kitchenTok = await tok(k);
    const cat = await prisma.category.create({ data: { name: 'C', storeId } });
    const p = await prisma.product.create({ data: { name: 'Latte', sku: `BO-${stamp}`, costPrice: 30, sellingPrice: 60, categoryId: cat.id, storeId, trackStock: true } });
    productId = p.id;
    inventoryId = (await prisma.inventory.create({ data: { productId, quantity: 1000 } })).id;
    for (const n of ['T1', 'T2', 'T3', 'T4', 'T5']) tables[n] = (await prisma.table.create({ data: { number: n, storeId } })).id;
    otherTable = (await prisma.table.create({ data: { number: 'X1', storeId: otherStoreId } })).id;

    const app = express();
    app.use(express.json());
    app.set('io', fakeIo);
    app.use('/orders', orderRoutes);
    app.use(errorMiddleware);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    void otherProductId;
  });

  afterAll(async () => {
    server?.close();
    const ids = [storeId, otherStoreId];
    await prisma.idempotencyKey.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { order: { storeId: { in: ids } } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId: { in: ids } } } });
    await prisma.stockMovement.deleteMany({ where: { inventoryId } });
    await prisma.order.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { inventoryId } });
    await prisma.inventory.deleteMany({ where: { id: inventoryId } });
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.category.deleteMany({ where: { storeId } });
    await prisma.table.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { userId: { in: [cashierId, otherUserId, kitchenId] } } });
    await prisma.user.deleteMany({ where: { storeId: { in: ids } } });
    await prisma.store.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('MOVE: frees old table, occupies new one keeping occupiedAt, logs, and guards', async () => {
    const o = await open(tables.T1, [{ productId, quantity: 1 }]);
    const t1 = await table(tables.T1);
    const busy = await open(tables.T2, [{ productId, quantity: 1 }]);

    // forbidden for kitchen
    expect((await call(kitchenTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T3 })).status).toBe(403);
    // same table / occupied target / cross-store table / cross-store order
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T1 })).body.code).toBe('SAME_TABLE');
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T2 })).body.code).toBe('TABLE_HAS_OPEN_BILL');
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: otherTable })).status).toBe(404);
    expect((await call(otherTok, 'POST', `/orders/${o.id}/move-table`, { tableId: otherTable })).status).toBe(404);

    const key = `move-key-${stamp}-1`;
    const r = await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T3 }, { 'Idempotency-Key': key });
    expect(r.status).toBe(200);
    expect(r.body.tableId).toBe(tables.T3);
    expect(r.body.table.number).toBe('T3');
    const [a, b] = [await table(tables.T1), await table(tables.T3)];
    expect(a.status).toBe('AVAILABLE'); expect(a.occupiedAt).toBeNull();
    expect(b.status).toBe('OCCUPIED'); expect(b.occupiedAt?.getTime()).toBe(t1.occupiedAt?.getTime());
    expect(await prisma.activityLog.count({ where: { userId: cashierId, action: 'MOVE_TABLE' } })).toBeGreaterThan(0);

    // replay returns same result without re-moving
    const again = await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T3 }, { 'Idempotency-Key': key });
    expect(again.status).toBe(200); expect(again.headers.get('idempotent-replay')).toBe('true');

    // paid/closed bill can't be moved
    await tabService.settleTab(o.id, { storeId, cashierId, payments: [{ method: 'CASH', amount: 500 }] }, fakeIo);
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/move-table`, { tableId: tables.T4 })).body.code).toBe('BILL_NOT_OPEN');
    await tabService.cancelOrder(busy.id, { storeId, userId: cashierId }, fakeIo);
  });

  it('MERGE: moves items, sums totals/guests, cancels sources, frees their tables; no restock', async () => {
    const a = await open(tables.T1, [{ productId, quantity: 2 }], { guestCount: 2, discount: 10 }); // 120, disc 10
    const b = await open(tables.T2, [{ productId, quantity: 1, discount: 5 }], { guestCount: 3, notes: 'no ice' }); // 55
    const stockBefore = (await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).quantity;

    // guards: self, cross-store source, no ids
    expect((await call(cashierTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderId: a.id })).body.code).toBe('MERGE_SELF');
    expect((await call(otherTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderId: b.id })).status).toBe(404);
    expect((await call(cashierTok, 'POST', `/orders/${a.id}/merge`, {})).status).toBe(400);
    expect((await call(cashierTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderId: 'nope' })).status).toBe(404);

    // refuse when a bill already carries a promotion
    await prisma.order.update({ where: { id: b.id }, data: { promotionDiscount: 5 } });
    expect((await call(cashierTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderId: b.id })).body.code).toBe('MERGE_HAS_DISCOUNT');
    await prisma.order.update({ where: { id: b.id }, data: { promotionDiscount: 0 } });

    const r = await call(cashierTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderIds: [b.id] });
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(Number(r.body.subtotal)).toBe(175);          // 120 + 55
    expect(Number(r.body.discount)).toBe(10);
    expect(Number(r.body.total)).toBeCloseTo((175 - 10) * 1.07, 2);
    expect(r.body.guestCount).toBe(5);
    expect(r.body.notes).toContain('no ice');

    const src = await prisma.order.findUniqueOrThrow({ where: { id: b.id }, include: { items: true } });
    expect(src.status).toBe('CANCELLED'); expect(src.notes).toContain(`รวมเข้า #${a.orderNumber}`);
    expect(src.items).toHaveLength(0); expect(Number(src.total)).toBe(0);
    expect((await table(tables.T2)).status).toBe('AVAILABLE');
    expect((await table(tables.T1)).status).toBe('OCCUPIED');
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).quantity).toBe(stockBefore);

    // source is no longer open → can't merge again
    expect((await call(cashierTok, 'POST', `/orders/${a.id}/merge`, { sourceOrderId: b.id })).body.code).toBe('BILL_NOT_OPEN');
    await tabService.cancelOrder(a.id, { storeId, userId: cashierId }, fakeIo);
  });

  it('SPLIT: partial qty into a new bill at the same table; totals add up; table stays occupied until both settle', async () => {
    const o = await open(tables.T4, [{ productId, quantity: 3, discount: 30 }], { discount: 6 }); // 180-30=150, disc 6
    await tabService.addRound(o.id, { storeId, cashierId, items: [{ productId, quantity: 1 }] }, fakeIo); // +60 → 210
    const full = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: { orderBy: { createdAt: 'asc' } } } });
    const [l1, l2] = full.items;

    // guards
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: l1.id, qty: 9 }] })).body.code).toBe('QTY_EXCEEDS');
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: l1.id, qty: 3 }, { orderItemId: l2.id, qty: 1 }] })).body.code).toBe('SPLIT_ALL');
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: 'zzz', qty: 1 }] })).body.code).toBe('ITEM_NOT_FOUND');
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: l1.id, qty: 0 }] })).status).toBe(400);
    expect((await call(otherTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: l1.id, qty: 1 }] })).status).toBe(404);
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: l1.id, qty: 1 }], tableId: otherTable })).status).toBe(404);

    // split 1 of the 3 (line discount 30 → 10 moves) + the whole round-2 line
    const key = `split-key-${stamp}-1`;
    const r = await call(cashierTok, 'POST', `/orders/${o.id}/split`,
      { items: [{ orderItemId: l1.id, qty: 1 }, { orderItemId: l2.id, qty: 1 }] }, { 'Idempotency-Key': key });
    expect(r.status).toBe(201);
    const { order: orig, newOrder } = r.body;
    expect(Number(newOrder.subtotal)).toBe(60 - 10 + 60);        // 110
    expect(Number(orig.subtotal)).toBe(100);                      // 2×60 − 20
    expect(Number(orig.subtotal) + Number(newOrder.subtotal)).toBe(210);
    expect(Number(orig.discount)).toBe(6); expect(Number(newOrder.discount)).toBe(0);
    expect(Number(orig.total)).toBeCloseTo((100 - 6) * 1.07, 2);
    expect(Number(newOrder.total)).toBeCloseTo(110 * 1.07, 2);
    expect(newOrder.tableId).toBe(tables.T4); expect(newOrder.status).toBe(orig.status);
    expect(newOrder.items).toHaveLength(2);
    expect(newOrder.notes).toContain(`แยกจาก #${o.orderNumber}`);
    const origItems = await prisma.orderItem.findMany({ where: { orderId: o.id } });
    expect(origItems).toHaveLength(1); expect(origItems[0].quantity).toBe(2); expect(Number(origItems[0].discount)).toBe(20);

    // replay → same new bill, both returned
    const again = await call(cashierTok, 'POST', `/orders/${o.id}/split`,
      { items: [{ orderItemId: l1.id, qty: 1 }, { orderItemId: l2.id, qty: 1 }] }, { 'Idempotency-Key': key });
    expect(again.headers.get('idempotent-replay')).toBe('true');
    expect(again.body.newOrder.id).toBe(newOrder.id);
    expect((await prisma.order.count({ where: { storeId, notes: { contains: `แยกจาก #${o.orderNumber}` } } }))).toBe(1);

    // table has two open bills: by-table = oldest, /all = both
    const one = await call(cashierTok, 'GET', `/orders/open/by-table/${tables.T4}`);
    expect(one.body.id).toBe(o.id);
    const all = await call(cashierTok, 'GET', `/orders/open/by-table/${tables.T4}/all`);
    expect(all.body.map((x: any) => x.id)).toEqual([o.id, newOrder.id]);

    // settling one must NOT free the table; settling the last one does
    await tabService.settleTab(o.id, { storeId, cashierId, payments: [{ method: 'CASH', amount: 500 }] }, fakeIo);
    expect((await table(tables.T4)).status).toBe('OCCUPIED');
    await tabService.settleTab(newOrder.id, { storeId, cashierId, payments: [{ method: 'CASH', amount: 500 }] }, fakeIo);
    expect((await table(tables.T4)).status).toBe('AVAILABLE');
  });

  it('SPLIT to another table, and cannot split voided qty', async () => {
    const o = await open(tables.T1, [{ productId, quantity: 2 }, { productId, quantity: 2 }]);
    const items = await prisma.orderItem.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' } });
    await tabService.voidItem(o.id, { storeId, cashierId, orderItemId: items[0].id, qty: 2, reason: 't' }, fakeIo);
    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: items[0].id, qty: 1 }] })).body.code).toBe('QTY_EXCEEDS');

    expect((await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: items[1].id, qty: 1 }], tableId: tables.T1 })).status).toBe(201); // same table ok
    const r = await call(cashierTok, 'POST', `/orders/${o.id}/split`, { items: [{ orderItemId: items[1].id, qty: 1 }], tableId: tables.T5 });
    // only 1 live unit left on the original → refused
    expect(r.body.code).toBe('SPLIT_ALL');

    const bills = await tabService.listOpenByTable(storeId, tables.T1);
    expect(bills).toHaveLength(2);
    const [orig, split] = bills;
    const r2 = await call(cashierTok, 'POST', `/orders/${split.id}/split`, { items: [{ orderItemId: split.items[0].id, qty: 1 }], tableId: tables.T5 });
    expect(r2.body.code).toBe('SPLIT_ALL'); // split bill has a single unit too
    // move the split bill instead, to T5
    expect((await call(cashierTok, 'POST', `/orders/${split.id}/move-table`, { tableId: tables.T5 })).status).toBe(200);
    expect((await table(tables.T1)).status).toBe('OCCUPIED');  // original still there
    expect((await table(tables.T5)).status).toBe('OCCUPIED');
    for (const b of [orig, split]) await tabService.cancelOrder(b.id, { storeId, userId: cashierId }, fakeIo);
    expect((await table(tables.T1)).status).toBe('AVAILABLE');
    expect((await table(tables.T5)).status).toBe('AVAILABLE');
  });
});
