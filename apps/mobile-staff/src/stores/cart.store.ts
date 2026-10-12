import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrderType } from '@/types/pos';

export interface CartVariant {
  name: string;
  priceDelta: number;
}

export interface CartItem {
  /** Line key: product + selected options (same dish with different options = separate line). */
  key?: string;
  productId: string;
  name: string;
  /** Base price + sum of variant priceDeltas (as web; the server recomputes authoritatively). */
  unitPrice: number;
  quantity: number;
  image?: string;
  categoryId?: string;
  notes?: string;
  variants?: CartVariant[];
}

export function cartLineKey(productId: string, variants?: CartVariant[]): string {
  if (!variants || variants.length === 0) return productId;
  return `${productId}|${variants.map((v) => v.name).sort().join('|')}`;
}

/** Key of an existing line (older persisted carts have no `key`). */
export const itemKey = (i: CartItem) => i.key ?? cartLineKey(i.productId, i.variants);

/** Order-payload shape for a cart line (shared by every code path that posts items). */
export function toOrderItem(i: CartItem) {
  return {
    productId: i.productId,
    quantity: i.quantity,
    notes: i.notes,
    ...(i.variants && i.variants.length > 0 ? { variants: i.variants } : {}),
  };
}

interface CartState {
  items: CartItem[];
  tableId?: string;
  type: OrderType;
  /** Server id of the table's running (open) bill, if any — mirrors apps/web's cart.store.ts */
  openOrderId?: string;
  /** Dine-in party size; sent as `guestCount` only when set. */
  guestCount?: number;

  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateQty: (key: string, qty: number) => void;
  removeItem: (key: string) => void;
  setTable: (id?: string) => void;
  setType: (t: OrderType) => void;
  setOpenOrder: (id?: string) => void;
  setGuestCount: (n?: number) => void;
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
          const key = cartLineKey(item.productId, item.variants);
          const idx = s.items.findIndex((i) => itemKey(i) === key);
          if (idx >= 0) {
            const next = [...s.items];
            next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
            return { items: next };
          }
          return { items: [...s.items, { ...item, key, quantity: qty }] };
        }),

      updateQty: (id, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => itemKey(i) !== id)
              : s.items.map((i) => (itemKey(i) === id ? { ...i, quantity: qty } : i)),
        })),

      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => itemKey(i) !== id) })),

      setTable: (id) => set({ tableId: id }),
      setType: (t) => set({ type: t }),
      setOpenOrder: (id) => set({ openOrderId: id }),
      setGuestCount: (n) => set({ guestCount: n && n > 0 ? Math.min(99, Math.floor(n)) : undefined }),

      clearItems: () => set({ items: [] }),
      clear: () => set({ items: [], tableId: undefined, openOrderId: undefined, guestCount: undefined }),

      subtotal: () => get().items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      itemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
    }),
    {
      name: 'pos-cart',
      storage: createJSONStorage(() => AsyncStorage as StateStorage),
    }
  )
);
