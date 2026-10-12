import { useCallback, useEffect, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { useOfflineQueue, selectQueueCount } from '@/stores/offlineQueue.store';
import { useCart } from '@/stores/cart.store';

// A device can stay on the same WiFi the whole time while the API itself is
// what's unreachable (a slow server wake, a restart) — NetInfo never fires a
// reconnect event for that, so this is also polled on an interval and on
// every app-foreground while something is queued.
const RETRY_INTERVAL_MS = 20000;

/** A response the server gave that retrying can never fix (bad request, bill already paid…).
 * 5xx, 401 (re-login), 408 and 429 are transient — those entries stay queued. */
function isDefinitiveRejection(err: unknown): err is import('axios').AxiosError<{ error?: string }> {
  if (!isAxiosError(err) || !err.response) return false;
  const s = err.response.status;
  return s >= 400 && s < 500 && s !== 401 && s !== 408 && s !== 429;
}

const rejectionMessage = (err: import('axios').AxiosError<{ error?: string }>) =>
  err.response?.data?.error ?? `เซิร์ฟเวอร์ปฏิเสธคำขอ (${err.response?.status})`;

/** Replays queued requests (see offlineQueue.store) whenever the device regains a connection,
 * mirroring apps/web's useOfflineQueue. Order: dine-in open/add-round (strictly in the order they
 * were made, a round waits for its bill's open), then pay-now orders, then settles.
 *
 * An entry is dropped only when the server accepted it OR definitively rejected it (4xx) — the
 * latter is recorded and shown in an alert. Network failures and 5xx stop that pass and leave the
 * entry queued; orders/opens carry an Idempotency-Key so replaying after a dropped response can't
 * create a duplicate. */
export function useOfflineSync() {
  const qc = useQueryClient();
  const syncingRef = useRef(false);
  const alertingRef = useRef(false);

  const flushFailures = useCallback(() => {
    if (alertingRef.current || AppState.currentState !== 'active') return;
    const { failures, clearFailures } = useOfflineQueue.getState();
    if (failures.length === 0) return;
    alertingRef.current = true;
    clearFailures();
    Alert.alert(
      'ส่งรายการที่ค้างไม่สำเร็จ',
      failures.map((f) => `• ${f.label}: ${f.message}`).join('\n'),
      [{ text: 'ตกลง', onPress: () => (alertingRef.current = false) }],
      { onDismiss: () => (alertingRef.current = false) }
    );
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const q = useOfflineQueue.getState();
      let synced = false;
      let stopped = false;

      // 1) dine-in open / add-round, strictly in queue order.
      while (!stopped) {
        const op = useOfflineQueue.getState().tabOps[0];
        if (!op) break;
        try {
          const headers = { 'Idempotency-Key': op.id };
          if (op.kind === 'open') {
            const order = (await api.post('/orders/open', op.payload, { headers })).data as { id: string };
            q.removeTabOp(op.id);
            q.resolveOpen(op.id, order.id);
            const cart = useCart.getState();
            if (cart.pendingOpenOpId === op.id) {
              useCart.setState({
                pendingOpenOpId: undefined,
                ...(cart.tableId && cart.tableId === op.tableId ? { openOrderId: order.id } : {}),
              });
            }
          } else {
            if (!op.orderId) {
              // Its open is gone from the queue without resolving — can't ever be delivered.
              q.removeTabOp(op.id);
              q.addFailure(op.label, 'ไม่พบบิลที่เปิดไว้');
              continue;
            }
            await api.post(`/orders/${op.orderId}/items`, op.payload, { headers });
            q.removeTabOp(op.id);
          }
          synced = true;
        } catch (err) {
          if (isDefinitiveRejection(err)) {
            q.removeTabOp(op.id);
            q.addFailure(op.label, rejectionMessage(err));
            if (op.kind === 'open') {
              for (const d of q.dropDependents(op.id)) q.addFailure(d.label, 'บิลที่เปิดไว้ถูกปฏิเสธ จึงส่งรายการนี้ไม่ได้');
              if (useCart.getState().pendingOpenOpId === op.id) useCart.setState({ pendingOpenOpId: undefined });
            }
          } else {
            stopped = true;
          }
        }
      }

      // 2) pay-now orders
      if (!stopped) {
        for (const o of useOfflineQueue.getState().orders) {
          try {
            await api.post('/orders', o.payload, { headers: { 'Idempotency-Key': o.idempotencyKey ?? o.id } });
            q.removeOrder(o.id);
            synced = true;
          } catch (err) {
            if (isDefinitiveRejection(err)) {
              q.removeOrder(o.id);
              q.addFailure('ออเดอร์ที่ชำระออฟไลน์', rejectionMessage(err));
            } else {
              stopped = true;
              break;
            }
          }
        }
      }

      // 3) settles (after opens/rounds so the bill is complete first)
      if (!stopped) {
        for (const s of useOfflineQueue.getState().settles) {
          try {
            await api.post(`/orders/${s.orderId}/settle`, s.payload);
            q.removeSettle(s.id);
            synced = true;
          } catch (err) {
            if (isDefinitiveRejection(err)) {
              q.removeSettle(s.id);
              q.addFailure('การชำระเงินที่ค้างอยู่', rejectionMessage(err));
            } else {
              break;
            }
          }
        }
      }

      if (synced) {
        qc.invalidateQueries({ queryKey: ['orders'] });
        qc.invalidateQueries({ queryKey: ['kds-orders'] });
        qc.invalidateQueries({ queryKey: ['tables'] });
      }
    } finally {
      syncingRef.current = false;
      flushFailures();
    }
  }, [qc, flushFailures]);

  useEffect(() => {
    sync();

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected) sync();
    });

    const unsubscribeAppState = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        sync();
        flushFailures();
      }
    });

    const interval = setInterval(() => {
      if (selectQueueCount(useOfflineQueue.getState()) > 0) sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      unsubscribeNetInfo?.();
      unsubscribeAppState?.remove();
      clearInterval(interval);
    };
  }, [sync, flushFailures]);
}
