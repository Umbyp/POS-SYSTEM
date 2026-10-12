/**
 * Integration: refunds give back the right amount (discount/tax-aware share), keep the
 * customer's lifetime totals and points consistent, and never double count across
 * partial → full refund sequences. Real local Postgres, self-cleaning.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import * as orderService from './order.service';
import * as tabService from './order-tab.service';
import { partialRefundAmount, earnedShare } from './refund-math';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;
const stamp = Date.now();

describe('refund-math (pure)', () => {
  it('prorates a line over the discounted, taxed total', () => {
    const amt = partialRefundAmount({ subtotal: 400, total: 385.2 }, [{ unitPrice: 100, quantity: 4, discount: 0, qty: 1 }]);
    expect(amt.toNumber()).toBe(96.3);
  });
  it('honours a line-level discount', () => {
    // 2 × 100 with 50 line discount → net 150, subtotal 150 → refunding 1 of 2 = half
    const amt = partialRefundAmount({ subtotal: 150, total: 150 }, [{ unitPrice: 100, quantity: 2, discount: 50, qty: 1 }]);
    expect(amt.toNumber()).toBe(75);
  });
  it('earnedShare rounds down and caps at the earned amount', () => {
    expect(earnedShare(38, 385.2, 96.3)).toBe(9);
    expect(earnedShare(38, 385.2, 9999)).toBe(38);
    expect(earnedShare(0, 100, 50)).toBe(0);
  });
});

describe('refund accuracy (integration)', () => {
  let storeId: string, userId: string, categoryId: string, productId: string, inventoryId: string, customerId: string;

  beforeAll(async () => {
    storeId = (await prisma.store.create({
      data: { name: `TEST_refund_${stamp}`, taxRate: 7, priceIncludesTax: false, serviceCharge: 0, loyaltyMode: 'POINTS', pointsEarnBaht: 10 },
    })).id;
    userId = (await prisma.user.create({ data: { email: `t-refund-${stamp}@test.local`, name: 'T', role: 'OWNER', storeId } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'C', storeId } })).id;
    productId = (await prisma.product.create({
      data: { name: 'Item', sku: `T-REF-${stamp}`, costPrice: 40, sellingPrice: 100, categoryId, storeId, trackStock: true },
    })).id;
    inventoryId = (await prisma.inventory.create({ data: { productId, quantity: 100 } })).id;
    customerId = (await prisma.customer.create({ data: { storeId, name: 'M', phone: `0${stamp}`.slice(0, 10) } })).id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { inventoryId } });
    await prisma.inventory.deleteMany({ where: { id: inventoryId } });
    await prisma.payment.deleteMany({ where: { order: { storeId } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
    await prisma.pointTransaction.deleteMany({ where: { storeId } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.$disconnect();
  });

  it('partial → partial → full refund: amounts add up to the bill, customer totals and points return to zero', async () => {
    const o = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 4 }] }, fakeIo);
    const settled: any = await tabService.settleTab(
      o.id,
      { storeId, cashierId: userId, customerId, discount: 40, payments: [{ method: 'CASH', amount: 1000 }] },
      fakeIo,
    );
    const total = Number(settled.total);
    expect(total).toBeCloseTo(385.2, 2); // (400 − 40) × 1.07
    const cust = () => prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const afterSale = await cust();
    expect(Number(afterSale.totalSpent)).toBeCloseTo(total, 2);
    expect(afterSale.visitCount).toBe(1);
    expect(afterSale.points).toBe(38);

    const itemId = settled.items[0].id;
    const r1 = await orderService.refundItems(o.id, userId, { items: [{ orderItemId: itemId, qty: 1 }] }, fakeIo, storeId);
    expect(r1.refundedAmount).toBeCloseTo(96.3, 2);
    expect(r1.fullyRefunded).toBe(false);
    let c = await cust();
    expect(Number(c.totalSpent)).toBeCloseTo(total - 96.3, 2);
    expect(c.visitCount).toBe(1); // the visit still happened
    expect(c.points).toBe(38 - 9);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).refundedAmount)).toBeCloseTo(96.3, 2);

    const r2 = await orderService.refundItems(o.id, userId, { items: [{ orderItemId: itemId, qty: 1 }] }, fakeIo, storeId);
    expect(r2.refundedAmount).toBeCloseTo(96.3, 2);

    // whole-bill refund now only returns what is left (192.60), not the full 385.20 again
    await orderService.refund(o.id, userId, fakeIo, storeId);
    const done = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(done.status).toBe('REFUNDED');
    expect(Number(done.refundedAmount)).toBeCloseTo(total, 2);
    expect(done.refundedAt).not.toBeNull();
    c = await cust();
    expect(Number(c.totalSpent)).toBeCloseTo(0, 2);
    expect(c.visitCount).toBe(0);
    expect(c.points).toBe(0); // 38 earned, all clawed back exactly once
    const logs = await prisma.activityLog.findMany({ where: { userId, action: 'REFUND' } });
    expect((logs[0].metadata as any).refundedAmount).toBeCloseTo(total - 192.6, 2);
  });

  it('final partial refund closes the bill with no cent drift', async () => {
    const o = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 3 }] }, fakeIo);
    const settled: any = await tabService.settleTab(o.id, { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 1000 }] }, fakeIo);
    const total = Number(settled.total);
    const id = settled.items[0].id;
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      sum += (await orderService.refundItems(o.id, userId, { items: [{ orderItemId: id, qty: 1 }] }, fakeIo, storeId)).refundedAmount;
    }
    expect(sum).toBeCloseTo(total, 2);
    expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).refundedAmount)).toBeCloseTo(total, 2);
  });

  it('restores recipe ingredients exactly as the sale deducted them (partial → partial → full, no over-restock)', async () => {
    const ingProduct = await prisma.product.create({
      data: { name: 'Ing', sku: `T-ING-${stamp}`, costPrice: 1, sellingPrice: 1, categoryId, storeId, trackStock: true, isIngredient: true },
    });
    const ingInv = await prisma.inventory.create({ data: { productId: ingProduct.id, quantity: 100 } });
    await prisma.recipeItem.create({ data: { productId, ingredientId: ingProduct.id, quantity: 1.5, unit: 'g' } });
    try {
      const o = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 3 }] }, fakeIo);
      const settled: any = await tabService.settleTab(o.id, { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 1000 }] }, fakeIo);
      const ing = async () => (await prisma.inventory.findUniqueOrThrow({ where: { id: ingInv.id } })).quantity;
      expect(await ing()).toBe(100 - 5); // ceil(3 × 1.5)
      const id = settled.items[0].id;
      await orderService.refundItems(o.id, userId, { items: [{ orderItemId: id, qty: 1 }] }, fakeIo, storeId);
      expect(await ing()).toBe(100 - 5 + 2); // ceil(1.5)
      await orderService.refundItems(o.id, userId, { items: [{ orderItemId: id, qty: 1 }] }, fakeIo, storeId);
      expect(await ing()).toBe(100 - 5 + 3); // ceil(3.0), not 2 + 2
      await orderService.refund(o.id, userId, fakeIo, storeId);
      expect(await ing()).toBe(100); // everything back, exactly once
    } finally {
      await prisma.stockMovement.deleteMany({ where: { inventoryId: ingInv.id } });
      await prisma.recipeItem.deleteMany({ where: { productId } });
      await prisma.inventory.delete({ where: { id: ingInv.id } });
    }
    await prisma.product.delete({ where: { id: ingProduct.id } }).catch(() => {});
  });
});
