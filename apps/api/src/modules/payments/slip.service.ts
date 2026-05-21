/**
 * Slip verification via EasySlip API
 * https://document.easyslip.com/
 *
 * Free tier: 100 requests/month
 */
import { env } from '../../config/env';
import { BadRequest } from '../../utils/errors';
import { prisma } from '../../config/prisma';

const EASYSLIP_ENDPOINT = 'https://developer.easyslip.com/api/v1/verify';

export interface SlipData {
  transRef: string;
  date: string;
  amount: number;
  sender: {
    bank: { id: string; name: string; short: string };
    accountName: string;
    accountNumber?: string;
  };
  receiver: {
    bank: { id: string; name: string; short: string };
    accountName: string;
    accountNumber?: string;
    proxy?: string; // PromptPay number/id
  };
  raw: any;
}

/**
 * เรียก EasySlip → คืนข้อมูลสลิป หรือ throw BadRequest
 */
export async function verifySlip(payload: string): Promise<SlipData> {
  if (!env.EASYSLIP_API_KEY) {
    throw BadRequest('ระบบยังไม่ได้ตั้งค่า EASYSLIP_API_KEY');
  }
  if (!payload || payload.trim().length < 10) {
    throw BadRequest('payload สลิปไม่ถูกต้อง');
  }

  const url = `${EASYSLIP_ENDPOINT}?payload=${encodeURIComponent(payload.trim())}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.EASYSLIP_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}

    // EasySlip error codes mapping
    const code = parsed?.message || parsed?.code || `HTTP_${res.status}`;
    const friendly = mapErrorCode(code);
    throw BadRequest(friendly);
  }

  const body = await res.json();
  const data = body.data;
  if (!data) throw BadRequest('ไม่พบข้อมูลสลิป');

  const amount = data.amount?.amount ?? data.amount?.local?.amount ?? data.amount;

  return {
    transRef: data.transRef || data.payload?.slice(-12),
    date: data.date,
    amount: Number(amount),
    sender: {
      bank: data.sender?.bank || { id: '', name: '', short: '' },
      accountName:
        data.sender?.account?.name?.th ||
        data.sender?.account?.name?.en ||
        data.sender?.account?.name ||
        '-',
      accountNumber:
        data.sender?.account?.bank?.account ||
        data.sender?.account?.proxy?.account,
    },
    receiver: {
      bank: data.receiver?.bank || { id: '', name: '', short: '' },
      accountName:
        data.receiver?.account?.name?.th ||
        data.receiver?.account?.name?.en ||
        data.receiver?.account?.name ||
        '-',
      accountNumber:
        data.receiver?.account?.bank?.account ||
        data.receiver?.account?.proxy?.account,
      proxy:
        data.receiver?.proxy?.account ||
        data.receiver?.account?.proxy?.account,
    },
    raw: data,
  };
}

function mapErrorCode(code: string): string {
  const map: Record<string, string> = {
    invalid_payload: 'รูปแบบ payload สลิปไม่ถูกต้อง',
    image_not_found: 'ไม่พบรูปสลิป',
    unable_to_decode_qr: 'ไม่สามารถอ่าน QR ของสลิปได้',
    invalid_image: 'รูปสลิปไม่ถูกต้อง',
    unauthorized: '⚠️ API key ผิดพลาดหรือหมดอายุ',
    quota_exceeded: '⚠️ ใช้ EasySlip ครบโควต้าเดือนนี้แล้ว',
    rate_limit_exceeded: 'เรียกเร็วเกินไป รอสักครู่แล้วลองใหม่',
    slip_not_found: 'ไม่พบข้อมูลสลิปในระบบธนาคาร — อาจเป็นสลิปปลอม',
    slip_expired: 'สลิปนี้เก่าเกินไป — ตรวจสอบยอดล่าสุดในแอปธนาคาร',
    duplicate_slip: 'สลิปนี้ถูกใช้ไปแล้ว',
    invalid_api_key: '⚠️ API key ไม่ถูกต้อง',
  };
  return map[code] || `ตรวจสลิปล้มเหลว: ${code}`;
}

/**
 * Match สลิปกับ order ที่ต้องชำระ
 *   - amount ตรงกัน (tolerance 0.01)
 *   - receiver.proxy ตรงกับ store.promptpayId
 *   - timestamp อยู่ภายใน N นาทีล่าสุด
 *   - ยังไม่เคยใช้สลิปนี้
 */
export interface MatchResult {
  ok: boolean;
  reasons: string[];
}

export async function matchSlipWithOrder(
  slip: SlipData,
  opts: {
    expectedAmount: number;
    storePromptpayId?: string | null;
    maxAgeMinutes?: number;
  }
): Promise<MatchResult> {
  const reasons: string[] = [];

  // 1. amount
  if (Math.abs(slip.amount - opts.expectedAmount) > 0.01) {
    reasons.push(
      `ยอดเงินไม่ตรง (สลิป ${slip.amount.toLocaleString()}, ต้อง ${opts.expectedAmount.toLocaleString()})`
    );
  }

  // 2. duplicate check
  const existing = await prisma.payment.findUnique({
    where: { slipTransRef: slip.transRef },
  });
  if (existing) {
    reasons.push('สลิปนี้ถูกใช้ไปแล้ว');
  }

  // 3. receiver
  if (opts.storePromptpayId && slip.receiver.proxy) {
    const normalize = (s: string) => s.replace(/[-\s]/g, '');
    const expected = normalize(opts.storePromptpayId);
    const got = normalize(slip.receiver.proxy);
    if (!got.endsWith(expected.slice(-9)) && !expected.endsWith(got.slice(-9))) {
      reasons.push(`บัญชีผู้รับไม่ตรง (${slip.receiver.proxy})`);
    }
  }

  // 4. timestamp
  if (slip.date) {
    const slipTime = new Date(slip.date).getTime();
    const ageMin = (Date.now() - slipTime) / 60_000;
    const maxAge = opts.maxAgeMinutes ?? 60;
    if (ageMin > maxAge) {
      reasons.push(`สลิปเก่าเกิน ${maxAge} นาที (${Math.floor(ageMin)} นาทีที่แล้ว)`);
    }
    if (ageMin < -5) {
      reasons.push('เวลาในสลิปอยู่ในอนาคต');
    }
  }

  return { ok: reasons.length === 0, reasons };
}
