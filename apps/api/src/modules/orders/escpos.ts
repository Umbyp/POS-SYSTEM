// ESC/POS builders + raw network-printer sender, shared by the manual
// customer-receipt print route (order.routes.ts) and the automatic
// kitchen-ticket print fired from order-tab.service.ts (openTab/addRound).
// One global PRINTER_IP/PRINTER_PORT for now — no per-station routing yet.
import * as net from 'net';

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
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'ทานที่ร้าน',
  TAKEAWAY: 'กลับบ้าน',
  DELIVERY: 'เดลิเวอรี่',
};

/**
 * A kitchen order ticket (KOT) — no prices (kitchen doesn't need to know the
 * bill), order#/table large and bold, item notes bold on their own line, and
 * an "เพิ่มรายการ" marker when this ticket is a later round rather than the
 * table's first. Only the items in *this* round print, not the whole order.
 */
export function buildKitchenTicketESCPOS(order: any, items: KitchenTicketItem[], isAddOn: boolean): Uint8Array {
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
  line('ครัว');
  out.push(0x1d, 0x21, 0x00);                 // normal size

  if (isAddOn) {
    line('*** เพิ่มรายการ ***');
  }

  out.push(0x0a);
  out.push(0x1d, 0x21, 0x11);                 // double size for order#/table
  const tableLabel = order.table ? order.table.number : ORDER_TYPE_LABEL[order.type] ?? order.type;
  twoCol(`#${order.orderNumber.split('-').pop()}`, tableLabel);
  out.push(0x1d, 0x21, 0x00);
  out.push(0x0a);

  out.push(0x1b, 0x61, 0);                    // left
  line(`${ORDER_TYPE_LABEL[order.type] ?? order.type}   ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
  if (order.cashier) line(`พนักงาน: ${order.cashier.name}`);
  line('--------------------------------');

  let totalQty = 0;
  for (const it of items) {
    totalQty += it.quantity;
    out.push(0x1d, 0x21, 0x01);               // double height
    line(`${it.quantity} x ${it.name}`);
    out.push(0x1d, 0x21, 0x00);
    if (it.notes?.trim()) {
      out.push(0x1b, 0x45, 1);                // bold on
      line(`  ** ${it.notes.trim()}`);
      out.push(0x1b, 0x45, 0);                // bold off
    }
  }
  line('--------------------------------');
  line(`รวม ${totalQty} ชิ้น`);

  out.push(0x0a, 0x0a);
  out.push(0x1d, 0x56, 1);                    // cut

  return new Uint8Array(out);
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
