/**
 * ESC/POS Command Generator
 *
 * Use case 1: Web USB / Web Serial → printer (browser-side)
 * Use case 2: Send bytes to backend, which forwards via TCP socket to network printer
 *
 * Reference: ESC/POS Application Programming Guide (Epson, Star Micronics)
 *
 * Usage:
 *   const bytes = buildReceipt({ store, order });
 *   // Send to printer:
 *   //   - Web USB: device.transferOut(endpoint, bytes)
 *   //   - Web Serial: writer.write(bytes)
 *   //   - Backend TCP: socket.write(bytes) to <printer_ip>:9100
 */

// Encoding for Thai (TIS-620 / CP874)
// JavaScript does not encode TIS-620 natively — map manually
const THAI_TIS620_MAP: Record<string, number> = {};
// Thai consonants: U+0E01..U+0E2E → 0xA1..0xCE
// Vowels and tone marks: U+0E2F..U+0E5B → 0xCF..0xFB

function tis620Byte(char: string): number {
  const code = char.charCodeAt(0);
  // ASCII printable
  if (code >= 0x20 && code <= 0x7e) return code;
  // Thai range
  if (code >= 0x0e01 && code <= 0x0e5b) {
    return code - 0x0e01 + 0xa1;
  }
  // Replace unsupported with ?
  return 0x3f;
}

function encodeTextTIS620(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = tis620Byte(text[i]);
  return bytes;
}

class ESCPOSBuilder {
  private chunks: number[] = [];

  raw(...bytes: number[]): this {
    this.chunks.push(...bytes);
    return this;
  }

  text(t: string): this {
    const encoded = encodeTextTIS620(t);
    this.chunks.push(...Array.from(encoded));
    return this;
  }

  line(t = ''): this {
    return this.text(t).raw(0x0a);
  }

  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.chunks.push(0x0a);
    return this;
  }

  init(): this {
    // ESC @ - initialize printer
    return this.raw(0x1b, 0x40);
  }

  setCharset(): this {
    // ESC t 21 - select code table TIS-620 (Thai)
    // Some models use 21 = TIS620, others 26 = TIS18
    return this.raw(0x1b, 0x74, 21);
  }

  align(mode: 'left' | 'center' | 'right'): this {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    return this.raw(0x1b, 0x61, n);
  }

  bold(on: boolean): this {
    return this.raw(0x1b, 0x45, on ? 1 : 0);
  }

  size(width: 1 | 2, height: 1 | 2): this {
    // GS ! n  — n = (width-1)<<4 | (height-1)
    const n = ((width - 1) << 4) | (height - 1);
    return this.raw(0x1d, 0x21, n);
  }

  divider(): this {
    return this.line('--------------------------------');
  }

  // Columns: left + right within 32 chars (for 80mm paper = 32-48 columns)
  twoCol(left: string, right: string, width = 32): this {
    const space = Math.max(1, width - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }

  cut(): this {
    // GS V 1 — partial cut
    return this.raw(0x1d, 0x56, 1);
  }

  qr(data: string): this {
    // QR Code commands
    const len = data.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;

    // Set QR model (model 2)
    this.raw(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Set size (1-16, recommend 4-8)
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
    // Set error correction (48=L, 49=M, 50=Q, 51=H)
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Store data
    this.raw(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    this.text(data);
    // Print
    this.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

// ============ Receipt Templates ============

interface ReceiptStore {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  promptpayId?: string | null;
  taxRate?: number;
  priceIncludesTax?: boolean;
}

interface ReceiptOrder {
  orderNumber: string;
  createdAt: Date | string;
  items: { product: { name: string }; quantity: number; unitPrice: number | string }[];
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  cashier?: { name: string };
  table?: { number: string } | null;
  payments: { method: string; amount: number | string }[];
}

export function buildReceipt(store: ReceiptStore, order: ReceiptOrder): Uint8Array {
  const b = new ESCPOSBuilder();

  b.init().setCharset();

  // Header
  b.align('center').bold(true).size(2, 2).line(store.name);
  b.size(1, 1).bold(false);
  if (store.address) b.line(store.address);
  if (store.phone) b.line(`Tel. ${store.phone}`);
  if (store.taxId) b.line(`TAX ID: ${store.taxId}`);
  b.divider();

  // Order info
  b.align('left');
  b.line(`No.: ${order.orderNumber}`);
  b.line(`Date: ${new Date(order.createdAt).toLocaleString('en-US')}`);
  if (order.cashier) b.line(`Cashier: ${order.cashier.name}`);
  if (order.table) b.line(`Table: ${order.table.number}`);
  b.divider();

  // Items
  for (const item of order.items) {
    const price = Number(item.unitPrice) * item.quantity;
    b.line(item.product.name);
    b.twoCol(`  ${item.quantity} x ${Number(item.unitPrice).toFixed(2)}`, price.toFixed(2));
  }
  b.divider();

  // Totals
  const rate = store.taxRate ?? 7;
  const inclusive = store.priceIncludesTax ?? true;
  b.twoCol(`Subtotal${inclusive && Number(order.tax) > 0 ? ' (incl. VAT)' : ''}`, Number(order.subtotal).toFixed(2));
  if (Number(order.discount) > 0) b.twoCol('Discount', `-${Number(order.discount).toFixed(2)}`);
  if (Number(order.tax) > 0) {
    const label = inclusive ? `VAT ${rate}% (incl.)` : `VAT ${rate}%`;
    b.twoCol(label, Number(order.tax).toFixed(2));
  }
  b.bold(true).size(2, 1).twoCol('Total', Number(order.total).toFixed(2), 16);
  b.size(1, 1).bold(false);
  b.divider();

  // Payments
  for (const p of order.payments) {
    const label =
      p.method === 'CASH' ? 'Cash'
      : p.method === 'PROMPTPAY' ? 'PromptPay'
      : p.method === 'CREDIT_CARD' ? 'Credit Card'
      : 'Bank Transfer';
    b.twoCol(label, Number(p.amount).toFixed(2));
  }

  // Footer
  b.feed(1);
  b.align('center');
  b.line('*** Thank you ***');
  b.line('Have a great day');
  b.feed(3);

  // Cut
  b.cut();

  return b.build();
}

// ============ Kitchen ticket (KOT, mockup 4a) ============
// Same layout as apps/api/src/modules/orders/escpos.ts and
// apps/mobile-staff/src/lib/escpos.ts (the mobile app prints it over the LAN).
const encodeText = (s: string): number[] => Array.from(encodeTextTIS620(s));

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
