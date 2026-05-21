'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth as useAuthStore } from '@/stores/auth.store';

export function useRequireAuth(roles?: string[]) {
  const router = useRouter();
  const { user, token, setAuth, logout } = useAuthStore();

  const { isLoading, data } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await api.get('/auth/me');
      return r.data;
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    if (data) {
      setAuth(
        { id: data.id, name: data.name, email: data.email, role: data.role, storeId: data.storeId },
        token
      );
    }
  }, [token, data, router, setAuth]);

  useEffect(() => {
    if (user && roles && !roles.includes(user.role)) {
      router.replace('/pos');
    }
  }, [user, roles, router]);

  return { user, isLoading, logout };
}
