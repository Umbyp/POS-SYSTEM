import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initSocket } from './socket';
import { logger } from './utils/logger';

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.WEB_URL.split(',').map((s) => s.trim()),
    credentials: true,
  },
});

initSocket(io);
app.set('io', io);

const port = Number(env.PORT);
httpServer.listen(port, () => {
  logger.info(`🚀 API running at http://localhost:${port}`);
  logger.info(`🔌 Socket.io ready`);
  logger.info(`🌐 CORS allowed for: ${env.WEB_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  httpServer.close(() => process.exit(0));
});
