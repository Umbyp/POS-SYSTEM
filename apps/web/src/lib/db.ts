import Dexie, { Table } from 'dexie';

export interface PendingOrder {
  id?: number;
  payload: any;
  createdAt: number;
  retries: number;
  error?: string;
}

export interface CachedProduct {
  id: string;
  data: any;
  cachedAt: number;
}

// A settle targets an *existing* order (openTab bill) rather than creating a
// new one, so it needs its own queue keyed by orderId — replaying it just
// re-POSTs to /orders/:orderId/settle when connectivity returns.
export interface PendingSettle {
  id?: number;
  orderId: string;
  payload: any;
  createdAt: number;
  retries: number;
  error?: string;
}

class POSDatabase extends Dexie {
  pendingOrders!: Table<PendingOrder, number>;
  cachedProducts!: Table<CachedProduct, string>;
  pendingSettles!: Table<PendingSettle, number>;

  constructor() {
    super('pos-offline');
    this.version(1).stores({
      pendingOrders: '++id, createdAt',
      cachedProducts: 'id, cachedAt',
    });
    this.version(2).stores({
      pendingOrders: '++id, createdAt',
      cachedProducts: 'id, cachedAt',
      pendingSettles: '++id, createdAt, orderId',
    });
  }
}

export const db = typeof window !== 'undefined' ? new POSDatabase() : null;
