import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { computeTotals } from './order-tab.service';

const dec = (n: number) => new Prisma.Decimal(n);

describe('computeTotals — the money math behind every bill', () => {
  it('adds VAT on top when prices are tax-exclusive', () => {
    const store = { taxRate: 7, serviceCharge: 0, priceIncludesTax: false };
    const { tax, serviceCharge, total } = computeTotals(dec(100), dec(0), store);
    expect(tax.toNumber()).toBeCloseTo(7, 5);
    expect(serviceCharge.toNumber()).toBe(0);
    expect(total.toNumber()).toBeCloseTo(107, 5);
  });

  it('extracts VAT from the price instead of adding it when tax-inclusive', () => {
    const store = { taxRate: 7, serviceCharge: 0, priceIncludesTax: true };
    const { tax, total } = computeTotals(dec(107), dec(0), store);
    // price already includes VAT — total must stay 107, tax is just reported
    expect(total.toNumber()).toBeCloseTo(107, 5);
    expect(tax.toNumber()).toBeCloseTo(7, 5);
  });

  it('applies service charge before VAT on a tax-exclusive bill', () => {
    const store = { taxRate: 7, serviceCharge: 10, priceIncludesTax: false };
    const { serviceCharge, tax, total } = computeTotals(dec(100), dec(0), store);
    expect(serviceCharge.toNumber()).toBeCloseTo(10, 5);
    expect(tax.toNumber()).toBeCloseTo(7, 5); // VAT on the original 100, not on 110
    expect(total.toNumber()).toBeCloseTo(117, 5);
  });

  it('subtracts a discount from the subtotal before tax', () => {
    const store = { taxRate: 7, serviceCharge: 0, priceIncludesTax: false };
    const { total } = computeTotals(dec(100), dec(20), store);
    expect(total.toNumber()).toBeCloseTo(85.6, 5); // (100-20) * 1.07
  });

  it('never lets a discount push the bill below zero', () => {
    const store = { taxRate: 7, serviceCharge: 0, priceIncludesTax: false };
    const { total } = computeTotals(dec(50), dec(999), store);
    expect(total.toNumber()).toBe(0);
  });

  it('handles a zero-tax, zero-service-charge store (common for small shops)', () => {
    const store = { taxRate: 0, serviceCharge: 0, priceIncludesTax: false };
    const { tax, serviceCharge, total } = computeTotals(dec(250), dec(0), store);
    expect(tax.toNumber()).toBe(0);
    expect(serviceCharge.toNumber()).toBe(0);
    expect(total.toNumber()).toBe(250);
  });
});
