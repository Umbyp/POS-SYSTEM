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

/** Solid status colors for legend dots, header spines and floor-plan chairs. */
export const TABLE_STATUS_DOT: Record<TableStatus, string> = {
  AVAILABLE: '#047857',
  RESERVED: '#B45309',
  OCCUPIED: '#2B1F17',
  BILLING: '#1D4ED8',
  DIRTY: '#7A6A5C',
};

/** Floor-plan table tile: occupied/billing are solid fills, others are tinted with a border. */
export const TABLE_TILE: Record<TableStatus, { bg: string; border: string; fg: string; chair: string; solid: boolean }> = {
  AVAILABLE: { bg: '#ECFDF5', border: '#047857', fg: '#047857', chair: '#A7D8C4', solid: false },
  RESERVED: { bg: '#FEFCE8', border: '#B45309', fg: '#B45309', chair: '#E9C77A', solid: false },
  OCCUPIED: { bg: '#2B1F17', border: '#2B1F17', fg: '#FFFFFF', chair: '#2B1F17', solid: true },
  BILLING: { bg: '#1D4ED8', border: '#1D4ED8', fg: '#FFFFFF', chair: '#1D4ED8', solid: true },
  DIRTY: { bg: '#F2E9E0', border: '#D8C7B8', fg: '#7A6A5C', chair: '#D8C7B8', solid: false },
};
