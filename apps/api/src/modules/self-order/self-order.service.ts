/**
 * QR self-order: a customer scans a table's QR code, builds a cart on their
 * own phone (no login), and submits it. It's merged straight into the
 * table's open tab via the existing order-tab flow (openTab / addRound) and
 * hits the kitchen immediately — no staff approval step — so pricing/stock/
 * recipe logic stays in one place without adding a wait for the customer.
 */
import { Server } from 'socket.io';
import { PointTxType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import * as orderTabService from '../orders/order-tab.service';
import { recordPoints, recordStamps, calcEarnedPoints, pointsEnabled, stampsEnabled } from '../orders/points.service';

export interface SelfOrderItemInput {
  productId: string;
  quantity: number;
  notes?: string;
}

async function findTableByQr(qrCode: string) {
  const table = await prisma.table.findUnique({
    where: { qrCode },
    include: { store: true },
  });
  if (!table) throw NotFound('Table not found');
  return table;
}

/** Public menu for the table's store — active, sellable products only. */
export async function getMenu(qrCode: string) {
  const table = await findTableByQr(qrCode);

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { storeId: table.storeId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.findMany({
      where: { storeId: table.storeId, isActive: true, isIngredient: false },
      include: { variants: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    store: {
      id: table.store.id,
      name: table.store.name,
      logo: table.store.logo,
      loyaltyMode: table.store.loyaltyMode,
      pointsEarnBaht: table.store.pointsEarnBaht,
      stampsPerReward: table.store.stampsPerReward,
      stampRewardValue: table.store.stampRewardValue,
      stampRewardName: table.store.stampRewardName,
    },
    table: { id: table.id, number: table.number },
    categories,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      sellingPrice: p.sellingPrice,
      categoryId: p.categoryId,
      variants: p.variants,
    })),
  };
}

interface SubmitInput {
  items: SelfOrderItemInput[];
  note?: string;
  customerId?: string;
}

/** Customer submits their self-built cart — processed automatically, fires to kitchen, sets table state. */
export async function submitRequest(qrCode: string, input: SubmitInput, io: Server) {
  if (!input.items?.length) throw BadRequest('No items');
  const table = await findTableByQr(qrCode);

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId: table.storeId, isActive: true, isIngredient: false },
  });
  if (products.length !== new Set(productIds).size) {
    throw BadRequest('Some items are no longer available');
  }
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw BadRequest('Invalid quantity');
    }
  }

  // Find a cashier/admin/owner of the store to associate with the order
  let cashier = await prisma.user.findFirst({
    where: { storeId: table.storeId, role: { in: ['OWNER', 'ADMIN', 'CASHIER'] }, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  // Fallback to any active user if no cashier-capable user is found
  if (!cashier) {
    cashier = await prisma.user.findFirst({
      where: { storeId: table.storeId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  // Fallback to any user at all in the store
  if (!cashier) {
    cashier = await prisma.user.findFirst({
      where: { storeId: table.storeId },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!cashier) {
    throw BadRequest('No staff member available to process this self-order');
  }
  const cashierId = cashier.id;

  const items = input.items as unknown as SelfOrderItemInput[];
  const existing = await orderTabService.getOpenByTable(table.storeId, table.id);

  let orderId: string;
  if (existing) {
    await orderTabService.addRound(
      existing.id,
      { storeId: table.storeId, cashierId, items },
      io
    );
    orderId = existing.id;
    if (input.customerId && !existing.customerId) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { customerId: input.customerId },
      });
    }
  } else {
    const created = await orderTabService.openTab(
      {
        storeId: table.storeId,
        cashierId,
        tableId: table.id,
        type: 'DINE_IN',
        items,
        notes: input.note,
        customerId: input.customerId,
      },
      io
    );
    orderId = created.id;
  }

  const request = await prisma.selfOrderRequest.create({
    data: {
      storeId: table.storeId,
      tableId: table.id,
      orderId,
      items: input.items as any,
      note: input.note,
      status: 'APPROVED',
      resolvedAt: new Date(),
      customerId: input.customerId || null,
    },
  });

  return request;
}

/** Customer-side polling fallback for live kitchen status (in case the socket connection drops). */
export async function getStatus(id: string) {
  const request = await prisma.selfOrderRequest.findUnique({
    where: { id },
    select: { id: true, status: true, orderId: true, order: { select: { status: true } } },
  });
  if (!request) return null;
  const { order, ...rest } = request;
  return { ...rest, orderStatus: order?.status ?? null };
}

/**
 * "Call for the bill" — a plain notification for staff to come collect
 * payment; it never touches money itself (settling still goes through the
 * normal settle-tab flow). Deduped per table: tapping again while one is
 * already PENDING just returns the existing request instead of spamming
 * staff with duplicates.
 */
export async function callForBill(qrCode: string, io: Server) {
  const table = await findTableByQr(qrCode);

  const existing = await prisma.billCallRequest.findFirst({
    where: { tableId: table.id, status: 'PENDING' },
  });
  if (existing) return existing;

  const request = await prisma.billCallRequest.create({
    data: { storeId: table.storeId, tableId: table.id },
  });

  io.to(`store:${table.storeId}`).emit('billcall:new', {
    id: request.id,
    tableId: table.id,
    tableNumber: table.number,
  });

  return request;
}

/** Staff-side: pending bill calls for the store, oldest first. */
export function listPendingBillCalls(storeId: string) {
  return prisma.billCallRequest.findMany({
    where: { storeId, status: 'PENDING' },
    include: { table: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function acknowledgeBillCall(id: string, storeId: string, io: Server) {
  const request = await prisma.billCallRequest.findUnique({ where: { id } });
  if (!request) throw NotFound('Request not found');
  if (request.storeId !== storeId) throw BadRequest('Wrong store');
  if (request.status !== 'PENDING') throw BadRequest('Request already resolved');

  const updated = await prisma.billCallRequest.update({
    where: { id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  });

  io.to(`store:${storeId}`).emit('billcall:update', updated);
  return updated;
}

/** Public: Lookup a customer member by phone in the table's store. */
export async function lookupCustomer(qrCode: string, phone: string) {
  const table = await findTableByQr(qrCode);
  const customer = await prisma.customer.findFirst({
    where: { storeId: table.storeId, phone, isActive: true },
    select: { id: true, name: true, phone: true, points: true, stamps: true },
  });
  return customer || null;
}

/** Public: Register a new customer member in the table's store. */
export async function registerCustomer(qrCode: string, name: string, phone: string, email?: string) {
  const table = await findTableByQr(qrCode);

  const existing = await prisma.customer.findFirst({
    where: { storeId: table.storeId, phone, isActive: true },
  });
  if (existing) {
    throw BadRequest('เบอร์โทรศัพท์นี้ลงทะเบียนสมาชิกไว้แล้ว');
  }

  const customer = await prisma.customer.create({
    data: {
      storeId: table.storeId,
      name,
      phone,
      email: email || null,
      points: 0,
      stamps: 0,
    },
  });

  return customer;
}

/** Public: Get public details and loyalty config of a store */
export async function getStorePublicInfo(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      logo: true,
      loyaltyMode: true,
      pointsEarnBaht: true,
      stampsPerReward: true,
      stampRewardValue: true,
      stampRewardName: true,
    },
  });
  if (!store) throw NotFound('Store not found');
  return store;
}

/** Public: Lookup customer by storeId and phone */
export async function lookupCustomerByStore(storeId: string, phone: string) {
  const customer = await prisma.customer.findFirst({
    where: { storeId, phone, isActive: true },
    select: { id: true, name: true, phone: true, points: true, stamps: true },
  });
  return customer || null;
}

/** Public: Register customer by storeId, name, phone, email */
export async function registerCustomerByStore(storeId: string, name: string, phone: string, email?: string) {
  const existing = await prisma.customer.findFirst({
    where: { storeId, phone, isActive: true },
  });
  if (existing) {
    throw BadRequest('เบอร์โทรศัพท์นี้ลงทะเบียนสมาชิกไว้แล้ว');
  }

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name,
      phone,
      email: email || null,
      points: 0,
      stamps: 0,
    },
  });

  return customer;
}

/**
 * Public: claim the points/stamps for a paid order via the QR code printed
 * on its receipt — the self-service fallback for when a cashier didn't
 * attach a member at checkout. Identifies the customer by phone (registers
 * them on the spot if `name` is given and none exists yet), then credits
 * that ONE order's earn exactly as checkout would have — safe to expose
 * publicly because it's scoped to a specific already-paid order and is a
 * one-time claim (order.customerId being set already blocks re-claiming).
 */
export async function claimOrderPoints(orderId: string, phone: string, name?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, store: true },
  });
  if (!order) throw NotFound('ไม่พบบิลนี้');
  if (order.payments.length === 0) throw BadRequest('บิลนี้ยังไม่ได้ชำระเงิน');
  if (order.customerId) throw BadRequest('บิลนี้สะสมแต้มไปแล้ว', 'ALREADY_CLAIMED');
  if (order.store.loyaltyMode === 'OFF') throw BadRequest('ร้านนี้ยังไม่เปิดระบบสะสมแต้ม');

  const store = order.store;

  return prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { storeId: order.storeId, phone, isActive: true },
    });
    if (!customer) {
      if (!name?.trim()) throw BadRequest('กรุณากรอกชื่อเพื่อสมัครสมาชิกใหม่', 'NEEDS_NAME');
      customer = await tx.customer.create({
        data: { storeId: order.storeId, name: name.trim(), phone, points: 0, stamps: 0 },
      });
    }

    // Re-check under the transaction — guards a race if the receipt QR is
    // scanned twice at nearly the same moment.
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { customerId: true } });
    if (fresh.customerId) throw BadRequest('บิลนี้สะสมแต้มไปแล้ว', 'ALREADY_CLAIMED');

    const earnedPoints = pointsEnabled(store.loyaltyMode)
      ? calcEarnedPoints(Number(order.total), store.pointsEarnBaht)
      : 0;
    const earnedStamps = stampsEnabled(store.loyaltyMode) ? 1 : 0;

    await tx.order.update({
      where: { id: order.id },
      data: { customerId: customer.id, pointsEarned: earnedPoints, stampsEarned: earnedStamps },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: { visitCount: { increment: 1 }, totalSpent: { increment: order.total }, lastVisitAt: new Date() },
    });

    let pointsBalance = customer.points;
    let stampsBalance = customer.stamps;
    if (earnedPoints > 0) {
      pointsBalance = await recordPoints(tx, {
        storeId: order.storeId,
        customerId: customer.id,
        type: PointTxType.EARN,
        points: earnedPoints,
        orderId: order.id,
        note: `ได้แต้มจากบิล ${order.orderNumber} (สแกน QR ท้ายใบเสร็จ)`,
      });
    }
    if (earnedStamps > 0) {
      stampsBalance = await recordStamps(tx, {
        storeId: order.storeId,
        customerId: customer.id,
        type: PointTxType.STAMP_EARN,
        stamps: earnedStamps,
        orderId: order.id,
        note: `ได้ดวงจากบิล ${order.orderNumber} (สแกน QR ท้ายใบเสร็จ)`,
      });
    }

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        points: pointsBalance,
        stamps: stampsBalance,
      },
      earnedPoints,
      earnedStamps,
      orderNumber: order.orderNumber,
    };
  });
}
