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
import { stripeWebhookHandler } from './modules/payments/stripe-webhook.routes';

const app = express();

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
app.use('/api/uploads', uploadRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorMiddleware);

export default app;
