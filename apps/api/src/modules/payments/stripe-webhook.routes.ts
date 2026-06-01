import { Request, Response } from 'express';
import { getStripe } from './stripe.service';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * Stripe webhook handler — production safety net for PromptPay.
 *
 * ต้อง mount ด้วย express.raw() (ไม่ใช่ express.json) เพราะการตรวจลายเซ็น
 * ต้องใช้ raw body. ดู app.ts:
 *   app.post('/api/payments/stripe/webhook',
 *            express.raw({ type: 'application/json' }), stripeWebhookHandler)
 *
 * หน้าที่หลัก: บันทึก/log เหตุการณ์การจ่ายเงินที่ Stripe ยืนยัน เพื่อกระทบยอด
 * (reconciliation) — เผื่อกรณีแคชเชียร์ปิดหน้าจอก่อนที่ลูกค้าจะจ่ายสำเร็จ
 * เงินถูกเก็บที่ Stripe แล้วแต่ POS ยังไม่ได้ปิดบิล จะได้มีร่องรอยไว้ตรวจสอบ
 */
export async function stripeWebhookHandler(req: Request, res: Response) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];

  if (!secret) {
    // ยังไม่ได้ตั้ง STRIPE_WEBHOOK_SECRET — ตอบ 200 เพื่อไม่ให้ Stripe retry รัว ๆ
    logger.warn('Stripe webhook hit but STRIPE_WEBHOOK_SECRET is not set — ignoring');
    return res.status(200).json({ received: true, skipped: true });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig as string, secret);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Stripe webhook signature verification failed');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as any;
      logger.info(
        { id: pi.id, amount: pi.amount / 100, storeId: pi.metadata?.storeId, orderRef: pi.metadata?.orderRef },
        'PromptPay payment succeeded (Stripe webhook)'
      );
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as any;
      logger.warn({ id: pi.id, storeId: pi.metadata?.storeId }, 'PromptPay payment failed (Stripe webhook)');
      break;
    }
    default:
      // เหตุการณ์อื่น ๆ ที่ยังไม่ได้ใช้ — รับทราบไว้เฉย ๆ
      break;
  }

  res.json({ received: true });
}
