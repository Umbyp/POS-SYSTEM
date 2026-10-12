/**
 * Integration: idempotent add-round/settle, reward re-activation on full
 * refund/cancel, and settle `notes`. Real local Postgres, self-cleaning.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import * as orderService from './order.service';
import * as tabService from './order-tab.service';
import { runIdempotent, addRoundScope, settleScope } from './idempotency';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;
const stamp = Date.now();

describe('idempotent round/settle, reward re-activation, settle notes (integration)', () => {
  let storeId: string, userId: string, categoryId: string, productId: string, inventoryId: string;
  let customerId: string, rewardId: string;
  let n = 0;

  const open = (qty = 1) =>
    tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: qty }] }, fakeIo);
  const stock = async () => (await prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId } })).quantity;
  const newRedemption = () =>
    prisma.rewardRedemption.create({ data: { storeId, customerId, rewardId, code: `R${stamp}${n++}` } });
  const settleInput = (extra: any = {}) => ({ storeId, cashierId: userId, payments: [{ method: 'CASH' as const, amount: 1000 }], ...extra });

  beforeAll(async () => {
    storeId = (await prisma.store.create({
      data: { name: `TEST_idem_${stamp}`, taxRate: 0, priceIncludesTax: false, serviceCharge: 0, loyaltyMode: 'POINTS', pointsEarnBaht: 10 },
    })).id;
    userId = (await prisma.user.create({ data: { email: `t-idem-${stamp}@test.local`, name: 'T', role: 'CASHIER', storeId } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'C', storeId } })).id;
    productId = (await prisma.product.create({
      data: { name: 'Item', sku: `T-IDEM-${stamp}`, costPrice: 40, sellingPrice: 100, categoryId, storeId, trackStock: true },
    })).id;
    inventoryId = (await prisma.inventory.create({ data: { productId, quantity: 100 } })).id;
    customerId = (await prisma.customer.create({ data: { storeId, name: 'M', phone: `0${stamp}`.slice(0, 10) } })).id;
    rewardId = (await prisma.reward.create({ data: { storeId, name: 'ลด 50', kind: 'DISCOUNT', discountAmount: 50 } })).id;
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { storeId } });
    await prisma.rewardRedemption.deleteMany({ where: { storeId } });
    await prisma.reward.deleteMany({ where: { storeId } });
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

  it('add-round: same key (sequential + concurrent) adds items and stock once', async () => {
    const o = await open(1); // stock 99
    const round = (key: string) => runIdempotent(storeId, addRoundScope(o.id), key, (k) =>
      tabService.addRound(o.id, { storeId, cashierId: userId, items: [{ productId, quantity: 2 }], idempotencyKey: k }, fakeIo));
    const a = await round(`round-${stamp}-1`);
    const b = await round(`round-${stamp}-1`);
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(true);
    const par = await Promise.all([1, 2, 3].map(() => round(`round-${stamp}-2`)));
    expect(par.filter((p) => !p.replay)).toHaveLength(1);

    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
    expect(fresh.items).toHaveLength(3); // initial + 2 distinct rounds
    expect(Number(fresh.subtotal)).toBe(100 + 200 + 200);
    expect(await stock()).toBe(100 - 5);
    // a different order with the same key string is a different scope, not a replay
    const o2 = await open(1);
    const other = await runIdempotent(storeId, addRoundScope(o2.id), `round-${stamp}-1`, (k) =>
      tabService.addRound(o2.id, { storeId, cashierId: userId, items: [{ productId, quantity: 1 }], idempotencyKey: k }, fakeIo));
    expect(other.replay).toBe(false);
    // no key: still works and is not deduped
    await tabService.addRound(o.id, { storeId, cashierId: userId, items: [{ productId, quantity: 1 }] }, fakeIo);
    await tabService.addRound(o.id, { storeId, cashierId: userId, items: [{ productId, quantity: 1 }] }, fakeIo);
  });

  it('settle: a retried key replays the original success instead of "already paid"; points/stock untouched', async () => {
    const o = await open(2);
    const run = () => runIdempotent(storeId, settleScope(o.id), `settle-${stamp}-1`, (k) =>
      tabService.settleTab(o.id, settleInput({ customerId, idempotencyKey: k }), fakeIo));
    const first = await run();
    const second = await run();
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect((second.order as any).status).toBe('COMPLETED');
    expect((second.order as any).payments).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
    const earn = await prisma.pointTransaction.count({ where: { orderId: o.id, type: 'EARN' } });
    expect(earn).toBe(1);
    // without a key the second settle still fails as before
    await expect(tabService.settleTab(o.id, settleInput(), fakeIo)).rejects.toThrow();

    // concurrent same-key: exactly one settles
    const o2 = await open(1);
    const par = await Promise.all([1, 2, 3].map(() =>
      runIdempotent(storeId, settleScope(o2.id), `settle-${stamp}-2`, (k) =>
        tabService.settleTab(o2.id, settleInput({ idempotencyKey: k }), fakeIo))));
    expect(par.filter((p) => !p.replay)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: o2.id } })).toBe(1);
  });

  it('settle replay reconstructs appliedReward', async () => {
    const o = await open(2);
    const r = await newRedemption();
    const run = () => runIdempotent(storeId, settleScope(o.id), `settle-${stamp}-rw`, (k) =>
      tabService.settleTab(o.id, settleInput({ redemptionCode: r.code, idempotencyKey: k }), fakeIo));
    const first: any = (await run()).order;
    const second: any = (await run());
    expect(second.replay).toBe(true);
    expect(second.order.appliedReward).toMatchObject({ code: r.code, kind: 'DISCOUNT', discountApplied: first.appliedReward.discountApplied });
  });

  it('settle appends notes to existing order notes (and to the reward line)', async () => {
    const opened = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 1 }], notes: 'no ice' }, fakeIo);
    const r = await newRedemption();
    const s: any = await tabService.settleTab(opened.id, settleInput({ notes: '  ลดให้ลูกค้าประจำ ', discount: 10, redemptionCode: r.code }), fakeIo);
    expect(s.notes).toContain('no ice');
    expect(s.notes).toContain('ลดให้ลูกค้าประจำ');
    expect(s.notes).toContain(r.code);
    expect(s.notes.startsWith('no ice | ลดให้ลูกค้าประจำ')).toBe(true);

    const bare = await open(1);
    const s2: any = await tabService.settleTab(bare.id, settleInput({ notes: 'comp' }), fakeIo);
    expect(s2.notes).toBe('comp');
    const keep = await tabService.openTab({ storeId, cashierId: userId, type: 'TAKEAWAY', items: [{ productId, quantity: 1 }], notes: 'keep me' }, fakeIo);
    expect(((await tabService.settleTab(keep.id, settleInput(), fakeIo)) as any).notes).toBe('keep me');
  });

  it('full refund re-activates the reward code; partial refund does not; second refund is refused', async () => {
    const r = await newRedemption();
    const o = await open(2);
    const settled: any = await tabService.settleTab(o.id, settleInput({ redemptionCode: r.code }), fakeIo);
    const itemId = settled.items[0].id;

    await orderService.refundItems(o.id, userId, { items: [{ orderItemId: itemId, qty: 1 }] }, fakeIo, storeId);
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } }))).toMatchObject({ status: 'USED', orderId: o.id });

    const res = await orderService.refundItems(o.id, userId, { items: [{ orderItemId: itemId, qty: 1 }] }, fakeIo, storeId);
    expect(res.fullyRefunded).toBe(true);
    const after = await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } });
    expect(after).toMatchObject({ status: 'ACTIVE', usedAt: null, orderId: null });
    expect(await prisma.activityLog.count({ where: { userId, action: 'REWARD_REACTIVATED' } })).toBeGreaterThanOrEqual(1);

    // code is usable exactly once again
    const o2 = await open(1);
    await tabService.settleTab(o2.id, settleInput({ redemptionCode: r.code }), fakeIo);
    const o3 = await open(1);
    await expect(tabService.settleTab(o3.id, settleInput({ redemptionCode: r.code }), fakeIo)).rejects.toMatchObject({ code: 'REDEMPTION_USED' });
  });

  it('whole-bill refund re-activates the code, restocks only what was not already returned', async () => {
    const before = await stock();
    const r = await newRedemption();
    const o = await open(3);
    const settled: any = await tabService.settleTab(o.id, settleInput({ redemptionCode: r.code }), fakeIo);
    await orderService.refundItems(o.id, userId, { items: [{ orderItemId: settled.items[0].id, qty: 1 }] }, fakeIo, storeId);
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('USED');
    await orderService.refund(o.id, userId, fakeIo, storeId);
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: r.id } }))).toMatchObject({ status: 'ACTIVE', orderId: null });
    expect(await stock()).toBe(before); // 3 sold, 1 + 2 returned: no double restock
    await expect(orderService.refund(o.id, userId, fakeIo, storeId)).rejects.toThrow();
  });

  it('refund refuses an unpaid or cancelled bill (no phantom restock)', async () => {
    const before = await stock();
    const o = await open(2);
    await expect(orderService.refund(o.id, userId, fakeIo, storeId)).rejects.toMatchObject({ code: 'NOT_REFUNDABLE' });
    await tabService.cancelOrder(o.id, { storeId, userId }, fakeIo);
    await expect(orderService.refund(o.id, userId, fakeIo, storeId)).rejects.toMatchObject({ code: 'NOT_REFUNDABLE' });
    expect(await stock()).toBe(before);
  });
});
