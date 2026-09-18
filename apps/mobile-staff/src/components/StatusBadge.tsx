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
  DRAFT: { bg: '#F3F4F6', fg: '#6B7280' },
  PENDING: { bg: '#FEF3C7', fg: '#B45309' },
  PREPARING: { bg: '#DBEAFE', fg: '#1D4ED8' },
  READY: { bg: '#D1FAE5', fg: '#047857' },
  COMPLETED: { bg: '#E5E7EB', fg: '#374151' },
  CANCELLED: { bg: '#FEE2E2', fg: '#B91C1C' },
  REFUNDED: { bg: '#FEE2E2', fg: '#B91C1C' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = COLOR[status];
  return (
    <View style={{ backgroundColor: c.bg }} className="rounded-full px-2.5 py-1 self-start">
      <Text style={{ color: c.fg }} className="text-[11px] font-semibold">
        {LABEL[status]}
      </Text>
    </View>
  );
}
