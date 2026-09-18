import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuthStore, type Role } from '@/stores/auth.store';
import { DEFAULT_ROUTE } from '@/constants/nav';

/** RN port of apps/web/src/hooks/useAuth.ts's useRequireAuth. */
export function useRequireAuth(roles?: Role[]) {
  const router = useRouter();
  const { user, token, hasHydrated, setAuth, logout } = useAuthStore();

  const { isLoading, data, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    enabled: hasHydrated && !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace('/login');
  }, [hasHydrated, token, router]);

  useEffect(() => {
    if (data && token) {
      setAuth(
        { id: data.id, name: data.name, email: data.email, role: data.role, storeId: data.storeId },
        token
      );
    }
  }, [data, token, setAuth]);

  useEffect(() => {
    if (isError && hasHydrated && isAxiosError(error) && error.response?.status === 401) {
      logout();
      router.replace('/login');
    }
  }, [isError, error, hasHydrated, logout, router]);

  useEffect(() => {
    if (user && roles && !roles.includes(user.role)) {
      router.replace(DEFAULT_ROUTE[user.role] as never);
    }
  }, [user, roles, router]);

  return { user, isLoading: !hasHydrated || isLoading, logout };
}
