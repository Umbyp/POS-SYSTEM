/**
 * Promotion Engine
 * รองรับ PERCENT_OFF / FIXED_OFF / BUY_X_GET_Y / FIXED_PRICE
 */
import { prisma } from '../../config/prisma';

export interface CartItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  categoryId?: string;
}

export interface PromotionResult {
  promotionId: string;
  promotionName: string;
  discountAmount: number;
  reason: string;
}

/** หา promotion ที่ apply ได้กับ cart และคืน promotion + ส่วนลดที่จะได้ */
export async function applyBestPromotion(
  storeId: string,
  cart: {
    items: CartItemInput[];
    subtotal: number;
    customerId?: string;
  },
  manualCode?: string
): Promise<PromotionResult | null> {
  const now = new Date();

  const promotions = await prisma.promotion.findMany({
    where: {
      storeId,
      isActive: true,
      OR: [
        { startAt: null },
        { startAt: { lte: now } },
      ],
      AND: [
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
  });

  let best: PromotionResult | null = null;

  for (const p of promotions) {
    const result = evaluatePromotion(p, cart, manualCode, now);
    if (!result) continue;
    if (!best || result.discountAmount > best.discountAmount) best = result;
  }

  return best;
}

/**
 * Is this ONE promotion applicable to the cart right now, and how much does it
 * take off? Pure (no DB) so the order flow can re-derive the discount on the
 * server instead of trusting an amount the client sent. `checkCode: false`
 * skips the "customer must type the code" gate (staff pick from the list).
 */
export function evaluatePromotion(
  p: any,
  cart: { items: CartItemInput[]; subtotal: number; customerId?: string },
  manualCode?: string,
  now: Date = new Date(),
  checkCode = true,
): PromotionResult | null {
  const dow = now.getDay();
  const hour = now.getHours();

  if (!p.isActive) return null;
  if (p.startAt && p.startAt > now) return null;
  if (p.endAt && p.endAt < now) return null;
  // เช็ค code ตรงหรือไม่ (ถ้า promotion ต้องการ code)
  if (checkCode && p.code && p.code !== manualCode) return null;
  // เช็ค member only
  if (p.memberOnly && !cart.customerId) return null;
  // เช็ค min spend
  if (p.minSpend && cart.subtotal < Number(p.minSpend)) return null;
  // เช็ค day of week
  if (p.daysOfWeek.length > 0 && !p.daysOfWeek.includes(dow)) return null;
  // เช็ค hour
  if (p.hourStart != null && p.hourEnd != null) {
    if (p.hourStart <= p.hourEnd) {
      if (hour < p.hourStart || hour > p.hourEnd) return null;
    } else {
      // overnight (เช่น 22-3)
      if (hour < p.hourStart && hour > p.hourEnd) return null;
    }
  }
  // เช็ค usage limit
  if (p.usageLimit && p.usageCount >= p.usageLimit) return null;

  // คำนวณส่วนลด
  const eligibleItems = filterEligibleItems(p, cart.items);
  if (eligibleItems.length === 0 && p.scope !== 'ALL_ORDER') return null;

  let discount = 0;
  let reason = p.name;

  if (p.type === 'PERCENT_OFF') {
    const base =
      p.scope === 'ALL_ORDER'
        ? cart.subtotal
        : eligibleItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    discount = (base * Number(p.value)) / 100;
    reason = `${p.name} (ลด ${p.value}%)`;
  } else if (p.type === 'FIXED_OFF') {
    discount = Math.min(Number(p.value), cart.subtotal);
    reason = `${p.name} (ลด ${p.value} บาท)`;
  } else if (p.type === 'BUY_X_GET_Y') {
    const buyQty = p.buyQty || 1;
    const getQty = p.getQty || 1;
    const totalQty = eligibleItems.reduce((s, i) => s + i.quantity, 0);
    const sets = Math.floor(totalQty / (buyQty + getQty));
    // ของฟรี = getQty × sets แก้วถูกสุด (เพื่อความยุติธรรม)
    const allUnits: number[] = [];
    eligibleItems.forEach((i) => {
      for (let j = 0; j < i.quantity; j++) allUnits.push(i.unitPrice);
    });
    allUnits.sort((a, b) => a - b);
    const freeCount = sets * getQty;
    discount = allUnits.slice(0, freeCount).reduce((s, x) => s + x, 0);
    reason = `${p.name} (ซื้อ ${buyQty} แถม ${getQty})`;
  } else if (p.type === 'FIXED_PRICE') {
    // เปลี่ยน eligible items เป็นราคา FIXED (value) ต่อหน่วย
    const before = eligibleItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const after = eligibleItems.reduce((s, i) => s + Number(p.value) * i.quantity, 0);
    discount = Math.max(0, before - after);
    reason = `${p.name} (ราคาพิเศษ ${p.value} บาท)`;
  }

  if (discount <= 0) return null;
  discount = Math.min(discount, cart.subtotal);

  return {
    promotionId: p.id,
    promotionName: reason,
    discountAmount: Math.round(discount * 100) / 100,
    reason,
  };
}

function filterEligibleItems(p: any, items: CartItemInput[]) {
  if (p.scope === 'ALL_ORDER') return items;
  if (p.scope === 'PRODUCT') {
    return items.filter((i) => p.productIds.includes(i.productId));
  }
  if (p.scope === 'CATEGORY') {
    return items.filter((i) => i.categoryId && p.categoryIds.includes(i.categoryId));
  }
  return [];
}

/** เพิ่ม usageCount หลังใช้ promotion */
export async function incrementUsage(promotionId: string) {
  return prisma.promotion.update({
    where: { id: promotionId },
    data: { usageCount: { increment: 1 } },
  });
}

/** Schedule/limit gate only (no cart): is this promotion currently usable at all? */
export function isUsableNow(p: any, now: Date = new Date()): boolean {
  if (!p.isActive) return false;
  if (p.startAt && p.startAt > now) return false;
  if (p.endAt && p.endAt < now) return false;
  if (p.daysOfWeek?.length > 0 && !p.daysOfWeek.includes(now.getDay())) return false;
  if (p.hourStart != null && p.hourEnd != null) {
    const h = now.getHours();
    if (p.hourStart <= p.hourEnd ? h < p.hourStart || h > p.hourEnd : h < p.hourStart && h > p.hourEnd) return false;
  }
  if (p.usageLimit && p.usageCount >= p.usageLimit) return false;
  return true;
}
