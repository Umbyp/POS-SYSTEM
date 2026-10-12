/**
 * Integration: reward redemption as a real discount, server-side promotion
 * recompute, manual-discount cap, and idempotent order creation. Real local
 * Postgres, self-contained + self-cleaning fixtures (see order-tab test).
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import * as orderService from './order.service';
import * as tabService from './order-tab.service';
import { runIdempotent } from './idempotency';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;
const stamp = Date.now();

describe('reward redemption + promotions at checkout (integration)', () => {
  let storeId: string, otherStoreId: string, userId: string, categoryId: string, productId: string;
  let customerId: string, otherCustomerId: string, discountRewardId: string, freeRewardId: string;
  let promoId: string;
  let n = 0;

  const newRedemption = async (rewardId: string, sid = storeId, cid = customerId) =>
    prisma.rewardRedemption.create({ data: { storeId: sid, customerId: cid, rewardId, code: `T${stamp}${n++}` } });

  const payNow = (extra: any = {}) => ({
    storeId, cashierId: userId, type: 'TAKEAWAY' as const,
    items: [{ productId, quantity: 2 }], // 2 x 100 = 200, no VAT in this store
    payments: [{ method: 'CASH' as const, amount: 1000 }],
    ...extra,
  });

  beforeAll(async () => {
    const store = await prisma.store.create({ data: { name: `TEST_redemption_${stamp}`, taxRate: 7, priceIncludesTax: false, serviceCharge: 0 } });
    storeId = store.id;
    otherStoreId = (await prisma.store.create({ data: { name: `TEST_redemption_other_${stamp}` } })).id;
    userId = (await prisma.user.create({ data: { email: `t-red-${stamp}@test.local`, name: 'T', role: 'CASHIER', storeId } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'C', storeId } })).id;
    productId = (await prisma.product.create({
      data: { name: 'Item', sku: `T-RED-${stamp}`, costPrice: 40, sellingPrice: 100, categoryId, storeId },
    })).id;
    customerId = (await prisma.customer.create({ data: { storeId, name: 'Member', phone: `0${stamp}`.slice(0, 10) } })).id;
    otherCustomerId = (await prisma.customer.create({ data: { storeId: otherStoreId, name: 'Other', phone: `1${stamp}`.slice(0, 10) } })).id;
    discountRewardId = (await prisma.reward.create({ data: { storeId, name: 'ลด 50', kind: 'DISCOUNT', discountAmount: 50 } })).id;
    freeRewardId = (await prisma.reward.create({ data: { storeId, name: 'ชาไทยฟรี', kind: 'FREE_ITEM' } })).id;
    promoId = (await prisma.promotion.create({
      data: { storeId, name: 'ลด 10%', type: 'PERCENT_OFF', value: 10, usageLimit: 1 },
    })).id;
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { storeId } });
    await prisma.rewardRedemption.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.reward.deleteMany({ where: { storeId } });
    await prisma.promotion.deleteMany({ where: { storeId } });
    await prisma.payment.deleteMany({ where: { order: { storeId } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
    await prisma.pointTransaction.deleteMany({ where: { storeId } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it('DISCOUNT reward reduces the bill through the normal VAT math and is marked USED with the order id', async () => {
    const r = await newRedemption(discountRewardId);
    const order: any = await orderService.create(payNow({ redemptionCode: r.code.toLowerCase() }), fakeIo);
    expect(Number(order.subtotal)).toBe(200);
    expect(Number(order.discount)).toBe(50);
    expect(Number(order.total)).toBeCloseTo(150 * 1.07, 2);
    expect(order.appliedReward).toMatchObject({ kind: 'DISCOUNT', name: 'ลด 50', discountApplied: 50 });
    expect(order.notes).toContain(r.code);

    const after = await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe('USED');
    expect(after.orderId).toBe(order.id);
    expect(after.usedAt).not.toBeNull();

    // used code can't be applied again
    await expect(orderService.create(payNow({ redemptionCode: r.code }), fakeIo)).rejects.toMatchObject({ code: 'REDEMPTION_USED' });
  });

  it('caps a reward at the bill subtotal', async () => {
    const big = await prisma.reward.create({ data: { storeId, name: 'ลด 999', kind: 'DISCOUNT', discountAmount: 999 } });
    const r = await newRedemption(big.id);
    const order: any = await orderService.create(payNow({ redemptionCode: r.code, payments: [{ method: 'CASH', amount: 0 }] }), fakeIo);
    expect(Number(order.discount)).toBe(200);
    expect(Number(order.total)).toBe(0);
    expect(order.appliedReward.discountApplied).toBe(200);
  });

  it('FREE_ITEM applies no money but is marked used and recorded on the order', async () => {
    const r = await newRedemption(freeRewardId);
    const order: any = await orderService.create(payNow({ redemptionCode: r.code }), fakeIo);
    expect(Number(order.discount)).toBe(0);
    expect(Number(order.total)).toBeCloseTo(214, 2);
    expect(order.notes).toContain('ชาไทยฟรี');
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('USED');
  });

  it('rejects unknown, cancelled and other-store codes with clear errors, leaving no order behind', async () => {
    const before = await prisma.order.count({ where: { storeId } });
    await expect(orderService.create(payNow({ redemptionCode: 'NOPE-0000' }), fakeIo)).rejects.toMatchObject({ code: 'REDEMPTION_NOT_FOUND' });

    const cancelled = await newRedemption(discountRewardId);
    await prisma.rewardRedemption.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
    await expect(orderService.create(payNow({ redemptionCode: cancelled.code }), fakeIo)).rejects.toMatchObject({ code: 'REDEMPTION_CANCELLED' });

    const otherReward = await prisma.reward.create({ data: { storeId: otherStoreId, name: 'x', kind: 'DISCOUNT', discountAmount: 10 } });
    const foreign = await newRedemption(otherReward.id, otherStoreId, otherCustomerId);
    await expect(orderService.create(payNow({ redemptionCode: foreign.code }), fakeIo)).rejects.toMatchObject({ code: 'REDEMPTION_NOT_FOUND' });
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('ACTIVE');
    expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    await prisma.reward.delete({ where: { id: otherReward.id } }).catch(() => {});
  });

  it('a failed order (underpayment) rolls the redemption back to ACTIVE', async () => {
    const r = await newRedemption(discountRewardId);
    await expect(
      orderService.create(payNow({ redemptionCode: r.code, payments: [{ method: 'CASH', amount: 1 }] }), fakeIo),
    ).rejects.toThrow();
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('ACTIVE');
  });

  it('two concurrent orders using one code: exactly one wins', async () => {
    const r = await newRedemption(discountRewardId);
    const results = await Promise.allSettled([
      orderService.create(payNow({ redemptionCode: r.code }), fakeIo),
      orderService.create(payNow({ redemptionCode: r.code }), fakeIo),
      orderService.create(payNow({ redemptionCode: r.code }), fakeIo),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const used = await prisma.order.findMany({ where: { storeId, notes: { contains: r.code } } });
    expect(used).toHaveLength(1);
  });

  it('tab settle applies a reward too', async () => {
    const opened = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 2 }] }, fakeIo);
    const r = await newRedemption(discountRewardId);
    const settled: any = await tabService.settleTab(
      opened.id, { storeId, cashierId: userId, payments: [{ method: 'CASH', amount: 1000 }], redemptionCode: r.code }, fakeIo,
    );
    expect(Number(settled.discount)).toBe(50);
    expect(Number(settled.total)).toBeCloseTo(150 * 1.07, 2);
    const after = await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } });
    expect(after).toMatchObject({ status: 'USED', orderId: opened.id });
  });

  it('promotion discount is recomputed server-side; invented amounts are refused', async () => {
    // an amount without a promotionId can't be invented
    await expect(orderService.create(payNow({ promotionDiscount: 150 }), fakeIo)).rejects.toMatchObject({ code: 'PROMOTION_REQUIRED' });
    // a real promotion with a wildly inflated client amount: the server's 10% (20) is what applies
    const order: any = await orderService.create(payNow({ promotionId: promoId, promotionDiscount: 190, promotionName: 'hack' }), fakeIo);
    expect(Number(order.promotionDiscount)).toBe(20);
    expect(Number(order.discount)).toBe(20);
    expect(order.promotionName).not.toBe('hack');
    expect(Number(order.total)).toBeCloseTo(180 * 1.07, 2);
    // usageLimit 1 is now exhausted
    await expect(orderService.create(payNow({ promotionId: promoId }), fakeIo)).rejects.toMatchObject({ code: 'PROMOTION_NOT_APPLICABLE' });
    // unknown promotion
    await expect(orderService.create(payNow({ promotionId: 'nope' }), fakeIo)).rejects.toMatchObject({ code: 'PROMOTION_INVALID' });
  });

  it('caps manual order and item discounts at what they apply to', async () => {
    const order: any = await orderService.create(
      payNow({ discount: 9999, items: [{ productId, quantity: 1, discount: 500 }], payments: [{ method: 'CASH', amount: 0 }] }), fakeIo,
    );
    expect(Number(order.items[0].discount)).toBe(100);
    expect(Number(order.subtotal)).toBe(0);
    expect(Number(order.discount)).toBe(0);
    expect(Number(order.total)).toBe(0);
  });

  it('idempotency key: a retry (sequential or concurrent) returns the original order, no duplicate', async () => {
    const key = `idem-${stamp}-seq`;
    const run = () => runIdempotent(storeId, 'orders:create', key, (k) => orderService.create(payNow({ idempotencyKey: k }), fakeIo));
    const first = await run();
    const second = await run();
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect((second.order as any).id).toBe((first.order as any).id);

    const ckey = `idem-${stamp}-par`;
    const before = await prisma.order.count({ where: { storeId } });
    const par = await Promise.all([1, 2, 3].map(() =>
      runIdempotent(storeId, 'orders:create', ckey, (k) => orderService.create(payNow({ idempotencyKey: k }), fakeIo))));
    expect(new Set(par.map((p) => (p.order as any).id)).size).toBe(1);
    expect(par.filter((p) => !p.replay)).toHaveLength(1);
    expect(await prisma.order.count({ where: { storeId } })).toBe(before + 1);
  });

  it('idempotency key works for open-tab too', async () => {
    const key = `idem-${stamp}-open`;
    const open = () => runIdempotent(storeId, 'orders:open', key, (k) =>
      tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 1 }], idempotencyKey: k }, fakeIo));
    const [a, b] = [await open(), await open()];
    expect((b.order as any).id).toBe((a.order as any).id);
    expect(b.replay).toBe(true);
  });

  it('cancelOrder returns stock for an unpaid bill and refuses a paid one', async () => {
    const inv = await prisma.inventory.create({ data: { productId, quantity: 10 } });
    await prisma.product.update({ where: { id: productId }, data: { trackStock: true } });
    const opened = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 3 }] }, fakeIo);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: inv.id } })).quantity).toBe(7);
    const cancelled = await tabService.cancelOrder(opened.id, { storeId, userId, reason: 'ลูกค้าเปลี่ยนใจ' }, fakeIo);
    expect(cancelled.status).toBe('CANCELLED');
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: inv.id } })).quantity).toBe(10);
    await expect(tabService.cancelOrder(opened.id, { storeId, userId }, fakeIo)).rejects.toThrow();

    const paid: any = await orderService.create(payNow({ items: [{ productId, quantity: 1 }] }), fakeIo);
    await expect(tabService.cancelOrder(paid.id, { storeId, userId }, fakeIo)).rejects.toMatchObject({ code: 'USE_REFUND' });
    // other store can't cancel it
    await expect(tabService.cancelOrder(opened.id, { storeId: otherStoreId, userId }, fakeIo)).rejects.toThrow();

    await prisma.stockMovement.deleteMany({ where: { inventoryId: inv.id } });
    await prisma.inventory.delete({ where: { id: inv.id } });
    await prisma.product.update({ where: { id: productId }, data: { trackStock: false } });
  });
});
