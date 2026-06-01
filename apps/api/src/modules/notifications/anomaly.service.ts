/**
 * Revenue anomaly detection
 *
 * Compares today's revenue (up to the current hour) against the same
 * day-of-week over the previous 4 weeks. Returns whether today is unusually
 * high/low plus a human-readable message. No external push integration —
 * the caller decides what to do with the result.
 */
import { prisma } from '../../config/prisma';

/**
 * Detect anomaly: today's revenue vs 4-week avg of the same day-of-week.
 */
export async function checkAnomaly(storeId: string): Promise<{
  anomaly: boolean;
  message?: string;
  todayRevenue: number;
  expectedRange: { min: number; max: number };
}> {
  const now = new Date();
  const hourNow = now.getHours();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // เก็บข้อมูลเฉพาะของวันนี้ ในชั่วโมงที่เกิดขึ้นแล้ว
  const todayAgg = await prisma.order.aggregate({
    where: {
      storeId,
      createdAt: { gte: startOfToday },
      status: { notIn: ['CANCELLED', 'REFUNDED', 'DRAFT'] as any },
    },
    _sum: { total: true },
  });
  const todayRevenue = Number(todayAgg._sum.total || 0);

  // baseline: วันเดียวกันใน 4 สัปดาห์ที่ผ่านมา (ก่อน 7,14,21,28 วัน)
  const baselineValues: number[] = [];
  for (const weekBack of [1, 2, 3, 4]) {
    const dayStart = new Date(now);
    dayStart.setDate(now.getDate() - weekBack * 7);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(hourNow, now.getMinutes(), now.getSeconds(), 999);
    const agg = await prisma.order.aggregate({
      where: {
        storeId,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED', 'REFUNDED', 'DRAFT'] as any },
      },
      _sum: { total: true },
    });
    baselineValues.push(Number(agg._sum.total || 0));
  }

  // ค่าเฉลี่ย + std
  const avg = baselineValues.reduce((s, v) => s + v, 0) / baselineValues.length;
  const variance =
    baselineValues.reduce((s, v) => s + (v - avg) ** 2, 0) / baselineValues.length;
  const std = Math.sqrt(variance);
  const min = Math.max(0, avg - 1.5 * std);
  const max = avg + 1.5 * std;

  // ยังไม่พอข้อมูล 4 อาทิตย์ → skip
  if (avg < 100) {
    return { anomaly: false, todayRevenue, expectedRange: { min, max } };
  }

  let message: string | undefined;
  let anomaly = false;
  if (todayRevenue < min) {
    anomaly = true;
    const pctDown = ((avg - todayRevenue) / avg) * 100;
    message = `⚠️ ยอดต่ำผิดปกติ\nวันนี้ตอนนี้ ฿${todayRevenue.toFixed(0)} (ต่ำกว่าค่าเฉลี่ยวันเดียวกัน ${pctDown.toFixed(0)}%)\nคาดการณ์ปกติ: ฿${avg.toFixed(0)}\nลองตรวจ: พนักงานครบ? ระบบใช้งานได้? คู่แข่งมีโปร?`;
  } else if (todayRevenue > max) {
    anomaly = true;
    const pctUp = ((todayRevenue - avg) / avg) * 100;
    message = `🎉 ยอดสูงผิดปกติ (ในทางดี!)\nวันนี้ตอนนี้ ฿${todayRevenue.toFixed(0)} (สูงกว่าค่าเฉลี่ย ${pctUp.toFixed(0)}%)\nคาดการณ์ปกติ: ฿${avg.toFixed(0)}\nเตรียมสต็อก + พนักงานเพิ่ม?`;
  }

  return { anomaly, message, todayRevenue, expectedRange: { min, max } };
}
