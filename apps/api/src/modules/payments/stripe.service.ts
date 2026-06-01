import Stripe from 'stripe';
import { env } from '../../config/env';
import { BadRequest } from '../../utils/errors';

/** Instance type of the Stripe client (avoids the `Stripe` namespace-as-type pitfall) */
type StripeClient = InstanceType<typeof Stripe>;

/**
 * Stripe client — lazy singleton.
 * รับเฉพาะ PromptPay (ประเทศไทย) ผ่าน Stripe PaymentIntent
 * โดยไม่ต้องใช้ publishable key ฝั่ง client เพราะเราแสดง QR ที่ Stripe สร้างให้
 * แล้ว poll สถานะจนกว่าจะจ่ายสำเร็จ
 */
let _stripe: StripeClient | null = null;

export function getStripe(): StripeClient {
  if (!env.STRIPE_SECRET_KEY) {
    throw BadRequest(
      'Stripe ยังไม่ได้ตั้งค่า — ใส่ STRIPE_SECRET_KEY ใน .env ของ apps/api ก่อน'
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const isStripeConfigured = () => !!env.STRIPE_SECRET_KEY;

/** true ถ้าใช้ test key (sk_test_...) — QR สแกนด้วยแอปธนาคารจริงไม่ได้ */
export const isTestMode = () => !!env.STRIPE_SECRET_KEY?.startsWith('sk_test');

export interface PromptPayIntentResult {
  paymentIntentId: string;
  status: string;
  /** Stripe-hosted PNG image of the QR — ใช้ <img src> ได้เลย */
  qrImageUrl: string | null;
  /** EMVCo QR string ดิบ — เผื่ออยาก render เอง */
  qrData: string | null;
  /** หน้า Stripe สำหรับดู QR (และจำลองการจ่ายใน test mode) */
  hostedUrl: string | null;
  amount: number;
}

/** Stripe THB เป็นสกุล 2 ตำแหน่ง → จำนวนเงินเป็นสตางค์ */
function toSatang(amountBaht: number): number {
  return Math.round(amountBaht * 100);
}

/** ขั้นต่ำของ PromptPay บน Stripe ~ 10 บาท */
const MIN_THB = 10;

/**
 * สร้าง + confirm PaymentIntent แบบ PromptPay แล้วคืน QR ให้ลูกค้าสแกน
 */
export async function createPromptPayIntent(
  amountBaht: number,
  meta: { storeId: string; orderRef?: string; email?: string }
): Promise<PromptPayIntentResult> {
  if (!amountBaht || amountBaht < MIN_THB) {
    throw BadRequest(`ยอด PromptPay ขั้นต่ำ ${MIN_THB} บาท`);
  }
  const stripe = getStripe();

  // Stripe บังคับให้มีอีเมลใน billing_details สำหรับ PromptPay (ใช้ส่งใบเสร็จ)
  // ถ้าไม่ได้เก็บอีเมลลูกค้า → ใช้ placeholder ที่ผูกกับร้าน (โดเมน example.com สงวนไว้ ปลอดภัย)
  const email = meta.email?.trim() || `pos+${meta.storeId}@example.com`;

  const intent = await stripe.paymentIntents.create({
    amount: toSatang(amountBaht),
    currency: 'thb',
    payment_method_types: ['promptpay'],
    payment_method_data: { type: 'promptpay', billing_details: { email } },
    confirm: true,
    metadata: {
      storeId: meta.storeId,
      orderRef: meta.orderRef || '',
      source: 'pos',
    },
  });

  const qr = intent.next_action?.promptpay_display_qr_code;

  return {
    paymentIntentId: intent.id,
    status: intent.status,
    qrImageUrl: qr?.image_url_png ?? null,
    qrData: qr?.data ?? null,
    hostedUrl: qr?.hosted_instructions_url ?? null,
    amount: amountBaht,
  };
}

export interface IntentStatusResult {
  paymentIntentId: string;
  status: string;
  /** true เมื่อจ่ายสำเร็จแล้ว — ฝั่ง POS ค่อยปิดออเดอร์ */
  paid: boolean;
  amount: number;
}

/** ดึงสถานะ PaymentIntent ตรงจาก Stripe (ใช้ polling จากฝั่ง POS) */
export async function getIntentStatus(id: string): Promise<IntentStatusResult> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(id);
  return {
    paymentIntentId: intent.id,
    status: intent.status,
    paid: intent.status === 'succeeded',
    amount: intent.amount / 100,
  };
}

/** ยกเลิก PaymentIntent (เช่น แคชเชียร์กดยกเลิกก่อนลูกค้าจ่าย) */
export async function cancelIntent(id: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(id);
  } catch {
    // เงียบไว้ — อาจถูกจ่าย/ยกเลิกไปแล้ว
  }
}
