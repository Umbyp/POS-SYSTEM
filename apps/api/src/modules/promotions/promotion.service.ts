/**
 * Promotion Engine
 * รองรับ PERCENT_OFF / FIXED_OFF / BUY_X_GET_Y / FIXED_PRICE
 */
import { prisma } from '../../config/prisma';

interface CartItemInput {
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
  const dow = now.getDay();
  const hour = now.getHours();

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
    // เช็ค code ตรงหรือไม่ (ถ้า promotion ต้องการ code)
    if (p.code && p.code !== manualCode) continue;
    // เช็ค member only
    if (p.memberOnly && !cart.customerId) continue;
    // เช็ค min spend
    if (p.minSpend && cart.subtotal < Number(p.minSpend)) continue;
    // เช็ค day of week
    if (p.daysOfWeek.length > 0 && !p.daysOfWeek.includes(dow)) continue;
    // เช็ค hour
    if (p.hourStart != null && p.hourEnd != null) {
      if (p.hourStart <= p.hourEnd) {
        if (hour < p.hourStart || hour > p.hourEnd) continue;
      } else {
        // overnight (เช่น 22-3)
        if (hour < p.hourStart && hour > p.hourEnd) continue;
      }
    }
    // เช็ค usage limit
    if (p.usageLimit && p.usageCount >= p.usageLimit) continue;

    // คำนวณส่วนลด
    const eligibleItems = filterEligibleItems(p, cart.items);
    if (eligibleItems.length === 0 && p.scope !== 'ALL_ORDER') continue;

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
      discount = allUnits.slice(0, freeCount).reduce((s, p) => s + p, 0);
      reason = `${p.name} (ซื้อ ${buyQty} แถม ${getQty})`;
    } else if (p.type === 'FIXED_PRICE') {
      // เปลี่ยน eligible items เป็นราคา FIXED (value) ต่อหน่วย
      const before = eligibleItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const after = eligibleItems.reduce((s, i) => s + Number(p.value) * i.quantity, 0);
      discount = Math.max(0, before - after);
      reason = `${p.name} (ราคาพิเศษ ${p.value} บาท)`;
    }

    if (discount <= 0) continue;

    if (!best || discount > best.discountAmount) {
      best = {
        promotionId: p.id,
        promotionName: reason,
        discountAmount: Math.round(discount * 100) / 100,
        reason,
      };
    }
  }

  return best;
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
