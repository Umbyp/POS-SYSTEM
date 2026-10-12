/** Plain-text (monospace) rendering of a tax invoice for thermal printers / sharing. */

const isZeroWidth = (cp: number) => cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);

/** Display columns: Thai combining vowels/tone marks take no column. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) if (!isZeroWidth(ch.codePointAt(0)!)) w++;
  return w;
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let cur = '', curW = 0;
  for (const ch of s) {
    const cw = isZeroWidth(ch.codePointAt(0)!) ? 0 : 1;
    if (curW + cw > width) { out.push(cur); cur = ''; curW = 0; }
    cur += ch; curW += cw;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

const center = (s: string, w: number) => ' '.repeat(Math.max(0, Math.floor((w - textWidth(s)) / 2))) + s;
function lr(l: string, r: string, w: number) {
  const gap = w - textWidth(l) - textWidth(r);
  return gap >= 1 ? l + ' '.repeat(gap) + r : `${l} ${r}`;
}
export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface TaxInvoiceTextData {
  seller: { name: string; address: string; taxId: string; branch: string };
  buyer: { name: string; address: string; taxId: string; branch: string };
  number: string;
  issuedAt: Date;
  orderNumber: string;
  items: Array<{ name: string; qty: number; unitPrice: number; lineTotal: number }>;
  totals: { subtotalExVat: number; discount: number; baseExVat: number; serviceCharge: number; vatRate: number; vat: number; total: number };
  payments: Array<{ label: string; amount: number }>;
}

export function renderTaxInvoiceText(d: TaxInvoiceTextData, width: 32 | 48 = 32): string {
  const sep = '-'.repeat(width);
  const L: string[] = [];
  const block = (s: string, indent = '') => wrap(s, width - indent.length).forEach((x) => L.push(indent + x));
  const date = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d.issuedAt);

  L.push(center('ใบกำกับภาษี / ใบเสร็จรับเงิน', width));
  L.push(center('(ต้นฉบับ)', width));
  L.push(sep);
  block(d.seller.name);
  block(d.seller.address);
  L.push(`เลขประจำตัวผู้เสียภาษี ${d.seller.taxId}`);
  L.push(d.seller.branch);
  L.push(sep);
  L.push(`เลขที่: ${d.number}`);
  L.push(`วันที่: ${date}`);
  L.push(`อ้างอิงบิล: ${d.orderNumber}`);
  L.push(sep);
  L.push('ผู้ซื้อ:');
  block(d.buyer.name, ' ');
  block(d.buyer.address, ' ');
  L.push(` เลขประจำตัวผู้เสียภาษี ${d.buyer.taxId}`);
  L.push(` ${d.buyer.branch}`);
  L.push(sep);
  for (const it of d.items) {
    block(it.name);
    L.push(lr(`  ${it.qty} x ${money(it.unitPrice)}`, money(it.lineTotal), width));
  }
  L.push(sep);
  const t = d.totals;
  L.push(lr('รวมก่อนภาษี', money(t.subtotalExVat), width));
  if (t.discount > 0) L.push(lr('ส่วนลด', `-${money(t.discount)}`, width));
  L.push(lr('มูลค่าก่อนภาษี', money(t.baseExVat), width));
  L.push(lr(`ภาษีมูลค่าเพิ่ม ${t.vatRate}%`, money(t.vat), width));
  if (t.serviceCharge > 0) L.push(lr('ค่าบริการ', money(t.serviceCharge), width));
  L.push(lr('รวมทั้งสิ้น', money(t.total), width));
  if (d.payments.length) {
    L.push(sep);
    for (const p of d.payments) L.push(lr(p.label, money(p.amount), width));
  }
  L.push(sep);
  L.push(center('ขอบคุณที่ใช้บริการ', width));
  return L.join('\n');
}
