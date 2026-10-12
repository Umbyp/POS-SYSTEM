/**
 * Pure helpers for the Thai full tax invoice (ใบกำกับภาษีเต็มรูป): tax-ID checksum,
 * branch handling, invoice numbering and the VAT breakdown. All money is handled as
 * integer satang so nothing drifts by a floating-point cent.
 */

export const HEAD_OFFICE = 'สำนักงานใหญ่';

/** 13-digit Thai taxpayer/national ID with the mod-11 check digit. */
export function isValidThaiTaxId(raw: string | null | undefined): boolean {
  const id = (raw ?? '').trim();
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** Buyer branch → label. "" / "00000" / "สำนักงานใหญ่" → head office; 5 digits → "สาขา xxxxx". null = invalid. */
export function normalizeBranch(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (v === '' || v === HEAD_OFFICE || v === '00000') return HEAD_OFFICE;
  const m = v.replace(/^สาขา\s*/, '');
  return /^\d{5}$/.test(m) ? `สาขา ${m}` : null;
}

/** Seller branch label from the store config. */
export function sellerBranchLabel(store: { branchName?: string | null; branchCode?: string | null }): string {
  const name = store.branchName?.trim();
  if (name) return name;
  const code = store.branchCode?.trim();
  if (code && code !== '00000') return `สาขา ${code}`;
  return HEAD_OFFICE;
}

/** Calendar year in Bangkok time (the tax year boundary for a Thai business). */
export function bangkokYear(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(d));
}

/** `${prefix||'INV'}-${YYYY}-${6-digit sequence}`. The sequence is continuous per store (not reset yearly). */
export function formatTaxInvoiceNo(prefix: string | null | undefined, issuedAt: Date, seq: number): string {
  const p = (prefix ?? '').trim() || 'INV';
  return `${p}-${bangkokYear(issuedAt)}-${String(seq).padStart(6, '0')}`;
}

export const toSatang = (n: number | string | { toString(): string }): number => Math.round(Number(n.toString()) * 100);
export const fromSatang = (s: number): number => s / 100;

export interface BreakdownInput {
  priceIncludesTax: boolean;
  taxRate: number; // percent, e.g. 7
  subtotal: number; // Σ line nets (after line discounts), as priced on the bill
  discount: number; // total bill-level discount (manual + promo + points...)
  tax: number; // VAT stored on the order
  serviceCharge: number;
  lines: Array<{ quantity: number; lineNet: number }>; // lineNet = unitPrice*qty − line discount
}

export interface Breakdown {
  lines: Array<{ lineTotalExVat: number; unitPriceExVat: number }>;
  totals: { subtotalExVat: number; discount: number; baseExVat: number; serviceCharge: number; vatRate: number; vat: number; total: number };
}

/**
 * Splits a bill into price-excluding-VAT lines + VAT.
 *  - tax-exclusive stores: prices already exclude VAT; VAT = order.tax.
 *  - tax-inclusive stores: VAT is backed out of the (discounted) gross, ex-VAT lines are the gross
 *    lines scaled down, remainder on the LAST line so Σ lines === subtotalExVat exactly.
 * Invariant: baseExVat + vat + serviceCharge === total (the amount the customer paid).
 */
export function computeBreakdown(inp: BreakdownInput): Breakdown {
  const S = toSatang(inp.subtotal);
  const D = Math.min(toSatang(inp.discount), S);
  const A = S - D;
  const V = toSatang(inp.tax);
  const SC = toSatang(inp.serviceCharge);

  let base: number, subEx: number;
  if (inp.priceIncludesTax) {
    base = A - V;
    subEx = A > 0 ? Math.round((S * base) / A) : Math.round((S * 10000) / (10000 + Math.round(inp.taxRate * 100)));
  } else {
    base = A;
    subEx = S;
  }
  const discEx = subEx - base;

  const weights = inp.lines.map((l) => toSatang(l.lineNet));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const lineEx = weights.map((w, i) => {
    if (i === weights.length - 1) return subEx - acc;
    const v = wSum > 0 ? Math.round((subEx * w) / wSum) : 0;
    acc += v;
    return v;
  });

  return {
    lines: lineEx.map((v, i) => ({
      lineTotalExVat: fromSatang(v),
      unitPriceExVat: inp.lines[i].quantity > 0 ? fromSatang(Math.round(v / inp.lines[i].quantity)) : 0,
    })),
    totals: {
      subtotalExVat: fromSatang(subEx),
      discount: fromSatang(discEx),
      baseExVat: fromSatang(base),
      serviceCharge: fromSatang(SC),
      vatRate: inp.taxRate,
      vat: fromSatang(V),
      total: fromSatang(base + V + SC),
    },
  };
}
