import { create } from 'zustand';

export interface StockAlertItem {
  inventoryId: string;
  productId: string;
  name: string;
  quantity: number;
  lowStockAt: number;
  level: 1 | 2; // 1 = running low, 2 = out
  isIngredient: boolean;
}

interface StockAlertState {
  items: StockAlertItem[];
  /** Merge freshly announced items (newest first; one entry per inventory, worst level wins). */
  push: (incoming: StockAlertItem[]) => void;
  dismiss: () => void;
}

export const useStockAlert = create<StockAlertState>((set) => ({
  items: [],
  push: (incoming) =>
    set((s) => {
      const byId = new Map(s.items.map((i) => [i.inventoryId, i]));
      for (const i of incoming) {
        const prev = byId.get(i.inventoryId);
        if (!prev || i.level >= prev.level) byId.set(i.inventoryId, i);
      }
      const merged = [...incoming.map((i) => byId.get(i.inventoryId)!), ...[...byId.values()].filter((v) => !incoming.some((i) => i.inventoryId === v.inventoryId))];
      return { items: merged.slice(0, 20) };
    }),
  dismiss: () => set({ items: [] }),
}));
