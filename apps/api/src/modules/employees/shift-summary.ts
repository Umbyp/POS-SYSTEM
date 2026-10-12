/**
 * Shift cash reconciliation.
 *
 * Payment rows store the amount TENDERED (a 100 note on a 60 bill is saved as
 * CASH 100; nothing stores the change). The order's `total` is what was owed, so
 * change = (sum of payments − total) when positive, and it is handed back from
 * the drawer in cash. Cash that stays in the drawer for an order is therefore
 *   netCash = cashTendered − min(cashTendered, max(0, paid − total)).
 *
 * Scope of a shift: payments created in [startTime, endTime ?? now] on orders
 * whose cashier is the shift's user (an open tab counts when it is SETTLED, not
 * when it was opened). Cancelled orders never have payments; REFUNDED orders
 * stay in sales and their refund is deducted separately, so nothing is counted
 * twice. Cash refunds = refunds (activity log REFUND / PARTIAL_REFUND) made in
 * the window by the shift user or on this cashier's orders, attributed to cash by
 * the order's cash share of net payments.
 */
import { prisma } from '../../config/prisma';

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ShiftSummary {
  shiftId: string;
  userId: string;
  startTime: Date;
  endTime: Date | null;
  openingCash: number;
  cashSales: number;       // net of change given
  cashTendered: number;    // gross cash handed over (before change)
  changeGiven: number;
  promptpaySales: number;
  transferSales: number;
  cardSales: number;
  totalSales: number;      // sum of order totals counted in this shift
  orderCount: number;
  refundsTotal: number;
  cashRefunds: number;
  discountTotal: number;
  expectedCash: number;    // openingCash + cashSales − cashRefunds
  closingCash: number | null;
  difference: number | null; // closingCash − expectedCash (+ over / − short)
}

export async function computeShiftSummary(shift: {
  id: string; userId: string; startTime: Date; endTime: Date | null; openingCash: unknown; closingCash: unknown;
}, storeId: string): Promise<ShiftSummary> {
  const end = shift.endTime ?? new Date();
  const orders = await prisma.order.findMany({
    where: {
      storeId, cashierId: shift.userId, status: { notIn: ['CANCELLED', 'DRAFT'] },
      payments: { some: { createdAt: { gte: shift.startTime, lte: end } } },
    },
    include: { payments: true, items: { select: { discount: true } } },
  });

  let cashTendered = 0, changeGiven = 0, promptpay = 0, transfer = 0, card = 0, totalSales = 0, discountTotal = 0;
  const cashShare = new Map<string, number>(); // orderId → cash share of net payments (0..1)
  for (const o of orders) {
    const inWindow = o.payments.filter((p) => p.createdAt >= shift.startTime && p.createdAt <= end);
    const by = (m: string) => inWindow.filter((p) => p.method === m).reduce((s, p) => s + num(p.amount), 0);
    const cash = by('CASH');
    const paidAll = o.payments.reduce((s, p) => s + num(p.amount), 0);
    const change = Math.min(cash, Math.max(0, paidAll - num(o.total)));
    cashTendered += cash;
    changeGiven += change;
    promptpay += by('PROMPTPAY');
    transfer += by('BANK_TRANSFER');
    card += by('CREDIT_CARD');
    totalSales += num(o.total);
    discountTotal += num(o.discount) + o.items.reduce((a, i) => a + num(i.discount), 0); // order-level + line-level
    const net = paidAll - change;
    cashShare.set(o.id, net > 0 ? Math.min(1, (cash - change) / net) : 0);
  }
  const cashSales = cashTendered - changeGiven;

  // Refunds in the window (the schema keeps no refund timestamp besides the activity log).
  const logs = await prisma.activityLog.findMany({
    where: {
      action: { in: ['REFUND', 'PARTIAL_REFUND'] },
      createdAt: { gte: shift.startTime, lte: end },
      user: { storeId },
    },
  });
  const refOrderIds = [...new Set(logs.map((l) => (l.metadata as any)?.orderId).filter(Boolean))] as string[];
  const refOrders = refOrderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: refOrderIds }, storeId },
        include: { payments: true },
      })
    : [];
  const byId = new Map(refOrders.map((o) => [o.id, o]));
  let refundsTotal = 0, cashRefunds = 0;
  for (const l of logs) {
    const meta = l.metadata as any;
    const o = byId.get(meta?.orderId);
    if (!o) continue;
    if (l.userId !== shift.userId && o.cashierId !== shift.userId) continue;
    // Full refunds log only the order id → the refunded amount is the bill total.
    const amount = l.action === 'PARTIAL_REFUND' ? num(meta.refundedAmount) : num(o.total);
    let share = cashShare.get(o.id);
    if (share === undefined) {
      const paidAll = o.payments.reduce((s, p) => s + num(p.amount), 0);
      const cash = o.payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + num(p.amount), 0);
      const change = Math.min(cash, Math.max(0, paidAll - num(o.total)));
      share = paidAll - change > 0 ? (cash - change) / (paidAll - change) : 0;
    }
    refundsTotal += amount;
    cashRefunds += amount * share;
  }

  const openingCash = num(shift.openingCash);
  const expectedCash = openingCash + cashSales - cashRefunds;
  const closingCash = shift.closingCash == null ? null : num(shift.closingCash);
  return {
    shiftId: shift.id, userId: shift.userId, startTime: shift.startTime, endTime: shift.endTime,
    openingCash: r2(openingCash), cashSales: r2(cashSales), cashTendered: r2(cashTendered), changeGiven: r2(changeGiven),
    promptpaySales: r2(promptpay), transferSales: r2(transfer), cardSales: r2(card),
    totalSales: r2(totalSales), orderCount: orders.length,
    refundsTotal: r2(refundsTotal), cashRefunds: r2(cashRefunds), discountTotal: r2(discountTotal),
    expectedCash: r2(expectedCash), closingCash,
    difference: closingCash == null ? null : r2(closingCash - expectedCash),
  };
}
