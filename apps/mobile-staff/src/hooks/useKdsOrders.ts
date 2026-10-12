import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/types/pos';

/**
 * Active kitchen orders (PENDING/PREPARING/READY). Shared by the KDS screen
 * and the dashboard bell so both read one cache entry — useOrderRealtime
 * invalidates ['kds-orders'] on socket events and after a reconnect.
 */
export function useKdsOrders(opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ['kds-orders'],
    queryFn: async () => {
      const res = await api.get('/orders', { params: { status: 'PENDING,PREPARING,READY', limit: 150 } });
      return res.data as { data: Order[] };
    },
    refetchInterval: opts.refetchInterval ?? 10000,
    enabled: opts.enabled ?? true,
  });
}
