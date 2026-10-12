/**
 * Table bill operations on OPEN (unpaid) bills — move to another table, merge
 * bills, split items into a new bill. Pure bookkeeping: no stock change (the
 * food has already been fired/deducted), no kitchen re-print (a kitchen ticket
 * re-derives its table from the order, so tickets show the new table).
 *
 * Every operation runs in one transaction that first row-locks the bill(s)
 * involved (FOR UPDATE, in id order) so concurrent moves/merges/splits/settles
 * of the same bill serialise instead of racing.
 */
import { Server } from 'socket.io';
import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequest, NotFound } from '../../utils/errors';
import { generateOrderNumber, tableHasOtherOpenBill } from './order.service';
import { computeTotals, OPEN_STATUSES, ORDER_INCLUDE } from './order-tab.service';
import { joinNotes } from './checkout-discounts';
import { recordIdempotencyKey, moveScope, mergeScope, splitScope } from './idempotency';

type Tx = Prisma.TransactionClient;
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const STATUS_RANK: Record<string, number> = { PENDING: 0, PREPARING: 1, READY: 2 };

/** Lock the given orders (sorted by id → no deadlocks between concurrent ops). */
async function lockOrders(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
  }
}

/** Load an order of this store that is still an open, unpaid dine-in bill. */
async function loadOpenBill(tx: Tx, storeId: string, id: string, what = 'บิล') {
  const order = await tx.order.findFirst({
    where: { id, storeId },
    include: { items: true, payments: true },
  });
  if (!order) throw NotFound('Order not found');
  if (order.payments.length > 0 || !OPEN_STATUSES.includes(order.status)) {
    throw BadRequest(`${what}นี้ปิดแล้ว/ชำระแล้ว ทำรายการไม่ได้`, 'BILL_NOT_OPEN');
  }
  return order;
}

/** The target table must exist in this store and carry no open bill. */
async function loadFreeTable(tx: Tx, storeId: string, tableId: string, exceptOrderId?: string) {
  const table = await tx.table.findFirst({ where: { id: tableId, storeId } });
  if (!table) throw NotFound('Table not found');
  const busy = await tx.order.count({
    where: {
      tableId, id: exceptOrderId ? { not: exceptOrderId } : undefined,
      status: { in: OPEN_STATUSES }, payments: { none: {} },
    },
  });
  if (busy > 0) throw BadRequest(`โต๊ะ ${table.number} มีบิลที่ยังไม่ชำระอยู่แล้ว`, 'TABLE_HAS_OPEN_BILL');
  return table;
}

/** Free `tableId` unless another open bill (other than `exceptOrderIds`) is still on it. */
async function releaseTableIfIdle(tx: Tx, tableId: string | null, exceptOrderIds: string[]) {
  if (!tableId) return null;
  const others = await tx.order.count({
    where: { tableId, id: { notIn: exceptOrderIds }, status: { in: OPEN_STATUSES }, payments: { none: {} } },
  });
  if (others > 0) return null;
  return tx.table.update({ where: { id: tableId }, data: { status: 'AVAILABLE', occupiedAt: null } });
}

function emitTables(io: Server, storeId: string, tables: (any | null)[]) {
  for (const t of tables) if (t) io.to(`store:${storeId}`).emit('table:updated', t);
}

// ------------------------------------------------------------------- MOVE

/**
 * Move an open bill to another table. The target must have no open bill. The
 * old table is freed (unless a split-off bill is still open there); the new one
 * becomes OCCUPIED keeping the old table's `occupiedAt` (seating time travels
 * with the guests), or "now" if the bill had no table.
 */
export async function moveTable(
  orderId: string,
  input: { storeId: string; userId: string; tableId: string; idempotencyKey?: string },
  io: Server,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockOrders(tx, [orderId]);
    if (input.idempotencyKey) await recordIdempotencyKey(tx, input.storeId, moveScope(orderId), input.idempotencyKey, orderId);
    const order = await loadOpenBill(tx, input.storeId, orderId);
    if (order.tableId === input.tableId) throw BadRequest('บิลนี้อยู่โต๊ะนี้อยู่แล้ว', 'SAME_TABLE');
    const target = await loadFreeTable(tx, input.storeId, input.tableId, orderId);

    const oldTable = order.tableId
      ? await tx.table.findUnique({ where: { id: order.tableId } })
      : null;
    const updated = await tx.order.update({
      where: { id: orderId }, data: { tableId: target.id }, include: ORDER_INCLUDE,
    });
    const newTable = await tx.table.update({
      where: { id: target.id },
      data: { status: 'OCCUPIED', occupiedAt: oldTable?.occupiedAt ?? new Date() },
    });
    const freed = await releaseTableIfIdle(tx, order.tableId, [orderId]);

    await tx.activityLog.create({
      data: {
        userId: input.userId, action: 'MOVE_TABLE',
        metadata: {
          orderId, orderNumber: order.orderNumber,
          fromTableId: order.tableId, fromTable: oldTable?.number ?? null,
          toTableId: target.id, toTable: target.number,
        },
      },
    });
    return { updated, tables: [newTable, freed] };
  });

  const { storeId } = input;
  emitTables(io, storeId, result.tables);
  io.to(`store:${storeId}:kds`).emit('kds:new', result.updated);
  io.to(`store:${storeId}`).emit('order:status', { id: orderId, status: result.updated.status });
  return result.updated;
}

// ------------------------------------------------------------------ MERGE

/**
 * Merge other open bills into `orderId` (the target).
 *  - items are re-pointed at the target (kitchen state / createdAt untouched);
 *  - subtotal = sum of the bills' subtotals; manual order-level `discount` is
 *    SUMMED (it is a plain baht amount, capped by computeTotals); guestCount is
 *    SUMMED (null if no bill had one); tax/service/total recomputed with
 *    computeTotals;
 *  - SAFE OPTION for discounts: the merge is REFUSED (MERGE_HAS_DISCOUNT) if any
 *    involved bill already carries a promotion, points/stamps redemption or an
 *    attached reward code — those are tied to one bill's contents;
 *  - sources become CANCELLED with notes 'รวมเข้า #<target>' and zeroed totals
 *    (no restock — the items live on in the target), their tables are freed;
 *  - target status = the least-advanced of all bills (a READY bill that absorbs a
 *    PENDING one goes back to PENDING so the kitchen sees it); target adopts a
 *    source's customer if it has none.
 */
export async function mergeOrders(
  orderId: string,
  input: { storeId: string; userId: string; sourceOrderIds: string[]; idempotencyKey?: string },
  io: Server,
) {
  const sourceIds = [...new Set(input.sourceOrderIds)];
  if (sourceIds.length === 0) throw BadRequest('ต้องระบุบิลที่จะรวม', 'NO_SOURCE');
  if (sourceIds.includes(orderId)) throw BadRequest('รวมบิลเข้ากับตัวเองไม่ได้', 'MERGE_SELF');

  const result = await prisma.$transaction(async (tx) => {
    await lockOrders(tx, [orderId, ...sourceIds]);
    if (input.idempotencyKey) await recordIdempotencyKey(tx, input.storeId, mergeScope(orderId), input.idempotencyKey, orderId);
    const target = await loadOpenBill(tx, input.storeId, orderId, 'บิลปลายทาง');
    const sources = [];
    for (const sid of sourceIds) sources.push(await loadOpenBill(tx, input.storeId, sid, `บิลต้นทาง`));

    const all = [target, ...sources];
    const redemptions = await tx.rewardRedemption.count({ where: { orderId: { in: all.map((o) => o.id) } } });
    const hasPerk = all.some((o) =>
      o.promotionId || Number(o.promotionDiscount) > 0 || o.pointsRedeemed > 0 || o.stampsRedeemed > 0);
    if (hasPerk || redemptions > 0) {
      throw BadRequest('มีบิลที่ใช้โปรโมชั่น/คะแนน/รางวัลแล้ว รวมบิลไม่ได้ — ยกเลิกส่วนลดก่อน', 'MERGE_HAS_DISCOUNT');
    }

    await tx.orderItem.updateMany({ where: { orderId: { in: sourceIds } }, data: { orderId } });

    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const subtotal = all.reduce((s, o) => s.plus(o.subtotal), D(0));
    const discount = all.reduce((s, o) => s.plus(o.discount), D(0));
    const { tax, serviceCharge, total } = computeTotals(subtotal, discount, store);
    const guests = all.map((o) => o.guestCount).filter((g): g is number => g != null);
    const rank = Math.min(...all.map((o) => STATUS_RANK[o.status] ?? 0));
    const status = (Object.keys(STATUS_RANK).find((k) => STATUS_RANK[k] === rank) ?? 'PENDING') as OrderStatus;
    const customerId = target.customerId ?? sources.find((s) => s.customerId)?.customerId ?? null;
    const sourceNotes = sources.map((s) => s.notes?.trim() ? `${s.orderNumber}: ${s.notes.trim()}` : undefined);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal, discount, tax, serviceCharge, total, status, customerId,
        guestCount: guests.length ? guests.reduce((a, b) => a + b, 0) : null,
        notes: joinNotes(target.notes, ...sourceNotes) ?? null,
      },
      include: ORDER_INCLUDE,
    });

    const freedTables: any[] = [];
    for (const s of sources) {
      await tx.order.update({
        where: { id: s.id },
        data: {
          status: 'CANCELLED', notes: joinNotes(s.notes, `รวมเข้า #${target.orderNumber}`) ?? null,
          subtotal: 0, discount: 0, tax: 0, serviceCharge: 0, total: 0,
        },
      });
    }
    const srcTableIds = [...new Set(sources.map((s) => s.tableId).filter((t): t is string => !!t))];
    for (const tid of srcTableIds) {
      // The target's own table (same table, two bills) must not be freed.
      if (tid === target.tableId) continue;
      freedTables.push(await releaseTableIfIdle(tx, tid, [orderId, ...sourceIds]));
    }

    await tx.activityLog.create({
      data: {
        userId: input.userId, action: 'MERGE_ORDERS',
        metadata: {
          targetOrderId: orderId, targetOrderNumber: target.orderNumber,
          sources: sources.map((s) => ({ id: s.id, orderNumber: s.orderNumber, total: Number(s.total) })),
          newTotal: total.toNumber(),
        },
      },
    });
    return { updated, freedTables, sourceIds };
  });

  const { storeId } = input;
  emitTables(io, storeId, result.freedTables);
  io.to(`store:${storeId}:kds`).emit('kds:new', result.updated);
  io.to(`store:${storeId}`).emit('order:status', { id: orderId, status: result.updated.status });
  for (const sid of result.sourceIds) {
    io.to(`store:${storeId}:kds`).emit('kds:status', { id: sid, status: 'CANCELLED' });
    io.to(`store:${storeId}`).emit('order:status', { id: sid, status: 'CANCELLED' });
    io.of('/self-order').to(`order:${sid}`).emit('order:status', { status: 'CANCELLED' });
  }
  io.of('/display').to(`store:${storeId}:display`).emit('ready-board:update');
  return result.updated;
}

// ------------------------------------------------------------------ SPLIT

/**
 * Split item quantities off an open bill into a NEW open bill.
 *  - a line moved in full (and never voided) is re-pointed to the new bill; a
 *    partial qty creates a new OrderItem copy (same createdAt/notes/variants,
 *    line discount prorated per unit, rounded to 2dp) and shrinks the original;
 *  - only live qty (quantity − refundedQty) can be split; splitting off ALL live
 *    qty is refused (SPLIT_ALL);
 *  - the order-level (manual) discount stays on the ORIGINAL bill; the new bill
 *    starts with 0 discount and guestCount null; both bills' subtotal/tax/
 *    service/total are recomputed with computeTotals;
 *  - the new bill is at the same table unless `tableId` is given (that table
 *    must have no open bill and becomes OCCUPIED, keeping occupiedAt);
 *  - new bill keeps the original's cashier, customer, type and status.
 */
export async function splitOrder(
  orderId: string,
  input: {
    storeId: string; userId: string; items: { orderItemId: string; qty: number }[];
    tableId?: string; idempotencyKey?: string;
  },
  io: Server,
) {
  if (!input.items?.length) throw BadRequest('ต้องเลือกรายการที่จะแยก', 'NO_ITEMS');
  const ids = input.items.map((i) => i.orderItemId);
  if (new Set(ids).size !== ids.length) throw BadRequest('รายการซ้ำกัน', 'DUPLICATE_ITEM');
  if (input.items.some((i) => !Number.isInteger(i.qty) || i.qty <= 0)) {
    throw BadRequest('จำนวนที่แยกต้องเป็นจำนวนเต็มมากกว่า 0', 'BAD_QTY');
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockOrders(tx, [orderId]);
    if (input.idempotencyKey) await recordIdempotencyKey(tx, input.storeId, splitScope(orderId), input.idempotencyKey, orderId);
    const order = await loadOpenBill(tx, input.storeId, orderId);

    let newTableId = order.tableId;
    let occupied: any = null;
    if (input.tableId && input.tableId !== order.tableId) {
      const target = await loadFreeTable(tx, input.storeId, input.tableId);
      const oldTable = order.tableId ? await tx.table.findUnique({ where: { id: order.tableId } }) : null;
      occupied = await tx.table.update({
        where: { id: target.id }, data: { status: 'OCCUPIED', occupiedAt: oldTable?.occupiedAt ?? new Date() },
      });
      newTableId = target.id;
    }

    // Validate every line first.
    const plan = input.items.map((req) => {
      const item = order.items.find((i) => i.id === req.orderItemId);
      if (!item) throw BadRequest('ไม่พบรายการนี้ในบิล', 'ITEM_NOT_FOUND');
      const live = item.quantity - item.refundedQty;
      if (req.qty > live) {
        throw BadRequest(live <= 0 ? 'รายการนี้ถูกยกเลิก/คืนเงินแล้ว แยกไม่ได้' : `แยกได้สูงสุด ${live} รายการ`, 'QTY_EXCEEDS');
      }
      return { item, qty: req.qty };
    });
    const liveTotal = order.items.reduce((s, i) => s + (i.quantity - i.refundedQty), 0);
    const moving = plan.reduce((s, p) => s + p.qty, 0);
    if (moving >= liveTotal) throw BadRequest('แยกรายการทั้งหมดออกจากบิลไม่ได้ — ใช้ย้ายโต๊ะแทน', 'SPLIT_ALL');

    const orderNumber = await generateOrderNumber(tx, input.storeId);
    const created = await tx.order.create({
      data: {
        orderNumber, storeId: input.storeId, cashierId: order.cashierId, customerId: order.customerId,
        tableId: newTableId, type: order.type, status: order.status,
        subtotal: 0, discount: 0, tax: 0, serviceCharge: 0, total: 0,
        notes: `แยกจาก #${order.orderNumber}`,
      },
    });

    let movedValue = D(0);
    for (const { item, qty } of plan) {
      const unitDiscount = D(item.discount).div(item.quantity);
      if (qty === item.quantity && item.refundedQty === 0) {
        await tx.orderItem.update({ where: { id: item.id }, data: { orderId: created.id } });
        movedValue = movedValue.plus(D(item.unitPrice).mul(qty).minus(item.discount));
      } else {
        const moveDisc = unitDiscount.mul(qty).toDecimalPlaces(2);
        await tx.orderItem.create({
          data: {
            orderId: created.id, productId: item.productId, quantity: qty, unitPrice: item.unitPrice,
            discount: moveDisc, notes: item.notes, createdAt: item.createdAt,
            variants: item.variants ?? Prisma.JsonNull,
          },
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - qty, discount: D(item.discount).minus(moveDisc) },
        });
        movedValue = movedValue.plus(D(item.unitPrice).mul(qty).minus(moveDisc));
      }
    }

    const store = await tx.store.findUniqueOrThrow({ where: { id: input.storeId } });
    const origSubtotal = Prisma.Decimal.max(0, D(order.subtotal).minus(movedValue));
    const origT = computeTotals(origSubtotal, D(order.discount), store);
    const newT = computeTotals(movedValue, D(0), store);

    const original = await tx.order.update({
      where: { id: orderId },
      data: { subtotal: origSubtotal, tax: origT.tax, serviceCharge: origT.serviceCharge, total: origT.total },
      include: ORDER_INCLUDE,
    });
    const newOrder = await tx.order.update({
      where: { id: created.id },
      data: { subtotal: movedValue, tax: newT.tax, serviceCharge: newT.serviceCharge, total: newT.total },
      include: ORDER_INCLUDE,
    });
    // Replays of this request resolve to the NEW bill.
    if (input.idempotencyKey) {
      await tx.idempotencyKey.updateMany({
        where: { storeId: input.storeId, scope: splitScope(orderId), key: input.idempotencyKey },
        data: { orderId: created.id },
      });
    }

    await tx.activityLog.create({
      data: {
        userId: input.userId, action: 'SPLIT_ORDER',
        metadata: {
          orderId, orderNumber: order.orderNumber, newOrderId: created.id, newOrderNumber: orderNumber,
          items: input.items, movedValue: movedValue.toNumber(), toTableId: newTableId,
        },
      },
    });
    return { original, newOrder, occupied };
  });

  const { storeId } = input;
  emitTables(io, storeId, [result.occupied]);
  io.to(`store:${storeId}:kds`).emit('kds:new', result.original);
  io.to(`store:${storeId}:kds`).emit('kds:new', result.newOrder);
  io.to(`store:${storeId}`).emit('order:status', { id: orderId, status: result.original.status });
  io.to(`store:${storeId}`).emit('order:status', { id: result.newOrder.id, status: result.newOrder.status });
  return { order: result.original, newOrder: result.newOrder };
}
