// Mirrors apps/mobile-staff/src/types/pos.ts (the fields the world needs).
export type TableStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'BILLING' | 'DIRTY';
export type OrderStatus = 'DRAFT' | 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export interface RestaurantTable {
  id: string;
  number: string;
  capacity: number;
  size: 'SMALL' | 'MEDIUM' | 'LARGE';
  status: TableStatus;
  occupiedAt: string | null;
}

export interface LiveOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  table?: { id: string; number: string } | null;
  total?: number | string;
  cashier?: { name: string } | null;
  items?: { quantity: number; notes?: string | null; product?: { name: string } | null }[];
}

export type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN' | 'GUEST';

export interface Staff {
  id: string;
  name: string;
  role: Role;
}

/** One line of the big menu board. */
export interface MenuItem {
  name: string;
  price: number;
}
