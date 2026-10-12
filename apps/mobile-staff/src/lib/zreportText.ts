import type { ZReport } from '@/types/zreport';

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'เงินสด',
  PROMPTPAY: 'พร้อมเพย์',
  BANK_TRANSFER: 'โอนเงิน',
  CREDIT_CARD: 'บัตรเครดิต',
};

const money = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2030-06-15" → "15/06/2030" (no timezone math: the date is already the store's calendar day). */
export const formatYmd = (ymd: string) => ymd.split('-').reverse().join('/');

/** Pure: Thai plain-text Z-report summary for sharing (LINE / email / copy). */
export function buildZReportText(r: ZReport, storeName?: string): string {
  const s = r.sales;
  const L: string[] = [];
  L.push(`รายงานปิดยอดวัน${storeName ? ` · ${storeName}` : ''}`);
  L.push(`วันที่ ${formatYmd(r.date)}`);
  L.push('');
  L.push(`ยอดขายสุทธิ  ${money(s.netSales)}`);
  L.push(`ยอดขายรวม   ${money(s.grossSales)}  (${s.orderCount} บิล, เฉลี่ย ${money(s.avgBill)}/บิล)`);
  L.push(`ส่วนลด       ${money(s.discountTotal)}`);
  L.push(`คืนเงิน       ${money(s.refunds.amount)}  (${s.refunds.count} รายการ)`);
  if (s.serviceCharge > 0) L.push(`ค่าบริการ    ${money(s.serviceCharge)}`);
  L.push(`ภาษี (VAT)   ${money(s.tax)}`);
  if (r.cancelled.count > 0) L.push(`บิลยกเลิก    ${r.cancelled.count} บิล`);
  const methods = r.byMethod.filter((m) => m.amount !== 0);
  if (methods.length) {
    L.push('', 'แยกตามช่องทางชำระ (สุทธิ)');
    for (const m of methods) L.push(`- ${METHOD_LABEL[m.method] ?? m.method}: ${money(m.amount)}`);
  }
  if (r.topItems.length) {
    L.push('', 'สินค้าขายดี');
    r.topItems.slice(0, 5).forEach((i, idx) => L.push(`${idx + 1}. ${i.name} x${i.quantity} (${money(i.revenue)})`));
  }
  if (r.shifts.length) {
    L.push('', 'เงินสดในลิ้นชัก');
    for (const sh of r.shifts) {
      const d = sh.difference;
      const tail = d == null ? 'ยังไม่ปิดกะ' : Math.abs(d) < 0.01 ? 'ตรง' : d > 0 ? `เกิน ${money(d)}` : `ขาด ${money(-d)}`;
      L.push(`- ${sh.userName}: ควรมี ${money(sh.expectedCash)} · ${tail}`);
    }
    const c = r.cashDrawer;
    if (r.shifts.some((x) => x.closingCash != null)) {
      L.push(`รวมที่ปิดกะแล้ว: ควรมี ${money(c.expectedTotal)} / นับได้ ${money(c.countedTotal)} / ผลต่าง ${money(c.differenceTotal)}`);
    }
  }
  return L.join('\n');
}
