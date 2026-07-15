/**
 * Open-tab (dine-in) order flow for restaurants:
 *   openTab   → create an unpaid order, fire to kitchen (KDS), deduct stock, occupy table
 *   addRound  → append another round of items to an open bill, fire the new items
 *   getOpenByTable / listOpen → load a table's running bill
 *   settleTab → take payment on an open bill, complete it, free the table, award points
 *
 * Kept separate from order.service.create() (the pay-now flow) so the working
 * money path is untouched. Pricing/stock logic mirrors create() exactly.
 */
import { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import { OrderStatus, PaymentMethod, PointTxType, Prisma } from '@prisma/client';
import { generateOrderNumber } from './order.service';
import { recordPoints, recordStamps, calcEarnedPoints, pointsEnabled, stampsEnabled } from './points.service';
import * as stripeService from '../payments/stripe.service';

export interface TabItem {
  productId: string;
  quantity: number;
  notes?: string;
  variants?: { name: string; priceDelta: number }[];
  discount?: number;
}

// "Open bill" = fired to kitchen but not yet paid. Excludes DRAFT (legacy park).
const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'PREPARING', 'READY'];

const ORDER_INCLUDE = {
  items: { include: { product: true } },
  payments: true,
  customer: true,
  table: true,
  cashier: { select: { id: true, name: true } },
} as const;

/** Build order-item rows, verify product + recipe stock, return running subtotal. */
async function buildItems(tx: any, storeId: string, items: TabItem[]) {
  const productIds = items.map((i) => i.productId);
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, storeId },
    include: { inventory: true },
  });
  const allRecipes = await tx.recipeItem.findMany({
    where: { productId: { in: productIds } },
    include: { ingredient: { include: { inventory: true } } },
  });

  const ingredientNeed = new Map<string, { name: string; qty: number; available: number }>();
  let subtotal = new Prisma.Decimal(0);
  const itemsData: any[] = [];

  for (const it of items) {
    const p = products.find((x: any) => x.id === it.productId);
    if (!p) throw BadRequest(`Product ${it.productId} not found`);
    if (p.trackStock && p.inventory && p.inventory.quantity < it.quantity) {
      throw BadRequest(`สต็อกไม่พอ: ${p.name} (เหลือ ${p.inventory.quantity})`);
    }
    for (const r of allRecipes.filter((r: any) => r.productId === it.productId)) {
      if (!r.ingredient.trackStock || !r.ingredient.inventory) continue;
      const useQty = Number(r.quantity) * it.quantity;
      const key = r.ingredient.inventory.id;
      const ex = ingredientNeed.get(key);
      if (ex) ex.qty += useQty;
      else ingredientNeed.set(key, { name: r.ingredient.name, qty: useQty, available: r.ingredient.inventory.quantity });
    }
    const variantDelta = (it.variants || []).reduce((s, v) => s + Number(v.priceDelta), 0);
    const unitPrice = new Prisma.Decimal(p.sellingPrice).plus(variantDelta);
    const itemDiscount = new Prisma.Decimal(it.discount || 0);
    subtotal = subtotal.plus(unitPrice.mul(it.quantity).minus(itemDiscount));
    itemsData.push({
      productId: p.id,
      quantity: it.quantity,
      unitPrice,
      discount: itemDiscount,
      notes: it.notes,
      variants: it.variants ? (it.variants as any) : Prisma.JsonNull,
    });
  }

  for (const need of ingredientNeed.values()) {
    const required = Math.ceil(need.qty);
    if (need.available < required) {
      throw BadRequest(`วัตถุดิบไม่พอ: ${need.name} (ต้องการ ${required}, เหลือ ${need.available})`);
    }
  }
  return { products, productIds, itemsData, subtotal, allRecipes };
}

/** Deduct product + recipe-ingredient stock for a set of items (food is being made). */
async function deductStock(
  tx: any, items: TabItem[], products: any[], allRecipes: any[],
  orderId: string, orderNumber: string, cashierId: string,
) {
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (p?.trackStock && p.inventory) {
      await tx.inventory.update({ where: { id: p.inventory.id }, data: { quantity: { decrement: it.quantity } } });
      await tx.stockMovement.create({
        data: { inventoryId: p.inventory.id, type: 'SALE', quantity: -it.quantity, orderId, userId: cashierId },
      });
    }
  }
  const usage = new Map<string, { inventoryId: string; qty: number }>();
  for (const it of items) {
    for (const r of allRecipes.filter((r) => r.productId === it.productId)) {
      if (!r.ingredient.inventory || !r.ingredient.trackStock) continue;
      const useQty = Number(r.quantity) * it.quantity;
      const ex = usage.get(r.ingredient.inventory.id);
      if (ex) ex.qty += useQty;
      else usage.set(r.ingredient.inventory.id, { inventoryId: r.ingredient.inventory.id, qty: useQty });
    }
  }
  for (const u of usage.values()) {
    const ceil = Math.ceil(u.qty);
    await tx.inventory.update({ where: { id: u.inventoryId }, data: { quantity: { decrement: ceil } } });
    await tx.stockMovement.create({
      data: { inventoryId: u.inventoryId, type: 'SALE', quantity: -ceil, orderId, userId: cashierId, reason: `ใช้ในออเดอร์ ${orderNumber}` },
    });
  }
}

/** Tax / service charge / total from a subtotal + total discount + store config. */
export function computeTotals(subtotal: Prisma.Decimal, orderDiscount: Prisma.Decimal, store: any) {
  const afterDiscount = Prisma.Decimal.max(0, subtotal.minus(orderDiscount));
  const rate = new Prisma.Decimal(store.taxRate);
  const serviceCharge = afterDiscount.mul(store.serviceCharge).div(100);
  const tax = store.priceIncludesTax
    ? afterDiscount.mul(rate).div(rate.plus(100))
    : afterDiscount.mul(rate).div(100);
  const total = store.priceIncludesTax
    ? afterDiscount.plus(serviceCharge)
    : afterDiscount.plus(tax).plus(serviceCharge);
  return { serviceCharge, tax, total };
}

interface OpenTabInput {
  storeId: string;
  cashierId: string;
  customerId?: string;
  tableId?: string;
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  items: TabItem[];
  discount?: number;
  notes?: string;
}

/** Open a new bill and fire the first round to the kitchen. */
export async function openTab(input: OpenTabInput, io: Server) {
  if (!input.items?.length) throw BadRequest('No items');

  const result = await prisma.$transaction(async (tx) => {
    const { products, productIds, itemsData, subtotal, allRecipes } = await buildItems(tx, input.storeId, input.items);
    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const orderDiscount = new Prisma.Decimal(input.discount || 0);
    const { tax, serviceCharge, total } = computeTotals(subtotal, orderDiscount, store);
    const orderNumber = await generateOrderNumber(tx, input.storeId);

    const created = await tx.order.create({
      data: {
        orderNumber, storeId: input.storeId, cashierId: input.cashierId,
        customerId: input.customerId, tableId: input.tableId, type: input.type,
        status: OrderStatus.PENDING, subtotal, discount: orderDiscount,
        tax, serviceCharge, total, notes: input.notes,
        items: { create: itemsData },
      },
      include: ORDER_INCLUDE,
    });

    await deductStock(tx, input.items, products, allRecipes, created.id, orderNumber, input.cashierId);
    await tx.activityLog.create({
      data: { userId: input.cashierId, action: 'OPEN_TAB', metadata: { orderId: created.id, orderNumber } },
    });

    let table = null;
    if (input.tableId) {
      table = await tx.table.update({
        where: { id: input.tableId },
        data: { status: 'OCCUPIED', occupiedAt: new Date() },
      });
    }
    return { created, table, productIds };
  });

  io.to(`store:${input.storeId}:kds`).emit('kds:new', result.created);
  io.to(`store:${input.storeId}`).emit('order:created', result.created);
  io.to(`store:${input.storeId}`).emit('stock:updated', { productIds: result.productIds });
  if (result.table) io.to(`store:${input.storeId}`).emit('table:updated', result.table);
  return result.created;
}

/** Append another round of items to an existing open bill and fire them. */
export async function addRound(
  orderId: string,
  input: { storeId: string; cashierId: string; items: TabItem[] },
  io: Server,
) {
  if (!input.items?.length) throw BadRequest('No items');

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw NotFound('Order not found');
    if (order.storeId !== input.storeId) throw BadRequest('Wrong store');
    if (order.payments.length > 0 || !OPEN_STATUSES.includes(order.status)) {
      throw BadRequest('บิลนี้ปิดแล้ว เพิ่มรายการไม่ได้');
    }

    const { products, productIds, itemsData, subtotal: addSubtotal, allRecipes } = await buildItems(tx, input.storeId, input.items);
    for (const d of itemsData) await tx.orderItem.create({ data: { orderId, ...d } });

    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const newSubtotal = new Prisma.Decimal(order.subtotal).plus(addSubtotal);
    const { tax, serviceCharge, total } = computeTotals(newSubtotal, new Prisma.Decimal(order.discount), store);

    // A fresh round means there's unprepared food again — if the kitchen had
    // already marked this table READY (food out, awaiting the next round or
    // payment), that READY no longer reflects reality: it must go back to the
    // kitchen queue, both so KDS shows it again and so it drops off the
    // public ready-board instead of wrongly lingering there.
    const wasReady = order.status === 'READY';

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal, tax, serviceCharge, total,
        ...(wasReady ? { status: 'PENDING' } : {}),
      },
      include: ORDER_INCLUDE,
    });
    await deductStock(tx, input.items, products, allRecipes, orderId, order.orderNumber, input.cashierId);
    return { updated, productIds, wasReady };
  });

  io.to(`store:${input.storeId}:kds`).emit('kds:new', result.updated);
  io.to(`store:${input.storeId}`).emit('stock:updated', { productIds: result.productIds });
  io.to(`store:${input.storeId}`).emit('order:status', { id: orderId, status: result.updated.status });
  if (result.wasReady) {
    io.of('/display').to(`store:${input.storeId}:display`).emit('ready-board:update');
  }
  return result.updated;
}

/** The open (unpaid) bill for a table, if any. */
export function getOpenByTable(storeId: string, tableId: string) {
  return prisma.order.findFirst({
    where: { storeId, tableId, status: { in: OPEN_STATUSES }, payments: { none: {} } },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

/** All open (unpaid) bills for the store. */
export function listOpen(storeId: string) {
  return prisma.order.findMany({
    where: { storeId, status: { in: OPEN_STATUSES }, payments: { none: {} } },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

interface SettleInput {
  storeId: string;
  cashierId: string;
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
  discount?: number;
  pointsToRedeem?: number;
  useStampReward?: boolean;
  customerId?: string;
  promotionId?: string;
  promotionDiscount?: number;
  promotionName?: string;
  customerName?: string;
  customerTaxId?: string;
  customerAddress?: string;
}

/** Take payment on an open bill, complete it, free the table, award points. */
export async function settleTab(orderId: string, input: SettleInput, io: Server) {
  if (!input.payments?.length) throw BadRequest('No payment provided');

  // Verify Stripe PromptPay before the transaction (same guard as create()).
  for (const p of input.payments) {
    if (p.method === 'PROMPTPAY' && p.reference?.startsWith('pi_')) {
      const st = await stripeService.getIntentStatus(p.reference);
      if (!st.paid) throw BadRequest('ยังไม่ได้รับเงิน PromptPay — กรุณารอลูกค้าชำระให้สำเร็จก่อน');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw NotFound('Order not found');
    if (order.storeId !== input.storeId) throw BadRequest('Wrong store');
    if (order.payments.length > 0 || !OPEN_STATUSES.includes(order.status)) {
      throw BadRequest('บิลนี้ชำระแล้ว');
    }

    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const customerId = input.customerId ?? order.customerId ?? undefined;

    let pointsToRedeem = 0;
    let pointDiscount = new Prisma.Decimal(0);
    if (input.pointsToRedeem && input.pointsToRedeem > 0) {
      if (!customerId) throw BadRequest('ต้องเลือกลูกค้าก่อนใช้คะแนน');
      const c = await tx.customer.findUnique({ where: { id: customerId } });
      if (!c) throw BadRequest('ไม่พบลูกค้า');
      if (c.points < input.pointsToRedeem) throw BadRequest(`คะแนนไม่พอ (มี ${c.points}, ต้องการ ${input.pointsToRedeem})`);
      if (store.minRedeemPoints > 0 && input.pointsToRedeem < store.minRedeemPoints) {
        throw BadRequest(`ต้องใช้แต้มขั้นต่ำ ${store.minRedeemPoints} แต้ม`);
      }
      pointsToRedeem = input.pointsToRedeem;
      pointDiscount = new Prisma.Decimal(pointsToRedeem).mul(store.pointValue);
    }

    // ใช้รางวัลบัตรสะสม (แลกดวงเต็ม 1 ใบ)
    let stampsToRedeem = 0;
    let stampDiscount = new Prisma.Decimal(0);
    if (input.useStampReward && stampsEnabled(store.loyaltyMode)) {
      if (!customerId) throw BadRequest('ต้องเลือกลูกค้าก่อนใช้รางวัล');
      const c = await tx.customer.findUnique({ where: { id: customerId } });
      if (!c) throw BadRequest('ไม่พบลูกค้า');
      if (store.stampsPerReward <= 0) throw BadRequest('ร้านยังไม่ได้ตั้งค่าจำนวนดวงต่อรางวัล');
      if (c.stamps < store.stampsPerReward) {
        throw BadRequest(`ดวงไม่พอแลกรางวัล (มี ${c.stamps}, ต้องการ ${store.stampsPerReward})`);
      }
      stampsToRedeem = store.stampsPerReward;
      stampDiscount = new Prisma.Decimal(store.stampRewardValue);
    }

    const promoDiscount = new Prisma.Decimal(input.promotionDiscount || 0);
    const orderDiscount = new Prisma.Decimal(input.discount ?? Number(order.discount) ?? 0)
      .plus(pointDiscount)
      .plus(stampDiscount)
      .plus(promoDiscount);
    const { tax, serviceCharge, total } = computeTotals(new Prisma.Decimal(order.subtotal), orderDiscount, store);

    const paid = input.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (paid + 0.001 < total.toNumber()) {
      throw BadRequest(`เงินไม่พอ: ต้องชำระ ${total.toFixed(2)} ได้รับ ${paid.toFixed(2)}`);
    }

    const earnedPoints = customerId && pointsEnabled(store.loyaltyMode)
      ? calcEarnedPoints(total.toNumber(), store.pointsEarnBaht) : 0;
    const earnedStamps = customerId && stampsEnabled(store.loyaltyMode) ? 1 : 0;
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED, completedAt: new Date(), customerId,
        discount: orderDiscount, promotionDiscount: promoDiscount,
        promotionId: input.promotionId, promotionName: input.promotionName,
        tax, serviceCharge, total,
        pointsRedeemed: pointsToRedeem, pointsEarned: earnedPoints,
        stampsEarned: earnedStamps, stampsRedeemed: stampsToRedeem,
        customerName: input.customerName, customerTaxId: input.customerTaxId, customerAddress: input.customerAddress,
        payments: {
          create: input.payments.map((p) => ({
            method: p.method, amount: new Prisma.Decimal(p.amount), reference: p.reference,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    if (customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          visitCount: { increment: 1 }, totalSpent: { increment: total },
          lastVisitAt: new Date(),
        },
      });
      if (pointsToRedeem > 0) {
        await recordPoints(tx, {
          storeId: input.storeId, customerId, type: PointTxType.REDEEM,
          points: -pointsToRedeem, orderId, note: `ใช้แต้มในบิล ${updated.orderNumber}`,
        });
      }
      if (earnedPoints > 0) {
        await recordPoints(tx, {
          storeId: input.storeId, customerId, type: PointTxType.EARN,
          points: earnedPoints, orderId, note: `ได้แต้มจากบิล ${updated.orderNumber}`,
        });
      }
      if (stampsToRedeem > 0) {
        await recordStamps(tx, {
          storeId: input.storeId, customerId, type: PointTxType.STAMP_REDEEM,
          stamps: -stampsToRedeem, orderId, note: `ใช้ดวงแลกรางวัลในบิล ${updated.orderNumber}`,
        });
      }
      if (earnedStamps > 0) {
        await recordStamps(tx, {
          storeId: input.storeId, customerId, type: PointTxType.STAMP_EARN,
          stamps: earnedStamps, orderId, note: `ได้ดวงจากบิล ${updated.orderNumber}`,
        });
      }
    }
    if (input.promotionId) {
      await tx.promotion.update({ where: { id: input.promotionId }, data: { usageCount: { increment: 1 } } }).catch(() => {});
    }
    await tx.activityLog.create({
      data: { userId: input.cashierId, action: 'SETTLE_TAB', metadata: { orderId, total: total.toNumber() } },
    });

    let table = null;
    if (order.tableId) {
      table = await tx.table.update({ where: { id: order.tableId }, data: { status: 'AVAILABLE', occupiedAt: null } });
    }
    return { updated, table };
  });

  io.to(`store:${input.storeId}`).emit('order:created', result.updated); // payment sound + toast
  io.to(`store:${input.storeId}:kds`).emit('kds:status', { id: orderId, status: 'COMPLETED' });
  if (result.table) io.to(`store:${input.storeId}`).emit('table:updated', result.table);
  return result.updated;
}

interface VoidItemInput {
  storeId: string;
  cashierId: string;
  orderItemId: string;
  qty: number;
  reason: string;
}

/**
 * Void some or all of an item's quantity from an *unpaid* open bill — a
 * mistaken order, wrong modifier, or a comped item before the guest pays.
 * Unlike order.service.refundItems() (post-payment refund, which keeps the
 * original charged total for the record), this actually shrinks the bill,
 * since no money has changed hands yet. Restocks inventory/ingredients for
 * the voided quantity, same as a refund would.
 */
export async function voidItem(orderId: string, input: VoidItemInput, io: Server) {
  if (!input.reason?.trim()) throw BadRequest('ต้องระบุเหตุผลในการยกเลิกรายการ');
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw BadRequest('จำนวนที่ยกเลิกต้องมากกว่า 0');

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { include: { inventory: true } } } },
        payments: true,
      },
    });
    if (!order) throw NotFound('Order not found');
    if (order.storeId !== input.storeId) throw BadRequest('Wrong store');
    if (order.payments.length > 0 || !OPEN_STATUSES.includes(order.status)) {
      throw BadRequest('บิลนี้ชำระแล้ว ยกเลิกรายการไม่ได้ — ใช้การคืนเงินแทน');
    }

    const item = order.items.find((i) => i.id === input.orderItemId);
    if (!item) throw BadRequest('ไม่พบรายการนี้ในบิล');
    const remaining = item.quantity - item.refundedQty;
    if (input.qty > remaining) {
      throw BadRequest(`${item.product.name}: ยกเลิกได้สูงสุด ${remaining} รายการ`);
    }

    // คืนสต็อกสินค้า
    if (item.product.trackStock && item.product.inventory) {
      await tx.inventory.update({
        where: { id: item.product.inventory.id },
        data: { quantity: { increment: input.qty } },
      });
      await tx.stockMovement.create({
        data: {
          inventoryId: item.product.inventory.id,
          type: 'RETURN',
          quantity: input.qty,
          orderId: order.id,
          userId: input.cashierId,
          reason: `ยกเลิกรายการ: ${input.reason}`,
        },
      });
    }

    // คืนสต็อกวัตถุดิบตามสูตร (proportional to the voided qty)
    const recipes = await tx.recipeItem.findMany({
      where: { productId: item.productId },
      include: { ingredient: { include: { inventory: true } } },
    });
    for (const r of recipes) {
      if (!r.ingredient.trackStock || !r.ingredient.inventory) continue;
      const restoreQty = Math.round(Number(r.quantity) * input.qty);
      if (restoreQty <= 0) continue;
      await tx.inventory.update({
        where: { id: r.ingredient.inventory.id },
        data: { quantity: { increment: restoreQty } },
      });
      await tx.stockMovement.create({
        data: {
          inventoryId: r.ingredient.inventory.id,
          type: 'RETURN',
          quantity: restoreQty,
          orderId: order.id,
          userId: input.cashierId,
          reason: `ยกเลิกรายการ (วัตถุดิบ): ${input.reason}`,
        },
      });
    }

    await tx.orderItem.update({
      where: { id: item.id },
      data: { refundedQty: item.refundedQty + input.qty, refundReason: input.reason },
    });

    // บิลยังไม่จ่าย — ลดยอดจริง ไม่ใช่แค่บันทึกคืนเงิน
    const perUnitDiscount = item.quantity > 0 ? Number(item.discount) / item.quantity : 0;
    const voidedLineValue = Number(item.unitPrice) * input.qty - perUnitDiscount * input.qty;
    const newSubtotal = Prisma.Decimal.max(0, new Prisma.Decimal(order.subtotal).minus(voidedLineValue));

    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const { tax, serviceCharge, total } = computeTotals(newSubtotal, new Prisma.Decimal(order.discount), store);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { subtotal: newSubtotal, tax, serviceCharge, total },
      include: ORDER_INCLUDE,
    });

    await tx.activityLog.create({
      data: {
        userId: input.cashierId,
        action: 'VOID_ITEM',
        metadata: { orderId, orderItemId: item.id, qty: input.qty, reason: input.reason },
      },
    });

    return { updated, productId: item.productId };
  });

  io.to(`store:${input.storeId}:kds`).emit('kds:new', result.updated);
  io.to(`store:${input.storeId}`).emit('stock:updated', { productIds: [result.productId] });
  return result.updated;
}
