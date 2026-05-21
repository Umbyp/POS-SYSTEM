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

class POSDatabase extends Dexie {
  pendingOrders!: Table<PendingOrder, number>;
  cachedProducts!: Table<CachedProduct, string>;

  constructor() {
    super('pos-offline');
    this.version(1).stores({
      pendingOrders: '++id, createdAt',
      cachedProducts: 'id, cachedAt',
    });
  }
}

export const db = typeof window !== 'undefined' ? new POSDatabase() : null;
