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
  /** Legacy per-product variants. */
  variants?: { id?: string; name: string; priceDelta: string | number }[];
  /** Store-level option groups attached to this product. */
  optionGroups?: ProductOptionGroup[];
}

export interface OptionItem {
  id: string;
  name: string;
  priceDelta: string | number;
  isDefault?: boolean;
}

export interface OptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number; // 0 = unlimited
  isActive?: boolean;
  options: OptionItem[];
}

export interface ProductOptionGroup {
  group: OptionGroup;
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
  refundReason?: string | null;
  variants?: { name: string; priceDelta: number }[] | null;
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
  promotionName?: string | null;
  promotionDiscount?: string | null;
  pointsRedeemed?: number | null;
  pointsEarned?: number | null;
  stampsEarned?: number | null;
  stampsRedeemed?: number | null;
  serviceCharge: string;
  tax: string;
  total: string;
  notes: string | null;
  createdAt: string;
  table: { id: string; number: string } | null;
  customer: { id: string; name: string } | null;
  customerName: string | null;
  guestCount?: number | null;
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

export type PromotionType = 'PERCENT_OFF' | 'FIXED_OFF' | 'BUY_X_GET_Y' | 'FIXED_PRICE';
export type PromotionScope = 'ALL_ORDER' | 'CATEGORY' | 'PRODUCT';

/** GET /promotions row (Decimal columns arrive as strings). */
export interface Promotion {
  id: string;
  name: string;
  code: string | null;
  type: PromotionType;
  scope: PromotionScope;
  value: string | number;
  buyQty: number | null;
  getQty: number | null;
  productIds: string[];
  categoryIds: string[];
  minSpend: string | number | null;
  startAt: string | null;
  endAt: string | null;
  daysOfWeek: number[];
  hourStart: number | null;
  hourEnd: number | null;
  memberOnly: boolean;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
}

/** GET /customers?q= row as used by the POS member picker. */
export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  points: number;
  stamps: number;
  tier?: { name: string; color: string | null } | null;
}

/** GET /loyalty/redemptions/code/:code */
export interface RewardRedemption {
  id: string;
  code: string;
  status: 'ACTIVE' | 'USED' | 'CANCELLED';
  customerId: string;
  reward: { id: string; name: string; kind: 'DISCOUNT' | 'FREE_ITEM'; discountAmount: number };
  customer?: { id: string; name: string; phone: string | null };
}
