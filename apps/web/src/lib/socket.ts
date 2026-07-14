import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Realtime server base URL. Prefers NEXT_PUBLIC_SOCKET_URL, but falls back to
 * NEXT_PUBLIC_API_URL with the trailing "/api" stripped — so a production
 * deploy only needs NEXT_PUBLIC_API_URL set and sockets follow automatically
 * (avoids the silent localhost:4000 fallback that breaks realtime in prod).
 */
export function getSocketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (explicit) return explicit;
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) return api.replace(/\/api\/?$/, '');
  return 'http://localhost:4000';
}

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => console.log('🔌 Socket connected'));
  socket.on('disconnect', () => console.log('🔌 Socket disconnected'));
  socket.on('connect_error', (err) => console.error('Socket error:', err.message));

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
