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
  OCCUPIED: { bg: '#E6E6E6', border: '#1F1F1F', fg: '#1F1F1F' },
  BILLING: { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1D4ED8' },
  DIRTY: { bg: '#EFEFEF', border: '#D4D4D4', fg: '#707070' },
};

export const TABLE_STATUS_ORDER: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING', 'DIRTY'];

/** Solid status colors for legend dots, header spines and floor-plan chairs. */
export const TABLE_STATUS_DOT: Record<TableStatus, string> = {
  AVAILABLE: '#047857',
  RESERVED: '#B45309',
  OCCUPIED: '#1F1F1F',
  BILLING: '#1D4ED8',
  DIRTY: '#707070',
};

/** Floor-plan table tile: every status is a light tile with a coloured 1.5px border (occupied = white + dark border). */
export const TABLE_TILE: Record<TableStatus, { bg: string; border: string; fg: string; chair: string; solid: boolean }> = {
  AVAILABLE: { bg: '#ECFDF5', border: '#047857', fg: '#047857', chair: '#A7D8C4', solid: false },
  RESERVED: { bg: '#FEFCE8', border: '#B45309', fg: '#B45309', chair: '#E9C77A', solid: false },
  OCCUPIED: { bg: '#FFFFFF', border: '#1F1F1F', fg: '#1F1F1F', chair: '#8A8A8A', solid: false },
  BILLING: { bg: '#EFF6FF', border: '#1D4ED8', fg: '#1D4ED8', chair: '#93B4F5', solid: false },
  DIRTY: { bg: '#EFEFEF', border: '#D4D4D4', fg: '#707070', chair: '#D4D4D4', solid: false },
};
