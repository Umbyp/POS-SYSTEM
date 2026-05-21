/**
 * LINE Notify integration
 * https://notify-bot.line.me/doc/en/
 *
 * - แต่ละ store เก็บ access token (ขอจาก https://notify-bot.line.me/my/)
 * - ส่ง message ผ่าน POST https://notify-api.line.me/api/notify
 */
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';

const NOTIFY_URL = 'https://notify-api.line.me/api/notify';

/** ส่งข้อความไป LINE Notify ของร้าน */
export async function notifyStore(storeId: string, message: string): Promise<boolean> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { lineNotifyToken: true, name: true },
  });
  if (!store?.lineNotifyToken) return false;

  try {
    const body = new URLSearchParams({ message });
    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${store.lineNotifyToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text, storeId }, 'LINE Notify failed');
      return false;
    }
    return true;
  } catch (e: any) {
    logger.warn({ err: e.message, storeId }, 'LINE Notify error');
    return false;
  }
}

/** ส่ง notification เมื่อสร้างออเดอร์ */
export async function notifyOrderCreated(order: any) {
  if (!order?.storeId) return;
  const paymentLabel = (m: string) =>
    m === 'CASH' ? '💵 เงินสด'
    : m === 'PROMPTPAY' ? '📱 PromptPay'
    : m === 'CREDIT_CARD' ? '💳 บัตร'
    : m === 'BANK_TRANSFER' ? '🏦 โอน'
    : m;

  const payments = (order.payments || [])
    .map((p: any) => `${paymentLabel(p.method)} ${Number(p.amount).toFixed(2)}`)
    .join(', ');

  const items = (order.items || [])
    .slice(0, 5)
    .map((i: any) => `  • ${i.quantity}× ${i.product?.name || ''}`)
    .join('\n');
  const moreItems = order.items?.length > 5 ? `\n  ... +${order.items.length - 5} รายการ` : '';

  const lines = [
    `🧾 ออเดอร์ใหม่ ${order.orderNumber}`,
    `ยอดรวม: ฿${Number(order.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
    `${payments}`,
    order.table ? `โต๊ะ: ${order.table.number}` : '',
    order.customer ? `ลูกค้า: ${order.customer.name}` : '',
    order.cashier ? `โดย: ${order.cashier.name}` : '',
    '',
    items + moreItems,
  ].filter(Boolean);

  await notifyStore(order.storeId, '\n' + lines.join('\n'));
}

/** Daily summary — สรุปรายได้ของวัน */
export async function sendDailySummary(storeId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: { gte: today },
      status: { notIn: ['CANCELLED', 'REFUNDED', 'DRAFT'] },
    },
    include: { payments: true, items: true },
  });

  if (orders.length === 0) {
    await notifyStore(storeId, '\n📊 สรุปวันนี้: ยังไม่มีออเดอร์');
    return;
  }

  const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const itemCount = orders.reduce((s, o) => s + o.items.length, 0);
  const cash = orders.flatMap((o) => o.payments).filter((p) => p.method === 'CASH').reduce((s, p) => s + Number(p.amount), 0);
  const promptpay = orders.flatMap((o) => o.payments).filter((p) => p.method === 'PROMPTPAY').reduce((s, p) => s + Number(p.amount), 0);

  const message = [
    `\n📊 สรุปวันนี้ ${today.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    `รายได้: ฿${revenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
    `ออเดอร์: ${orders.length} บิล (${itemCount} รายการ)`,
    `💵 เงินสด: ฿${cash.toFixed(2)}`,
    `📱 PromptPay: ฿${promptpay.toFixed(2)}`,
    `เฉลี่ย/บิล: ฿${(revenue / orders.length).toFixed(2)}`,
  ].join('\n');

  await notifyStore(storeId, message);
}

/**
 * Detect anomaly: today's revenue vs 14-day avg of same day-of-week
 * ส่ง LINE เตือนถ้าเบี่ยงเบนเกิน threshold
 */
export async function checkAnomaly(storeId: string): Promise<{
  anomaly: boolean;
  message?: string;
  todayRevenue: number;
  expectedRange: { min: number; max: number };
}> {
  const now = new Date();
  const dow = now.getDay();
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

  if (anomaly && message) {
    await notifyStore(storeId, '\n' + message);
  }

  return { anomaly, message, todayRevenue, expectedRange: { min, max } };
}

/** ทดสอบ token (verify) */
export async function testToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const body = new URLSearchParams({ message: '✅ ทดสอบการเชื่อมต่อ POS System สำเร็จ' });
    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      return { ok: false, message: `ไม่สำเร็จ (HTTP ${res.status}) — token อาจไม่ถูกต้อง` };
    }
    return { ok: true, message: 'ส่งข้อความทดสอบไปยัง LINE แล้ว' };
  } catch (e: any) {
    return { ok: false, message: `เชื่อมต่อไม่ได้: ${e.message}` };
  }
}
