import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  image?: string;
  notes?: string;
  variants?: { name: string; priceDelta: number }[];
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export interface CartCustomer {
  id: string;
  name: string;
  phone?: string | null;
  points?: number;
  stamps?: number;
}

export interface AppliedPromotion {
  promotionId: string;
  promotionName: string;
  discountAmount: number;
}

interface CartState {
  items: CartItem[];
  discount: number;
  pointsToRedeem: number;
  useStampReward: boolean;
  promotion?: AppliedPromotion;
  promoCode: string;
  tableId?: string;
  type: OrderType;
  gpFeePct: number; // delivery-platform commission % (e.g. LINE MAN ~30%)
  customerNote: string;
  customer?: CartCustomer;
  openOrderId?: string; // server id of the table's running (open) bill, if any

  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  setNotes: (productId: string, notes: string) => void;
  setDiscount: (amt: number) => void;
  setPointsToRedeem: (n: number) => void;
  setUseStampReward: (v: boolean) => void;
  setPromotion: (p?: AppliedPromotion) => void;
  setPromoCode: (c: string) => void;
  setTable: (id?: string) => void;
  setType: (t: OrderType) => void;
  setGpFeePct: (pct: number) => void;
  setOpenOrder: (id?: string) => void;
  setCustomerNote: (n: string) => void;
  setCustomer: (c?: CartCustomer) => void;
  clearItems: () => void;
  clear: () => void;

  subtotal: () => number;
  itemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discount: 0,
      pointsToRedeem: 0,
      useStampReward: false,
      promoCode: '',
      type: 'DINE_IN',
      gpFeePct: 30,
      customerNote: '',

      addItem: (item) =>
        set((s) => {
          const qty = item.quantity ?? 1;
          const idx = s.items.findIndex((i) => i.productId === item.productId);
          if (idx >= 0) {
            const next = [...s.items];
            next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
            return { items: next };
          }
          return {
            items: [
              ...s.items,
              { ...item, quantity: qty } as CartItem,
            ],
          };
        }),

      updateQty: (id, qty) =>
        set((s) => ({
          items: qty <= 0
            ? s.items.filter((i) => i.productId !== id)
            : s.items.map((i) =>
                i.productId === id ? { ...i, quantity: qty } : i
              ),
        })),

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== id) })),

      setNotes: (id, notes) =>
        set((s) => ({
          items: s.items.map((i) => (i.productId === id ? { ...i, notes } : i)),
        })),

      setDiscount: (amt) => set({ discount: amt }),
      setPointsToRedeem: (n) => set({ pointsToRedeem: Math.max(0, n) }),
      setUseStampReward: (v) => set({ useStampReward: v }),
      setPromotion: (p) => set({ promotion: p }),
      setPromoCode: (c) => set({ promoCode: c }),
      setTable: (id) => set({ tableId: id }),
      setType: (t) => set({ type: t }),
      setGpFeePct: (pct) => set({ gpFeePct: Math.min(100, Math.max(0, pct)) }),
      setOpenOrder: (id) => set({ openOrderId: id }),
      setCustomerNote: (n) => set({ customerNote: n }),
      setCustomer: (c) =>
        // Reset points/reward when changing customer
        set({ customer: c, pointsToRedeem: 0, useStampReward: false }),

      // Clear the current (unsent) round but keep the table/customer selection
      clearItems: () => set({ items: [], discount: 0, promotion: undefined, promoCode: '' }),

      clear: () =>
        set({
          items: [],
          discount: 0,
          pointsToRedeem: 0,
          useStampReward: false,
          promotion: undefined,
          promoCode: '',
          tableId: undefined,
          customerNote: '',
          customer: undefined,
          openOrderId: undefined,
        }),

      subtotal: () =>
        get().items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    { name: 'pos-cart' }
  )
);
