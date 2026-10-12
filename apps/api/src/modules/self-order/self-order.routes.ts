import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as service from './self-order.service';
import { hitCounter } from '../../middleware/rate-limit-store';

// These endpoints are unauthenticated (a diner's phone hits them straight from
// the QR link), so throttle per IP to keep the QR from being a spam/abuse
// vector — fake orders, bill-call floods. Menu reads are chattier than writes.
// Cast: express-rate-limit@7 ships Express-5 handler types; runtime is Express 4.
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

// Same shape the staff POS sends ({name, priceDelta}); optionId/groupId are
// optional disambiguators. priceDelta is only cross-checked, never trusted.
const variantSchema = z.object({
  name: z.string().min(1).max(100),
  priceDelta: z.number().optional(),
  optionId: z.string().optional(),
  groupId: z.string().optional(),
});

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive().max(99),
  notes: z.string().max(200).optional(),
  variants: z.array(variantSchema).max(30).optional(),
});

const submitSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  note: z.string().max(500).optional(),
  customerId: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
});

const claimPointsSchema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
});

/**
 * Public — no auth. Reached by a customer's phone via the table's QR link.
 * Scoped entirely by the opaque `qrCode` token; never exposes internal IDs
 * or anything beyond the store's public menu.
 */
const publicRouter = Router();

publicRouter.get('/menu/:qrCode', readLimiter, async (req, res, next) => {
  try {
    const menu = await service.getMenu(req.params.qrCode);
    res.json(menu);
  } catch (e) { next(e); }
});

publicRouter.post('/:qrCode/submit', writeLimiter, validate(submitSchema), async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const request = await service.submitRequest(req.params.qrCode, req.body, io);
    res.status(201).json({ id: request.id, status: request.status, orderId: request.orderId });
  } catch (e) { next(e); }
});

publicRouter.get('/:qrCode/customer/lookup', readLimiter, async (req, res, next) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    const customer = await service.lookupCustomer(req.params.qrCode, phone);
    res.json(customer);
  } catch (e) { next(e); }
});

publicRouter.post('/:qrCode/customer/register', writeLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await service.registerCustomer(req.params.qrCode, name, phone, email);
    res.status(201).json(customer);
  } catch (e) { next(e); }
});

publicRouter.get('/status/:id', readLimiter, async (req, res, next) => {
  try {
    const status = await service.getStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'Not found' });
    res.json(status);
  } catch (e) { next(e); }
});

publicRouter.post('/:qrCode/call-bill', writeLimiter, async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const request = await service.callForBill(req.params.qrCode, io);
    res.status(201).json({ id: request.id });
  } catch (e) { next(e); }
});

publicRouter.get('/store/:storeId', readLimiter, async (req, res, next) => {
  try {
    const store = await service.getStorePublicInfo(req.params.storeId);
    res.json(store);
  } catch (e) { next(e); }
});

publicRouter.get('/store/:storeId/customer/lookup', readLimiter, async (req, res, next) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    const customer = await service.lookupCustomerByStore(req.params.storeId, phone);
    res.json(customer);
  } catch (e) { next(e); }
});

// Rewards/coupons visible to the member identified by phone (same trust model as lookup).
publicRouter.get('/store/:storeId/rewards', readLimiter, async (req, res, next) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    res.json(await service.listMemberRewards(req.params.storeId, phone));
  } catch (e) { next(e); }
});

const redeemSchema = z.object({ phone: z.string().min(1).max(30) });

// Redeeming spends a member's points and the only credential is their phone
// number, so guess-and-spend is the abuse case. Every attempt is counted —
// BEFORE the member lookup, whether or not the phone exists — per phone and
// per IP in the DB-backed counter table (shared across instances, survives
// restarts). The 429 is identical for known and unknown phones.
const REDEEM_WINDOW_MS = 15 * 60_000;
const REDEEM_MAX_PER_PHONE = 8;
const REDEEM_MAX_PER_IP = 40; // generous: a whole restaurant can share one NAT IP

const redeemGuard: RequestHandler = async (req, res, next) => {
  try {
    const storeId = req.params.storeId;
    const phone = String(req.body?.phone ?? '').replace(/\D/g, '') || 'none';
    const [byPhone, byIp] = await Promise.all([
      hitCounter(`redeem:phone:${storeId}:${phone}`, REDEEM_WINDOW_MS),
      hitCounter(`redeem:ip:${req.ip}`, REDEEM_WINDOW_MS),
    ]);
    const over = byPhone.count > REDEEM_MAX_PER_PHONE ? byPhone : byIp.count > REDEEM_MAX_PER_IP ? byIp : null;
    if (over) {
      const retryAfter = Math.max(1, Math.ceil((over.resetAt.getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'ลองแลกรางวัลหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
        code: 'TOO_MANY_ATTEMPTS',
        retryAfter,
      });
    }
    next();
  } catch (e) { next(e); }
};

publicRouter.post(
  '/store/:storeId/rewards/:rewardId/redeem',
  writeLimiter, validate(redeemSchema), redeemGuard,
  async (req, res, next) => {
    try {
      res.json(await service.redeemMemberReward(req.params.storeId, req.body.phone, req.params.rewardId));
    } catch (e) { next(e); }
  },
);

publicRouter.post('/store/:storeId/customer/register', writeLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    const customer = await service.registerCustomerByStore(req.params.storeId, name, phone, email);
    res.status(201).json(customer);
  } catch (e) { next(e); }
});

// Scanned from the QR printed at the end of a receipt — claims that one
// order's points/stamps for whoever's phone number is entered.
publicRouter.post('/order/:orderId/claim-points', writeLimiter, validate(claimPointsSchema), async (req, res, next) => {
  try {
    const { phone, name } = req.body;
    const result = await service.claimOrderPoints(req.params.orderId, phone, name);
    res.json(result);
  } catch (e) { next(e); }
});

/** Staff-side — authenticated, scoped to the cashier's own store. */
const router = Router();
router.use(authMiddleware);

router.get('/bill-calls/pending', async (req, res, next) => {
  try {
    const pending = await service.listPendingBillCalls(req.user!.storeId);
    res.json(pending);
  } catch (e) { next(e); }
});

router.post('/bill-calls/:id/acknowledge', async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const updated = await service.acknowledgeBillCall(req.params.id, req.user!.storeId, io);
    res.json(updated);
  } catch (e) { next(e); }
});

export { publicRouter as selfOrderPublicRouter, router as selfOrderRouter };
