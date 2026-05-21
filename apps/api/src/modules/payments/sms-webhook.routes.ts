/**
 * SMS Webhook for inbound bank payment notifications.
 *
 * Flow:
 *   1. User installs an Android "SMS Forwarder" app at the counter
 *   2. App POSTs incoming bank SMS to /api/payments/sms-webhook/:storeToken
 *   3. We parse the SMS, store the notification, try to match a recent
 *      unpaid order with the same amount, and emit a Socket.io event
 *   4. POS frontend receives the event and announces with Web Speech API
 *
 * The webhook is intentionally public (no auth middleware) — authenticated by
 * the per-store smsWebhookToken in the URL.
 */
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authMiddleware } from '../../middleware/auth.middleware';
import { rbac } from '../../middleware/rbac.middleware';
import {
  parseBankMessage,
  parseBankEmail,
  isPlausibleAmount,
} from './sms-parser';
import crypto from 'crypto';

const router = Router();

/**
 * POST /api/payments/sms-webhook/:storeToken
 *
 * Accepts two payload shapes:
 *   SMS:    { message: string, from?: string, receivedAt?: string }
 *   Email:  { subject: string, body: string, from?: string, receivedAt?: string }
 *
 * No auth middleware — protected by storeToken in URL.
 */
router.post('/sms-webhook/:storeToken', async (req, res, next) => {
  try {
    const { storeToken } = req.params;
    const { message, subject, body, from, receivedAt } = req.body || {};

    const isEmail = typeof subject === 'string' || typeof body === 'string';
    const isSms = typeof message === 'string' && message.length > 0;

    if (!isSms && !isEmail) {
      return res
        .status(400)
        .json({ error: 'either "message" (SMS) or "subject"+"body" (email) is required' });
    }

    const store = await prisma.store.findFirst({
      where: { smsWebhookToken: storeToken },
    });
    if (!store) {
      return res.status(401).json({ error: 'invalid webhook token' });
    }

    const parsedAt = receivedAt ? new Date(receivedAt) : new Date();
    const parsed = isEmail
      ? parseBankEmail(subject || '', body || '', parsedAt)
      : parseBankMessage(message!, parsedAt);

    const rawForStorage = isEmail
      ? `[EMAIL] ${subject || ''}\n${body || ''}`.slice(0, 4000)
      : message!.slice(0, 4000);

    if (!parsed || !isPlausibleAmount(parsed.amount)) {
      // Still log non-payment messages for debugging, but don't broadcast
      return res.json({ ok: true, parsed: false, reason: 'not an inbound payment' });
    }

    // Replace raw with full email body (parser sees a truncated combined view)
    parsed.raw = rawForStorage;

    // Find a matching unpaid order: pending with this exact total within last 60 min
    const sinceWindow = new Date(Date.now() - 60 * 60_000);
    const candidate = await prisma.order.findFirst({
      where: {
        storeId: store.id,
        status: { in: ['PENDING', 'PREPARING'] },
        total: parsed.amount,
        createdAt: { gte: sinceWindow },
      },
      orderBy: { createdAt: 'desc' },
    });

    const notification = await prisma.paymentNotification.create({
      data: {
        storeId: store.id,
        amount: parsed.amount,
        bank: parsed.bank || null,
        senderName: parsed.senderName || from || null,
        rawMessage: rawForStorage,
        receivedAt: parsedAt,
        matched: !!candidate,
        matchedOrderId: candidate?.id || null,
      },
    });

    // Emit Socket.io event so POS can speak the amount
    const io = req.app.get('io');
    if (io) {
      io.to(`store:${store.id}`).emit('payment:received', {
        notificationId: notification.id,
        amount: parsed.amount,
        bank: parsed.bank,
        senderName: parsed.senderName,
        matchedOrderId: candidate?.id || null,
        matchedOrderNumber: candidate?.orderNumber || null,
        receivedAt: parsedAt.toISOString(),
      });
    }

    return res.json({
      ok: true,
      parsed: true,
      notification: {
        id: notification.id,
        amount: parsed.amount,
        matched: !!candidate,
        matchedOrderId: candidate?.id,
      },
    });
  } catch (e) {
    next(e);
  }
});

/* ---------- Authenticated endpoints (frontend) ---------- */
const authRouter = Router();
authRouter.use(authMiddleware);

// List recent payment notifications for this store
authRouter.get('/notifications', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const notifications = await prisma.paymentNotification.findMany({
      where: { storeId: req.user!.storeId },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
    res.json(notifications);
  } catch (e) {
    next(e);
  }
});

// Manually match a notification with an order
authRouter.post('/notifications/:id/match-order', async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId: req.user!.storeId },
    });
    if (!order) return res.status(404).json({ error: 'order not found' });

    const updated = await prisma.paymentNotification.update({
      where: { id: req.params.id },
      data: { matchedOrderId: orderId, matched: true },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Generate / rotate webhook token for current store
authRouter.post(
  '/sms-webhook/rotate-token',
  rbac('OWNER', 'ADMIN'),
  async (req, res, next) => {
    try {
      const token = crypto.randomBytes(24).toString('base64url');
      await prisma.store.update({
        where: { id: req.user!.storeId },
        data: { smsWebhookToken: token },
      });
      res.json({ token });
    } catch (e) {
      next(e);
    }
  }
);

// Read current webhook token (or null)
authRouter.get('/sms-webhook/token', async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
      select: { smsWebhookToken: true },
    });
    res.json({ token: store?.smsWebhookToken || null });
  } catch (e) {
    next(e);
  }
});

// Test the parser without storing (for the settings UI "test" button)
authRouter.post('/sms-webhook/parse-test', async (req, res, next) => {
  try {
    const { message, subject, body } = req.body || {};
    let parsed = null;
    if (subject || body) {
      parsed = parseBankEmail(subject || '', body || '');
    } else if (message) {
      parsed = parseBankMessage(message);
    } else {
      return res.status(400).json({ error: 'message or subject+body required' });
    }
    res.json({ parsed });
  } catch (e) {
    next(e);
  }
});

export { router as smsWebhookPublicRouter, authRouter as smsWebhookAuthRouter };
