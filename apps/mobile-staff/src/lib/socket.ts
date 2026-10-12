import { useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/constants/config';
import { useAuthStore } from '@/stores/auth.store';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

let socket: Socket | null = null;
let status: SocketStatus = 'disconnected';
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let manualRetries = 0;
let unsubAuth: (() => void) | null = null;
const statusListeners = new Set<() => void>();

function setStatus(next: SocketStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l());
}

/**
 * socket.io retries automatically (with backoff) for transport errors, but
 * NOT after a server-initiated disconnect or a middleware rejection
 * (connect_error with `socket.active === false`) — e.g. an API restart that
 * briefly rejects the handshake. Cover those with our own capped backoff.
 */
function scheduleManualRetry() {
  if (retryTimer || !socket || !useAuthStore.getState().token) return;
  const delay = Math.min(30000, 1000 * 2 ** manualRetries++);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (socket && !socket.connected && useAuthStore.getState().token) {
      setStatus('connecting');
      socket.connect();
    }
  }, delay);
}

function clearManualRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/**
 * Singleton socket. Server-side, rooms (store / kds) are joined on every
 * `connection`, and listeners attached with `.on` survive reconnects, so
 * consumers don't need to re-subscribe — they only need to refetch whatever
 * they missed (see the `reconnect` handler in useOrderRealtime).
 */
export function getSocket(): Socket | null {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  if (socket) return socket;

  socket = io(getSocketUrl(), {
    // Function form: re-read the token on every (re)connect attempt.
    auth: (cb) => cb({ token: useAuthStore.getState().token }),
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 10000,
  });
  setStatus('connecting');

  socket.on('connect', () => {
    manualRetries = 0;
    clearManualRetry();
    setStatus('connected');
  });
  socket.on('disconnect', (reason) => {
    setStatus('disconnected');
    // 'io server disconnect' / 'io client disconnect' don't auto-reconnect.
    if (reason === 'io server disconnect') scheduleManualRetry();
  });
  socket.on('connect_error', () => {
    setStatus(socket?.active ? 'connecting' : 'disconnected');
    if (socket && !socket.active) scheduleManualRetry();
  });
  socket.io.on('reconnect_attempt', () => setStatus('connecting'));

  // Different staff member (PIN switch) → rooms/role are decided at handshake,
  // so reconnect with the new token; logout → tear down.
  unsubAuth?.();
  unsubAuth = useAuthStore.subscribe((state, prev) => {
    if (state.token === prev.token) return;
    if (!state.token) disconnectSocket();
    else if (socket) {
      socket.disconnect();
      setStatus('connecting');
      socket.connect();
    }
  });

  return socket;
}

/** Nudge a dead socket (e.g. app returned to foreground). No-op if connected. */
export function ensureSocketConnected() {
  const s = getSocket();
  if (s && !s.connected && !s.active) {
    manualRetries = 0;
    clearManualRetry();
    setStatus('connecting');
    s.connect();
  }
}

export function disconnectSocket() {
  clearManualRetry();
  manualRetries = 0;
  unsubAuth?.();
  unsubAuth = null;
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setStatus('disconnected');
}

export function getSocketStatus(): SocketStatus {
  return status;
}

/** Live connection status for UI (KDS dot, banners). */
export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => status
  );
}
