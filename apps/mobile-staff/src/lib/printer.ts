// Sends raw ESC/POS bytes straight from the phone to the restaurant's network
// printer over TCP (port 9100) — no backend involved. The backend (apps/api)
// may be hosted off-site with no route to the restaurant's LAN, but the staff
// phone is physically there on the same WiFi, so it connects directly.
//
// iOS requires the "Local Network" permission the first time a connection
// like this is made (NSLocalNetworkUsageDescription in app.json) — the OS
// shows its own prompt, nothing to trigger manually here.
import TcpSockets from 'react-native-tcp-socket';
import { buildReceiptESCPOS, buildKitchenTicketESCPOS } from './escpos';
import type { Order } from '@/types/pos';
import type { StoreSettings } from '@/types/backoffice';

export class PrinterError extends Error {}

export function sendToPrinter(bytes: Uint8Array, ip: string, port = 9100): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = TcpSockets.createConnection({ host: ip, port }, () => {
      client.write(bytes, undefined, (err) => {
        if (err) {
          if (!settled) { settled = true; reject(new PrinterError(err.message)); }
          return;
        }
        client.end();
      });
    });

    client.setTimeout(5000, () => {
      if (!settled) { settled = true; reject(new PrinterError('เชื่อมต่อเครื่องพิมพ์หมดเวลา (timeout)')); }
      client.destroy();
    });

    client.on('error', (err: Error) => {
      if (!settled) { settled = true; reject(new PrinterError(err.message)); }
    });

    client.on('close', () => {
      if (!settled) { settled = true; resolve(); }
    });
  });
}

/** Throws PrinterError when the store has no printer IP set yet (Settings). */
function requirePrinterIp(store: Pick<StoreSettings, 'printerIp' | 'printerPort'>) {
  if (!store.printerIp) {
    throw new PrinterError('ยังไม่ได้ตั้งค่า IP เครื่องพิมพ์ — ไปที่ตั้งค่า > เครื่องพิมพ์');
  }
  return { ip: store.printerIp, port: store.printerPort || 9100 };
}

export async function printReceipt(store: StoreSettings, order: Order): Promise<void> {
  const { ip, port } = requirePrinterIp(store);
  await sendToPrinter(buildReceiptESCPOS(store, order), ip, port);
}

export async function printKitchenTicket(store: StoreSettings, order: Order): Promise<void> {
  const { ip, port } = requirePrinterIp(store);
  const items = order.items.map((it) => ({ name: it.product.name, quantity: it.quantity, notes: it.notes }));
  await sendToPrinter(buildKitchenTicketESCPOS(order, items), ip, port);
}
