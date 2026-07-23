import { Prisma, PointTxType } from '@prisma/client';

type LoyaltyKind = 'points' | 'stamps';

/**
 * ตัวเขียน ledger กลาง — อัปเดตยอดสรุป (points หรือ stamps) ที่ Customer
 * + สร้างแถว PointTransaction ในทรานแซกชันเดียว คืนยอดคงเหลือหลังรายการ
 * ต้องเรียกภายใน prisma.$transaction เสมอ
 */
async function writeLedger(
  tx: Prisma.TransactionClient,
  kind: LoyaltyKind,
  args: {
    storeId: string;
    customerId: string;
    type: PointTxType;
    amount: number; // +ได้ / -ใช้ (delta ที่จะใช้จริง)
    orderId?: string | null;
    note?: string;
    createdBy?: string;
  }
): Promise<number> {
  const column = kind === 'points' ? 'points' : 'stamps';

  if (args.amount === 0) {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: args.customerId },
      select: { [column]: true } as any,
    });
    return (c as any)[column];
  }

  const updated = await tx.customer.update({
    where: { id: args.customerId },
    data: { [column]: { increment: args.amount } } as any,
    select: { [column]: true } as any,
  });
  const balanceAfter = (updated as any)[column] as number;

  await tx.pointTransaction.create({
    data: {
      storeId: args.storeId,
      customerId: args.customerId,
      type: args.type,
      points: args.amount,
      balanceAfter,
      orderId: args.orderId ?? null,
      note: args.note,
      createdBy: args.createdBy,
    },
  });

  return balanceAfter;
}

/** บันทึกการเปลี่ยนแปลง "แต้ม" (points ตามยอดซื้อ) */
export function recordPoints(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string; customerId: string; type: PointTxType;
    points: number; orderId?: string | null; note?: string; createdBy?: string;
  }
): Promise<number> {
  return writeLedger(tx, 'points', { ...args, amount: args.points });
}

/** บันทึกการเปลี่ยนแปลง "ดวง" (stamps บัตรสะสม) */
export function recordStamps(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string; customerId: string; type: PointTxType;
    stamps: number; orderId?: string | null; note?: string; createdBy?: string;
  }
): Promise<number> {
  return writeLedger(tx, 'stamps', { ...args, amount: args.stamps });
}

/** โหมด loyalty ของร้านเปิดใช้ points / stamps อยู่ไหม */
export function pointsEnabled(loyaltyMode: string): boolean {
  return loyaltyMode === 'POINTS' || loyaltyMode === 'BOTH';
}
export function stampsEnabled(loyaltyMode: string): boolean {
  return loyaltyMode === 'STAMPS' || loyaltyMode === 'BOTH';
}

/**
 * แต้มที่จะได้จากยอดบิล ตาม config ของร้าน
 * pointsEarnBaht = 0 → ปิดการสะสม
 */
export function calcEarnedPoints(total: number, pointsEarnBaht: number): number {
  if (!pointsEarnBaht || pointsEarnBaht <= 0) return 0;
  return Math.floor(total / pointsEarnBaht);
}

/**
 * ดวงที่จะได้จากยอดบิล ตาม config ของร้าน
 * stampsEarnBaht = 0 → แบบเดิม คือ 1 ดวงต่อบิล (ไม่ว่ายอดเท่าไหร่)
 */
export function calcEarnedStamps(total: number, stampsEarnBaht: number): number {
  if (!stampsEarnBaht || stampsEarnBaht <= 0) return 1;
  return Math.floor(total / stampsEarnBaht);
}

/**
 * คืนเงินบิล → กลับทั้งแต้มและดวง:
 *  - คืนสิ่งที่ลูกค้าเคย "ใช้" (redeemed) กลับให้
 *  - ดึงสิ่งที่เคย "ได้" (earned) กลับ แต่ไม่ให้ยอดติดลบ (ดึงเท่าที่เหลืออยู่)
 * ต้องกันการ refund ซ้ำจากผู้เรียก (order.service ทำอยู่) ไม่งั้นจะกลับซ้ำ
 */
export async function reverseOrderPoints(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    storeId: string;
    customerId: string | null;
    pointsEarned: number;
    pointsRedeemed: number;
    stampsEarned?: number;
    stampsRedeemed?: number;
  }
): Promise<void> {
  if (!order.customerId) return;

  // ---- แต้ม (points) ----
  if (order.pointsRedeemed > 0) {
    await recordPoints(tx, {
      storeId: order.storeId, customerId: order.customerId,
      type: PointTxType.REFUND_REVERSAL, points: order.pointsRedeemed,
      orderId: order.id, note: 'คืนแต้มที่ใช้ (คืนเงินบิล)',
    });
  }
  if (order.pointsEarned > 0) {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: order.customerId }, select: { points: true },
    });
    const clawback = Math.min(order.pointsEarned, c.points);
    if (clawback > 0) {
      await recordPoints(tx, {
        storeId: order.storeId, customerId: order.customerId,
        type: PointTxType.REFUND_REVERSAL, points: -clawback,
        orderId: order.id, note: 'ดึงแต้มที่ได้กลับ (คืนเงินบิล)',
      });
    }
  }

  // ---- ดวง (stamps) ----
  const stampsRedeemed = order.stampsRedeemed ?? 0;
  const stampsEarned = order.stampsEarned ?? 0;
  if (stampsRedeemed > 0) {
    await recordStamps(tx, {
      storeId: order.storeId, customerId: order.customerId,
      type: PointTxType.REFUND_REVERSAL, stamps: stampsRedeemed,
      orderId: order.id, note: 'คืนดวงที่ใช้แลกรางวัล (คืนเงินบิล)',
    });
  }
  if (stampsEarned > 0) {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: order.customerId }, select: { stamps: true },
    });
    const clawback = Math.min(stampsEarned, c.stamps);
    if (clawback > 0) {
      await recordStamps(tx, {
        storeId: order.storeId, customerId: order.customerId,
        type: PointTxType.REFUND_REVERSAL, stamps: -clawback,
        orderId: order.id, note: 'ดึงดวงที่ได้กลับ (คืนเงินบิล)',
      });
    }
  }
}
