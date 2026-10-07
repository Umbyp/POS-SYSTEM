import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { printQueuedJob, type PrintJobPayload } from '@/lib/printer';
import { usePrintStation } from '@/stores/printStation.store';
import { useAuthStore } from '@/stores/auth.store';

const POLL_MS = 15_000;
const MAX_POLL_MS = 60_000;

/**
 * Print-queue runner. The backend can't reach the shop's LAN printers, so it
 * queues PrintJob rows; this phone (on the same WiFi) drains them: it listens
 * for the 'print:job' socket event, polls /print-jobs/pending as a fallback,
 * prints each job over TCP and reports /complete or /fail (the server retries
 * failed jobs, so a down printer just keeps the job pending).
 * Mount once in the authenticated layout.
 */
export function usePrintQueue() {
  const qc = useQueryClient();
  const enabled = usePrintStation((s) => s.enabled);
  const token = useAuthStore((s) => s.token);
  const running = useRef(false);
  const failStreak = useRef(0);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let onWifi = true;

    const drain = async () => {
      if (running.current || cancelled || !onWifi) return;
      running.current = true;
      try {
        const { data } = await api.get<PrintJobPayload[]>('/print-jobs/pending');
        for (const job of data) {
          if (cancelled) break;
          try {
            await printQueuedJob(job);
            failStreak.current = 0;
            await api.post(`/print-jobs/${job.id}/complete`).catch(() => {});
          } catch (err) {
            failStreak.current += 1;
            const msg = err instanceof Error ? err.message : 'print failed';
            await api.post(`/print-jobs/${job.id}/fail`, { error: msg }).catch(() => {});
          }
        }
        if (data.length > 0) qc.invalidateQueries({ queryKey: ['printers'] });
      } catch {
        // API unreachable — the next poll tries again.
      } finally {
        running.current = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      // Back off while every attempt is failing (e.g. this phone can't see the printer).
      const delay = Math.min(MAX_POLL_MS, POLL_MS * (1 + Math.min(failStreak.current, 3)));
      timer = setTimeout(async () => {
        await drain();
        schedule();
      }, delay);
    };

    const unsubNet = NetInfo.addEventListener((state) => {
      // A phone on mobile data can't reach LAN printers; don't burn the job's retries.
      onWifi = state.type !== 'cellular';
      if (onWifi) drain();
    });
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') drain(); });

    const socket = getSocket();
    const onJob = () => { drain(); };
    socket?.on('print:job', onJob);

    drain();
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubNet();
      appSub.remove();
      socket?.off('print:job', onJob);
    };
  }, [enabled, token, qc]);
}
