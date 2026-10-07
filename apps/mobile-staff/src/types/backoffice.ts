import type { Role } from '@/stores/auth.store';

export interface Inventory {
  id: string;
  productId: string;
  quantity: number;
  lowStockAt: number;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    image: string | null;
    category: { id: string; name: string } | null;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  address: string | null;
  notes: string | null;
  points: number;
  stamps: number;
  totalSpent: string;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  createdAt: string;
  items: { product: { name: string } }[];
}

export interface MemberTier {
  id: string;
  name: string;
  minSpent: number;
  color: string | null;
  sortOrder: number;
}

export interface CustomerDetail extends Customer {
  orders: CustomerOrderSummary[];
  tier?: MemberTier | null;
  nextTier?: MemberTier | null;
  tierProgress?: { spent: number; target: number; remaining: number; pct: number } | null;
  expiringPoints?: number;
  expiringDate?: string | null;
}

export interface RewardRedemption {
  id: string;
  code: string;
  status: 'ACTIVE' | 'USED' | 'CANCELLED';
  pointsSpent: number;
  createdAt: string;
  usedAt: string | null;
  reward: { id: string; name: string; kind: 'DISCOUNT' | 'FREE_ITEM'; discountAmount: number };
  customer: { id: string; name: string; phone: string | null };
}

export type LoyaltyMode = 'OFF' | 'POINTS' | 'STAMPS' | 'BOTH';

export interface StoreSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  taxId: string | null;
  logo: string | null;
  currency: string;
  taxRate: number;
  priceIncludesTax: boolean;
  serviceCharge: number;
  promptpayId: string | null;
  invoicePrefix: string | null;
  branchCode: string | null;
  dailyTarget: string | null;
  monthlyTarget: string | null;
  loyaltyMode: LoyaltyMode;
  pointsEarnBaht: number;
  pointValue: string;
  minRedeemPoints: number;
  pointsExpiryMonths: number;
  stampsEarnBaht: number;
  stampsPerReward: number;
  stampRewardValue: string;
  stampRewardName: string | null;
  receiptShowSignupQr: boolean;
  receiptSignupHeadline: string | null;
  receiptShowPointsQr: boolean;
  receiptPointsTerms: string | null;
  receiptFooterText: string | null;
  printerIp: string | null;
  printerPort: number;
}

export interface Employee {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { orders: number };
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: Role };
}

export interface DashboardOverview {
  storeName: string;
  today: {
    revenue: number;
    orders: number;
    avgTicket: number;
    vsYesterdayPct: number | null;
  };
  restaurant: {
    activeTables: number;
    totalTables: number;
    pendingKitchen: number;
  };
  alerts: {
    lowStock: { id: string; name: string; quantity: number; lowStockAt: number }[];
    outOfStockCount: number;
  };
  topItems: { name: string; qty: number; revenue: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    type: string;
    createdAt: string;
    tableNumber: string | null;
  }[];
  insights: { type: 'positive' | 'neutral' | 'warning' | 'critical'; text: string }[];
  /** Today's sales per hour (24 entries, Asia/Bangkok). */
  hourly: { hour: number; orders: number; revenue: number }[];
}

export interface DailySalesRow {
  date: string;
  revenue: number;
  orders: number;
}

export interface ReportSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  profitMargin: number;
  orderCount: number;
  itemsSold: number;
  avgTicket: number;
  topProducts: { product: { id: string; name: string }; quantity: number; revenue: number }[];
  paymentBreakdown: { method: string; amount: number; count: number }[];
  growth: { revenue: number | null; orderCount: number | null; avgTicket: number | null };
}
