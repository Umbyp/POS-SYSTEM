import { Prisma } from '@prisma/client';

type D = Prisma.Decimal.Value;

const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * What a partial refund of some lines gives back.
 * The bill total already folds in order discounts, tax and service charge, so each line's
 * refund is its share of the subtotal applied to the total — a line bought with a 10% bill
 * discount is refunded at the discounted price, not the shelf price.
 * `unitPrice` already includes variant deltas; `discount` is the line-level discount (whole line).
 */
export function partialRefundAmount(
  order: { subtotal: D; total: D },
  lines: Array<{ unitPrice: D; quantity: number; discount: D; qty: number }>,
): Prisma.Decimal {
  const subtotal = new Prisma.Decimal(order.subtotal);
  const total = new Prisma.Decimal(order.total);
  if (subtotal.lte(0) || total.lte(0)) return new Prisma.Decimal(0);
  let lineNet = new Prisma.Decimal(0);
  for (const l of lines) {
    const gross = new Prisma.Decimal(l.unitPrice).mul(l.quantity);
    const net = Prisma.Decimal.max(0, gross.minus(l.discount));
    lineNet = lineNet.plus(net.mul(l.qty).div(l.quantity));
  }
  return r2(Prisma.Decimal.min(total, total.mul(lineNet).div(subtotal)));
}

/** Points/stamps earned that belong to the refunded share of the bill (rounded down). */
export function earnedShare(earned: number, total: D, refunded: D): number {
  const t = new Prisma.Decimal(total);
  if (earned <= 0 || t.lte(0)) return 0;
  const ratio = Prisma.Decimal.min(1, new Prisma.Decimal(refunded).div(t));
  return Math.floor(ratio.mul(earned).toNumber() + 1e-9);
}
