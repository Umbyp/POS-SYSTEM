import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ensureSocketConnected, getSocket } from '@/lib/socket';
import type { RestaurantTable } from '@/types/pos';

/** RN port of apps/web's useOrderRealtime — invalidates queries so screens
 * reactively refetch. The KDS new-order alert lives in useNewOrderAlert. */
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

    // After the connection comes back (network blip, API restart, phone slept)
    // we missed every event in between — refetch what screens show.
    const catchUp = () => {
      qc.invalidateQueries({ queryKey: ['kds-orders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    };
    // 'connect' fires for auto-reconnects and for the manual retries in
    // lib/socket.ts alike; only catch up if we were actually down before, so
    // the first connect doesn't cause a redundant refetch.
    let wasDown = false;
    const onDisconnect = () => { wasDown = true; };
    const onConnect = () => {
      if (wasDown) { wasDown = false; catchUp(); }
    };
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      ensureSocketConnected();
      catchUp();
    });

    s.on('disconnect', onDisconnect);
    s.on('connect', onConnect);
    s.on('order:created', onOrders);
    s.on('order:status', onOrders);
    s.on('order:refunded', onOrders);
    s.on('stock:updated', onStock);
    s.on('kds:new', onKds);
    s.on('kds:status', onKds);
    s.on('table:updated', onTableUpdated);

    return () => {
      appSub.remove();
      s.off('disconnect', onDisconnect);
      s.off('connect', onConnect);
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
