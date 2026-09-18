import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoreTaxConfig {
  taxRate: number;
  serviceCharge: number;
  priceIncludesTax: boolean;
}

interface StoreConfigState {
  config: StoreTaxConfig | null;
  setConfig: (c: StoreTaxConfig) => void;
}

/** Last-known store tax config, cached so a fresh app launch with no
 * connectivity can still price a cash sale (see PaymentModal's amountDue) —
 * tax rates change rarely, so a stale copy is far better than being unable
 * to charge at all. */
export const useStoreConfig = create<StoreConfigState>()(
  persist(
    (set) => ({
      config: null,
      setConfig: (c) => set({ config: c }),
    }),
    {
      name: 'pos-store-config',
      storage: createJSONStorage(() => AsyncStorage as StateStorage),
    }
  )
);
