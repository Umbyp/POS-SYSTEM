import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from '@/lib/uuid';

export interface PendingOrder {
  id: string;
  payload: Record<string, unknown>;
  /** Sent as the Idempotency-Key on every attempt so a replay after a dropped response can't duplicate the order. */
  idempotencyKey?: string;
  createdAt: number;
}

export interface PendingSettle {
  id: string;
  orderId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

/** A dine-in "send to kitchen" that couldn't reach the server.
 * - `open`  → POST /orders/open
 * - `round` → POST /orders/:orderId/items. If the bill itself was opened offline, `orderId` is
 *   unknown and `dependsOn` is the local id of the queued `open`; replay fills `orderId` in once
 *   that open succeeds. Replay is strictly in queue order. */
export interface PendingTabOp {
  /** Also the Idempotency-Key. */
  id: string;
  kind: 'open' | 'round';
  tableId?: string;
  orderId?: string;
  dependsOn?: string;
  payload: Record<string, unknown>;
  /** Short Thai label for failure alerts, e.g. "ส่งเข้าครัว โต๊ะ 4". */
  label: string;
  createdAt: number;
}

/** A queued request the server definitively rejected (4xx) — surfaced once, then dropped. */
export interface QueueFailure {
  id: string;
  label: string;
  message: string;
  at: number;
}

interface OfflineQueueState {
  orders: PendingOrder[];
  settles: PendingSettle[];
  tabOps: PendingTabOp[];
  failures: QueueFailure[];
  enqueueOrder: (payload: Record<string, unknown>, idempotencyKey?: string) => void;
  enqueueSettle: (orderId: string, payload: Record<string, unknown>) => void;
  /** Pass `id` to reuse the Idempotency-Key of a request that was already attempted live. */
  enqueueTabOp: (op: Omit<PendingTabOp, 'id' | 'createdAt'> & { id?: string }) => string;
  removeOrder: (id: string) => void;
  removeSettle: (id: string) => void;
  removeTabOp: (id: string) => void;
  /** An offline-opened bill now has a server id: point its queued rounds at it. */
  resolveOpen: (openOpId: string, orderId: string) => void;
  /** Queued rounds waiting on a failed open can never succeed — drop them with it. */
  dropDependents: (openOpId: string) => PendingTabOp[];
  addFailure: (label: string, message: string) => void;
  clearFailures: () => void;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Mirrors apps/web's Dexie pendingOrders/pendingSettles tables — queued
 * payloads for POST /orders, POST /orders/:id/settle and the dine-in
 * open/add-round calls that failed because the device had no route to the
 * API, replayed by useOfflineSync. Persisted so a queued request survives the
 * app being killed while offline. */
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      orders: [],
      settles: [],
      tabOps: [],
      failures: [],
      enqueueOrder: (payload, idempotencyKey) =>
        set((s) => ({ orders: [...s.orders, { id: makeId(), payload, idempotencyKey: idempotencyKey ?? uuid(), createdAt: Date.now() }] })),
      enqueueSettle: (orderId, payload) =>
        set((s) => ({ settles: [...s.settles, { id: makeId(), orderId, payload, createdAt: Date.now() }] })),
      enqueueTabOp: (op) => {
        const id = op.id ?? uuid();
        set((s) => ({ tabOps: [...s.tabOps, { ...op, id, createdAt: Date.now() }] }));
        return id;
      },
      removeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
      removeSettle: (id) => set((s) => ({ settles: s.settles.filter((x) => x.id !== id) })),
      removeTabOp: (id) => set((s) => ({ tabOps: s.tabOps.filter((x) => x.id !== id) })),
      resolveOpen: (openOpId, orderId) =>
        set((s) => ({
          tabOps: s.tabOps.map((o) => (o.dependsOn === openOpId ? { ...o, orderId, dependsOn: undefined } : o)),
        })),
      dropDependents: (openOpId) => {
        const dropped = get().tabOps.filter((o) => o.dependsOn === openOpId);
        if (dropped.length > 0) set((s) => ({ tabOps: s.tabOps.filter((o) => o.dependsOn !== openOpId) }));
        return dropped;
      },
      addFailure: (label, message) =>
        set((s) => ({ failures: [...s.failures, { id: makeId(), label, message, at: Date.now() }] })),
      clearFailures: () => set({ failures: [] }),
    }),
    {
      name: 'pos-offline-queue',
      storage: createJSONStorage(() => AsyncStorage as StateStorage),
    }
  )
);

/** Everything still waiting to sync (drives the OfflineBanner count). */
export const selectQueueCount = (s: OfflineQueueState) => s.orders.length + s.settles.length + s.tabOps.length;
