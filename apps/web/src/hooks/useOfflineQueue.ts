'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function useOfflineQueue() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    if (!db) return;

    const refresh = async () => {
      if (!db) return;
      const [orders, settles] = await Promise.all([
        db.pendingOrders.count(),
        db.pendingSettles.count(),
      ]);
      setPending(orders + settles);
    };

    const sync = async () => {
      if (!navigator.onLine || !db) return;
      const queue = await db.pendingOrders.toArray();
      for (const item of queue) {
        try {
          await api.post('/orders', item.payload);
          await db.pendingOrders.delete(item.id!);
          toast.success(`Offline order synced`);
        } catch (err: any) {
          await db.pendingOrders.update(item.id!, {
            retries: (item.retries || 0) + 1,
            error: err.message,
          });
        }
      }

      const settleQueue = await db.pendingSettles.toArray();
      for (const item of settleQueue) {
        try {
          await api.post(`/orders/${item.orderId}/settle`, item.payload);
          await db.pendingSettles.delete(item.id!);
          toast.success(`Offline payment synced`);
        } catch (err: any) {
          // Bill already settled elsewhere (e.g. cashier re-entered it on
          // another terminal) — drop it instead of retrying forever.
          if (err.response?.status === 400) {
            await db.pendingSettles.delete(item.id!);
            continue;
          }
          await db.pendingSettles.update(item.id!, {
            retries: (item.retries || 0) + 1,
            error: err.message,
          });
        }
      }

      refresh();
    };

    const handleOnline = () => {
      setOnline(true);
      sync();
    };
    const handleOffline = () => setOnline(false);

    refresh();
    sync();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { pending, online };
}

export async function submitOrderWithFallback(payload: any): Promise<{ offline: boolean; data?: any }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (db) {
      await db.pendingOrders.add({ payload, createdAt: Date.now(), retries: 0 });
    }
    return { offline: true };
  }
  try {
    const res = await api.post('/orders', payload);
    return { offline: false, data: res.data };
  } catch (err: any) {
    // network error → queue
    if (!err.response && db) {
      await db.pendingOrders.add({ payload, createdAt: Date.now(), retries: 0 });
      return { offline: true };
    }
    throw err;
  }
}

/**
 * Settle an existing open-tab bill, queuing for retry if offline. Unlike
 * submitOrderWithFallback, this targets a specific order id (the bill was
 * already created + fired to the kitchen), so a dropped connection at the
 * counter doesn't strand the cashier mid-payment.
 */
export async function submitSettleWithFallback(
  orderId: string,
  payload: any
): Promise<{ offline: boolean; data?: any }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (db) {
      await db.pendingSettles.add({ orderId, payload, createdAt: Date.now(), retries: 0 });
    }
    return { offline: true };
  }
  try {
    const res = await api.post(`/orders/${orderId}/settle`, payload);
    return { offline: false, data: res.data };
  } catch (err: any) {
    if (!err.response && db) {
      await db.pendingSettles.add({ orderId, payload, createdAt: Date.now(), retries: 0 });
      return { offline: true };
    }
    throw err;
  }
}
