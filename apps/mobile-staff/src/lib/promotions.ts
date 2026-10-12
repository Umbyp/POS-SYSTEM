import type { Promotion } from '@/types/pos';

export interface PromoCartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  categoryId?: string;
}

export interface PromoEvaluation {
  promotion: Promotion;
  eligible: boolean;
  /** Why it doesn't apply right now (Thai, shown under the promotion). */
  why?: string;
  discount: number;
  label: string;
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

/** Promotions that are switched on, inside their date window and under their usage cap. */
export function isLive(p: Promotion, now = new Date()): boolean {
  if (!p.isActive) return false;
  if (p.startAt && new Date(p.startAt) > now) return false;
  if (p.endAt && new Date(p.endAt) < now) return false;
  if (p.usageLimit && p.usageCount >= p.usageLimit) return false;
  return true;
}

function eligibleItems(p: Promotion, items: PromoCartItem[]) {
  if (p.scope === 'ALL_ORDER') return items;
  if (p.scope === 'PRODUCT') return items.filter((i) => p.productIds.includes(i.productId));
  if (p.scope === 'CATEGORY') return items.filter((i) => i.categoryId && p.categoryIds.includes(i.categoryId));
  return [];
}

/** Client copy of apps/api promotion.service.ts evaluatePromotion (checkCode=false), so a
 * specific promotion picked from the list can be priced (the API endpoint only returns the single
 * best one). The amount is sent as `promotionDiscount`, exactly like the web POS does. */
export function evaluatePromotion(
  p: Promotion,
  cart: { items: PromoCartItem[]; subtotal: number; hasCustomer: boolean },
  now = new Date()
): PromoEvaluation {
  const fail = (why: string): PromoEvaluation => ({ promotion: p, eligible: false, why, discount: 0, label: p.name });
  if (!isLive(p, now)) return fail('หมดอายุหรือปิดใช้งาน');
  // `code` is deliberately not checked: like the server (checkCode=false) a promotion picked from the list by staff needs no typed code.
  if (p.memberOnly && !cart.hasCustomer) return fail('เฉพาะสมาชิก — เลือกสมาชิกก่อน');
  if (p.minSpend && cart.subtotal < num(p.minSpend)) return fail(`ขั้นต่ำ ฿${num(p.minSpend)}`);
  const dow = now.getDay();
  if (p.daysOfWeek.length > 0 && !p.daysOfWeek.includes(dow)) return fail('ไม่ใช่วันที่ร่วมรายการ');
  const hour = now.getHours();
  if (p.hourStart != null && p.hourEnd != null) {
    const inWindow = p.hourStart <= p.hourEnd ? hour >= p.hourStart && hour <= p.hourEnd : !(hour < p.hourStart && hour > p.hourEnd);
    if (!inWindow) return fail('นอกช่วงเวลาร่วมรายการ');
  }
  const eligible = eligibleItems(p, cart.items);
  if (eligible.length === 0 && p.scope !== 'ALL_ORDER') return fail('ไม่มีสินค้าที่ร่วมรายการในตะกร้า');

  let discount = 0;
  let label = p.name;
  const value = num(p.value);
  if (p.type === 'PERCENT_OFF') {
    const base = p.scope === 'ALL_ORDER' ? cart.subtotal : eligible.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    discount = (base * value) / 100;
    label = `${p.name} (ลด ${value}%)`;
  } else if (p.type === 'FIXED_OFF') {
    discount = Math.min(value, cart.subtotal);
    label = `${p.name} (ลด ${value} บาท)`;
  } else if (p.type === 'BUY_X_GET_Y') {
    const buyQty = p.buyQty || 1;
    const getQty = p.getQty || 1;
    const totalQty = eligible.reduce((s, i) => s + i.quantity, 0);
    const sets = Math.floor(totalQty / (buyQty + getQty));
    const units: number[] = [];
    for (const i of eligible) for (let j = 0; j < i.quantity; j++) units.push(i.unitPrice);
    units.sort((a, b) => a - b);
    discount = units.slice(0, sets * getQty).reduce((s, x) => s + x, 0);
    label = `${p.name} (ซื้อ ${buyQty} แถม ${getQty})`;
  } else if (p.type === 'FIXED_PRICE') {
    const before = eligible.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const after = eligible.reduce((s, i) => s + value * i.quantity, 0);
    discount = Math.max(0, before - after);
    label = `${p.name} (ราคาพิเศษ ${value} บาท)`;
  }
  discount = Math.round(Math.min(discount, cart.subtotal) * 100) / 100;
  if (discount <= 0) return fail('ยังไม่เข้าเงื่อนไข');
  return { promotion: p, eligible: true, discount, label };
}
