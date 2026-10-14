import type { ItemType, PlacedItem } from '../config';
import type { WorldPlan } from './layout';
import { restroomRect } from './scene/Interior';

export interface ItemInfo {
  type: ItemType;
  name: string;
  emoji: string;
  /** footprint radius, used to keep things from overlapping */
  r: number;
  /** flat things (rugs) may sit under other items */
  flat?: boolean;
}

export const CATALOG: ItemInfo[] = [
  { type: 'plant', name: 'กระถางต้นไม้', emoji: '🪴', r: 0.55 },
  { type: 'tallplant', name: 'ไม้ใบสูง', emoji: '🌿', r: 0.65 },
  { type: 'tree', name: 'ต้นไม้ใหญ่', emoji: '🌳', r: 1.0 },
  { type: 'lamp', name: 'โคมไฟตั้งพื้น', emoji: '💡', r: 0.5 },
  { type: 'lantern', name: 'โคมกระดาษ', emoji: '🏮', r: 0.5 },
  { type: 'rug', name: 'พรมกลม', emoji: '🟠', r: 1.9, flat: true },
  { type: 'rugsq', name: 'พรมเหลี่ยม', emoji: '🟫', r: 1.9, flat: true },
  { type: 'bench', name: 'ม้านั่ง', emoji: '🪑', r: 1.2 },
  { type: 'sofa', name: 'โซฟา', emoji: '🛋️', r: 1.5 },
  { type: 'shelf', name: 'ชั้นหนังสือ', emoji: '📚', r: 1.1 },
];
export const infoOf = (t: ItemType): ItemInfo => CATALOG.find((c) => c.type === t) ?? CATALOG[0];

export const snap = (v: number) => Math.round(v * 2) / 2;

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const inBox = (b: Box, x: number, z: number, pad: number) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

/** Where decoration may NOT go: the tables, the walking lanes, the door, and the stations at the front. */
function blockedBoxes(plan: WorldPlan): Box[] {
  const { plaza, anchors, lounge, photo, plate } = plan;
  const rr = restroomRect(plan);
  return [
    { x0: plaza.x0, x1: plaza.x1, z0: plaza.z0 - 2.5, z1: plaza.z1 + 0.5 }, // tables + the lane in front of the counters
    { x0: plate.x0, x1: plate.x1, z0: plate.z0, z1: plaza.z0 - 2.5 }, // kitchen + bar zone
    { x0: -2.8, x1: 2.8, z0: plaza.z1, z1: plate.z1 }, // the way in from the door
    { x0: lounge.x - 3.6, x1: lounge.x + 3.6, z0: lounge.z - 3.4, z1: lounge.z + 3.2 },
    { x0: photo.x - 3.6, x1: photo.x + 3.6, z0: photo.z - 3.4, z1: photo.z + 3.2 },
    { x0: anchors.office.x - 2.4, x1: anchors.office.x + 2.4, z0: anchors.office.z - 2.2, z1: anchors.office.z + 2.2 },
    { x0: rr.x0 - 2.4, x1: rr.x1, z0: rr.z0 - 0.4, z1: rr.z1 + 0.4 },
  ];
}

/** Can this thing stand here? Inside the room, clear of lanes and stations, and not on top of another item. */
export function canPlace(plan: WorldPlan, type: ItemType, x: number, z: number, items: PlacedItem[], ignoreId?: string): boolean {
  if (plan.theme !== 'interior') return false;
  const { plate } = plan;
  const info = infoOf(type);
  const m = 1.0 + (info.flat ? 0 : info.r * 0.4);
  if (x < plate.x0 + m || x > plate.x1 - m || z < plate.z0 + m || z > plate.z1 - m) return false;
  for (const b of blockedBoxes(plan)) if (inBox(b, x, z, info.flat ? 0 : info.r * 0.5)) return false;
  for (const it of items) {
    if (it.id === ignoreId) continue;
    const o = infoOf(it.type);
    if (info.flat && o.flat) {
      if (Math.hypot(it.x - x, it.z - z) < (info.r + o.r) * 0.9) return false;
    } else if (!info.flat && !o.flat) {
      if (Math.hypot(it.x - x, it.z - z) < (info.r + o.r) * 0.85) return false;
    }
  }
  return true;
}
