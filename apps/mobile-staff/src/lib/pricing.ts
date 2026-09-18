interface TaxConfig {
  taxRate: number;
  serviceCharge: number;
  priceIncludesTax: boolean;
}

/** Mirrors apps/api's order-tab.service.ts computeTotals — used client-side
 * only to quote an amount due before an order exists server-side (direct
 * takeaway/delivery checkout). The server recomputes and is authoritative. */
export function computeTotals(subtotal: number, store: TaxConfig, discount = 0) {
  const afterDiscount = Math.max(0, subtotal - discount);
  const serviceCharge = (afterDiscount * store.serviceCharge) / 100;
  const tax = store.priceIncludesTax
    ? (afterDiscount * store.taxRate) / (store.taxRate + 100)
    : (afterDiscount * store.taxRate) / 100;
  const total = store.priceIncludesTax ? afterDiscount + serviceCharge : afterDiscount + tax + serviceCharge;
  return { tax, serviceCharge, total };
}
