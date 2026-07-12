/**
 * QR self-order: a customer scans a table's QR code, builds a cart on their
 * own phone (no login), and submits it. Nothing touches stock, the kitchen,
 * or the table's bill until a staff member approves it — approval merges the
 * items into the table's open tab via the existing order-tab flow (openTab /
 * addRound), so pricing/stock/recipe logic stays in one place. This keeps a
 * prank or mistaken submission from ever reaching the kitchen unattended.
 */
import { Server } from 'socket.io';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import * as orderTabService from '../orders/order-tab.service';

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
    store: { id: table.store.id, name: table.store.name, logo: table.store.logo },
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
}

/** Customer submits their self-built cart — lands as PENDING, staff must approve. */
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

  const request = await prisma.selfOrderRequest.create({
    data: {
      storeId: table.storeId,
      tableId: table.id,
      items: input.items as any,
      note: input.note,
    },
  });

  io.to(`store:${table.storeId}`).emit('selforder:new', {
    id: request.id,
    tableId: table.id,
    tableNumber: table.number,
    items: input.items,
    note: input.note,
  });

  return request;
}

/** Customer-side polling fallback (in case the socket connection drops). */
export function getStatus(id: string) {
  return prisma.selfOrderRequest.findUnique({
    where: { id },
    select: { id: true, status: true, rejectReason: true },
  });
}

/** Staff-side: pending requests for the store, oldest first, items enriched with product names. */
export async function listPending(storeId: string) {
  const requests = await prisma.selfOrderRequest.findMany({
    where: { storeId, status: 'PENDING' },
    include: { table: true },
    orderBy: { createdAt: 'asc' },
  });
  if (requests.length === 0) return requests;

  const productIds = [
    ...new Set(
      requests.flatMap((r) => (r.items as unknown as SelfOrderItemInput[]).map((i) => i.productId))
    ),
  ];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return requests.map((r) => ({
    ...r,
    items: (r.items as unknown as SelfOrderItemInput[]).map((i) => ({
      ...i,
      name: nameById.get(i.productId) || i.productId,
    })),
  }));
}

interface ApproveInput {
  storeId: string;
  cashierId: string;
}

/** Approve — merge into the table's open tab (or open a new one), then mark resolved. */
export async function approve(id: string, input: ApproveInput, io: Server) {
  const request = await prisma.selfOrderRequest.findUnique({ where: { id } });
  if (!request) throw NotFound('Request not found');
  if (request.storeId !== input.storeId) throw BadRequest('Wrong store');
  if (request.status !== 'PENDING') throw BadRequest('Request already resolved');

  const items = request.items as unknown as SelfOrderItemInput[];
  const existing = await orderTabService.getOpenByTable(input.storeId, request.tableId);

  if (existing) {
    await orderTabService.addRound(
      existing.id,
      { storeId: input.storeId, cashierId: input.cashierId, items },
      io
    );
  } else {
    await orderTabService.openTab(
      {
        storeId: input.storeId,
        cashierId: input.cashierId,
        tableId: request.tableId,
        type: 'DINE_IN',
        items,
      },
      io
    );
  }

  const updated = await prisma.selfOrderRequest.update({
    where: { id },
    data: { status: 'APPROVED', resolvedAt: new Date() },
  });

  io.of('/self-order').to(`req:${id}`).emit('resolved', { status: 'APPROVED' });
  io.to(`store:${input.storeId}`).emit('selforder:update', updated);
  return updated;
}

interface RejectInput {
  storeId: string;
  reason?: string;
}

export async function reject(id: string, input: RejectInput, io: Server) {
  const request = await prisma.selfOrderRequest.findUnique({ where: { id } });
  if (!request) throw NotFound('Request not found');
  if (request.storeId !== input.storeId) throw BadRequest('Wrong store');
  if (request.status !== 'PENDING') throw BadRequest('Request already resolved');

  const updated = await prisma.selfOrderRequest.update({
    where: { id },
    data: { status: 'REJECTED', rejectReason: input.reason, resolvedAt: new Date() },
  });

  io.of('/self-order').to(`req:${id}`).emit('resolved', {
    status: 'REJECTED',
    rejectReason: input.reason,
  });
  io.to(`store:${input.storeId}`).emit('selforder:update', updated);
  return updated;
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
