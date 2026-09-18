import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrderType } from '@/types/pos';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  items: CartItem[];
  tableId?: string;
  type: OrderType;
  /** Server id of the table's running (open) bill, if any — mirrors apps/web's cart.store.ts */
  openOrderId?: string;

  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  setTable: (id?: string) => void;
  setType: (t: OrderType) => void;
  setOpenOrder: (id?: string) => void;
  clearItems: () => void;
  clear: () => void;

  subtotal: () => number;
  itemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      type: 'DINE_IN',

      addItem: (item) =>
        set((s) => {
          const qty = item.quantity ?? 1;
          const idx = s.items.findIndex((i) => i.productId === item.productId);
          if (idx >= 0) {
            const next = [...s.items];
            next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
            return { items: next };
          }
          return { items: [...s.items, { ...item, quantity: qty }] };
        }),

      updateQty: (id, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== id)
              : s.items.map((i) => (i.productId === id ? { ...i, quantity: qty } : i)),
        })),

      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.productId !== id) })),

      setTable: (id) => set({ tableId: id }),
      setType: (t) => set({ type: t }),
      setOpenOrder: (id) => set({ openOrderId: id }),

      clearItems: () => set({ items: [] }),
      clear: () => set({ items: [], tableId: undefined, openOrderId: undefined }),

      subtotal: () => get().items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    {
      name: 'pos-cart',
      storage: createJSONStorage(() => AsyncStorage as StateStorage),
    }
  )
);
