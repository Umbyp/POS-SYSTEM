/**
 * PromptPay QR payload generator (EMVCo merchant-presented QR for Thai PromptPay).
 * Same algorithm as apps/web/src/lib/promptpay.ts so a QR drawn on the phone pays the
 * same account, for the same amount, as the one the web POS / customer display draws.
 *
 * Supports a 10-digit mobile number, 13-digit national/tax ID, or 15-digit e-wallet ID.
 */

function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, '0') + value;
}

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type PromptPayIdType = 'MOBILE' | 'NATIONAL_ID' | 'EWALLET';

export function detectPromptPayType(id: string): PromptPayIdType | null {
  const clean = id.replace(/\D/g, '');
  if (clean.length === 10) return 'MOBILE';
  if (clean.length === 13) return 'NATIONAL_ID';
  if (clean.length === 15) return 'EWALLET';
  return null;
}

/** Throws if the ID isn't 10/13/15 digits. */
export function generatePromptPayPayload(promptpayId: string, amount?: number): string {
  const clean = promptpayId.replace(/\D/g, '');
  const type = detectPromptPayType(clean);
  if (!type) throw new Error('เลขพร้อมเพย์ไม่ถูกต้อง (ต้องเป็นเบอร์โทร 10 หลัก, เลขบัตร 13 หลัก หรือ e-Wallet 15 หลัก)');

  const proxyTag = type === 'MOBILE' ? '01' : type === 'NATIONAL_ID' ? '02' : '03';
  const proxyValue = type === 'MOBILE' ? ('0000000000000' + ('66' + clean.substring(1))).slice(-13) : clean;

  const withAmount = !!amount && amount > 0;
  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('01', withAmount ? '12' : '11');
  payload += tlv('29', tlv('00', 'A000000677010111') + tlv(proxyTag, proxyValue));
  payload += tlv('53', '764');
  if (withAmount) payload += tlv('54', amount!.toFixed(2));
  payload += tlv('58', 'TH');
  payload += '6304';
  return payload + crc16(payload);
}
