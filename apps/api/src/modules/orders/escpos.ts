// ESC/POS builders + raw network-printer sender, shared by the manual
// customer-receipt print route (order.routes.ts) and the automatic
// kitchen-ticket print fired from order.service.ts (create) and
// order-tab.service.ts (openTab/addRound) — every place an order's items are
// first committed. One global PRINTER_IP/PRINTER_PORT is the legacy fallback;
// stores with Printer rows route through the print-job queue instead
// (modules/printers) and the phone prints over the LAN.
import * as net from 'net';
import { logger } from '../../utils/logger';

/** Whether a network kitchen printer is configured on this server at all —
 * read by the frontend (GET /orders/print-config) so it can turn off its own
 * older browser-print auto-print toggle instead of double-printing. */
export function isKitchenPrinterConfigured(): boolean {
  return !!process.env.PRINTER_IP;
}

function tis620Byte(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e01 + 0xa1;
  return 0x3f;
}

function encodeText(text: string): number[] {
  return Array.from(text).map(tis620Byte);
}

export function buildReceiptESCPOS(store: any, order: any): Uint8Array {
  const out: number[] = [];
  const W = 32;

  const line = (t = '') => { out.push(...encodeText(t), 0x0a); };
  const twoCol = (l: string, r: string) => {
    const space = Math.max(1, W - l.length - r.length);
    line(l + ' '.repeat(space) + r);
  };

  out.push(0x1b, 0x40);                       // init
  out.push(0x1b, 0x74, 21);                   // charset TIS-620

  out.push(0x1b, 0x61, 1);                    // center
  out.push(0x1d, 0x21, 0x11);                 // double size
  line(store.name);
  out.push(0x1d, 0x21, 0x00);                 // normal size

  if (store.address) line(store.address);
  if (store.phone) line(`โทร. ${store.phone}`);
  if (store.taxId) line(`TAX ID: ${store.taxId}`);
  line('--------------------------------');

  out.push(0x1b, 0x61, 0);                    // left
  line(`เลขที่: ${order.orderNumber}`);
  line(`วันที่: ${new Date(order.createdAt).toLocaleString('th-TH')}`);
  if (order.cashier) line(`พนักงาน: ${order.cashier.name}`);
  if (order.table) line(`โต๊ะ: ${order.table.number}`);
  line('--------------------------------');

  for (const it of order.items) {
    line(it.product.name);
    twoCol(`  ${it.quantity} x ${Number(it.unitPrice).toFixed(2)}`,
           (Number(it.unitPrice) * it.quantity).toFixed(2));
  }
  line('--------------------------------');

  twoCol('ยอดรวม', Number(order.subtotal).toFixed(2));
  if (Number(order.discount) > 0)
    twoCol('ส่วนลด', `-${Number(order.discount).toFixed(2)}`);
  if (Number(order.tax) > 0)
    twoCol('VAT 7%', Number(order.tax).toFixed(2));

  out.push(0x1d, 0x21, 0x10);                 // double width
  twoCol('รวมทั้งสิ้น', Number(order.total).toFixed(2));
  out.push(0x1d, 0x21, 0x00);
  line('--------------------------------');

  for (const p of order.payments) {
    const label = p.method === 'CASH' ? 'เงินสด'
                : p.method === 'PROMPTPAY' ? 'พร้อมเพย์'
                : p.method === 'CREDIT_CARD' ? 'บัตรเครดิต'
                : 'โอนธนาคาร';
    twoCol(label, Number(p.amount).toFixed(2));
  }

  out.push(0x0a);
  out.push(0x1b, 0x61, 1);                    // center
  line('*** ขอบคุณที่ใช้บริการ ***');
  out.push(0x0a, 0x0a, 0x0a);
  out.push(0x1d, 0x56, 1);                    // cut

  return new Uint8Array(out);
}

export interface KitchenTicketItem {
  name: string;
  quantity: number;
  notes?: string | null;
  /** Chosen options (sweetness, toppings, ...) — each prints on its own "**" line. */
  modifiers?: string[];
}

export interface KitchenTicketInput {
  /** Station / printer name, printed large at the top (e.g. "ครัวหลัง"). */
  stationName?: string | null;
  orderNumber: string;
  /** Table number, or null for takeaway/delivery. */
  tableNumber?: string | null;
  orderType: string;
  time?: Date | string | null;
  cashierName?: string | null;
  items: KitchenTicketItem[];
  /** A later round of an already-fired order — printed in a box. */
  isAddOn?: boolean;
  /** "ใบที่ n/m" */
  round?: { n: number; m: number } | null;
}

const KT_TYPE_EN: Record<string, string> = { DINE_IN: 'DINE-IN', TAKEAWAY: 'TAKEAWAY', DELIVERY: 'DELIVERY' };
const KT_TYPE_TH: Record<string, string> = { DINE_IN: 'ทานที่ร้าน', TAKEAWAY: 'กลับบ้าน', DELIVERY: 'เดลิเวอรี่' };

// Thai above/below vowels and tone marks occupy no printer cell.
function ktCombining(code: number): boolean {
  return code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
}
function ktWidth(s: string): number {
  let w = 0;
  for (const ch of Array.from(s)) if (!ktCombining(ch.charCodeAt(0))) w++;
  return w;
}
function ktWrap(s: string, width: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let w = 0;
  for (const ch of Array.from(s)) {
    const cw = ktCombining(ch.charCodeAt(0)) ? 0 : 1;
    if (w + cw > width) { lines.push(cur); cur = ''; w = 0; }
    cur += ch;
    w += cw;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
function ktHHMM(t?: Date | string | null): string {
  const d = t ? new Date(t) : new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Kitchen order ticket (KOT), 80mm / 32 columns, mockup "4a": station name
 * large, order# + table on one double-size line, no prices, items double
 * height, modifiers/notes bold with a leading "**", boxed "เพิ่มรายการ" for
 * later rounds, and "ใบที่ n/m" at the foot. Thermal paper has no colour, so
 * everything is size + bold + symbols only.
 */
export function buildKitchenTicket(t: KitchenTicketInput): Uint8Array {
  const out: number[] = [];
  const W = 32;
  const raw = (...b: number[]) => { out.push(...b); };
  const line = (s = '') => { out.push(...encodeText(s), 0x0a); };
  const size = (w: 1 | 2, h: 1 | 2) => raw(0x1d, 0x21, ((w - 1) << 4) | (h - 1));
  const bold = (on: boolean) => raw(0x1b, 0x45, on ? 1 : 0);
  const align = (a: 0 | 1 | 2) => raw(0x1b, 0x61, a);
  const fit = (l: string, r: string, width: number) =>
    l + ' '.repeat(Math.max(1, width - ktWidth(l) - ktWidth(r))) + r;
  const divider = () => line('-'.repeat(W));

  raw(0x1b, 0x40);       // init
  raw(0x1b, 0x74, 21);   // TIS-620

  // Header
  align(1);
  bold(true);
  size(2, 2);
  for (const l of ktWrap(t.stationName?.trim() || 'ครัว', 16)) line(l);
  size(1, 1);
  if (t.isAddOn) {
    size(2, 2);
    const inner = 14;
    const label = 'เพิ่มรายการ';
    const pad = Math.max(0, inner - ktWidth(label));
    const left = Math.floor(pad / 2);
    line('+' + '-'.repeat(inner) + '+');
    line('|' + ' '.repeat(left) + label + ' '.repeat(pad - left) + '|');
    line('+' + '-'.repeat(inner) + '+');
    size(1, 1);
  } else {
    line('KITCHEN');
  }
  bold(false);
  divider();

  // Order number + table, double size, one line
  align(0);
  bold(true);
  size(2, 2);
  const orderNo = `#${String(t.orderNumber).split('-').pop()}`;
  const where = t.tableNumber
    ? (/^[0-9]/.test(t.tableNumber) ? `T${t.tableNumber}` : t.tableNumber)
    : (KT_TYPE_TH[t.orderType] ?? t.orderType);
  line(fit(orderNo, where, 16));
  size(1, 1);
  bold(false);

  // Info lines
  const hhmm = ktHHMM(t.time);
  if (t.isAddOn) {
    line(`${hhmm}  ${t.round ? `รอบที่ ${t.round.n}` : ''}`.trimEnd());
  } else {
    line(`${KT_TYPE_EN[t.orderType] ?? t.orderType}  ${KT_TYPE_TH[t.orderType] ?? ''}`.trimEnd());
    line(`${hhmm}  ${t.cashierName ?? ''}`.trimEnd());
  }
  divider();

  // Items
  let totalQty = 0;
  t.items.forEach((it, idx) => {
    totalQty += it.quantity;
    if (idx > 0) line();
    bold(true);
    size(1, 2);
    ktWrap(`${it.quantity} x ${it.name}`, W).forEach((l) => line(l));
    size(1, 1);
    const extras = [...(it.modifiers ?? []), ...(it.notes?.trim() ? [it.notes.trim()] : [])];
    for (const m of extras) {
      ktWrap(`** ${m}`, W - 3).forEach((l, i) => line(`   ${i === 0 ? l : `   ${l}`}`));
    }
    bold(false);
  });
  divider();
  line(`รวม ${totalQty} ชิ้น`);

  // Footer
  if (t.round) {
    align(1);
    bold(true);
    line();
    line(`-- ใบที่ ${t.round.n}/${t.round.m} --`);
    bold(false);
  }
  raw(0x0a, 0x0a, 0x0a);
  raw(0x1d, 0x56, 1);    // partial cut
  return new Uint8Array(out);
}

/** Legacy (env PRINTER_IP) entry point — same layout, one ticket for the given items. */
export function buildKitchenTicketESCPOS(order: any, items: KitchenTicketItem[], isAddOn: boolean): Uint8Array {
  return buildKitchenTicket({
    orderNumber: order.orderNumber,
    tableNumber: order.table?.number ?? null,
    orderType: order.type,
    cashierName: order.cashier?.name,
    items,
    isAddOn,
  });
}

export function sendToPrinter(bytes: Uint8Array, ip: string, port = 9100): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(port, ip, () => {
      client.write(Buffer.from(bytes), () => {
        client.end();
      });
    });
    client.on('close', () => resolve());
    client.on('error', (err) => reject(err));
    client.setTimeout(5000, () => {
      client.destroy();
      reject(new Error('Printer timeout'));
    });
  });
}

/**
 * Fire a round's kitchen ticket at the configured network printer. Best-effort
 * only — a failed/misconfigured printer must never fail the order itself, so
 * this always resolves and just logs on error. No per-station routing yet
 * (single global PRINTER_IP), and no retry/queue — both are deferred to a
 * later "print stations" settings feature.
 */
export async function printKitchenTicket(order: any, items: KitchenTicketItem[], isAddOn: boolean) {
  const printerIp = process.env.PRINTER_IP;
  if (!printerIp || items.length === 0) return;
  try {
    const port = Number(process.env.PRINTER_PORT || 9100);
    const bytes = buildKitchenTicketESCPOS(order, items, isAddOn);
    await sendToPrinter(bytes, printerIp, port);
  } catch (err) {
    logger.warn({ err, orderId: order.id, orderNumber: order.orderNumber }, 'Kitchen ticket auto-print failed');
  }
}
