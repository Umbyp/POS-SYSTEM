/**
 * Pricing math — must match backend (apps/api/src/modules/orders/order.service.ts)
 *
 * VAT-inclusive  (priceIncludesTax = true):  Prices already include tax
 *   tax   = afterDiscount × rate / (100 + rate)   ← extracted from price
 *   total = afterDiscount + service                 (do not add tax again)
 *
 * VAT-exclusive (priceIncludesTax = false): Prices exclude tax
 *   tax   = afterDiscount × rate / 100             ← added on top
 *   total = afterDiscount + tax + service
 */

export interface TaxConfig {
  taxRate: number;
  priceIncludesTax: boolean;
  serviceCharge: number;
}

export interface PricingBreakdown {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  vatIncluded: boolean;
}

export function computePricing(
  subtotal: number,
  discount: number,
  config: TaxConfig
): PricingBreakdown {
  const afterDiscount = Math.max(0, subtotal - discount);
  const service = (afterDiscount * (config.serviceCharge || 0)) / 100;
  const rate = config.taxRate || 0;

  const tax = config.priceIncludesTax
    ? (afterDiscount * rate) / (100 + rate)
    : (afterDiscount * rate) / 100;

  const total = config.priceIncludesTax
    ? afterDiscount + service
    : afterDiscount + tax + service;

  return {
    subtotal,
    discount,
    afterDiscount,
    tax,
    serviceCharge: service,
    total,
    vatIncluded: config.priceIncludesTax,
  };
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  taxRate: 7,
  priceIncludesTax: true,
  serviceCharge: 0,
};
