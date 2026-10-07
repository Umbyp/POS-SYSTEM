/**
 * Print stations + print-job queue.
 *
 * Network printers live on the shop's LAN, which a (possibly off-site) backend
 * can't reach. So the API never opens a TCP connection for these: it records a
 * PrintJob row and pings the store's socket room ('print:job'); a staff phone
 * on the same WiFi (apps/mobile-staff usePrintQueue) fetches pending jobs,
 * prints over TCP:9100 and reports back via complete/fail.
 *
 * PrintJob has no payload column, so what to print is re-derived when the job
 * is fetched: receipts = the whole order; kitchen tickets = the order items of
 * that "round" (see deriveRound in print-routing.ts) filtered by the
 * printer's categoryIds.
 */
import type { Server } from 'socket.io';
import { PrinterRole, PrintJobStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { BadRequest, NotFound } from '../../utils/errors';
import { printKitchenTicket as legacyPrintKitchenTicket, type KitchenTicketItem } from '../orders/escpos';
import {
  planKitchenPrinters, planReceiptPrinters, deriveRound, itemsInRound, filterItemsForPrinter,
} from './print-routing';

export const MAX_ATTEMPTS = 20;
const RETRY_AFTER_FAIL_MS = 15_000;
const LEASE_MS = 30_000;
const STALE_JOB_MS = 6 * 60 * 60_000; // don't print a 6h-old ticket when the printer comes back
const TEST_ORDER_ID = 'TEST';

// Which jobs a phone is currently working on / backing off from. In-memory is
// fine: it only de-duplicates between phones polling the same API process; a
// restart at worst lets one job print twice.
const leases = new Map<string, number>();

export interface PrinterInput {
  name: string;
  ip: string;
  port?: number;
  role?: PrinterRole;
  autoPrint?: boolean;
  copies?: number;
  categoryIds?: string[];
  isActive?: boolean;
}

// ---------------------------------------------------------------- CRUD

export async function listPrinters(storeId: string) {
  const [printers, jobs] = await Promise.all([
    prisma.printer.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } }),
    prisma.printJob.findMany({
      where: { storeId, status: PrintJobStatus.PENDING, attempts: { gt: 0 } },
      select: { printerId: true, createdAt: true, error: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return printers.map((p) => {
    const stuck = jobs.filter((j) => j.printerId === p.id);
    return {
      ...p,
      status: stuck.length > 0 ? ('error' as const) : ('ok' as const),
      stuckJobs: stuck.length,
      lastError: stuck.length > 0 ? stuck[stuck.length - 1].error : null,
      failingSince: stuck.length > 0 ? stuck[0].createdAt : null,
    };
  });
}

export function createPrinter(storeId: string, input: PrinterInput) {
  return prisma.printer.create({
    data: {
      storeId,
      name: input.name,
      ip: input.ip,
      port: input.port ?? 9100,
      role: input.role ?? PrinterRole.KITCHEN,
      autoPrint: input.autoPrint ?? true,
      copies: input.copies ?? 1,
      categoryIds: input.categoryIds ?? [],
      isActive: input.isActive ?? true,
    },
  });
}

async function ownedPrinter(storeId: string, id: string) {
  const p = await prisma.printer.findFirst({ where: { id, storeId } });
  if (!p) throw NotFound('ไม่พบเครื่องพิมพ์');
  return p;
}

export async function updatePrinter(storeId: string, id: string, input: Partial<PrinterInput>) {
  await ownedPrinter(storeId, id);
  return prisma.printer.update({ where: { id }, data: input });
}

export async function deletePrinter(storeId: string, id: string) {
  await ownedPrinter(storeId, id);
  await prisma.printer.delete({ where: { id } });
}

// ---------------------------------------------------------------- enqueue

function notify(io: Server | undefined, storeId: string, jobIds: string[]) {
  if (io && jobIds.length > 0) io.to(`store:${storeId}`).emit('print:job', { jobIds });
}

/**
 * Create kitchen-ticket jobs for one round of an order. `itemIds` = the items
 * fired in this round (omit = every item, i.e. a brand-new order). Idempotent
 * per (order, printer, round).
 * Returns false when the store has no Printer rows at all (caller falls back
 * to the legacy Store/env printer).
 */
export async function enqueueKitchenJobs(
  order: { id: string; storeId: string; items: any[] },
  opts: { itemIds?: string[]; io?: Server },
): Promise<boolean> {
  const printers = await prisma.printer.findMany({ where: { storeId: order.storeId } });
  if (printers.length === 0) return false;

  const roundItems = order.items.filter((it) => !opts.itemIds || opts.itemIds.includes(it.id));
  if (roundItems.length === 0) return true;
  const boundary = new Date(Math.max(...roundItems.map((it) => new Date(it.createdAt).getTime())));

  const plan = planKitchenPrinters(
    printers,
    roundItems.map((it) => ({ id: it.id, categoryId: it.product?.categoryId ?? null })),
  );
  if (plan.length === 0) return true;

  const existing = await prisma.printJob.findMany({
    where: { orderId: order.id, kind: PrinterRole.KITCHEN, createdAt: boundary },
    select: { printerId: true },
  });
  const have = new Set(existing.map((e) => e.printerId));
  const fresh = plan.filter((x) => !have.has(x.printer.id));
  if (fresh.length === 0) return true;

  const jobs = await prisma.$transaction(
    fresh.map((x) =>
      prisma.printJob.create({
        data: {
          storeId: order.storeId, printerId: x.printer.id, orderId: order.id,
          kind: PrinterRole.KITCHEN, createdAt: boundary,
        },
      }),
    ),
  );
  notify(opts.io, order.storeId, jobs.map((j) => j.id));
  return true;
}

/** Customer receipt on every active auto-print RECEIPT printer. Idempotent per (order, printer). */
export async function enqueueReceiptJobs(order: { id: string; storeId: string }, io?: Server): Promise<boolean> {
  const printers = await prisma.printer.findMany({ where: { storeId: order.storeId } });
  if (printers.length === 0) return false;
  const targets = planReceiptPrinters(printers);
  if (targets.length === 0) return true;

  const existing = await prisma.printJob.findMany({
    where: { orderId: order.id, kind: PrinterRole.RECEIPT },
    select: { printerId: true },
  });
  const have = new Set(existing.map((e) => e.printerId));
  const fresh = targets.filter((p) => !have.has(p.id));
  if (fresh.length === 0) return true;

  const jobs = await prisma.$transaction(
    fresh.map((p) =>
      prisma.printJob.create({
        data: { storeId: order.storeId, printerId: p.id, orderId: order.id, kind: PrinterRole.RECEIPT },
      }),
    ),
  );
  notify(io, order.storeId, jobs.map((j) => j.id));
  return true;
}

/**
 * Entry points called from the order flow. Fire-and-forget: a printing
 * problem must never fail the order. Falls back to the legacy env printer
 * (kitchen only) when the store has no Printer rows.
 */
export function dispatchKitchenPrint(
  order: { id: string; storeId: string; items: any[]; orderNumber: string },
  opts: { itemIds?: string[]; isAddOn: boolean; legacyItems: KitchenTicketItem[]; io?: Server },
): void {
  enqueueKitchenJobs(order, opts)
    .then((handled) => {
      if (!handled) return legacyPrintKitchenTicket(order, opts.legacyItems, opts.isAddOn);
    })
    .catch((err) => logger.warn({ err, orderId: order.id }, 'enqueue kitchen print jobs failed'));
}

export function dispatchReceiptPrint(order: { id: string; storeId: string }, io?: Server): void {
  enqueueReceiptJobs(order, io).catch((err) =>
    logger.warn({ err, orderId: order.id }, 'enqueue receipt print jobs failed'),
  );
}

// ---------------------------------------------------------------- phone-facing queue

function sampleOrder() {
  const now = new Date();
  return {
    orderNumber: 'TEST-0000', type: 'DINE_IN', createdAt: now,
    subtotal: '100.00', discount: '0', tax: '6.54', serviceCharge: '0', total: '100.00',
    cashier: { name: 'ทดสอบ' }, table: { number: '1' },
    items: [{ product: { name: 'รายการทดสอบ' }, quantity: 1, unitPrice: '100.00' }],
    payments: [{ method: 'CASH', amount: '100.00' }],
  };
}

async function buildPayload(job: any, printer: any) {
  const base = {
    id: job.id, kind: job.kind, orderId: job.orderId, attempts: job.attempts, createdAt: job.createdAt,
    printer: { id: printer.id, name: printer.name, ip: printer.ip, port: printer.port, copies: printer.copies, role: printer.role },
  };

  if (job.orderId === TEST_ORDER_ID) {
    if (job.kind === PrinterRole.KITCHEN) {
      return {
        ...base,
        ticket: {
          stationName: printer.name, orderNumber: 'TEST-0000', tableNumber: '1', orderType: 'DINE_IN',
          time: new Date().toISOString(), cashierName: 'ทดสอบ',
          items: [{ name: 'พิมพ์ทดสอบ', quantity: 1, modifiers: ['หวานน้อย'] }],
          isAddOn: false, round: { n: 1, m: 1 },
        },
      };
    }
    const store = await prisma.store.findUnique({ where: { id: job.storeId } });
    return { ...base, receipt: { store: pickStore(store), order: sampleOrder() } };
  }

  const order = await prisma.order.findUnique({
    where: { id: job.orderId },
    include: {
      items: { include: { product: true }, orderBy: { createdAt: 'asc' } },
      payments: true,
      table: true,
      cashier: { select: { id: true, name: true } },
    },
  });
  if (!order) return null;

  if (job.kind === PrinterRole.RECEIPT) {
    const store = await prisma.store.findUnique({ where: { id: job.storeId } });
    return { ...base, receipt: { store: pickStore(store), order } };
  }

  // KITCHEN: re-derive this round's items from the order's job boundaries.
  const siblings = await prisma.printJob.findMany({
    where: { orderId: job.orderId, kind: PrinterRole.KITCHEN },
    select: { createdAt: true },
  });
  const round = deriveRound(siblings.map((s) => s.createdAt.getTime()), job.createdAt.getTime());
  const items = filterItemsForPrinter(
    printer,
    itemsInRound(order.items, round.after, round.upTo).map((it: any) => ({ ...it, categoryId: it.product.categoryId })),
  );
  if (items.length === 0) return { ...base, ticket: null };
  return {
    ...base,
    ticket: {
      stationName: printer.name,
      orderNumber: order.orderNumber,
      tableNumber: order.table?.number ?? null,
      orderType: order.type,
      time: new Date(Math.max(...items.map((i: any) => new Date(i.createdAt).getTime()))).toISOString(),
      cashierName: order.cashier?.name ?? null,
      items: items.map((it: any) => ({
        name: it.product.name,
        quantity: it.quantity,
        notes: it.notes,
        modifiers: Array.isArray(it.variants) ? it.variants.map((v: any) => v?.name).filter(Boolean) : [],
      })),
      isAddOn: round.n > 1,
      round: { n: round.n, m: round.m },
    },
  };
}

function pickStore(store: any) {
  return {
    name: store?.name ?? '',
    address: store?.address ?? null,
    phone: store?.phone ?? null,
    taxId: store?.taxId ?? null,
  };
}

/**
 * Jobs a phone should print now. Marks them leased for 30s so a second phone
 * polling at the same moment doesn't print them too; complete/fail release or
 * extend the lease. Jobs for inactive printers wait (they stay PENDING).
 */
export async function claimPending(storeId: string, limit = 10) {
  const now = Date.now();
  for (const [id, until] of leases) if (until < now) leases.delete(id);

  // Give up on tickets that sat too long (e.g. printer offline all night).
  await prisma.printJob.updateMany({
    where: { storeId, status: PrintJobStatus.PENDING, createdAt: { lt: new Date(now - STALE_JOB_MS) } },
    data: { status: PrintJobStatus.FAILED, error: 'หมดอายุ — ค้างนานเกินไป' },
  });

  const jobs = await prisma.printJob.findMany({
    where: { storeId, status: PrintJobStatus.PENDING, printer: { isActive: true } },
    include: { printer: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const out: any[] = [];
  for (const job of jobs) {
    if (out.length >= limit) break;
    if ((leases.get(job.id) ?? 0) > now) continue;
    const payload = await buildPayload(job, job.printer);
    if (!payload) {
      await prisma.printJob.update({ where: { id: job.id }, data: { status: PrintJobStatus.FAILED, error: 'ไม่พบออเดอร์' } });
      continue;
    }
    if ('ticket' in payload && payload.ticket === null) {
      // Nothing from this round belongs to this station.
      await prisma.printJob.update({ where: { id: job.id }, data: { status: PrintJobStatus.PRINTED, printedAt: new Date() } });
      continue;
    }
    leases.set(job.id, now + LEASE_MS);
    out.push(payload);
  }
  return out;
}

async function ownedJob(storeId: string, id: string) {
  const job = await prisma.printJob.findFirst({ where: { id, storeId } });
  if (!job) throw NotFound('ไม่พบงานพิมพ์');
  return job;
}

export async function completeJob(storeId: string, id: string) {
  await ownedJob(storeId, id);
  leases.delete(id);
  return prisma.printJob.update({
    where: { id },
    data: { status: PrintJobStatus.PRINTED, printedAt: new Date(), error: null, attempts: { increment: 1 } },
  });
}

export async function failJob(storeId: string, id: string, error: string) {
  const job = await ownedJob(storeId, id);
  const attempts = job.attempts + 1;
  const giveUp = attempts >= MAX_ATTEMPTS;
  leases.set(id, Date.now() + RETRY_AFTER_FAIL_MS); // back off before any phone retries it
  return prisma.printJob.update({
    where: { id },
    data: { attempts, error: error.slice(0, 300), status: giveUp ? PrintJobStatus.FAILED : PrintJobStatus.PENDING },
  });
}

/** Re-queue a job (retry / reprint), optionally on another printer of the same store. */
export async function reprintJob(storeId: string, id: string, printerId?: string, io?: Server) {
  const job = await ownedJob(storeId, id);
  // A receipt may be re-routed to a kitchen printer (and vice versa) in an emergency;
  // the phone builds the layout from job.kind, so only check the target exists.
  if (printerId && printerId !== job.printerId) await ownedPrinter(storeId, printerId);
  leases.delete(id);
  const updated = await prisma.printJob.update({
    where: { id },
    data: { status: PrintJobStatus.PENDING, attempts: 0, error: null, printedAt: null, ...(printerId ? { printerId } : {}) },
  });
  notify(io, storeId, [id]);
  return updated;
}

export async function testPrint(storeId: string, printerId: string, io?: Server) {
  const printer = await ownedPrinter(storeId, printerId);
  if (!printer.isActive) throw BadRequest('เครื่องพิมพ์นี้ปิดใช้งานอยู่');
  const job = await prisma.printJob.create({
    data: { storeId, printerId, orderId: TEST_ORDER_ID, kind: printer.role },
  });
  notify(io, storeId, [job.id]);
  return job;
}

/** Recent jobs for the settings "คิวงานพิมพ์" list — pending/failed first, then latest printed. */
export async function listJobs(storeId: string, limit = 30) {
  const jobs = await prisma.printJob.findMany({
    where: { storeId },
    include: { printer: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });
  const orderIds = Array.from(new Set(jobs.map((j) => j.orderId).filter((id) => id !== TEST_ORDER_ID)));
  const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } });
  const numbers = new Map(orders.map((o) => [o.id, o.orderNumber]));
  return jobs.map((j) => ({
    ...j,
    orderNumber: j.orderId === TEST_ORDER_ID ? 'ทดสอบ' : numbers.get(j.orderId) ?? null,
  }));
}
