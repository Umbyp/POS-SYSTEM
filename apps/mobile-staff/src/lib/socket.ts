import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/constants/config';
import { useAuthStore } from '@/stores/auth.store';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (socket?.connected) return socket;

  const token = useAuthStore.getState().token;
  if (!token) return null;

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
