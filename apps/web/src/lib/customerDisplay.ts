'use client';
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';

/**
 * Customer-facing display channel — mirrors the cashier's cart and, at
 * checkout, the PromptPay QR. Two transports run side by side:
 *
 *  - BroadcastChannel: instant, same-browser/same-machine (e.g. a second
 *    window dragged onto a customer-facing monitor on the till PC). No
 *    server involved, works offline.
 *  - Socket.IO `/display` namespace: for a display on a *separate* device
 *    (tablet/phone on the same network), reached via a store-specific link.
 *    This namespace is deliberately unauthenticated — see apps/api
 *    src/socket.ts — so the kiosk device needs no staff login.
 *
 * Senders (Cart/PaymentDialog) fire both. Receivers (the display page)
 * listen to both and just render whichever arrives.
 */
const CHANNEL_NAME = 'pos-customer-display';

export interface CartLineMsg {
  name: string;
  qty: number;
  unitPrice: number;
}

export type CustomerDisplayMessage =
  | { type: 'idle' }
  | { type: 'cart'; storeName?: string; items: CartLineMsg[]; subtotal: number; total: number }
  | {
      type: 'qr';
      amount: number;
      // Stripe-hosted QR image (when Stripe PromptPay is configured)...
      qrImageUrl?: string | null;
      // ...or the store's own PromptPay ID, rendered client-side otherwise.
      promptpayId?: string;
      merchantName?: string;
    }
  | { type: 'success'; total: number; orderNumber: string };

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Send a state update to the customer display, if one is open (any transport). */
export function sendToCustomerDisplay(msg: CustomerDisplayMessage) {
  getChannel()?.postMessage(msg);
  // Fire-and-forget — a display on another device may or may not be open;
  // either way this must never block or fail the cashier's own flow.
  api.post('/display/broadcast', msg).catch(() => {});
}

/**
 * Subscribe to display updates — used by the customer-display page itself.
 * Pass `storeId` (from the page's own URL, e.g. `?store=...`) to also
 * receive broadcasts relayed over the network for a separate-device display;
 * omit it to rely on BroadcastChannel only (same-machine).
 */
export function useCustomerDisplayMessages(
  onMessage: (msg: CustomerDisplayMessage) => void,
  storeId?: string
) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const ch = getChannel();
    const handler = (e: MessageEvent<CustomerDisplayMessage>) => cbRef.current(e.data);
    ch?.addEventListener('message', handler);
    return () => ch?.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    // Default to the page's own host (not a hardcoded "localhost") — this
    // page may be loaded on a separate device via a LAN IP, where
    // "localhost" would (wrongly) mean that device itself.
    const socketBase =
      process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
    const socket: Socket = io(`${socketBase}/display`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socket.on('connect', () => socket.emit('join', { storeId }));
    socket.on('update', (msg: CustomerDisplayMessage) => cbRef.current(msg));
    return () => {
      socket.disconnect();
    };
  }, [storeId]);
}
