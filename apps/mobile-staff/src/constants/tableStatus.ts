import type { TableStatus } from '@/types/pos';

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: 'ว่าง',
  RESERVED: 'จองแล้ว',
  OCCUPIED: 'มีลูกค้า',
  BILLING: 'รอเก็บเงิน',
  DIRTY: 'รอทำความสะอาด',
};

export const TABLE_STATUS_COLOR: Record<TableStatus, { bg: string; border: string; fg: string }> = {
  AVAILABLE: { bg: '#ECFDF5', border: '#A7F3D0', fg: '#047857' },
  RESERVED: { bg: '#FEFCE8', border: '#FDE68A', fg: '#B45309' },
  OCCUPIED: { bg: '#FFF4F0', border: '#FFC9A8', fg: '#D14315' },
  BILLING: { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1D4ED8' },
  DIRTY: { bg: '#F3F4F6', border: '#D1D5DB', fg: '#6B7280' },
};

export const TABLE_STATUS_ORDER: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING', 'DIRTY'];
