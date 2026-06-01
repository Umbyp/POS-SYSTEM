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
      const count = await db.pendingOrders.count();
      setPending(count);
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
