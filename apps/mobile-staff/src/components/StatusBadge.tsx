import { View, Text } from 'react-native';
import type { OrderStatus } from '@/types/pos';

const LABEL: Record<OrderStatus, string> = {
  DRAFT: 'ร่าง',
  PENDING: 'รอทำ',
  PREPARING: 'กำลังทำ',
  READY: 'พร้อมเสิร์ฟ',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
  REFUNDED: 'คืนเงิน',
};

// Compact solid pills with white text.
const COLOR: Record<OrderStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: '#A3A3A3', fg: '#FFFFFF' },
  PENDING: { bg: '#B45309', fg: '#FFFFFF' },
  PREPARING: { bg: '#1D4ED8', fg: '#FFFFFF' },
  READY: { bg: '#047857', fg: '#FFFFFF' },
  COMPLETED: { bg: '#707070', fg: '#FFFFFF' },
  CANCELLED: { bg: '#B91C1C', fg: '#FFFFFF' },
  REFUNDED: { bg: '#B91C1C', fg: '#FFFFFF' },
};

/** Left "status spine" colour per order status (mockup 1g/2d). */
export const SPINE_COLOR: Record<OrderStatus, string> = {
  DRAFT: '#D4D4D4',
  PENDING: '#B45309',
  PREPARING: '#1D4ED8',
  READY: '#047857',
  COMPLETED: '#D4D4D4',
  CANCELLED: '#D4D4D4',
  REFUNDED: '#D4D4D4',
};

export const OVERDUE_COLOR = '#B91C1C';
const OVERDUE_AFTER_MIN = 15;

/** Minutes past the kitchen threshold for an order still being made, else 0. */
export function overdueMinutes(status: OrderStatus, createdAt: string): number {
  if (status !== 'PENDING' && status !== 'PREPARING') return 0;
  const waited = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  return waited > OVERDUE_AFTER_MIN ? waited - OVERDUE_AFTER_MIN : 0;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = COLOR[status];
  return (
    <View style={{ backgroundColor: c.bg }} className="rounded-full px-2 py-[3px] self-start">
      <Text style={{ color: c.fg }} className="text-[10px] font-bold">
        {LABEL[status]}
      </Text>
    </View>
  );
}
