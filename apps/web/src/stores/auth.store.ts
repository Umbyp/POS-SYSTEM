import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN';
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

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      hasHydrated: false,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') localStorage.setItem('token', token);
        set({ user, token });
      },
      logout: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('token');
        set({ user: null, token: null });
      },
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'pos-auth',
      // Only persist user + token (not hasHydrated flag itself)
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        // Mark as hydrated once localStorage has been read
        state?.setHasHydrated(true);
        // Sync token to legacy localStorage key used by axios interceptor
        if (typeof window !== 'undefined' && state?.token) {
          localStorage.setItem('token', state.token);
        }
      },
    }
  )
);
