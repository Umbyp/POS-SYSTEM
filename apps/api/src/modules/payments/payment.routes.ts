import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as stripeService from './stripe.service';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/payments/config
 * บอกฝั่ง POS ว่าเปิดใช้ Stripe PromptPay ได้ไหม
 */
router.get('/config', (req, res) => {
  res.json({
    stripeEnabled: stripeService.isStripeConfigured(),
    testMode: stripeService.isTestMode(),
  });
});

const intentSchema = z.object({
  amount: z.number().positive(),
  orderRef: z.string().optional(),
});

/**
 * POST /api/payments/promptpay/intent
 * สร้าง Stripe PaymentIntent แบบ PromptPay แล้วคืน QR ให้ลูกค้าสแกน
 */
router.post('/promptpay/intent', validate(intentSchema), async (req, res, next) => {
  try {
    const { amount, orderRef } = req.body as z.infer<typeof intentSchema>;
    const result = await stripeService.createPromptPayIntent(amount, {
      storeId: req.user!.storeId,
      orderRef,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/payments/promptpay/status/:id
 * เช็คสถานะการจ่าย (POS poll จนกว่าจะ paid)
 */
router.get('/promptpay/status/:id', async (req, res, next) => {
  try {
    const result = await stripeService.getIntentStatus(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/payments/promptpay/cancel/:id
 * ยกเลิก PaymentIntent (แคชเชียร์ยกเลิกก่อนลูกค้าจ่าย)
 */
router.post('/promptpay/cancel/:id', async (req, res, next) => {
  try {
    await stripeService.cancelIntent(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
