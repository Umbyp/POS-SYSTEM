/**
 * Thai bank payment notification parser
 *
 * Handles both SMS and email notification formats from Thai banks.
 * New banks can be added by appending a pattern to the lists below.
 *
 * SMS examples (sanitized):
 *   K-BANK:   "K-PLUS:Receive THB1,250.00 from X. Y.. Balance THB12,345.00"
 *             "บัญชี xxx มียอดเงินเข้า 1,250.00 บาท จาก X. Y.."
 *   SCB:      "บัญชี xxx รับเงินโอน 1,250.00 บาท จาก X. Y. เมื่อ 10/05 14:23"
 *             "Received: THB1,250.00 from X. Y."
 *   Bangkok:  "+1,250.00 บาท เข้าบัญชี xxxxx เวลา 14:23"
 *   Krungsri: "BAY: Money in THB1,250.00 from X. Y."
 *   TMB/TTB:  "Receive 1250.00 THB from X. Y."
 *
 * Email examples (the subject + plain-text body, HTML stripped):
 *   K-BANK:   Subject "K-PLUS Notify"
 *             Body   "Dear customer, ... Receive THB1,250.00 from MR. SOMSAK J. ..."
 *   SCB:      Subject "SCB EASY Notice: Receive Money"
 *             Body   "บัญชี xxx รับเงินโอนจำนวน 1,250.00 บาท ..."
 *   BBL:      Subject "Bualuang mBanking — Receive"
 *             Body   "Your account ... received THB1,250.00 ..."
 */

export interface ParsedMessage {
  amount: number;
  bank?: string;
  senderName?: string;
  raw: string;
  receivedAt: Date;
}

/** Patterns that signal an inbound transfer (not outbound, not balance alert) */
const INBOUND_KEYWORDS = [
  /receive/i,
  /money\s*in/i,
  /รับเงิน/, // รับเงิน
  /ยอดเงินเข้า/, // ยอดเงินเข้า
  /เงินเข้า/, // เงินเข้า
  /credited/i,
  /\+\s*[\d,]+\.\d{2}/, // explicit +amount
];

const OUTBOUND_KEYWORDS = [
  /transfer\s*out/i,
  /sent\s+(?:to|out)/i,
  /โอนออก/, // โอนออก
  /paid\s+to/i,
  /withdraw/i,
  /\bdebited\b/i,
];

// Common amount patterns: "1,250.00", "THB1,250.00", "1250.00 THB", "1,250 บาท"
const AMOUNT_RX =
  /(?:thb\s*)?([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})(?:\s*(?:thb|baht|บาท))?/i;

/** Strip HTML tags + decode common entities to plain text */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    // Drop script/style content
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // Replace block-level tags with newlines so words don't run together
    .replace(/<\/?(?:br|p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// Try to identify which bank
function detectBank(text: string): string | undefined {
  const s = text.toUpperCase();
  if (s.includes('K-PLUS') || s.includes('KBANK') || s.includes('KASIKORN')) return 'KBANK';
  if (s.includes('SCB')) return 'SCB';
  if (s.includes('BBL') || s.includes('BANGKOK BANK') || s.includes('BUALUANG')) return 'BBL';
  if (s.includes('BAY') || s.includes('KRUNGSRI')) return 'BAY';
  if (s.includes('TMB') || s.includes('TTB')) return 'TTB';
  if (s.includes('GHB') || s.includes('GSB')) return 'GSB';
  if (s.includes('KTB') || s.includes('KRUNGTHAI')) return 'KTB';
  if (s.includes('UOB')) return 'UOB';
  if (s.includes('CIMB')) return 'CIMB';
  return undefined;
}

function extractSender(text: string): string | undefined {
  // Patterns: "from X. Y." | "จาก X. Y." | "by X. Y."
  const patterns = [
    /from\s+([A-Z][A-Za-z. ]{1,40})(?:\.|$|\s+at|\s+\d|\s+Balance|\s+Date)/,
    /จาก\s+([ก-๛A-Za-z. ]{1,40})(?:\s+\d|\s+เมื่อ|\s+วันที่|$|\n)/,
    /by\s+([A-Z][A-Za-z. ]{1,40})/i,
    /sender[:\s]+([A-Z][A-Za-z. ]{1,40})/i,
    /ผู้ส่ง[:\s]+([ก-๛A-Za-z. ]{1,40})/,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) return m[1].trim().replace(/[.,;]$/, '');
  }
  return undefined;
}

/**
 * Parse a bank notification (SMS or email body).
 * Returns null if not a recognizable inbound payment.
 */
export function parseBankMessage(
  message: string,
  receivedAt: Date = new Date()
): ParsedMessage | null {
  if (!message || typeof message !== 'string') return null;
  const text = message.trim();

  // Skip outbound transfers unless message also mentions inbound (some banks
  // include both directions in the same email)
  if (
    OUTBOUND_KEYWORDS.some((rx) => rx.test(text)) &&
    !INBOUND_KEYWORDS.some((rx) => rx.test(text))
  ) {
    return null;
  }

  // Must look like an inbound transfer
  if (!INBOUND_KEYWORDS.some((rx) => rx.test(text))) return null;

  const amountMatch = text.match(AMOUNT_RX);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  return {
    amount,
    bank: detectBank(text),
    senderName: extractSender(text),
    raw: text,
    receivedAt,
  };
}

/**
 * Parse an email notification. Concatenates subject + plain-text body,
 * then runs the same parser.
 */
export function parseBankEmail(
  subject: string,
  body: string,
  receivedAt: Date = new Date()
): ParsedMessage | null {
  const plainBody = stripHtml(body || '');
  const combined = [subject || '', plainBody].filter(Boolean).join('\n');
  return parseBankMessage(combined, receivedAt);
}

/** Backwards-compatible alias */
export const parseBankSms = parseBankMessage;

/** Sanity check: amount should be plausible (avoid parsing transaction IDs as amounts) */
export function isPlausibleAmount(amount: number): boolean {
  return amount >= 1 && amount <= 1_000_000;
}
