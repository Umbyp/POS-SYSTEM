/** GET /reports/z-report?date=YYYY-MM-DD (apps/api z-report.service.ts) */
export interface ZReport {
  date: string;
  window: { from: string; to: string };
  sales: {
    orderCount: number;
    grossSales: number;
    discountTotal: number;
    serviceCharge: number;
    tax: number;
    refunds: { count: number; amount: number };
    netSales: number;
    avgBill: number;
  };
  byMethod: { method: 'CASH' | 'PROMPTPAY' | 'BANK_TRANSFER' | 'CREDIT_CARD'; amount: number }[];
  cancelled: { count: number };
  byHour: { hour: number; orders: number; sales: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  byCashier: { name: string; orders: number; sales: number }[];
  shifts: {
    shiftId: string; userName: string; startTime: string; endTime: string | null;
    openingCash: number; closingCash: number | null; expectedCash: number; difference: number | null;
  }[];
  cashDrawer: { expectedTotal: number; countedTotal: number; differenceTotal: number; openShifts: number };
}
