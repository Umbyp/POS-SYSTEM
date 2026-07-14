import { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import { OrderStatus, OrderType, PaymentMethod, PointTxType, Prisma } from '@prisma/client';
import * as stripeService from '../payments/stripe.service';
import {
  recordPoints, recordStamps, calcEarnedPoints, reverseOrderPoints,
  pointsEnabled, stampsEnabled,
} from './points.service';

interface CreateOrderInput {
  storeId: string;
  cashierId: string;
  customerId?: string;
  tableId?: string;
  type: OrderType;
  items: {
    productId: string;
    quantity: number;
    notes?: string;
    variants?: { name: string; priceDelta: number }[];
    discount?: number;
  }[];
  discount?: number;
  pointsToRedeem?: number;
  useStampReward?: boolean;
  promotionId?: string;
  promotionDiscount?: number;
  promotionName?: string;
  payments: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
  }[];
  notes?: string;
  customerName?: string;
  customerTaxId?: string;
  customerAddress?: string;
}

interface ParkOrderInput {
  storeId: string;
  cashierId: string;
  customerId?: string;
  tableId?: string;
  type: OrderType;
  items: {
    productId: string;
    quantity: number;
    notes?: string;
    variants?: { name: string; priceDelta: number }[];
    discount?: number;
  }[];
  discount?: number;
  notes?: string;
}

export async function create(input: CreateOrderInput, io: Server) {
  if (!input.items?.length) throw BadRequest('No items in order');
  if (!input.payments?.length) throw BadRequest('No payment provided');

  // ตรวจการจ่ายผ่าน Stripe PromptPay ก่อนเริ่ม transaction (กัน reference ปลอม)
  // เฉพาะ payment ที่ reference เป็น Stripe PaymentIntent (ขึ้นต้น pi_)
  for (const p of input.payments) {
    if (p.method === 'PROMPTPAY' && p.reference?.startsWith('pi_')) {
      const st = await stripeService.getIntentStatus(p.reference);
      if (!st.paid) {
        throw BadRequest('ยังไม่ได้รับเงิน PromptPay — กรุณารอลูกค้าชำระให้สำเร็จก่อน');
      }
      if (st.amount + 0.5 < Number(p.amount)) {
        throw BadRequest(
          `ยอดที่จ่ายผ่าน PromptPay (${st.amount.toFixed(2)}) น้อยกว่ายอดบิล (${Number(p.amount).toFixed(2)})`
        );
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. ดึงข้อมูลสินค้า
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId: input.storeId },
      include: { inventory: true },
    });
    if (products.length !== productIds.length) {
      throw BadRequest('Some products not found');
    }

    // 2. คำนวณ + เช็คสต็อก (ของสินค้าเอง + วัตถุดิบจาก recipe)
    let subtotal = new Prisma.Decimal(0);
    const itemsData: any[] = [];

    // ดึง recipes ของทุก product ในออเดอร์ (สำหรับเช็คสต็อกวัตถุดิบ)
    const allRecipes = await tx.recipeItem.findMany({
      where: { productId: { in: productIds } },
      include: { ingredient: { include: { inventory: true } } },
    });

    // รวม qty วัตถุดิบที่ต้องใช้ทั้งหมด
    const ingredientNeed = new Map<string, { name: string; qty: number; available: number }>();

    for (const it of input.items) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) throw BadRequest(`Product ${it.productId} not found`);
      if (p.trackStock && p.inventory && p.inventory.quantity < it.quantity) {
        throw BadRequest(`สต็อกไม่พอ: ${p.name} (เหลือ ${p.inventory.quantity})`);
      }

      // สะสมความต้องการวัตถุดิบ
      const productRecipes = allRecipes.filter((r) => r.productId === it.productId);
      for (const r of productRecipes) {
        if (!r.ingredient.trackStock || !r.ingredient.inventory) continue;
        const useQty = Number(r.quantity) * it.quantity;
        const key = r.ingredient.inventory.id;
        const existing = ingredientNeed.get(key);
        if (existing) {
          existing.qty += useQty;
        } else {
          ingredientNeed.set(key, {
            name: r.ingredient.name,
            qty: useQty,
            available: r.ingredient.inventory.quantity,
          });
        }
      }

      const variantDelta = (it.variants || []).reduce(
        (s, v) => s + Number(v.priceDelta), 0
      );
      const unitPrice = new Prisma.Decimal(p.sellingPrice).plus(variantDelta);
      const itemDiscount = new Prisma.Decimal(it.discount || 0);
      const lineTotal = unitPrice.mul(it.quantity).minus(itemDiscount);
      subtotal = subtotal.plus(lineTotal);

      itemsData.push({
        productId: p.id,
        quantity: it.quantity,
        unitPrice,
        discount: itemDiscount,
        notes: it.notes,
        variants: it.variants ? (it.variants as any) : Prisma.JsonNull,
      });
    }

    // 2b. เช็คว่าวัตถุดิบทั้งหมดพอใช้ไหม
    for (const need of ingredientNeed.values()) {
      const required = Math.ceil(need.qty);
      if (need.available < required) {
        throw BadRequest(
          `วัตถุดิบไม่พอ: ${need.name} (ต้องการ ${required}, เหลือ ${need.available})`
        );
      }
    }

    // 3. ภาษี + service charge + redeem points
    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });

    // ตรวจ + หัก points ถ้ามี
    let pointsToRedeem = 0;
    let pointDiscount = new Prisma.Decimal(0);
    if (input.pointsToRedeem && input.pointsToRedeem > 0) {
      if (!input.customerId) {
        throw BadRequest('ต้องเลือกลูกค้าก่อนใช้คะแนน');
      }
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw BadRequest('ไม่พบลูกค้า');
      if (customer.points < input.pointsToRedeem) {
        throw BadRequest(`คะแนนไม่พอ (มี ${customer.points}, ต้องการ ${input.pointsToRedeem})`);
      }
      if (store.minRedeemPoints > 0 && input.pointsToRedeem < store.minRedeemPoints) {
        throw BadRequest(`ต้องใช้แต้มขั้นต่ำ ${store.minRedeemPoints} แต้ม`);
      }
      pointsToRedeem = input.pointsToRedeem;
      pointDiscount = new Prisma.Decimal(pointsToRedeem).mul(store.pointValue);
    }

    // ใช้รางวัลบัตรสะสม (แลกดวงเต็ม 1 ใบ → ส่วนลด stampRewardValue)
    let stampsToRedeem = 0;
    let stampDiscount = new Prisma.Decimal(0);
    if (input.useStampReward && stampsEnabled(store.loyaltyMode)) {
      if (!input.customerId) throw BadRequest('ต้องเลือกลูกค้าก่อนใช้รางวัล');
      const c = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!c) throw BadRequest('ไม่พบลูกค้า');
      if (store.stampsPerReward <= 0) throw BadRequest('ร้านยังไม่ได้ตั้งค่าจำนวนดวงต่อรางวัล');
      if (c.stamps < store.stampsPerReward) {
        throw BadRequest(`ดวงไม่พอแลกรางวัล (มี ${c.stamps}, ต้องการ ${store.stampsPerReward})`);
      }
      stampsToRedeem = store.stampsPerReward;
      stampDiscount = new Prisma.Decimal(store.stampRewardValue);
    }

    const promoDiscount = new Prisma.Decimal(input.promotionDiscount || 0);
    const orderDiscount = new Prisma.Decimal(input.discount || 0)
      .plus(pointDiscount)
      .plus(stampDiscount)
      .plus(promoDiscount);
    const afterDiscount = Prisma.Decimal.max(0, subtotal.minus(orderDiscount));
    const rate = new Prisma.Decimal(store.taxRate);
    const serviceCharge = afterDiscount.mul(store.serviceCharge).div(100);

    // VAT-inclusive: ราคาสินค้ารวมภาษีแล้ว → ถอด VAT ออกมาเพื่อบันทึก ไม่บวกเพิ่ม
    // VAT-exclusive: ราคาสินค้าไม่รวมภาษี → คำนวณ VAT แล้วบวกเข้า total
    const tax = store.priceIncludesTax
      ? afterDiscount.mul(rate).div(rate.plus(100))
      : afterDiscount.mul(rate).div(100);
    const total = store.priceIncludesTax
      ? afterDiscount.plus(serviceCharge)
      : afterDiscount.plus(tax).plus(serviceCharge);

    // 4. เช็คเงิน
    const paid = input.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (paid + 0.001 < total.toNumber()) {
      throw BadRequest(`เงินไม่พอ: ต้องชำระ ${total.toFixed(2)} ได้รับ ${paid.toFixed(2)}`);
    }

    // 5. สร้าง order
    const earnedPoints = input.customerId && pointsEnabled(store.loyaltyMode)
      ? calcEarnedPoints(total.toNumber(), store.pointsEarnBaht) : 0;
    const earnedStamps = input.customerId && stampsEnabled(store.loyaltyMode) ? 1 : 0;
    const orderNumber = await generateOrderNumber(tx, input.storeId);
    const order = await tx.order.create({
      data: {
        orderNumber,
        storeId: input.storeId,
        cashierId: input.cashierId,
        customerId: input.customerId,
        tableId: input.tableId,
        type: input.type,
        status: OrderStatus.PENDING,
        subtotal,
        discount: orderDiscount,
        promotionDiscount: promoDiscount,
        promotionId: input.promotionId,
        promotionName: input.promotionName,
        tax,
        serviceCharge,
        total,
        pointsRedeemed: pointsToRedeem,
        pointsEarned: earnedPoints,
        stampsEarned: earnedStamps,
        stampsRedeemed: stampsToRedeem,
        notes: input.notes,
        customerName: input.customerName,
        customerTaxId: input.customerTaxId,
        customerAddress: input.customerAddress,
        completedAt: new Date(),
        items: { create: itemsData },
        payments: {
          create: input.payments.map((p) => ({
            method: p.method,
            amount: new Prisma.Decimal(p.amount),
            reference: p.reference,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        payments: true,
        cashier: { select: { id: true, name: true } },
        table: true,
      },
    });

    // 6. ตัดสต็อก + log movement
    // 6a. ตัดสต็อกของสินค้าเอง (ถ้า trackStock)
    for (const it of input.items) {
      const p = products.find((x) => x.id === it.productId)!;
      if (p.trackStock && p.inventory) {
        await tx.inventory.update({
          where: { id: p.inventory.id },
          data: { quantity: { decrement: it.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: p.inventory.id,
            type: 'SALE',
            quantity: -it.quantity,
            orderId: order.id,
            userId: input.cashierId,
          },
        });
      }
    }

    // 6b. ตัดสต็อกวัตถุดิบตาม recipe (สำหรับเมนูที่มีสูตร)
    const recipes = await tx.recipeItem.findMany({
      where: { productId: { in: productIds } },
      include: { ingredient: { include: { inventory: true } } },
    });
    if (recipes.length > 0) {
      // รวม qty ที่ใช้ต่อ ingredient จากทุก line ในออเดอร์
      const ingredientUsage = new Map<string, { inventoryId: string; qty: number; name: string }>();
      for (const it of input.items) {
        const productRecipes = recipes.filter((r) => r.productId === it.productId);
        for (const r of productRecipes) {
          if (!r.ingredient.inventory || !r.ingredient.trackStock) continue;
          const useQty = Number(r.quantity) * it.quantity;
          const existing = ingredientUsage.get(r.ingredient.inventory.id);
          if (existing) {
            existing.qty += useQty;
          } else {
            ingredientUsage.set(r.ingredient.inventory.id, {
              inventoryId: r.ingredient.inventory.id,
              qty: useQty,
              name: r.ingredient.name,
            });
          }
        }
      }

      // ตัดสต็อกวัตถุดิบทั้งหมดในครั้งเดียว
      for (const usage of ingredientUsage.values()) {
        const ceil = Math.ceil(usage.qty); // ปัดขึ้นเพราะ Inventory.quantity เป็น Int
        await tx.inventory.update({
          where: { id: usage.inventoryId },
          data: { quantity: { decrement: ceil } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: usage.inventoryId,
            type: 'SALE',
            quantity: -ceil,
            orderId: order.id,
            userId: input.cashierId,
            reason: `ใช้ในออเดอร์ ${order.orderNumber}`,
          },
        });
      }
    }

    // 7. Activity log
    await tx.activityLog.create({
      data: {
        userId: input.cashierId,
        action: 'CREATE_ORDER',
        metadata: { orderId: order.id, orderNumber, total: total.toNumber() },
      },
    });

    // 8. Update table status if dine-in
    let updatedTable: any = null;
    if (input.tableId) {
      updatedTable = await tx.table.update({
        where: { id: input.tableId },
        data: { status: 'OCCUPIED', occupiedAt: new Date() },
      });
    }

    // 8b. Update customer stats + บันทึกแต้มลง ledger (หักที่ใช้ / เพิ่มที่ได้)
    if (input.customerId) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: {
          visitCount: { increment: 1 },
          totalSpent: { increment: total },
          lastVisitAt: new Date(),
        },
      });
      if (pointsToRedeem > 0) {
        await recordPoints(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.REDEEM,
          points: -pointsToRedeem,
          orderId: order.id,
          note: `ใช้แต้มในบิล ${orderNumber}`,
        });
      }
      if (earnedPoints > 0) {
        await recordPoints(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.EARN,
          points: earnedPoints,
          orderId: order.id,
          note: `ได้แต้มจากบิล ${orderNumber}`,
        });
      }
      if (stampsToRedeem > 0) {
        await recordStamps(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.STAMP_REDEEM,
          stamps: -stampsToRedeem,
          orderId: order.id,
          note: `ใช้ดวงแลกรางวัลในบิล ${orderNumber}`,
        });
      }
      if (earnedStamps > 0) {
        await recordStamps(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.STAMP_EARN,
          stamps: earnedStamps,
          orderId: order.id,
          note: `ได้ดวงจากบิล ${orderNumber}`,
        });
      }
    }

    // 8c. Increment promotion usage
    if (input.promotionId) {
      await tx.promotion.update({
        where: { id: input.promotionId },
        data: { usageCount: { increment: 1 } },
      }).catch(() => {});
    }

    // 9. Emit realtime
    io.to(`store:${input.storeId}`).emit('order:created', order);
    io.to(`store:${input.storeId}:kds`).emit('kds:new', order);
    io.to(`store:${input.storeId}`).emit('stock:updated', { productIds });
    if (updatedTable) {
      io.to(`store:${input.storeId}`).emit('table:updated', updatedTable);
    }

    return order;
  });
}

export async function list(storeId: string, query: any) {
  const where: Prisma.OrderWhereInput = { storeId };

  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(Number(query.limit) || 50, 200);
  const skip = Number(query.offset) || 0;

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        payments: true,
        cashier: { select: { id: true, name: true } },
        table: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.order.count({ where }),
  ]);

  return { data, total, limit: take, offset: skip };
}

export async function getById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      payments: true,
      cashier: { select: { id: true, name: true } },
      table: true,
      store: true,
    },
  });
  if (!order) throw NotFound('Order not found');
  return order;
}

export async function updateStatus(id: string, status: OrderStatus, io: Server) {
  const order = await prisma.order.update({
    where: { id },
    data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    include: { items: { include: { product: true } } },
  });

  // ปลดล็อกโต๊ะอัตโนมัติเมื่อออเดอร์เสร็จสิ้น/ยกเลิก
  if (order.tableId && (status === 'COMPLETED' || status === 'CANCELLED')) {
    const table = await prisma.table.update({
      where: { id: order.tableId },
      data: { status: 'AVAILABLE', occupiedAt: null },
    });
    io.to(`store:${order.storeId}`).emit('table:updated', table);
  }

  io.to(`store:${order.storeId}`).emit('order:status', { id: order.id, status });
  io.to(`store:${order.storeId}:kds`).emit('kds:status', { id: order.id, status });
  return order;
}

export async function refund(id: string, userId: string, io: Server) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { items: { include: { product: { include: { inventory: true } } } } },
    });
    if (!order) throw NotFound('Order not found');
    if (order.status === 'REFUNDED') throw BadRequest('Order already refunded');

    // คืนสต็อก
    for (const item of order.items) {
      if (item.product.trackStock && item.product.inventory) {
        await tx.inventory.update({
          where: { id: item.product.inventory.id },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: item.product.inventory.id,
            type: 'RETURN',
            quantity: item.quantity,
            orderId: order.id,
            userId,
            reason: 'Refund',
          },
        });
      }
    }

    // คืน/ดึงแต้มกลับ (idempotent เพราะกัน REFUNDED ซ้ำด้านบนแล้ว)
    await reverseOrderPoints(tx, order);

    const updated = await tx.order.update({
      where: { id },
      data: { status: 'REFUNDED' },
    });

    // ปลดโต๊ะเมื่อ refund
    let freedTable: any = null;
    if (order.tableId) {
      freedTable = await tx.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE', occupiedAt: null },
      });
    }

    await tx.activityLog.create({
      data: { userId, action: 'REFUND', metadata: { orderId: id } },
    });

    if (freedTable) {
      io.to(`store:${order.storeId}`).emit('table:updated', freedTable);
    }

    io.to(`store:${order.storeId}`).emit('order:refunded', { id });
    return updated;
  });
}

/**
 * Partial refund — คืนเงินบางรายการในออเดอร์
 * input: { items: [{ orderItemId, qty, reason? }] }
 */
export async function refundItems(
  orderId: string,
  userId: string,
  input: { items: Array<{ orderItemId: string; qty: number; reason?: string }> },
  io: Server
) {
  if (!input.items?.length) throw BadRequest('No items to refund');

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { include: { inventory: true } } } } },
    });
    if (!order) throw NotFound('Order not found');
    if (order.status === 'REFUNDED') throw BadRequest('Order already fully refunded');

    let totalRefunded = new Prisma.Decimal(0);

    for (const refundInput of input.items) {
      const item = order.items.find((i) => i.id === refundInput.orderItemId);
      if (!item) throw BadRequest(`Item ${refundInput.orderItemId} not found in order`);

      const remaining = item.quantity - item.refundedQty;
      if (refundInput.qty <= 0) throw BadRequest(`Invalid qty for item ${item.id}`);
      if (refundInput.qty > remaining) {
        throw BadRequest(
          `${item.product.name}: ขอคืน ${refundInput.qty} เกินจำนวนที่เหลือ (${remaining})`
        );
      }

      // คืนสต็อก
      if (item.product.trackStock && item.product.inventory) {
        await tx.inventory.update({
          where: { id: item.product.inventory.id },
          data: { quantity: { increment: refundInput.qty } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: item.product.inventory.id,
            type: 'RETURN',
            quantity: refundInput.qty,
            orderId: order.id,
            userId,
            reason: refundInput.reason || 'Partial refund',
          },
        });
      }

      // อัปเดท refundedQty
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          refundedQty: item.refundedQty + refundInput.qty,
          refundReason: refundInput.reason || item.refundReason,
        },
      });

      const lineRefund = new Prisma.Decimal(item.unitPrice).mul(refundInput.qty);
      totalRefunded = totalRefunded.plus(lineRefund);
    }

    // เช็คว่า refund ครบทั้งบิลหรือไม่ → ถ้าครบ status = REFUNDED
    const remainingItems = await tx.orderItem.findMany({ where: { orderId } });
    const allRefunded = remainingItems.every((i) => i.refundedQty >= i.quantity);

    // แต้มกลับเฉพาะตอนคืนครบทั้งบิล (การคืนบางรายการยังไม่แตะแต้ม — เฟส 1)
    // กันซ้ำได้เพราะ status='REFUNDED' แล้วจะ throw ที่ต้นฟังก์ชัน
    if (allRefunded) {
      await reverseOrderPoints(tx, order);
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: allRefunded ? { status: 'REFUNDED' } : {},
      include: { items: { include: { product: true } }, payments: true },
    });

    // ปลดโต๊ะถ้า refund ครบ
    if (allRefunded && order.tableId) {
      const freed = await tx.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE', occupiedAt: null },
      });
      io.to(`store:${order.storeId}`).emit('table:updated', freed);
    }

    await tx.activityLog.create({
      data: {
        userId,
        action: 'PARTIAL_REFUND',
        metadata: {
          orderId,
          items: input.items,
          refundedAmount: totalRefunded.toNumber(),
          fullyRefunded: allRefunded,
        },
      },
    });

    io.to(`store:${order.storeId}`).emit('order:refunded', { id: orderId, partial: !allRefunded });

    return {
      order: updated,
      refundedAmount: totalRefunded.toNumber(),
      fullyRefunded: allRefunded,
    };
  });
}

/**
 * Park order — บันทึก draft ไว้ก่อน (ลูกค้านั่งทาน จ่ายทีหลัง)
 * - ไม่ตัดสต็อก
 * - ไม่ต้องระบุ payment
 * - status = DRAFT
 */
export async function parkOrder(input: ParkOrderInput, io: Server) {
  if (!input.items?.length) throw BadRequest('No items');

  return prisma.$transaction(async (tx) => {
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId: input.storeId },
    });

    let subtotal = new Prisma.Decimal(0);
    const itemsData: any[] = [];
    for (const it of input.items) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) throw BadRequest(`Product ${it.productId} not found`);
      const variantDelta = (it.variants || []).reduce(
        (s, v) => s + Number(v.priceDelta),
        0
      );
      const unitPrice = new Prisma.Decimal(p.sellingPrice).plus(variantDelta);
      const itemDiscount = new Prisma.Decimal(it.discount || 0);
      const lineTotal = unitPrice.mul(it.quantity).minus(itemDiscount);
      subtotal = subtotal.plus(lineTotal);
      itemsData.push({
        productId: p.id,
        quantity: it.quantity,
        unitPrice,
        discount: itemDiscount,
        notes: it.notes,
        variants: it.variants ? (it.variants as any) : Prisma.JsonNull,
      });
    }

    const orderDiscount = new Prisma.Decimal(input.discount || 0);
    const orderNumber = await generateOrderNumber(tx, input.storeId);
    const order = await tx.order.create({
      data: {
        orderNumber,
        storeId: input.storeId,
        cashierId: input.cashierId,
        customerId: input.customerId,
        tableId: input.tableId,
        type: input.type,
        status: OrderStatus.DRAFT,
        subtotal,
        discount: orderDiscount,
        tax: new Prisma.Decimal(0),
        serviceCharge: new Prisma.Decimal(0),
        total: subtotal.minus(orderDiscount),
        notes: input.notes,
        items: { create: itemsData },
      },
      include: { items: { include: { product: true } }, customer: true, table: true },
    });

    // จองโต๊ะ (occupied) ทันทีเลย ลูกค้านั่งอยู่
    if (input.tableId) {
      const t = await tx.table.update({
        where: { id: input.tableId },
        data: { status: 'OCCUPIED', occupiedAt: new Date() },
      });
      io.to(`store:${input.storeId}`).emit('table:updated', t);
    }

    io.to(`store:${input.storeId}`).emit('order:parked', order);
    return order;
  });
}

/** List parked (DRAFT) orders for store */
export async function listParked(storeId: string) {
  return prisma.order.findMany({
    where: { storeId, status: 'DRAFT' },
    include: {
      items: { include: { product: true } },
      customer: true,
      table: true,
      cashier: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Delete a parked order (cancel without checkout) */
export async function deleteParked(id: string, userId: string, io: Server) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw NotFound('Order not found');
    if (order.status !== 'DRAFT') throw BadRequest('Only DRAFT orders can be deleted');

    // ปลดโต๊ะถ้ามี
    if (order.tableId) {
      const t = await tx.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
      io.to(`store:${order.storeId}`).emit('table:updated', t);
    }

    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.order.delete({ where: { id } });
    io.to(`store:${order.storeId}`).emit('order:unparked', { id });
    return { ok: true };
  });
}

export async function generateOrderNumber(tx: any, storeId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const count = await tx.order.count({
    where: { storeId, createdAt: { gte: startOfDay } },
  });
  return `ORD-${today}-${String(count + 1).padStart(4, '0')}`;
}
