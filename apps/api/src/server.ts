import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initSocket } from './socket';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';

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

// Loyalty points expiry (also done lazily on member lookup) is now triggered by a
// Supabase pg_cron job hitting POST /api/internal/expire-points once a day,
// instead of an in-process setInterval — see internal.routes.ts.

// Graceful shutdown: stop taking new connections, let in-flight requests and
// sockets finish, release the DB pool, and force-exit if that stalls (Render
// sends SIGKILL ~30s after SIGTERM anyway). Guarded so a second signal is a no-op.
let shuttingDown = false;
function shutdown(signal: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down...`);
  const force = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(code || 1);
  }, 10_000);
  force.unref();
  io.close(() => {
    // io.close() also closes the underlying http server.
    prisma.$disconnect().catch(() => {}).finally(() => process.exit(code));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A rejected promise nobody awaited would otherwise crash Node (v15+) with no
// context; log it and keep serving. An uncaught exception leaves the process in
// an unknown state, so log it and exit non-zero for the supervisor to restart.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});
