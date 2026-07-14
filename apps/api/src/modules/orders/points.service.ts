import { Prisma, PointTxType } from '@prisma/client';

/**
 * บันทึกการเปลี่ยนแปลงแต้มลง ledger + อัปเดตยอดสรุปที่ Customer ในทรานแซกชันเดียว
 * คืนค่ายอดแต้มคงเหลือหลังรายการ (balanceAfter)
 *
 * ต้องเรียกภายใน prisma.$transaction เสมอ (รับ tx client เข้ามา)
 */
export async function recordPoints(
  tx: Prisma.TransactionClient,
  args: {
    storeId: string;
    customerId: string;
    type: PointTxType;
    points: number; // +ได้ / -ใช้ (delta ที่จะใช้จริง)
    orderId?: string | null;
    note?: string;
    createdBy?: string;
  }
): Promise<number> {
  if (args.points === 0) {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: args.customerId },
      select: { points: true },
    });
    return c.points;
  }

  const updated = await tx.customer.update({
    where: { id: args.customerId },
    data: { points: { increment: args.points } },
    select: { points: true },
  });

  await tx.pointTransaction.create({
    data: {
      storeId: args.storeId,
      customerId: args.customerId,
      type: args.type,
      points: args.points,
      balanceAfter: updated.points,
      orderId: args.orderId ?? null,
      note: args.note,
      createdBy: args.createdBy,
    },
  });

  return updated.points;
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
 * คืนเงินบิล → กลับรายการแต้ม:
 *  - คืนแต้มที่ลูกค้าเคย "ใช้" (pointsRedeemed) กลับให้
 *  - ดึงแต้มที่เคย "ได้" (pointsEarned) กลับ แต่ไม่ให้ยอดติดลบ
 *    (เผื่อกรณีลูกค้าใช้แต้มนั้นไปแล้วก่อน refund — ดึงเท่าที่มี)
 * ต้องกันการ refund ซ้ำจากผู้เรียก (order.service ทำอยู่) ไม่งั้นจะกลับแต้มซ้ำ
 */
export async function reverseOrderPoints(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    storeId: string;
    customerId: string | null;
    pointsEarned: number;
    pointsRedeemed: number;
  }
): Promise<void> {
  if (!order.customerId) return;

  if (order.pointsRedeemed > 0) {
    await recordPoints(tx, {
      storeId: order.storeId,
      customerId: order.customerId,
      type: PointTxType.REFUND_REVERSAL,
      points: order.pointsRedeemed,
      orderId: order.id,
      note: 'คืนแต้มที่ใช้ (คืนเงินบิล)',
    });
  }

  if (order.pointsEarned > 0) {
    const c = await tx.customer.findUniqueOrThrow({
      where: { id: order.customerId },
      select: { points: true },
    });
    const clawback = Math.min(order.pointsEarned, c.points);
    if (clawback > 0) {
      await recordPoints(tx, {
        storeId: order.storeId,
        customerId: order.customerId,
        type: PointTxType.REFUND_REVERSAL,
        points: -clawback,
        orderId: order.id,
        note: 'ดึงแต้มที่ได้กลับ (คืนเงินบิล)',
      });
    }
  }
}
