import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Shift } from '@/types/shift';

export const ACTIVE_SHIFT_KEY = ['shift-active'] as const;

/** The signed-in user's open shift (null when none). `data === undefined` while loading / on error. */
export function useActiveShift(enabled = true) {
  return useQuery({
    queryKey: ACTIVE_SHIFT_KEY,
    queryFn: async () => ((await api.get('/employees/shifts/active')).data as Shift | null) ?? null,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Re-renders every minute so "elapsed" labels stay fresh. */
export function useMinuteTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}
