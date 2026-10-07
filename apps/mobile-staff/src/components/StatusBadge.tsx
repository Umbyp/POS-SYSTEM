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

const COLOR: Record<OrderStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: '#E7DACE', fg: '#7A6A5C' },
  PENDING: { bg: '#FEF3C7', fg: '#B45309' },
  PREPARING: { bg: '#DBEAFE', fg: '#1D4ED8' },
  READY: { bg: '#D1FAE5', fg: '#047857' },
  COMPLETED: { bg: '#E7DACE', fg: '#4A382C' },
  CANCELLED: { bg: '#FEE2E2', fg: '#B91C1C' },
  REFUNDED: { bg: '#FEE2E2', fg: '#B91C1C' },
};

/** Left "status spine" colour per order status (mockup 1g/2d). */
export const SPINE_COLOR: Record<OrderStatus, string> = {
  DRAFT: '#D8C7B8',
  PENDING: '#B45309',
  PREPARING: '#1D4ED8',
  READY: '#047857',
  COMPLETED: '#D8C7B8',
  CANCELLED: '#D8C7B8',
  REFUNDED: '#D8C7B8',
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
    <View style={{ backgroundColor: c.bg }} className="rounded-full px-[9px] py-1 self-start">
      <Text style={{ color: c.fg }} className="text-[11px] font-bold">
        {LABEL[status]}
      </Text>
    </View>
  );
}
