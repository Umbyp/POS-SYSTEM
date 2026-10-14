import type { LiveOrder, OrderStatus } from '../../types';

/** One order as the world sees it. */
export interface OrderView {
  id: string;
  number: string;
  status: OrderStatus;
  createdAt: number;
  /** when the status last changed (falls back to createdAt) */
  since: number;
  tableNumber: string | null;
  /** what was ordered (empty when the API did not say) */
  items: { name: string; qty: number; note?: string }[];
  total: number | null;
  cashier: string | null;
}

export const ACTIVE: OrderStatus[] = ['PENDING', 'PREPARING', 'READY'];
export const isActive = (s: OrderStatus) => ACTIVE.includes(s);

/** How long an order may sit in a state before the world shows a warning. Tune here. */
export const LATE_MS: Record<'PENDING' | 'PREPARING' | 'READY', number> = {
  PENDING: 5 * 60_000,
  PREPARING: 12 * 60_000,
  READY: 4 * 60_000,
};

export function isLate(o: OrderView, now = Date.now()): boolean {
  if (o.status !== 'PENDING' && o.status !== 'PREPARING' && o.status !== 'READY') return false;
  const from = o.status === 'PENDING' ? o.createdAt : o.since;
  return now - from > LATE_MS[o.status];
}

export function toOrderView(o: LiveOrder): OrderView {
  const created = Date.parse(o.createdAt) || Date.now();
  return {
    id: o.id,
    number: o.orderNumber,
    status: o.status,
    createdAt: created,
    since: o.updatedAt ? Date.parse(o.updatedAt) || created : created,
    tableNumber: o.table?.number ?? null,
    items: (o.items ?? []).map((i) => ({ name: i.product?.name ?? 'เมนู', qty: i.quantity, note: i.notes || undefined })),
    total: o.total == null ? null : Number(o.total),
    cashier: o.cashier?.name ?? null,
  };
}

/** Same sort the scene uses to give each real table a spot. */
export function sortTables<T extends { number: string }>(tables: T[]): T[] {
  return [...tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}
