import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { BadRequest } from '../../utils/errors';
import * as stripeService from './stripe.service';
import { isSlip2GoConfigured, verifySlipImage } from './slip2go.service';

const router = Router();
router.use(authMiddleware);

const slipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

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

/**
 * GET /api/payments/slip2go-config
 * บอกฝั่ง POS ว่าเปิดใช้การตรวจสลิปผ่าน Slip2Go ได้ไหม
 */
router.get('/slip2go-config', (_req, res) => {
  res.json({ slip2goEnabled: isSlip2GoConfigured() });
});

/**
 * POST /api/payments/verify-slip
 * ตรวจสอบสลิปโอนเงิน (รูปภาพ) กับ Slip2Go ก่อนแคชเชียร์กดยืนยันรับเงิน —
 * soft gate เสมอ: ผลตรวจ (ผ่าน/ไม่ผ่าน/เชื่อมต่อไม่ได้) แค่แสดงเตือน ไม่บล็อก
 * การจ่ายเงิน ฝั่ง frontend เป็นคนตัดสินใจว่าจะแนบผลนี้ไปกับ payment หรือไม่
 */
router.post('/verify-slip', slipUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw BadRequest('ไม่พบไฟล์สลิป');
    const expectedAmount = req.body.expectedAmount ? Number(req.body.expectedAmount) : undefined;
    const result = await verifySlipImage(
      { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype },
      expectedAmount
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
