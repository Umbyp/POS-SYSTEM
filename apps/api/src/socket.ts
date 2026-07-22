import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt';
import { logger } from './utils/logger';

export function initSocket(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('No token'));
    try {
      const user = verifyToken(token);
      (socket as any).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    if (!user) return socket.disconnect();

    socket.join(`store:${user.storeId}`);
    if (user.role === 'KITCHEN' || user.role === 'OWNER' || user.role === 'ADMIN') {
      socket.join(`store:${user.storeId}:kds`);
    }

    logger.info({ userId: user.id, role: user.role }, 'Socket connected');

    socket.on('disconnect', () => {
      logger.info({ userId: user.id }, 'Socket disconnected');
    });
  });

  // Customer-facing display — deliberately unauthenticated (no JWT) so a
  // kiosk tablet/second screen can open a store-specific link without
  // needing a staff login. It can only *receive* broadcasts relayed via the
  // authenticated POST /display/broadcast endpoint (see display.routes.ts);
  // there is no way to read or write store data through this socket.
  io.of('/display').on('connection', (socket) => {
    socket.on('join', (payload: { storeId?: string }) => {
      const storeId = payload?.storeId;
      if (typeof storeId === 'string' && storeId) {
        socket.join(`store:${storeId}:display`);
      }
    });
  });

  // Self-order (QR ordering) — also unauthenticated, same reasoning as
  // /display: a customer's own phone has no staff login. Once its cart is
  // merged into a real order, it can join that order's room to hear live
  // kitchen status (PREPARING/READY — see order.service.ts updateStatus). It
  // cannot read or write anything else.
  io.of('/self-order').on('connection', (socket) => {
    socket.on('join', (payload: { orderId?: string }) => {
      const orderId = payload?.orderId;
      if (typeof orderId === 'string' && orderId) {
        socket.join(`order:${orderId}`);
      }
    });
  });
}
