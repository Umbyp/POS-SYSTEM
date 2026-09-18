import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import type { RestaurantTable } from '@/types/pos';

/** RN port of apps/web's useOrderRealtime — invalidates queries so screens
 * reactively refetch; toasts/sounds are left out of the mobile v1 scope. */
export function useOrderRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onOrders = () => qc.invalidateQueries({ queryKey: ['orders'] });
    const onKds = () => qc.invalidateQueries({ queryKey: ['kds-orders'] });
    const onStock = () => qc.invalidateQueries({ queryKey: ['products'] });
    const onTableUpdated = (table: RestaurantTable) => {
      qc.setQueryData<RestaurantTable[]>(['tables'], (old = []) => {
        if (!Array.isArray(old)) return old;
        const idx = old.findIndex((t) => t.id === table.id);
        if (idx === -1) return [...old, table];
        const next = [...old];
        next[idx] = { ...next[idx], ...table };
        return next;
      });
    };

    s.on('order:created', onOrders);
    s.on('order:status', onOrders);
    s.on('order:refunded', onOrders);
    s.on('stock:updated', onStock);
    s.on('kds:new', onKds);
    s.on('kds:status', onKds);
    s.on('table:updated', onTableUpdated);

    return () => {
      s.off('order:created', onOrders);
      s.off('order:status', onOrders);
      s.off('order:refunded', onOrders);
      s.off('stock:updated', onStock);
      s.off('kds:new', onKds);
      s.off('kds:status', onKds);
      s.off('table:updated', onTableUpdated);
    };
  }, [qc]);
}
