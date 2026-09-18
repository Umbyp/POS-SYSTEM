import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { useOfflineQueue } from '@/stores/offlineQueue.store';

// A device can stay on the same WiFi the whole time while the API itself is
// what's unreachable (a slow server wake, a restart) — NetInfo never fires a
// reconnect event for that, so this is also polled on an interval and on
// every app-foreground while something is queued.
const RETRY_INTERVAL_MS = 20000;

/** Replays queued orders/settles (see offlineQueue.store) whenever the
 * device regains a network connection, mirroring apps/web's useOfflineQueue.
 * A queue entry is dropped once the server accepts it OR rejects it with a
 * response (e.g. 400 — already settled elsewhere); a network-level failure
 * (no response) stops that pass so it retries on the next connectivity event. */
export function useOfflineSync() {
  const qc = useQueryClient();
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const { orders, settles, removeOrder, removeSettle } = useOfflineQueue.getState();
      let synced = false;

      for (const o of orders) {
        try {
          await api.post('/orders', o.payload);
          removeOrder(o.id);
          synced = true;
        } catch (err) {
          if (isAxiosError(err) && err.response) removeOrder(o.id);
          else break;
        }
      }

      for (const s of settles) {
        try {
          await api.post(`/orders/${s.orderId}/settle`, s.payload);
          removeSettle(s.id);
          synced = true;
        } catch (err) {
          if (isAxiosError(err) && err.response) removeSettle(s.id);
          else break;
        }
      }

      if (synced) {
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['kds-orders'] });
        qc.invalidateQueries({ queryKey: ['tables'] });
      }
    } finally {
      syncingRef.current = false;
    }
  }, [qc]);

  useEffect(() => {
    sync();

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected) sync();
    });

    const unsubscribeAppState = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });

    const interval = setInterval(() => {
      const { orders, settles } = useOfflineQueue.getState();
      if (orders.length > 0 || settles.length > 0) sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      unsubscribeNetInfo?.();
      unsubscribeAppState?.remove();
      clearInterval(interval);
    };
  }, [sync]);
}
