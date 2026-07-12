'use client';
import { useEffect, useRef } from 'react';

/**
 * Customer-facing display channel — a second browser tab/window opened on
 * the same machine (e.g. dragged onto a customer-facing monitor) mirrors the
 * cashier's cart and, at checkout, the PromptPay QR. Uses BroadcastChannel,
 * so it only works same-origin/same-browser — there is no server involved
 * and no support for a display on a separate device.
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

/** Send a state update to the customer display, if one is open. */
export function sendToCustomerDisplay(msg: CustomerDisplayMessage) {
  getChannel()?.postMessage(msg);
}

/** Subscribe to display updates — used by the customer-display page itself. */
export function useCustomerDisplayMessages(onMessage: (msg: CustomerDisplayMessage) => void) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const handler = (e: MessageEvent<CustomerDisplayMessage>) => cbRef.current(e.data);
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
  }, []);
}
