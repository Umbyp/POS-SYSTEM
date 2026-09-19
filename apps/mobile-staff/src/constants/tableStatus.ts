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
  OCCUPIED: { bg: '#EAE1D6', border: '#2B1F17', fg: '#2B1F17' },
  BILLING: { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1D4ED8' },
  DIRTY: { bg: '#F2E9E0', border: '#D8C7B8', fg: '#7A6A5C' },
};

export const TABLE_STATUS_ORDER: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING', 'DIRTY'];
