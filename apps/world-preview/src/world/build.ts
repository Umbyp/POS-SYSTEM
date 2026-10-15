import type { ItemType, PlacedItem } from '../config';
import type { WorldPlan } from './layout';
import { restroomRect, wallBlocks } from './scene/Interior';

export type Category = 'plants' | 'furniture' | 'light' | 'cute' | 'rug' | 'wall';
export const CATEGORIES: { id: Category; name: string; emoji: string }[] = [
  { id: 'plants', name: 'ต้นไม้', emoji: '🪴' },
  { id: 'furniture', name: 'เฟอร์นิเจอร์', emoji: '🛋️' },
  { id: 'light', name: 'ไฟ', emoji: '💡' },
  { id: 'cute', name: 'ของน่ารัก', emoji: '🧸' },
  { id: 'rug', name: 'พรม', emoji: '🟫' },
  { id: 'wall', name: 'ติดผนัง', emoji: '🖼️' },
];

export interface ItemInfo {
  type: ItemType;
  name: string;
  emoji: string;
  cat: Category;
  /** footprint radius (for wall pieces: half the width), used to keep things from overlapping */
  r: number;
  /** flat things (rugs) may sit under other items */
  flat?: boolean;
}

const I = (type: ItemType, name: string, emoji: string, cat: Category, r: number, flat?: boolean): ItemInfo => ({ type, name, emoji, cat, r, flat });
export const CATALOG: ItemInfo[] = [
  I('plant', 'กระถางต้นไม้', '🪴', 'plants', 0.55),
  I('tallplant', 'ไม้ใบสูง', '🌿', 'plants', 0.65),
  I('tree', 'ต้นไม้ใหญ่', '🌳', 'plants', 1.0),
  I('cactus', 'กระบองเพชร', '🌵', 'plants', 0.5),
  I('flowerbox', 'กระบะดอกไม้', '🌷', 'plants', 1.0),
  I('bonsai', 'บอนไซ', '🎍', 'plants', 0.55),
  I('bamboo', 'กระถางไผ่', '🎋', 'plants', 0.5),
  I('bench', 'ม้านั่งยาว', '🪑', 'furniture', 1.2),
  I('sofa', 'โซฟา', '🛋️', 'furniture', 1.5),
  I('armchair', 'เก้าอี้นวม', '💺', 'furniture', 0.8),
  I('stool', 'สตูล', '⚪', 'furniture', 0.45),
  I('sidetable', 'โต๊ะข้าง', '☕', 'furniture', 0.55),
  I('shelf', 'ชั้นหนังสือ', '📚', 'furniture', 1.1),
  I('cakecase', 'ตู้โชว์ขนม', '🍰', 'furniture', 1.0),
  I('screen', 'ฉากกั้นห้อง', '🏯', 'furniture', 1.3),
  I('lamp', 'โคมไฟตั้งพื้น', '💡', 'light', 0.5),
  I('lantern', 'โคมกระดาษ', '🏮', 'light', 0.5),
  I('fairytree', 'ต้นไม้ไฟกระพริบ', '✨', 'light', 0.7),
  I('candles', 'เทียนหอม', '🕯️', 'light', 0.7),
  I('lamppost', 'เสาไฟสวน', '🏮', 'light', 0.35),
  I('teddy', 'ตุ๊กตาหมี', '🧸', 'cute', 0.6),
  I('balloons', 'ช่อลูกโป่ง', '🎈', 'cute', 0.5),
  I('giftpile', 'กองของขวัญ', '🎁', 'cute', 1.0),
  I('cakestand', 'ที่วางเค้ก', '🎂', 'cute', 0.6),
  I('coffeecart', 'รถเข็นกาแฟ', '☕', 'cute', 0.9),
  I('easel', 'ขาตั้งภาพ', '🎨', 'cute', 0.8),
  I('flowerarch', 'ซุ้มดอกไม้', '💐', 'cute', 1.3),
  I('fountain', 'น้ำพุเล็ก', '⛲', 'cute', 1.3),
  I('rug', 'พรมกลม', '🟠', 'rug', 1.9, true),
  I('rugsq', 'พรมเหลี่ยม', '🟫', 'rug', 1.9, true),
  I('runner', 'พรมทางเดิน', '🟥', 'rug', 2.0, true),
  I('poster', 'โปสเตอร์', '🖼️', 'wall', 0.7),
  I('frame', 'กรอบภาพทิวทัศน์', '🏞️', 'wall', 1.0),
  I('mirror', 'กระจกกลม', '🪞', 'wall', 0.7),
  I('clock', 'นาฬิกาแขวน', '🕰️', 'wall', 0.6),
  I('neon', 'ป้ายไฟนีออน', '🌟', 'wall', 1.0),
  I('wallshelf', 'ชั้นลอยผนัง', '🌱', 'wall', 0.9),
  I('banner', 'ธงราว', '🎏', 'wall', 1.3),
  I('garland', 'พวงดอกไม้', '🌸', 'wall', 1.3),
  I('wreath', 'พวงหรีดต้อนรับ', '🌼', 'wall', 0.7),
];
export const isWall = (t: ItemType) => infoOf(t).cat === 'wall';
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
  if (info.cat === 'wall') {
    // wall pieces must sit on a side wall, clear of windows, the menu board and the restroom
    const side = x < (plate.x0 + plate.x1) / 2 ? 'L' : 'R';
    if (z < plan.plaza.z0 - 0.5 || z > plate.z1 - 2.5) return false;
    if (wallBlocks(plan, side).some((b) => Math.abs(z - b.z) < b.half + info.r)) return false;
    return !items.some((it) => it.id !== ignoreId && infoOf(it.type).cat === 'wall' && Math.abs(it.x - x) < 1 && Math.abs(it.z - z) < info.r + infoOf(it.type).r);
  }
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

/** Where a wall piece goes when the pointer is at (x, z): glued to the nearer side wall, facing into the room,
 *  and nudged along the wall to the closest free spot (clear of windows, the menu board and other wall pieces). */
export function wallSnap(plan: WorldPlan, type: ItemType, x: number, z: number, items: PlacedItem[], ignoreId?: string): { x: number; z: number; rot: number } {
  const { plate } = plan;
  const left = x < (plate.x0 + plate.x1) / 2;
  const wx = left ? plate.x0 + 0.02 : plate.x1 - 0.02;
  const rot = left ? 1 : 3;
  for (let k = 0; k <= 24; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const zz = z + sign * k * 0.5;
      if (canPlace(plan, type, wx, zz, items, ignoreId)) return { x: wx, z: zz, rot };
    }
  }
  return { x: wx, z, rot };
}
