/**
 * ESC/POS Command Generator
 *
 * Use case 1: Web USB / Web Serial → printer (browser-side)
 * Use case 2: ส่ง bytes ไปให้ backend forward TCP socket ไปยัง network printer
 *
 * Reference: ESC/POS Application Programming Guide (Epson, Star Micronics)
 *
 * วิธีใช้:
 *   const bytes = buildReceipt({ store, order });
 *   // ส่งไปยัง printer:
 *   //   - Web USB: device.transferOut(endpoint, bytes)
 *   //   - Web Serial: writer.write(bytes)
 *   //   - Backend TCP: socket.write(bytes) ไปยัง <printer_ip>:9100
 */

// Encoding for Thai (TIS-620 / CP874)
// JavaScript ไม่ encode TIS-620 native — ต้อง map เอง
const THAI_TIS620_MAP: Record<string, number> = {};
// Thai consonants (ก-ฮ): U+0E01..U+0E2E → 0xA1..0xCE
// สระและวรรณยุกต์: U+0E2F..U+0E5B → 0xCF..0xFB

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
    // บางรุ่นใช้ 21 = TIS620, บางรุ่น 26 = TIS18
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

  // คอลัมน์: ซ้าย + ขวา ใน 32 ตัวอักษร (สำหรับกระดาษ 80mm = 32-48 columns)
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
  if (store.phone) b.line(`โทร. ${store.phone}`);
  if (store.taxId) b.line(`TAX ID: ${store.taxId}`);
  b.divider();

  // Order info
  b.align('left');
  b.line(`เลขที่: ${order.orderNumber}`);
  b.line(`วันที่: ${new Date(order.createdAt).toLocaleString('th-TH')}`);
  if (order.cashier) b.line(`พนักงาน: ${order.cashier.name}`);
  if (order.table) b.line(`โต๊ะ: ${order.table.number}`);
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
  b.twoCol(`ยอดรวม${inclusive && Number(order.tax) > 0 ? ' (รวม VAT)' : ''}`, Number(order.subtotal).toFixed(2));
  if (Number(order.discount) > 0) b.twoCol('ส่วนลด', `-${Number(order.discount).toFixed(2)}`);
  if (Number(order.tax) > 0) {
    const label = inclusive ? `VAT ${rate}% (รวมในราคา)` : `ภาษีมูลค่าเพิ่ม ${rate}%`;
    b.twoCol(label, Number(order.tax).toFixed(2));
  }
  b.bold(true).size(2, 1).twoCol('รวมทั้งสิ้น', Number(order.total).toFixed(2), 16);
  b.size(1, 1).bold(false);
  b.divider();

  // Payments
  for (const p of order.payments) {
    const label =
      p.method === 'CASH' ? 'เงินสด'
      : p.method === 'PROMPTPAY' ? 'พร้อมเพย์'
      : p.method === 'CREDIT_CARD' ? 'บัตรเครดิต'
      : 'โอนธนาคาร';
    b.twoCol(label, Number(p.amount).toFixed(2));
  }

  // Footer
  b.feed(1);
  b.align('center');
  b.line('*** ขอบคุณที่ใช้บริการ ***');
  b.line('Thank you');
  b.feed(3);

  // Cut
  b.cut();

  return b.build();
}
