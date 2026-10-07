import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initSocket } from './socket';
import { logger } from './utils/logger';
import { expireDuePoints } from './modules/loyalty/loyalty.service';

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    // The authenticated main namespace still requires a valid JWT (see
    // socket.ts), so a permissive origin here is safe — it only widens who
    // can *attempt* to connect, not what they can do without a token. This
    // also lets the unauthenticated /display namespace be reached from a
    // customer-facing device on the same LAN but a different origin
    // (e.g. http://192.168.x.x:3000) than WEB_URL.
    origin: true,
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

// Loyalty: write off lapsed points daily (also done lazily on member lookup).
// Idempotent, so running on boot + every 24h across restarts/instances is safe.
const runExpiry = () =>
  expireDuePoints()
    .then((r) => r.points > 0 && logger.info(r, 'expired loyalty points'))
    .catch((err) => logger.error({ err }, 'expireDuePoints failed'));
setTimeout(runExpiry, 30_000).unref();
setInterval(runExpiry, 24 * 60 * 60 * 1000).unref();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  httpServer.close(() => process.exit(0));
});
