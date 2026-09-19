// Slip2Go slip-verification integration — confirms a bank-transfer slip
// image with the customer's bank before the cashier trusts it, closing the
// gap where the direct-merchant PromptPay QR / manual bank-transfer flow had
// zero verification (see Payment.slipVerified/slipTransRef/slipVerifiedAt/
// slipPayload in schema.prisma, which existed unused before this).
//
// Soft-gate by design: a rejected/duplicate/mismatched slip or a Slip2Go
// outage never blocks checkout — it only surfaces a warning for the cashier
// to eyeball before confirming. See verify-slip route for how the result is
// surfaced.
//
// API contract (verified against https://slip2go.com/guide/rest-api/image
// and .../authentication — endpoint path, multipart shape, and the
// "Authorization: Bearer {secretKey}" header are all taken from Slip2Go's
// own published curl/JS examples, not guessed):
//   POST {SLIP2GO_API_URL}/api/verify-slip/qr-image/info
//   multipart/form-data: file=<slip image>, payload=<JSON string>
//   payload: { checkAmount?: { type: 'gte'|'eq'|'lte', amount: string } }
//   Header: Authorization: Bearer <SLIP2GO_API_KEY>
// SLIP2GO_API_URL is account-specific (shown in the Slip2Go dashboard after
// login) — there is no fixed public base URL to hardcode.

export interface Slip2GoResult {
  ok: boolean;
  /** Human-readable reason when ok is false — shown to the cashier as a warning, never a hard block. */
  reason?: string;
  transRef?: string;
  amount?: number;
  dateTime?: string;
  senderName?: string;
  receiverName?: string;
  bankName?: string;
  /** Full raw response body, stored as Payment.slipPayload for audit/support. */
  raw?: string;
}

export function isSlip2GoConfigured(): boolean {
  return !!process.env.SLIP2GO_API_URL && !!process.env.SLIP2GO_API_KEY;
}

/**
 * Verify a slip image against Slip2Go. `expectedAmount`, when given, is
 * enforced server-side via Slip2Go's own checkAmount condition (type "gte" —
 * a slip for more than the bill is fine, e.g. a rounded transfer).
 */
export async function verifySlipImage(
  file: { buffer: Buffer; originalname: string; mimetype: string },
  expectedAmount?: number
): Promise<Slip2GoResult> {
  const apiUrl = process.env.SLIP2GO_API_URL;
  const apiKey = process.env.SLIP2GO_API_KEY;
  if (!apiUrl || !apiKey) {
    return { ok: false, reason: 'Slip2Go ยังไม่ได้ตั้งค่า (SLIP2GO_API_URL/SLIP2GO_API_KEY)' };
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
  if (expectedAmount && expectedAmount > 0) {
    form.append('payload', JSON.stringify({ checkAmount: { type: 'gte', amount: String(expectedAmount) } }));
  }

  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/verify-slip/qr-image/info`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err: any) {
    return { ok: false, reason: `เชื่อมต่อ Slip2Go ไม่ได้: ${err?.message ?? 'unknown error'}` };
  }

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `Slip2Go ตอบกลับไม่ถูกต้อง (HTTP ${res.status})`, raw: text.slice(0, 2000) };
  }

  if (json.code !== '200000') {
    return { ok: false, reason: json.message || `Slip2Go ปฏิเสธสลิป (${json.code})`, raw: text.slice(0, 2000) };
  }

  const data = json.data ?? {};
  return {
    ok: true,
    transRef: data.transRef,
    amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || undefined,
    dateTime: data.dateTime,
    senderName: data.sender?.account?.name,
    receiverName: data.receiver?.account?.name,
    bankName: data.receiver?.bank?.name,
    raw: text.slice(0, 2000),
  };
}
