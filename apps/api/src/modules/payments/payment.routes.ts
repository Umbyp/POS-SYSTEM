import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { prisma } from '../../config/prisma';
import * as slipService from './slip.service';
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

const verifySchema = z.object({
  payload: z.string().min(10),
  expectedAmount: z.number().positive(),
});

/**
 * POST /api/payments/verify-slip
 * - เรียก EasySlip ตรวจสลิป
 * - validate ยอด + ผู้รับ + เวลา + duplicate
 * - คืนผลและข้อมูล (ยังไม่บันทึก — บันทึกตอน create order)
 */
router.post('/verify-slip', validate(verifySchema), async (req, res, next) => {
  try {
    const { payload, expectedAmount } = req.body as z.infer<typeof verifySchema>;

    const store = await prisma.store.findUnique({
      where: { id: req.user!.storeId },
    });

    const slip = await slipService.verifySlip(payload);
    const match = await slipService.matchSlipWithOrder(slip, {
      expectedAmount,
      storePromptpayId: store?.promptpayId,
      maxAgeMinutes: 60,
    });

    res.json({
      ok: match.ok,
      reasons: match.reasons,
      slip: {
        transRef: slip.transRef,
        date: slip.date,
        amount: slip.amount,
        sender: slip.sender,
        receiver: slip.receiver,
      },
      payload,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
