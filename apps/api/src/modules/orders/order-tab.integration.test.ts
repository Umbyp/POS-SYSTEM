/**
 * Integration test for the open-tab money path: open → add round → void an
 * item → settle. Runs against the real local dev Postgres (same DB `npm run
 * dev` uses) with fully self-contained, self-cleaning fixtures — it does not
 * touch seeded data and leaves nothing behind.
 *
 * Requires the local Docker Postgres to be running (see local-dev-setup
 * memory / DATABASE_URL in apps/api/.env).
 */
import 'dotenv/config'; // must run before ../../config/prisma is imported below
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import * as tabService from './order-tab.service';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;

describe('open-tab money path (integration)', () => {
  let storeId: string;
  let userId: string;
  let categoryId: string;
  let productId: string;
  let inventoryId: string;
  let tableId: string;

  beforeAll(async () => {
    const store = await prisma.store.create({
      data: { name: 'TEST_STORE_order-tab-integration', taxRate: 7, priceIncludesTax: false, serviceCharge: 0 },
    });
    storeId = store.id;

    const user = await prisma.user.create({
      data: { email: `test-cashier-${Date.now()}@test.local`, name: 'Test Cashier', role: 'CASHIER', storeId },
    });
    userId = user.id;

    const category = await prisma.category.create({ data: { name: 'TEST_CATEGORY', storeId } });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: 'Test Latte', sku: `TEST-SKU-${Date.now()}`, costPrice: 30, sellingPrice: 60,
        categoryId, storeId, trackStock: true,
      },
    });
    productId = product.id;

    const inventory = await prisma.inventory.create({ data: { productId, quantity: 100 } });
    inventoryId = inventory.id;

    const table = await prisma.table.create({ data: { number: 'TEST-1', capacity: 4, storeId } });
    tableId = table.id;
  });

  afterAll(async () => {
    // Delete in FK-safe order — children before parents.
    await prisma.payment.deleteMany({ where: { order: { storeId } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.stockMovement.deleteMany({ where: { inventoryId } });
    await prisma.inventory.deleteMany({ where: { id: inventoryId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.$disconnect();
  });

  it('walks a full dine-in bill: open, add a round, void an item, then settle', async () => {
    // 1) Open the tab with 2x latte (฿120 subtotal, 7% VAT → ฿128.40)
    const opened = await tabService.openTab(
      { storeId, cashierId: userId, tableId, type: 'DINE_IN', items: [{ productId, quantity: 2 }] },
      fakeIo
    );
    expect(opened.status).toBe('PENDING');
    expect(Number(opened.subtotal)).toBe(120);
    expect(Number(opened.total)).toBeCloseTo(128.4, 2);

    const stockAfterOpen = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(stockAfterOpen.quantity).toBe(98); // 100 - 2

    const table = await prisma.table.findUniqueOrThrow({ where: { id: tableId } });
    expect(table.status).toBe('OCCUPIED');
    expect(table.occupiedAt).not.toBeNull();

    // 2) Add a second round — 1 more latte
    const roundAdded = await tabService.addRound(
      opened.id,
      { storeId, cashierId: userId, items: [{ productId, quantity: 1 }] },
      fakeIo
    );
    expect(Number(roundAdded.subtotal)).toBe(180); // 3 lattes now
    expect(roundAdded.items).toHaveLength(2); // two OrderItem rows (one per round)

    // 3) Void 1 of the 3 lattes (wrong order) — bill shrinks, stock returns
    const secondRoundItem = roundAdded.items.find((i: any) => i.quantity === 1)!;
    const voided = await tabService.voidItem(
      opened.id,
      { storeId, cashierId: userId, orderItemId: secondRoundItem.id, qty: 1, reason: 'สั่งผิด (test)' },
      fakeIo
    );
    expect(Number(voided.subtotal)).toBe(120); // back to 2 lattes worth
    expect(Number(voided.total)).toBeCloseTo(128.4, 2);

    const stockAfterVoid = await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(stockAfterVoid.quantity).toBe(98); // 100 -2 (open) -1 (round 2) +1 (void) = 98

    // A fully-void reason is mandatory — reject the empty-reason case up front
    await expect(
      tabService.voidItem(opened.id, { storeId, cashierId: userId, orderItemId: secondRoundItem.id, qty: 1, reason: '' }, fakeIo)
    ).rejects.toThrow();

    // Can't void more than what's left on a line
    await expect(
      tabService.voidItem(opened.id, { storeId, cashierId: userId, orderItemId: secondRoundItem.id, qty: 99, reason: 'test' }, fakeIo)
    ).rejects.toThrow();

    // 4) Settle with a ฿20 discount — total must reflect it, table frees up
    const settled = await tabService.settleTab(
      opened.id,
      { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 200 }], discount: 20 },
      fakeIo
    );
    expect(settled.status).toBe('COMPLETED');
    expect(Number(settled.discount)).toBe(20);
    expect(Number(settled.total)).toBeCloseTo((120 - 20) * 1.07, 2);

    const tableAfterSettle = await prisma.table.findUniqueOrThrow({ where: { id: tableId } });
    expect(tableAfterSettle.status).toBe('AVAILABLE');
    expect(tableAfterSettle.occupiedAt).toBeNull();

    // Can't settle the same bill twice
    await expect(
      tabService.settleTab(opened.id, { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 1000 }] }, fakeIo)
    ).rejects.toThrow();
  });

  it('rejects underpayment — paid amount must cover the total', async () => {
    const opened = await tabService.openTab(
      { storeId, cashierId: userId, tableId, type: 'DINE_IN', items: [{ productId, quantity: 1 }] },
      fakeIo
    );
    // total ≈ 64.20 (60 * 1.07) — paying 10 is nowhere near enough
    await expect(
      tabService.settleTab(opened.id, { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 10 }] }, fakeIo)
    ).rejects.toThrow();

    // clean up this order too so it doesn't linger as an open bill
    await tabService.settleTab(
      opened.id,
      { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 100 }] },
      fakeIo
    );
  });

  it('rejects opening a bill with insufficient stock', async () => {
    await expect(
      tabService.openTab(
        { storeId, cashierId: userId, tableId, type: 'DINE_IN', items: [{ productId, quantity: 9999 }] },
        fakeIo
      )
    ).rejects.toThrow();
  });
});
