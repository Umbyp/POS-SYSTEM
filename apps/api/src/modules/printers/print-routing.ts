// Pure routing/filter logic for print jobs — no DB, no sockets — so it can be
// unit-tested. printers.service.ts feeds it rows and acts on what it returns.

export interface RoutablePrinter {
  id: string;
  role: 'KITCHEN' | 'RECEIPT';
  autoPrint: boolean;
  isActive: boolean;
  copies: number;
  categoryIds: string[];
}

export interface RoutableItem {
  id: string;
  categoryId: string | null;
}

/** Empty categoryIds = the station prints every category. */
export function printerAcceptsItem(printer: Pick<RoutablePrinter, 'categoryIds'>, item: RoutableItem): boolean {
  if (!printer.categoryIds || printer.categoryIds.length === 0) return true;
  return !!item.categoryId && printer.categoryIds.includes(item.categoryId);
}

export function filterItemsForPrinter<T extends RoutableItem>(
  printer: Pick<RoutablePrinter, 'categoryIds'>,
  items: T[],
): T[] {
  return items.filter((it) => printerAcceptsItem(printer, it));
}

/** Printers that should get a kitchen ticket automatically for these items. */
export function planKitchenPrinters<T extends RoutableItem>(printers: RoutablePrinter[], items: T[]) {
  return printers
    .filter((p) => p.role === 'KITCHEN' && p.isActive && p.autoPrint)
    .map((p) => ({ printer: p, items: filterItemsForPrinter(p, items) }))
    .filter((x) => x.items.length > 0);
}

/** Printers that should get the customer receipt automatically on payment. */
export function planReceiptPrinters(printers: RoutablePrinter[]) {
  return printers.filter((p) => p.role === 'RECEIPT' && p.isActive && p.autoPrint);
}

/**
 * A kitchen "round" is identified by a timestamp (the newest item createdAt in
 * that round) which is also stored as the PrintJob.createdAt of every kitchen
 * job of the round — PrintJob has no payload column, so rounds are re-derived
 * from these boundaries. Given the sorted distinct boundaries of an order and
 * one job's boundary, return that round's index (1-based), the total, and the
 * exclusive lower bound for the round's items.
 */
export function deriveRound(boundaries: number[], jobBoundary: number) {
  const sorted = Array.from(new Set(boundaries.concat(jobBoundary))).sort((a, b) => a - b);
  const idx = sorted.indexOf(jobBoundary);
  return {
    n: idx + 1,
    m: sorted.length,
    after: idx > 0 ? sorted[idx - 1] : -Infinity,
    upTo: jobBoundary,
  };
}

export function itemsInRound<T extends { createdAt: Date | string }>(items: T[], after: number, upTo: number): T[] {
  return items.filter((it) => {
    const t = new Date(it.createdAt).getTime();
    return t > after && t <= upTo;
  });
}
