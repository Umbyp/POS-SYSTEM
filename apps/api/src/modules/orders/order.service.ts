import { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import { OrderStatus, OrderType, PaymentMethod, PointTxType, Prisma } from '@prisma/client';
import * as stripeService from '../payments/stripe.service';
import {
  recordPoints, recordStamps, calcEarnedPoints, calcEarnedStamps, reverseOrderPoints,
  pointsEnabled, stampsEnabled,
} from './points.service';
import { dispatchKitchenPrint, dispatchReceiptPrint } from '../printers/printers.service';
import {
  allocateDiscounts, capLineDiscount, resolvePromotion, consumePromotionUse, claimRedemption,
  attachRedemptionToOrder, redemptionNote, joinNotes, appliedRewardView, releaseRedemptionForOrder,
} from './checkout-discounts';
import { recordIdempotencyKey } from './idempotency';
import { partialRefundAmount, earnedShare } from './refund-math';

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
  /** Code of an ACTIVE loyalty RewardRedemption to apply to this bill. */
  redemptionCode?: string;
  /** Idempotency-Key / clientRequestId — see orders/idempotency.ts. */
  idempotencyKey?: string;
  payments: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    /** Set when the cashier attached a slip image the frontend already had
     * Slip2Go verify (see payments/slip2go.service.ts) before confirming. */
    slipVerified?: boolean;
    slipTransRef?: string;
    slipPayload?: string;
  }[];
  notes?: string;
  customerName?: string;
  customerTaxId?: string;
  customerAddress?: string;
  guestCount?: number;
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

  const order = await prisma.$transaction(async (tx) => {
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
    const pricedLines: { productId: string; quantity: number; unitPrice: number; categoryId?: string }[] = [];

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
      const itemDiscount = capLineDiscount(unitPrice.mul(it.quantity), it.discount);
      const lineTotal = unitPrice.mul(it.quantity).minus(itemDiscount);
      subtotal = subtotal.plus(lineTotal);
      pricedLines.push({ productId: p.id, quantity: it.quantity, unitPrice: unitPrice.toNumber(), categoryId: p.categoryId ?? undefined });

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

    // โปรโมชั่น: คำนวณใหม่ฝั่งเซิร์ฟเวอร์ ไม่เชื่อยอดที่ client ส่งมา
    const resolvedPromo = await resolvePromotion(tx, {
      storeId: input.storeId, promotionId: input.promotionId, promotionDiscount: input.promotionDiscount,
      items: pricedLines, subtotal, customerId: input.customerId,
    });
    // โค้ดรางวัล (RewardRedemption): claim แบบ atomic ใน transaction เดียวกับบิล
    const claimed = input.redemptionCode
      ? await claimRedemption(tx, input.storeId, input.redemptionCode)
      : null;

    const { applied, total: orderDiscount } = allocateDiscounts(subtotal, {
      manual: new Prisma.Decimal(input.discount || 0),
      promo: resolvedPromo?.discount,
      reward: claimed?.amount,
      stamp: stampDiscount,
      points: pointDiscount,
    });
    const promoDiscount = applied.promo;
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
    const earnedStamps = input.customerId && stampsEnabled(store.loyaltyMode)
      ? calcEarnedStamps(total.toNumber(), store.stampsEarnBaht) : 0;
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
        promotionId: resolvedPromo?.promotionId,
        promotionName: resolvedPromo?.promotionName,
        tax,
        serviceCharge,
        total,
        pointsRedeemed: pointsToRedeem,
        pointsEarned: earnedPoints,
        stampsEarned: earnedStamps,
        stampsRedeemed: stampsToRedeem,
        notes: joinNotes(input.notes, claimed ? redemptionNote(claimed, applied.reward) : undefined),
        guestCount: input.guestCount,
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
            slipVerified: p.slipVerified ?? false,
            slipTransRef: p.slipTransRef,
            slipVerifiedAt: p.slipVerified ? new Date() : undefined,
            slipPayload: p.slipPayload,
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

    if (claimed) await attachRedemptionToOrder(tx, claimed.id, order.id);
    if (input.idempotencyKey) await recordIdempotencyKey(tx, input.storeId, 'orders:create', input.idempotencyKey, order.id);

    // 6. ตัดสต็อก + log movement
    // 6a. ตัดสต็อกของสินค้าเอง + วัตถุดิบจาก recipe (รวมเป็น batch)
    const stockMovements: any[] = [];
    const inventoryUpdates = new Map<string, number>(); // inventoryId → total decrement

    // 6a-1. สินค้าเอง
    for (const it of input.items) {
      const p = products.find((x) => x.id === it.productId)!;
      if (p.trackStock && p.inventory) {
        const cur = inventoryUpdates.get(p.inventory.id) ?? 0;
        inventoryUpdates.set(p.inventory.id, cur + it.quantity);
        stockMovements.push({
          inventoryId: p.inventory.id,
          type: 'SALE',
          quantity: -it.quantity,
          orderId: order.id,
          userId: input.cashierId,
        });
      }
    }

    // 6b. ตัดสต็อกวัตถุดิบตาม recipe (ใช้ allRecipes ที่ query ไว้แล้ว ไม่ query ซ้ำ)
    if (allRecipes.length > 0) {
      const ingredientUsage = new Map<string, { inventoryId: string; qty: number; name: string }>();
      for (const it of input.items) {
        const productRecipes = allRecipes.filter((r) => r.productId === it.productId);
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

      for (const usage of ingredientUsage.values()) {
        const ceil = Math.ceil(usage.qty);
        const cur = inventoryUpdates.get(usage.inventoryId) ?? 0;
        inventoryUpdates.set(usage.inventoryId, cur + ceil);
        stockMovements.push({
          inventoryId: usage.inventoryId,
          type: 'SALE',
          quantity: -ceil,
          orderId: order.id,
          userId: input.cashierId,
          reason: `ใช้ในออเดอร์ ${order.orderNumber}`,
        });
      }
    }

    // Batch: อัปเดต inventory ทีละตัว (Prisma ไม่รองรับ bulk decrement ต่างจำนวน)
    // แต่ batch stock movements ทั้งหมดในครั้งเดียว
    await Promise.all(
      Array.from(inventoryUpdates.entries()).map(([invId, qty]) =>
        tx.inventory.update({
          where: { id: invId },
          data: { quantity: { decrement: qty } },
        })
      )
    );
    if (stockMovements.length > 0) {
      await tx.stockMovement.createMany({ data: stockMovements });
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
      // Parallelize independent loyalty writes
      const loyaltyOps: Promise<any>[] = [];
      if (pointsToRedeem > 0) {
        loyaltyOps.push(recordPoints(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.REDEEM,
          points: -pointsToRedeem,
          orderId: order.id,
          note: `ใช้แต้มในบิล ${orderNumber}`,
        }));
      }
      if (earnedPoints > 0) {
        loyaltyOps.push(recordPoints(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.EARN,
          points: earnedPoints,
          orderId: order.id,
          note: `ได้แต้มจากบิล ${orderNumber}`,
        }));
      }
      if (stampsToRedeem > 0) {
        loyaltyOps.push(recordStamps(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.STAMP_REDEEM,
          stamps: -stampsToRedeem,
          orderId: order.id,
          note: `ใช้ดวงแลกรางวัลในบิล ${orderNumber}`,
        }));
      }
      if (earnedStamps > 0) {
        loyaltyOps.push(recordStamps(tx, {
          storeId: input.storeId,
          customerId: input.customerId,
          type: PointTxType.STAMP_EARN,
          stamps: earnedStamps,
          orderId: order.id,
          note: `ได้ดวงจากบิล ${orderNumber}`,
        }));
      }
      if (loyaltyOps.length > 0) await Promise.all(loyaltyOps);
    }

    // 8c. Increment promotion usage
    if (resolvedPromo) await consumePromotionUse(tx, resolvedPromo.promotionId);

    // 9. Emit realtime
    io.to(`store:${input.storeId}`).emit('order:created', order);
    io.to(`store:${input.storeId}:kds`).emit('kds:new', order);
    io.to(`store:${input.storeId}`).emit('stock:updated', { productIds });
    if (updatedTable) {
      io.to(`store:${input.storeId}`).emit('table:updated', updatedTable);
    }

    return Object.assign(order, { appliedReward: appliedRewardView(claimed, applied.reward) });
  });

  dispatchKitchenPrint(order, {
    isAddOn: false,
    legacyItems: order.items.map((it: any) => ({
      name: it.product.name, quantity: it.quantity, notes: it.notes,
      modifiers: Array.isArray(it.variants) ? it.variants.map((v: any) => v?.name).filter(Boolean) : [],
    })),
    io,
  });
  dispatchReceiptPrint(order, io);
  return order;
}

export async function list(storeId: string, query: any) {
  const where: Prisma.OrderWhereInput = { storeId };

  if (query.status) {
    where.status = query.status.includes(',')
      ? { in: query.status.split(',') }
      : query.status;
  }
  if (query.type) where.type = query.type;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: 'insensitive' } },
      { table: { number: { contains: query.q, mode: 'insensitive' } } },
      { customer: { phone: { contains: query.q, mode: 'insensitive' } } },
      { customer: { name: { contains: query.q, mode: 'insensitive' } } },
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
        customer: { select: { id: true, name: true, phone: true } },
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

export async function getById(id: string, storeId?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(storeId ? { storeId } : {}) },
    include: {
      items: { include: { product: true } },
      payments: true,
      cashier: { select: { id: true, name: true } },
      customer: true,
      table: true,
      store: true,
    },
  });
  if (!order) throw NotFound('Order not found');
  return order;
}

export async function updateStatus(id: string, status: OrderStatus, io: Server, storeId?: string) {
  if (storeId) {
    const own = await prisma.order.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!own) throw NotFound('Order not found');
  }
  const order = await prisma.order.update({
    where: { id },
    data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    include: { items: { include: { product: true } } },
  });

  // ปลดล็อกโต๊ะอัตโนมัติเมื่อออเดอร์เสร็จสิ้น/ยกเลิก
  // (but not while another open bill — e.g. a split-off one — still sits there)
  if (order.tableId && (status === 'COMPLETED' || status === 'CANCELLED')
    && !(await tableHasOtherOpenBill(prisma, order.tableId, order.id))) {
    const table = await prisma.table.update({
      where: { id: order.tableId },
      data: { status: 'AVAILABLE', occupiedAt: null },
    });
    io.to(`store:${order.storeId}`).emit('table:updated', table);
  }

  io.to(`store:${order.storeId}`).emit('order:status', { id: order.id, status });
  io.to(`store:${order.storeId}:kds`).emit('kds:status', { id: order.id, status });
  // Let a customer's self-order status page (if still open) reflect real
  // kitchen progress instead of freezing at "order received".
  io.of('/self-order').to(`order:${order.id}`).emit('order:status', { status });
  // Ready-board is public/unauthenticated, so it lives on its own socket
  // namespace (see socket.ts) — only ping it for the two transitions it
  // actually cares about (an order becoming ready, or leaving the board).
  if (status === 'READY' || status === 'COMPLETED') {
    io.of('/display').to(`store:${order.storeId}:display`).emit('ready-board:update');
  }
  return order;
}

/** Only a bill that was actually paid can be refunded (open/cancelled/draft bills have nothing to give back). */
function assertRefundable(order: { status: string; payments: unknown[] }) {
  if (order.status === 'CANCELLED' || order.status === 'DRAFT' || order.payments.length === 0) {
    throw BadRequest('บิลนี้ยังไม่ได้ชำระ/ถูกยกเลิก คืนเงินไม่ได้', 'NOT_REFUNDABLE');
  }
}


/**
 * Give back a refunded amount to the customer's lifetime totals (tier is derived from totalSpent).
 * Never goes below zero; visitCount only drops when the whole bill is refunded.
 */
async function reverseCustomerTotals(
  tx: Prisma.TransactionClient,
  customerId: string | null,
  amount: Prisma.Decimal,
  fullBill: boolean,
) {
  if (!customerId || amount.lte(0)) return;
  const c = await tx.customer.findUnique({ where: { id: customerId }, select: { totalSpent: true, visitCount: true } });
  if (!c) return;
  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalSpent: Prisma.Decimal.max(0, new Prisma.Decimal(c.totalSpent).minus(amount)),
      ...(fullBill ? { visitCount: Math.max(0, c.visitCount - 1) } : {}),
    },
  });
}

/** Claw back the points that belong to a partially refunded share (never below the balance). */
async function clawbackPointsShare(
  tx: Prisma.TransactionClient,
  order: { id: string; storeId: string; customerId: string | null; pointsEarned: number; total: Prisma.Decimal.Value },
  oldRefunded: Prisma.Decimal.Value,
  newRefunded: Prisma.Decimal.Value,
) {
  if (!order.customerId || order.pointsEarned <= 0) return;
  const delta = earnedShare(order.pointsEarned, order.total, newRefunded) - earnedShare(order.pointsEarned, order.total, oldRefunded);
  if (delta <= 0) return;
  const c = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId }, select: { points: true } });
  const take = Math.min(delta, c.points);
  if (take > 0) {
    await recordPoints(tx, {
      storeId: order.storeId, customerId: order.customerId, type: PointTxType.REFUND_REVERSAL,
      points: -take, orderId: order.id, note: 'ดึงแต้มกลับตามสัดส่วน (คืนเงินบางรายการ)',
    });
  }
}

/** A refund must not free a table that a newer, still-open bill is sitting at. */
export async function tableHasOtherOpenBill(tx: Pick<Prisma.TransactionClient, 'order'>, tableId: string, exceptOrderId: string) {
  const n = await tx.order.count({
    where: { tableId, id: { not: exceptOrderId }, status: { in: ['PENDING', 'PREPARING', 'READY'] }, payments: { none: {} } },
  });
  return n > 0;
}

export async function refund(id: string, userId: string, io: Server, storeId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, ...(storeId ? { storeId } : {}) },
      include: { items: { include: { product: { include: { inventory: true } } } }, payments: true },
    });
    if (!order) throw NotFound('Order not found');
    if (order.status === 'REFUNDED') throw BadRequest('Order already refunded');
    assertRefundable(order);

    // คืนสต็อก (เฉพาะจำนวนที่ยังไม่เคยคืนจาก partial refund — กันคืนซ้ำ)
    for (const item of order.items) {
      const qtyLeft = item.quantity - item.refundedQty;
      if (qtyLeft > 0 && item.product.trackStock && item.product.inventory) {
        await tx.inventory.update({
          where: { id: item.product.inventory.id },
          data: { quantity: { increment: qtyLeft } },
        });
        await tx.stockMovement.create({
          data: {
            inventoryId: item.product.inventory.id,
            type: 'RETURN',
            quantity: qtyLeft,
            orderId: order.id,
            userId,
            reason: 'Refund',
          },
        });
      }
    }

    // ยอดที่ยังไม่เคยคืน (กรณีเคยคืนบางรายการมาก่อน) และแต้มที่ดึงกลับไปแล้วตามสัดส่วน
    const amount = Prisma.Decimal.max(0, new Prisma.Decimal(order.total).minus(order.refundedAmount));
    const alreadyClawed = earnedShare(order.pointsEarned, order.total, order.refundedAmount);

    // คืน/ดึงแต้มกลับ (idempotent เพราะกัน REFUNDED ซ้ำด้านบนแล้ว)
    await reverseOrderPoints(tx, { ...order, pointsEarned: Math.max(0, order.pointsEarned - alreadyClawed) });
    // คืนสิทธิ์โค้ดรางวัลที่บิลนี้เคยใช้
    await releaseRedemptionForOrder(tx, id, order.storeId, userId, 'REFUND');
    // ยอดสะสม/จำนวนครั้งของลูกค้า
    await reverseCustomerTotals(tx, order.customerId, amount, true);

    const updated = await tx.order.update({
      where: { id },
      data: { status: 'REFUNDED', refundedAmount: order.total, refundedAt: new Date() },
    });

    // ปลดโต๊ะเมื่อ refund (ถ้าโต๊ะนั้นไม่ได้มีบิลใหม่นั่งอยู่)
    let freedTable: any = null;
    if (order.tableId && !(await tableHasOtherOpenBill(tx, order.tableId, id))) {
      freedTable = await tx.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE', occupiedAt: null },
      });
    }

    await tx.activityLog.create({
      data: {
        userId, action: 'REFUND',
        metadata: { orderId: id, refundedAmount: amount.toNumber(), ...(order.taxInvoiceNo ? { taxInvoiceIssued: true, taxInvoiceNo: order.taxInvoiceNo } : {}) },
      },
    });

    if (freedTable) {
      io.to(`store:${order.storeId}`).emit('table:updated', freedTable);
    }

    io.to(`store:${order.storeId}`).emit('order:refunded', { id });
    // ออกใบกำกับภาษีไปแล้ว → UI ควรเตือนให้ออกใบลดหนี้ (ยังไม่มีในระบบ)
    return { ...updated, taxInvoiceIssued: !!order.taxInvoiceNo };
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
  io: Server,
  storeId?: string,
) {
  if (!input.items?.length) throw BadRequest('No items to refund');

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, ...(storeId ? { storeId } : {}) },
      include: { items: { include: { product: { include: { inventory: true } } } }, payments: true },
    });
    if (!order) throw NotFound('Order not found');
    if (order.status === 'REFUNDED') throw BadRequest('Order already fully refunded');
    assertRefundable(order);

    const refundLines: Array<{ unitPrice: Prisma.Decimal.Value; quantity: number; discount: Prisma.Decimal.Value; qty: number }> = [];

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

      refundLines.push({ unitPrice: item.unitPrice, quantity: item.quantity, discount: item.discount, qty: refundInput.qty });
    }

    // เช็คว่า refund ครบทั้งบิลหรือไม่ → ถ้าครบ status = REFUNDED
    const remainingItems = await tx.orderItem.findMany({ where: { orderId } });
    const allRefunded = remainingItems.every((i) => i.refundedQty >= i.quantity);

    // ยอดคืน = สัดส่วนของรายการที่คืนบนยอดสุทธิ (รวมส่วนลดบิล ภาษี ค่าบริการ)
    // ครบทั้งบิล → ปิดส่วนที่เหลือพอดี ไม่ให้เศษสตางค์ค้าง
    const oldRefunded = new Prisma.Decimal(order.refundedAmount);
    const totalRefunded = allRefunded
      ? Prisma.Decimal.max(0, new Prisma.Decimal(order.total).minus(oldRefunded))
      : Prisma.Decimal.min(
          partialRefundAmount(order, refundLines),
          Prisma.Decimal.max(0, new Prisma.Decimal(order.total).minus(oldRefunded)),
        );
    const newRefunded = oldRefunded.plus(totalRefunded);

    // คืนครบ → ดึงแต้ม/ดวง/โค้ดทั้งหมด (หักส่วนที่ดึงตามสัดส่วนไปแล้ว); คืนบางส่วน → ดึงแต้มตามสัดส่วน
    // กันซ้ำได้เพราะ status='REFUNDED' แล้วจะ throw ที่ต้นฟังก์ชัน
    if (allRefunded) {
      const alreadyClawed = earnedShare(order.pointsEarned, order.total, oldRefunded);
      await reverseOrderPoints(tx, { ...order, pointsEarned: Math.max(0, order.pointsEarned - alreadyClawed) });
      await releaseRedemptionForOrder(tx, orderId, order.storeId, userId, 'REFUND');
    } else {
      await clawbackPointsShare(tx, order, oldRefunded, newRefunded);
    }
    await reverseCustomerTotals(tx, order.customerId, totalRefunded, allRefunded);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { refundedAmount: newRefunded, refundedAt: new Date(), ...(allRefunded ? { status: 'REFUNDED' } : {}) },
      include: { items: { include: { product: true } }, payments: true },
    });

    // ปลดโต๊ะถ้า refund ครบ
    if (allRefunded && order.tableId && !(await tableHasOtherOpenBill(tx, order.tableId, orderId))) {
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
          ...(order.taxInvoiceNo ? { taxInvoiceIssued: true, taxInvoiceNo: order.taxInvoiceNo } : {}),
        },
      },
    });

    io.to(`store:${order.storeId}`).emit('order:refunded', { id: orderId, partial: !allRefunded });

    return {
      order: updated,
      refundedAmount: totalRefunded.toNumber(),
      fullyRefunded: allRefunded,
      taxInvoiceIssued: !!order.taxInvoiceNo,
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
export async function deleteParked(id: string, userId: string, io: Server, storeId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, ...(storeId ? { storeId } : {}) } });
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
  const prefix = `ORD-${today}-`;
  // Two bills created at the same moment (a busy lunch, or a mobile retry) used
  // to read the same count and collide on the (storeId, orderNumber) unique
  // index → 500. Serialise numbering per store for the rest of this transaction
  // with a transaction-scoped advisory lock, and derive the next number from the
  // highest one already issued today (a count would reuse a number after a
  // parked order is deleted).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ordnum:' + storeId}))`;
  const last = await tx.order.findFirst({
    where: { storeId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  const lastSeq = last ? parseInt(last.orderNumber.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, '0')}`;
}
