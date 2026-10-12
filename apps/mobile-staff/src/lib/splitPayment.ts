export type SplitMethod = 'CASH' | 'PROMPTPAY' | 'TRANSFER';

export interface SlipVerifyResult {
  ok: boolean;
  reason?: string;
  transRef?: string;
  amount?: number;
  senderName?: string;
  raw?: string;
}

export interface SplitLine {
  id: string;
  method: SplitMethod;
  /** Raw text from the amount input. */
  amount: string;
  slip?: SlipVerifyResult | null;
  slipVerifying?: boolean;
}

export interface PaymentLinePayload {
  method: 'CASH' | 'PROMPTPAY' | 'BANK_TRANSFER';
  amount: number;
  reference?: string;
  slipVerified?: boolean;
  slipTransRef?: string;
  slipPayload?: string;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const parseAmount = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? r2(n) : 0;
};

/** N equal shares of `total` (2-dp); the rounding remainder lands on the last share. */
export function equalShares(total: number, n: number): number[] {
  if (n <= 1) return [r2(total)];
  const base = Math.floor((total / n) * 100) / 100;
  const shares = Array.from({ length: n - 1 }, () => base);
  shares.push(r2(total - base * (n - 1)));
  return shares;
}

export interface SplitTotals {
  /** Sum of every entered line. */
  paid: number;
  cashSum: number;
  nonCashSum: number;
  remaining: number;
  /** Cash handed back — only cash may overpay. */
  change: number;
  /** Why the bill can't be confirmed yet (Thai), or null when it can. */
  blocker: string | null;
}

export function splitTotals(lines: SplitLine[], total: number): SplitTotals {
  let cashSum = 0;
  let nonCashSum = 0;
  let empty = false;
  for (const l of lines) {
    const a = parseAmount(l.amount);
    if (a <= 0) empty = true;
    if (l.method === 'CASH') cashSum += a;
    else nonCashSum += a;
  }
  const paid = r2(cashSum + nonCashSum);
  const remaining = Math.max(0, r2(total - paid));
  const change = Math.max(0, r2(paid - total));
  let blocker: string | null = null;
  if (lines.length === 0) blocker = 'เพิ่มรายการชำระอย่างน้อย 1 รายการ';
  else if (empty) blocker = 'ใส่จำนวนเงินให้ครบทุกรายการ';
  else if (remaining > 0.001) blocker = `ยังขาดอีก ${remaining.toFixed(2)} บาท`;
  else if (r2(nonCashSum - total) > 0.001) blocker = 'พร้อมเพย์/โอน รับเกินยอดบิลไม่ได้ — มีแต่เงินสดที่ทอนได้';
  return { paid, cashSum: r2(cashSum), nonCashSum: r2(nonCashSum), remaining, change, blocker };
}

/**
 * Lines to send to the server. Non-cash lines go as entered; cash lines are capped so the
 * payments sum exactly to the bill (the overpay is change handed back, not revenue).
 */
export function buildSplitPayments(lines: SplitLine[], total: number): PaymentLinePayload[] {
  const nonCash = lines.filter((l) => l.method !== 'CASH').reduce((s, l) => s + parseAmount(l.amount), 0);
  let cashNeeded = Math.max(0, r2(total - nonCash));
  const out: PaymentLinePayload[] = [];
  for (const l of lines) {
    const entered = parseAmount(l.amount);
    if (l.method === 'CASH') {
      const applied = Math.min(entered, cashNeeded);
      cashNeeded = r2(cashNeeded - applied);
      if (applied > 0) out.push({ method: 'CASH', amount: applied });
    } else if (entered > 0) {
      out.push({
        method: l.method === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK_TRANSFER',
        amount: entered,
        reference: l.slip?.transRef,
        slipVerified: l.slip?.ok,
        slipTransRef: l.slip?.transRef,
        slipPayload: l.slip?.raw,
      });
    }
  }
  return out;
}
