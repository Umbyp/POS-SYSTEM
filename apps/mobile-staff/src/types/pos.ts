export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  image: string | null;
  costPrice: string;
  sellingPrice: string;
  categoryId: string | null;
  category: Category | null;
  isActive: boolean;
  isIngredient: boolean;
  trackStock: boolean;
  inventory: { quantity: number; lowStockAt: number } | null;
}

export type OrderStatus = 'DRAFT' | 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type PaymentMethod = 'CASH' | 'PROMPTPAY' | 'BANK_TRANSFER' | 'CREDIT_CARD';

export interface OrderItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: string;
  notes: string | null;
  refundedQty: number;
}

export interface OrderPayment {
  method: PaymentMethod;
  amount: string;
  reference: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  payments: OrderPayment[];
  subtotal: string;
  discount: string;
  serviceCharge: string;
  tax: string;
  total: string;
  notes: string | null;
  createdAt: string;
  table: { id: string; number: string } | null;
  customer: { id: string; name: string } | null;
  customerName: string | null;
  cashier: { id: string; name: string } | null;
}

export type TableStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'BILLING' | 'DIRTY';
export type TableSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface RestaurantTable {
  id: string;
  number: string;
  capacity: number;
  size: TableSize;
  status: TableStatus;
  occupiedAt: string | null;
}
