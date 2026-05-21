/**
 * PromptPay QR Code Payload Generator
 * Implements EMVCo Merchant-Presented QR for Thai PromptPay
 *
 * รองรับ:
 * - เบอร์มือถือ 10 หลัก (เช่น 0812345678)
 * - เลขประจำตัวประชาชน 13 หลัก
 * - eWallet ID 15 หลัก
 */

function tlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return tag + length + value;
}

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
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

export function formatPromptPayId(id: string): string {
  const clean = id.replace(/\D/g, '');
  const type = detectPromptPayType(clean);
  if (!type) return id;

  if (type === 'MOBILE') {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (type === 'NATIONAL_ID') {
    return `${clean[0]}-${clean.slice(1, 5)}-${clean.slice(5, 10)}-${clean.slice(10, 12)}-${clean[12]}`;
  }
  return clean;
}

export interface PromptPayPayloadInput {
  promptpayId: string;
  amount?: number;
}

export function generatePromptPayPayload({ promptpayId, amount }: PromptPayPayloadInput): string {
  const clean = promptpayId.replace(/\D/g, '');
  const type = detectPromptPayType(clean);
  if (!type) {
    throw new Error('Invalid PromptPay ID: must be 10, 13, or 15 digits');
  }

  let proxyValue: string;
  let proxyTag: string;

  if (type === 'MOBILE') {
    proxyValue = ('0000000000000' + ('66' + clean.substring(1))).slice(-13);
    proxyTag = '01';
  } else if (type === 'NATIONAL_ID') {
    proxyValue = clean;
    proxyTag = '02';
  } else {
    proxyValue = clean;
    proxyTag = '03';
  }

  const merchantInfo = tlv('00', 'A000000677010111') + tlv(proxyTag, proxyValue);

  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('01', amount && amount > 0 ? '12' : '11');
  payload += tlv('29', merchantInfo);
  payload += tlv('53', '764');
  if (amount && amount > 0) {
    payload += tlv('54', amount.toFixed(2));
  }
  payload += tlv('58', 'TH');
  payload += '6304';
  payload += crc16(payload);

  return payload;
}
