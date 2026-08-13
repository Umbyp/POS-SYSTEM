import express, { type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { errorMiddleware } from './middleware/error.middleware';
import uploadRoutes, { UPLOADS_DIR } from './modules/uploads/upload.routes';

import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/product.routes';
import orderRoutes from './modules/orders/order.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import employeeRoutes from './modules/employees/employee.routes';
import reportRoutes from './modules/reports/report.routes';
import tableRoutes from './modules/tables/table.routes';
import storeRoutes from './modules/stores/store.routes'; // 🆕
import activityRoutes from './modules/activity/activity.routes';
import customerRoutes from './modules/customers/customer.routes';
import paymentRoutes from './modules/payments/payment.routes';
import {
  smsWebhookPublicRouter,
  smsWebhookAuthRouter,
} from './modules/payments/sms-webhook.routes';
import promotionRoutes from './modules/promotions/promotion.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { displayPublicRouter, displayRouter } from './modules/display/display.routes';
import { selfOrderPublicRouter, selfOrderRouter } from './modules/self-order/self-order.routes';
import { stripeWebhookHandler } from './modules/payments/stripe-webhook.routes';

const app = express();

// We run behind exactly one reverse proxy in production (Render's load
// balancer). Without this, Express's req.ip resolves to the proxy's own
// address for every request — since express-rate-limit keys its buckets by
// req.ip, that collapses ALL clients (every customer of every store hitting
// the public self-order endpoints) into a single shared counter, causing
// unrelated customers to 429 each other out under real traffic.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());

const allowedWebOrigins = env.WEB_URL.split(',').map((s) => s.trim());
// Vercel mints a unique URL per deployment (preview + production), so a static
// WEB_URL alone breaks on every new deploy. Allow any deployment under our own
// Vercel project/team scope in addition to the fixed origin(s) from WEB_URL.
const vercelPreviewOrigin = /^https:\/\/pos-system-[a-z0-9]+-umbyps-projects\.vercel\.app$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedWebOrigins.includes(origin) || vercelPreviewOrigin.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);
// Stripe webhook MUST receive the raw body (signature verification) — mount BEFORE express.json
app.post(
  '/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

app.use(express.json({ limit: '10mb' }));

// Brute-force guard on credential *attempts* only.
//
// This used to sit on the whole /api/auth router, which also serves
// GET /auth/me — a request every dashboard page fires on load. Thirty page
// loads inside the window (an ordinary morning, and shared by every device
// behind the shop's NAT) burned the budget, and the next 429 hit
// POST /auth/login: nobody could sign in for up to fifteen minutes. Keep the
// limiter on the endpoints where a guess costs something, and leave reads out.
//
// Cast: express-rate-limit@7 ships Express-5-aligned handler types; runtime is Express 4
const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // a staff member signing in shouldn't spend the budget
  // Default handler answers with plain text; the web client reads {error}.
  handler: (req, res) => {
    const retryAfter = Number(res.getHeader('Retry-After')) || 900;
    res.status(429).json({
      error: `ลองเข้าสู่ระบบหลายครั้งเกินไป — กรุณารออีก ${Math.ceil(retryAfter / 60)} นาทีแล้วลองใหม่`,
      code: 'TOO_MANY_ATTEMPTS',
      retryAfter,
    });
  },
}) as unknown as RequestHandler;

for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/google']) {
  app.use(path, authAttemptLimiter);
}

// Liveness: is the process up and serving? Deliberately does NOT touch the
// database — Render restarts the service when this fails, and a restart loop is
// no help when the DB is the thing that's down.
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Readiness: can we actually serve a request that needs data? The shallow check
// above stayed green through a full outage where every DB-backed endpoint 500'd,
// which is precisely the signal that was missing. Point uptime monitoring here.
app.get('/health/db', async (_req, res) => {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', ms: Date.now() - started });
  } catch (err) {
    // Prisma puts the code on errorCode for init failures and code for request
    // errors; fall back to the class name so the response always says something.
    const e = err as { errorCode?: string; code?: string; name?: string; message?: string };
    logger.error({ err }, 'Health check: database unreachable');
    res.status(503).json({
      ok: false,
      db: 'unreachable',
      ms: Date.now() - started,
      prismaCode: e.errorCode ?? e.code ?? e.name ?? null,
      detail: e.message?.split('\n')[0]?.slice(0, 160) ?? null,
    });
  }
});

// Serve uploaded images statically at /uploads/* (long browser cache; filenames are content-hashed)
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    immutable: true,
    fallthrough: false,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/stores', storeRoutes); // 🆕
app.use('/api/activity-logs', activityRoutes);
app.use('/api/customers', customerRoutes);
// SMS webhook is public (per-store token in URL) — mount BEFORE auth-protected payment routes
app.use('/api/payments', smsWebhookPublicRouter);
app.use('/api/payments', smsWebhookAuthRouter);
app.use('/api/payments', paymentRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
// Public ready-board read is unauthenticated (reached via a TV/kiosk link) — mount BEFORE the staff-only router
app.use('/api/display', displayPublicRouter);
app.use('/api/display', displayRouter);
// Public menu/submit is unauthenticated (reached via table QR) — mount BEFORE the staff-only router
app.use('/api/self-order', selfOrderPublicRouter);
app.use('/api/self-order', selfOrderRouter);
app.use('/api/uploads', uploadRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorMiddleware);

export default app;
