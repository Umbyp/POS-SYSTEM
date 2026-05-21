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
}
