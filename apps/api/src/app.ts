import express, { type RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
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
app.use(
  cors({
    origin: env.WEB_URL.split(',').map((s) => s.trim()),
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

// Cast: express-rate-limit@7 ships Express-5-aligned handler types; runtime is Express 4
app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false }) as unknown as RequestHandler,
);

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

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
