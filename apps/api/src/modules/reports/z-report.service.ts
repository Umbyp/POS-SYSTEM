/**
 * Z-report (daily close).
 *
 * DAY: store-local calendar day, fixed to Asia/Bangkok (UTC+7, no DST) like the
 *   hourly report. date=YYYY-MM-DD → window [00:00+07:00, next 00:00+07:00).
 * SOLD: a bill is sold on the day of its LAST payment (settle time). Open tabs
 *   (no payments), DRAFT and CANCELLED bills are never counted. REFUNDED /
 *   partially refunded bills stay in sales; refunds are deducted separately on the
 *   day they were made (ActivityLog REFUND / PARTIAL_REFUND createdAt), so
 *   netSales = grossSales − refunds. Legacy REFUND logs without refundedAmount
 *   fall back to the order total (same as shift-summary).
 * METHODS: payments store the TENDERED amount; change is taken from cash
 *   (change = min(cash, max(0, paid − total))), so net per method = tendered − change
 *   for cash. A refund is spread over the bill's methods by their net share
 *   (cash share = same as shift-summary). byMethod[].amount sums to netSales; any
 *   rounding remainder lands on the largest method.
 */
import { prisma } from '../../config/prisma';
import { computeShiftSummary } from '../employees/shift-summary';

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const TZ_MS = 7 * 3600_000;
const METHODS = ['CASH', 'PROMPTPAY', 'BANK_TRANSFER', 'CREDIT_CARD'] as const;

export const bangkokToday = (now = new Date()) => new Date(now.getTime() + TZ_MS).toISOString().slice(0, 10);

export function dayWindow(date: string) {
  const from = new Date(`${date}T00:00:00+07:00`);
  const to = new Date(from.getTime() + 86400_000);
  return { from, to };
}

export async function buildZReport(storeId: string, date: string) {
  const { from, to } = dayWindow(date);
  const inWin = (d: Date) => d >= from && d < to;

  const [candidates, cancelledCount, logs, shifts] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId, status: { notIn: ['CANCELLED', 'DRAFT'] },
        payments: { some: { createdAt: { gte: from, lt: to } } },
      },
      include: {
        payments: true,
        cashier: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    }),
    prisma.order.count({ where: { storeId, status: 'CANCELLED', createdAt: { gte: from, lt: to } } }),
    prisma.activityLog.findMany({
      where: { action: { in: ['REFUND', 'PARTIAL_REFUND'] }, createdAt: { gte: from, lt: to }, user: { storeId } },
    }),
    prisma.shift.findMany({
      where: { startTime: { gte: from, lt: to }, user: { storeId } },
      include: { user: { select: { name: true } } },
      orderBy: { startTime: 'asc' },
    }),
  ]);

  // Sold that day = last payment falls in the window.
  const orders = candidates.filter((o) => inWin(new Date(Math.max(...o.payments.map((p) => p.createdAt.getTime())))));

  const netByMethod: Record<string, number> = { CASH: 0, PROMPTPAY: 0, BANK_TRANSFER: 0, CREDIT_CARD: 0 };
  /** per-order net method shares (0..1), used for refunds too */
  const shareOf = (o: { payments: { method: string; amount: unknown }[]; total: unknown }) => {
    const paid = o.payments.reduce((s, p) => s + num(p.amount), 0);
    const cash = o.payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + num(p.amount), 0);
    const change = Math.min(cash, Math.max(0, paid - num(o.total)));
    const net: Record<string, number> = { CASH: 0, PROMPTPAY: 0, BANK_TRANSFER: 0, CREDIT_CARD: 0 };
    for (const p of o.payments) net[p.method] += num(p.amount);
    net.CASH -= change;
    const sum = METHODS.reduce((s, m) => s + net[m], 0);
    return { net, sum };
  };

  let grossSales = 0, discountTotal = 0, serviceCharge = 0, tax = 0;
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, sales: 0 }));
  const items = new Map<string, { name: string; quantity: number; revenue: number }>();
  const cashiers = new Map<string, { name: string; orders: number; sales: number }>();
  for (const o of orders) {
    const total = num(o.total);
    grossSales += total;
    discountTotal += num(o.discount) + num(o.promotionDiscount) + o.items.reduce((a, i) => a + num(i.discount), 0);
    serviceCharge += num(o.serviceCharge);
    tax += num(o.tax);
    const { net } = shareOf(o);
    for (const m of METHODS) netByMethod[m] += net[m];
    const last = new Date(Math.max(...o.payments.map((p) => p.createdAt.getTime())));
    const h = new Date(last.getTime() + TZ_MS).getUTCHours();
    hourly[h].orders += 1; hourly[h].sales += total;
    const c = cashiers.get(o.cashierId) ?? { name: o.cashier?.name ?? '-', orders: 0, sales: 0 };
    c.orders += 1; c.sales += total; cashiers.set(o.cashierId, c);
    for (const it of o.items) {
      const keep = it.quantity - it.refundedQty;
      if (keep <= 0) continue;
      const line = (num(it.unitPrice) * it.quantity - num(it.discount)) * (keep / it.quantity);
      const e = items.get(it.productId) ?? { name: it.product?.name ?? '-', quantity: 0, revenue: 0 };
      e.quantity += keep; e.revenue += line; items.set(it.productId, e);
    }
  }

  // Refunds by the day they happened (may relate to bills sold on other days).
  const refOrderIds = [...new Set(logs.map((l) => (l.metadata as any)?.orderId).filter(Boolean))] as string[];
  const refOrders = refOrderIds.length
    ? await prisma.order.findMany({ where: { id: { in: refOrderIds }, storeId }, include: { payments: true } })
    : [];
  const refById = new Map(refOrders.map((o) => [o.id, o]));
  let refundCount = 0, refundAmount = 0;
  const refByMethod: Record<string, number> = { CASH: 0, PROMPTPAY: 0, BANK_TRANSFER: 0, CREDIT_CARD: 0 };
  for (const l of logs) {
    const meta = l.metadata as any;
    const o = refById.get(meta?.orderId);
    if (!o) continue;
    const amount = meta.refundedAmount != null ? num(meta.refundedAmount) : num(o.total);
    const { net, sum } = shareOf(o);
    refundCount += 1; refundAmount += amount;
    for (const m of METHODS) if (sum > 0) refByMethod[m] += amount * (net[m] / sum);
  }

  const netSales = r2(grossSales - refundAmount);
  const byMethod = METHODS.map((m) => ({ method: m, amount: r2(netByMethod[m] - refByMethod[m]) }));
  const rem = r2(netSales - byMethod.reduce((s, m) => s + m.amount, 0));
  if (rem !== 0) {
    const big = byMethod.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    big.amount = r2(big.amount + rem);
  }

  const shiftRows = await Promise.all(shifts.map(async (s) => {
    const sum = await computeShiftSummary(s, storeId);
    return {
      shiftId: s.id, userName: s.user?.name ?? '-', startTime: s.startTime, endTime: s.endTime,
      openingCash: sum.openingCash, closingCash: sum.closingCash,
      expectedCash: sum.expectedCash, difference: sum.difference,
    };
  }));
  const closed = shiftRows.filter((s) => s.closingCash != null);

  return {
    date,
    window: { from, to },
    sales: {
      orderCount: orders.length,
      grossSales: r2(grossSales),
      discountTotal: r2(discountTotal),
      serviceCharge: r2(serviceCharge),
      tax: r2(tax),
      refunds: { count: refundCount, amount: r2(refundAmount) },
      netSales,
      avgBill: orders.length ? r2(grossSales / orders.length) : 0,
    },
    byMethod,
    cancelled: { count: cancelledCount },
    byHour: hourly.map((h) => ({ hour: h.hour, orders: h.orders, sales: r2(h.sales) })),
    topItems: [...items.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10)
      .map((i) => ({ ...i, revenue: r2(i.revenue) })),
    byCashier: [...cashiers.values()].sort((a, b) => b.sales - a.sales).map((c) => ({ ...c, sales: r2(c.sales) })),
    shifts: shiftRows,
    cashDrawer: {
      expectedTotal: r2(closed.reduce((s, x) => s + x.expectedCash, 0)),
      countedTotal: r2(closed.reduce((s, x) => s + num(x.closingCash), 0)),
      differenceTotal: r2(closed.reduce((s, x) => s + num(x.difference), 0)),
      openShifts: shiftRows.length - closed.length,
    },
  };
}
