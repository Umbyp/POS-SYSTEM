/**
 * Integration: QR self-order menu exposes option groups, and submit validates
 * picks against them and prices from the server. Real local Postgres.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import * as service from './self-order.service';

const fakeIo = { to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) } as any;
const stamp = Date.now();

describe('self-order option groups (integration)', () => {
  let storeId: string, otherStoreId: string, userId: string, categoryId: string, productId: string, plainId: string;
  let groupIds: string[] = [];
  let qrCode: string, tableId: string, memberId: string, foreignMemberId: string;

  beforeAll(async () => {
    storeId = (await prisma.store.create({ data: { name: `TEST_selforder_${stamp}`, taxRate: 0, serviceCharge: 0 } })).id;
    otherStoreId = (await prisma.store.create({ data: { name: `TEST_selforder_other_${stamp}` } })).id;
    userId = (await prisma.user.create({ data: { email: `t-so-${stamp}@test.local`, name: 'T', role: 'CASHIER', storeId } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'C', storeId } })).id;
    productId = (await prisma.product.create({ data: { name: 'ชานม', sku: `T-SO-${stamp}`, costPrice: 20, sellingPrice: 60, categoryId, storeId } })).id;
    plainId = (await prisma.product.create({ data: { name: 'น้ำเปล่า', sku: `T-SO2-${stamp}`, costPrice: 2, sellingPrice: 10, categoryId, storeId } })).id;
    const sweet = await prisma.optionGroup.create({
      data: { storeId, name: 'ความหวาน', minSelect: 1, maxSelect: 1, options: { create: [
        { name: 'หวานน้อย', priceDelta: 0, isDefault: true, sortOrder: 0 }, { name: 'หวานมาก', priceDelta: 0, sortOrder: 1 },
      ] } },
    });
    const top = await prisma.optionGroup.create({
      data: { storeId, name: 'ท็อปปิ้ง', minSelect: 0, maxSelect: 2, sortOrder: 1, options: { create: [
        { name: 'ไข่มุก', priceDelta: 10 }, { name: 'เจลลี่', priceDelta: 8 }, { name: 'ครีมชีส', priceDelta: 15 },
      ] } },
    });
    groupIds = [sweet.id, top.id];
    await prisma.productOptionGroup.createMany({ data: groupIds.map((groupId, i) => ({ productId, groupId, sortOrder: i })) });
    const table = await prisma.table.create({ data: { number: `T-SO-${stamp}`, capacity: 4, storeId, qrCode: `qr-test-${stamp}` } });
    tableId = table.id;
    qrCode = table.qrCode!;
    memberId = (await prisma.customer.create({ data: { storeId, name: 'M', phone: `2${stamp}`.slice(0, 10) } })).id;
    foreignMemberId = (await prisma.customer.create({ data: { storeId: otherStoreId, name: 'F', phone: `3${stamp}`.slice(0, 10) } })).id;
  });

  afterAll(async () => {
    await prisma.selfOrderRequest.deleteMany({ where: { storeId } });
    await prisma.payment.deleteMany({ where: { order: { storeId } } });
    await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.table.deleteMany({ where: { id: tableId } });
    await prisma.productOptionGroup.deleteMany({ where: { productId } });
    await prisma.optionGroup.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, plainId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it('public menu returns each product\'s optionGroups with numeric priceDelta', async () => {
    const menu: any = await service.getMenu(qrCode);
    const tea = menu.products.find((p: any) => p.id === productId);
    expect(tea.optionGroups.map((g: any) => g.name)).toEqual(['ความหวาน', 'ท็อปปิ้ง']);
    expect(tea.optionGroups[0]).toMatchObject({ minSelect: 1, maxSelect: 1 });
    const pearl = tea.optionGroups[1].options.find((o: any) => o.name === 'ไข่มุก');
    expect(pearl).toMatchObject({ priceDelta: 10, isDefault: false });
    expect(typeof pearl.id).toBe('string');
    expect(menu.products.find((p: any) => p.id === plainId).optionGroups).toEqual([]);
  });

  it('rejects missing required group / too many / unknown / tampered price, creating nothing', async () => {
    const submit = (variants: any) => service.submitRequest(qrCode, { items: [{ productId, quantity: 1, variants }] }, fakeIo);
    await expect(submit(undefined)).rejects.toMatchObject({ code: 'OPTION_REQUIRED' });
    await expect(submit([{ name: 'ไข่มุก' }])).rejects.toMatchObject({ code: 'OPTION_REQUIRED' });
    await expect(submit([{ name: 'หวานน้อย' }, { name: 'หวานมาก' }])).rejects.toMatchObject({ code: 'OPTION_TOO_MANY' });
    await expect(submit([{ name: 'หวานน้อย' }, { name: 'ไข่มุก' }, { name: 'เจลลี่' }, { name: 'ครีมชีส' }])).rejects.toMatchObject({ code: 'OPTION_TOO_MANY' });
    await expect(submit([{ name: 'หวานน้อย' }, { name: 'วุ้นทอง' }])).rejects.toMatchObject({ code: 'UNKNOWN_OPTION' });
    await expect(submit([{ name: 'หวานน้อย' }, { name: 'ไข่มุก', priceDelta: 0 }])).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
    expect(await prisma.order.count({ where: { storeId } })).toBe(0);
  });

  it('stores server-priced variants + notes, merges into the table tab, ignores foreign customer ids', async () => {
    const req = await service.submitRequest(qrCode, {
      items: [{ productId, quantity: 2, notes: ' ไม่ใส่น้ำแข็ง ', variants: [{ name: 'หวานมาก' }, { name: 'ไข่มุก', priceDelta: 10 }] }],
      customerId: foreignMemberId,
    }, fakeIo);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: req.orderId! }, include: { items: true } });
    expect(order.customerId).toBeNull(); // other store's member rejected
    const item = order.items[0];
    expect(item.notes).toBe('ไม่ใส่น้ำแข็ง');
    expect(item.variants).toEqual([{ name: 'ความหวาน: หวานมาก', priceDelta: 0 }, { name: 'ท็อปปิ้ง: ไข่มุก', priceDelta: 10 }]);
    expect(Number(item.unitPrice)).toBe(70);
    expect(Number(order.subtotal)).toBe(140);

    // second round onto the same tab, own-store member accepted
    const req2 = await service.submitRequest(qrCode, { items: [{ productId: plainId, quantity: 1 }], customerId: memberId }, fakeIo);
    expect(req2.orderId).toBe(order.id);
    const merged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(merged.subtotal)).toBe(150);
    expect(merged.customerId).toBe(memberId);
  });
});
