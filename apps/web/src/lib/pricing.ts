/**
 * Pricing math — ต้องตรงกับ backend (apps/api/src/modules/orders/order.service.ts)
 *
 * VAT-inclusive  (priceIncludesTax = true):  ราคาสินค้ารวมภาษีแล้ว
 *   tax   = afterDiscount × rate / (100 + rate)   ← ถอดออกมา
 *   total = afterDiscount + service                 (ไม่บวก tax ซ้ำ)
 *
 * VAT-exclusive (priceIncludesTax = false): ราคาสินค้าไม่รวมภาษี
 *   tax   = afterDiscount × rate / 100             ← บวกเพิ่ม
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
