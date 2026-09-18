import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  storeId: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  hasHydrated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

// SecureStore is async and key-based (no bulk read), which is exactly what
// zustand's StateStorage interface expects — no extra adapter code needed.
const secureStoreStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      hasHydrated: false,
      setAuth: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'pos-auth',
      storage: createJSONStorage(() => secureStoreStorage),
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
