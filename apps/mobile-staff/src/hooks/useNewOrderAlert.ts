import { useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { useKdsAlert } from '@/stores/kdsAlert.store';
import type { Order } from '@/types/pos';

const FLASH_MS = 5000;
const PATTERN = [0, 350, 150, 350];

/**
 * Detects newly arrived PENDING orders by diffing the KDS order list against
 * the ids seen so far. Works for socket pushes (event -> invalidate -> refetch)
 * and for the 10s poll alike, so no separate socket listener is needed.
 *
 * No audio library is installed (expo-av/expo-audio would need a native
 * rebuild), so the alert is a visual flash (`newCount > 0` for ~5s) plus a
 * vibration that the persisted mute toggle silences.
 */
export function useNewOrderAlert(orders: Order[] | undefined) {
  const muted = useKdsAlert((s) => s.muted);
  const seen = useRef<Set<string> | null>(null);
  const [newCount, setNewCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!orders) return;
    const pending = orders.filter((o) => o.status === 'PENDING').map((o) => o.id);

    // First data after mount: just record, don't alert for what's already queued.
    if (!seen.current) {
      seen.current = new Set(pending);
      return;
    }
    const fresh = pending.filter((id) => !seen.current!.has(id));
    pending.forEach((id) => seen.current!.add(id));
    if (fresh.length === 0) return;

    setNewCount((c) => c + fresh.length);
    if (!muted) {
      try {
        Vibration.vibrate(PATTERN);
      } catch {
        /* vibration unavailable (simulator / no permission) */
      }
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNewCount(0), FLASH_MS);
  }, [orders, muted]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return {
    newCount,
    dismiss: () => {
      if (timer.current) clearTimeout(timer.current);
      setNewCount(0);
    },
  };
}
