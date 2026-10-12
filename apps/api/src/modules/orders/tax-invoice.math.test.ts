import { describe, it, expect } from 'vitest';
import {
  isValidThaiTaxId, normalizeBranch, sellerBranchLabel, formatTaxInvoiceNo, computeBreakdown, bangkokYear,
} from './tax-invoice.math';
import { renderTaxInvoiceText, textWidth } from './tax-invoice.text';

/** Builds a valid 13-digit ID from 12 digits (test helper, mirrors the spec'd checksum). */
export function withCheckDigit(d12: string) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (13 - i);
  return d12 + String((11 - (s % 11)) % 10);
}

describe('isValidThaiTaxId', () => {
  it('accepts IDs with a correct check digit', () => {
    expect(isValidThaiTaxId('1101700230708')).toBe(true); // valid mod-11 check digit
    expect(isValidThaiTaxId(withCheckDigit('010555500012'))).toBe(true);
  });
  it('rejects a wrong check digit, wrong length and non-digits', () => {
    expect(isValidThaiTaxId('1101700230707')).toBe(false);
    expect(isValidThaiTaxId('110170023070')).toBe(false);
    expect(isValidThaiTaxId('11017002307051')).toBe(false);
    expect(isValidThaiTaxId('11017002307ab')).toBe(false);
    expect(isValidThaiTaxId('')).toBe(false);
    expect(isValidThaiTaxId(null)).toBe(false);
  });
});

describe('branch + number helpers', () => {
  it('normalizes buyer branch', () => {
    expect(normalizeBranch(undefined)).toBe('สำนักงานใหญ่');
    expect(normalizeBranch('00000')).toBe('สำนักงานใหญ่');
    expect(normalizeBranch('00012')).toBe('สาขา 00012');
    expect(normalizeBranch('สาขา 00012')).toBe('สาขา 00012');
    expect(normalizeBranch('12')).toBeNull();
  });
  it('seller branch label', () => {
    expect(sellerBranchLabel({})).toBe('สำนักงานใหญ่');
    expect(sellerBranchLabel({ branchCode: '00003' })).toBe('สาขา 00003');
    expect(sellerBranchLabel({ branchName: 'สาขาสยาม', branchCode: '00003' })).toBe('สาขาสยาม');
  });
  it('formats the number with prefix, Bangkok year, 6-digit sequence', () => {
    const d = new Date('2026-06-01T05:00:00Z');
    expect(formatTaxInvoiceNo('ABC', d, 42)).toBe('ABC-2026-000042');
    expect(formatTaxInvoiceNo(null, d, 1)).toBe('INV-2026-000001');
    // 31 Dec 18:00 UTC is already 1 Jan in Bangkok
    expect(bangkokYear(new Date('2026-12-31T18:00:00Z'))).toBe(2027);
  });
});

describe('computeBreakdown', () => {
  const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

  it('tax-exclusive: prices untouched, VAT on top', () => {
    const r = computeBreakdown({
      priceIncludesTax: false, taxRate: 7, subtotal: 400, discount: 40, tax: 25.2, serviceCharge: 0,
      lines: [{ quantity: 4, lineNet: 400 }],
    });
    expect(r.totals).toMatchObject({ subtotalExVat: 400, discount: 40, baseExVat: 360, vat: 25.2, total: 385.2 });
    expect(r.lines[0]).toEqual({ lineTotalExVat: 400, unitPriceExVat: 100 });
  });

  it('tax-inclusive: backs VAT out; lines sum to subtotalExVat exactly; ex + vat = paid', () => {
    // gross 107 → 100 + 7
    const r = computeBreakdown({
      priceIncludesTax: true, taxRate: 7, subtotal: 107, discount: 0, tax: 7, serviceCharge: 0,
      lines: [{ quantity: 1, lineNet: 107 }],
    });
    expect(r.totals).toMatchObject({ subtotalExVat: 100, baseExVat: 100, vat: 7, total: 107 });
  });

  it('tax-inclusive awkward amounts with discount + service charge reconcile to the satang', () => {
    // gross 3 lines 33.33 each = 99.99, discount 10, VAT = 89.99*7/107 = 5.89
    const lines = [{ quantity: 1, lineNet: 33.33 }, { quantity: 1, lineNet: 33.33 }, { quantity: 1, lineNet: 33.33 }];
    const r = computeBreakdown({ priceIncludesTax: true, taxRate: 7, subtotal: 99.99, discount: 10, tax: 5.89, serviceCharge: 9, lines });
    expect(sum(r.lines.map((l) => l.lineTotalExVat))).toBe(r.totals.subtotalExVat);
    expect(r.totals.subtotalExVat - r.totals.discount).toBeCloseTo(r.totals.baseExVat, 10);
    expect(r.totals.baseExVat).toBe(84.1); // 89.99 − 5.89
    expect(r.totals.total).toBe(98.99); // 89.99 + 9 service charge
  });

  it('many odd lines: remainder lands on the last line', () => {
    const lines = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ quantity: n, lineNet: n * 13.37 }));
    const subtotal = sum(lines.map((l) => l.lineNet));
    const r = computeBreakdown({ priceIncludesTax: true, taxRate: 7, subtotal, discount: 0, tax: Math.round((subtotal * 7 / 107) * 100) / 100, serviceCharge: 0, lines });
    expect(sum(r.lines.map((l) => l.lineTotalExVat))).toBe(r.totals.subtotalExVat);
  });

  it('100% discount does not divide by zero', () => {
    const r = computeBreakdown({ priceIncludesTax: true, taxRate: 7, subtotal: 100, discount: 100, tax: 0, serviceCharge: 0, lines: [{ quantity: 1, lineNet: 100 }] });
    expect(r.totals.baseExVat).toBe(0);
    expect(r.totals.total).toBe(0);
    expect(r.totals.subtotalExVat).toBe(r.totals.discount);
  });
});

describe('renderTaxInvoiceText', () => {
  it('fits the paper width and contains the legal elements', () => {
    const text = renderTaxInvoiceText({
      seller: { name: 'ร้านตัวอย่าง จำกัด', address: '99 ถนนสุขุมวิท กรุงเทพฯ 10110', taxId: '0105555000123', branch: 'สำนักงานใหญ่' },
      buyer: { name: 'บริษัท ผู้ซื้อ จำกัด', address: '1 ถนนสีลม กรุงเทพฯ', taxId: '1101700230708', branch: 'สำนักงานใหญ่' },
      number: 'INV-2026-000001', issuedAt: new Date('2026-06-01T05:00:00Z'), orderNumber: 'A-001',
      items: [{ name: 'ข้าวผัดกุ้งพิเศษใส่ไข่ดาวเพิ่มพริก', qty: 2, unitPrice: 93.46, lineTotal: 186.92 }],
      totals: { subtotalExVat: 186.92, discount: 0, baseExVat: 186.92, serviceCharge: 18.69, vatRate: 7, vat: 13.08, total: 218.69 },
      payments: [{ label: 'เงินสด', amount: 300 }],
    }, 32);
    for (const line of text.split('\n')) expect(textWidth(line)).toBeLessThanOrEqual(32);
    expect(text).toContain('ใบกำกับภาษี');
    expect(text).toContain('INV-2026-000001');
    expect(text).toContain('0105555000123');
    expect(text).toContain('ภาษีมูลค่าเพิ่ม 7%');
    expect(text).toContain('ค่าบริการ');
  });
});
