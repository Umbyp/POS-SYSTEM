import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorMiddleware } from './middleware/error.middleware';

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

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: env.WEB_URL.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false }),
);

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

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

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorMiddleware);

export default app;
