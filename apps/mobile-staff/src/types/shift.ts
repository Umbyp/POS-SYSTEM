export interface Shift {
  id: string;
  userId: string;
  startTime: string;
  endTime: string | null;
  openingCash: string | number;
  closingCash: string | number | null;
  cashSales: string | number;
  totalSales: string | number;
  notes: string | null;
  user?: { id: string; name: string };
}

/** Normalised running summary for an open shift (from GET /employees/shifts/:id/summary, or computed from /orders). */
export interface ShiftSummary {
  openingCash: number;
  expectedCash: number;
  orderCount: number;
  sales: { CASH: number; PROMPTPAY: number; TRANSFER: number; CARD: number };
  totalSales: number;
  refundsTotal: number;
  discountTotal: number;
  source: 'server' | 'computed';
}
