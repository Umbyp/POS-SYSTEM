import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingOrder {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PendingSettle {
  id: string;
  orderId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

interface OfflineQueueState {
  orders: PendingOrder[];
  settles: PendingSettle[];
  enqueueOrder: (payload: Record<string, unknown>) => void;
  enqueueSettle: (orderId: string, payload: Record<string, unknown>) => void;
  removeOrder: (id: string) => void;
  removeSettle: (id: string) => void;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Mirrors apps/web's Dexie pendingOrders/pendingSettles tables — queued
 * payloads for POST /orders and POST /orders/:id/settle that failed because
 * the device had no route to the API, replayed by useOfflineSync. Persisted
 * so a queued order survives the app being killed while offline. */
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set) => ({
      orders: [],
      settles: [],
      enqueueOrder: (payload) =>
        set((s) => ({ orders: [...s.orders, { id: makeId(), payload, createdAt: Date.now() }] })),
      enqueueSettle: (orderId, payload) =>
        set((s) => ({ settles: [...s.settles, { id: makeId(), orderId, payload, createdAt: Date.now() }] })),
      removeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
      removeSettle: (id) => set((s) => ({ settles: s.settles.filter((x) => x.id !== id) })),
    }),
    {
      name: 'pos-offline-queue',
      storage: createJSONStorage(() => AsyncStorage as StateStorage),
    }
  )
);
