'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth as useAuthStore } from '@/stores/auth.store';

export function useRequireAuth(roles?: string[]) {
  const router = useRouter();
  const { user, token, hasHydrated, setAuth, logout } = useAuthStore();

  const { isLoading, data, isError } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await api.get('/auth/me');
      return r.data;
    },
    // Only query once hydration is done AND token exists
    enabled: hasHydrated && !!token,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min — avoid refetching every refresh
  });

  // Redirect to /login only after hydration completes and there's no token
  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      router.replace('/login');
    }
  }, [hasHydrated, token, router]);

  // Refresh user info from /auth/me response
  useEffect(() => {
    if (data && token) {
      setAuth(
        { id: data.id, name: data.name, email: data.email, role: data.role, storeId: data.storeId },
        token
      );
    }
  }, [data, token, setAuth]);

  // If /auth/me explicitly fails (e.g. 401), logout
  useEffect(() => {
    if (isError && hasHydrated) {
      logout();
      router.replace('/login');
    }
  }, [isError, hasHydrated, logout, router]);

  // Role-based redirect
  useEffect(() => {
    if (user && roles && !roles.includes(user.role)) {
      router.replace('/pos');
    }
  }, [user, roles, router]);

  // While hydrating, treat as loading so the layout shows spinner instead of flashing /login
  return { user, isLoading: !hasHydrated || isLoading, logout };
}
