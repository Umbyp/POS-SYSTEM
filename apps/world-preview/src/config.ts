import type { HairStyle, Pattern } from './world/characters/people';
import type { PresetId } from './world/palette';

/** Per-person customisation (all fields optional: anything missing falls back to the generated look). */
export interface PersonCfg {
  nick?: string;
  style?: HairStyle;
  skin?: string;
  hair?: string;
  top?: string;
  accent?: string;
  pattern?: Pattern;
  bow?: string;
  extra?: 'glasses' | 'flower';
  height?: number;
  girth?: number;
}

export const ITEM_TYPES = [
  'plant', 'tallplant', 'tree', 'cactus', 'flowerbox', 'bonsai', 'bamboo',
  'bench', 'sofa', 'armchair', 'stool', 'sidetable', 'shelf', 'cakecase', 'screen',
  'lamp', 'lantern', 'fairytree', 'candles', 'lamppost',
  'teddy', 'balloons', 'giftpile', 'cakestand', 'coffeecart', 'easel', 'flowerarch', 'fountain',
  'rug', 'rugsq', 'runner',
  'poster', 'frame', 'mirror', 'clock', 'neon', 'wallshelf', 'banner', 'garland', 'wreath',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface PlacedItem {
  id: string;
  type: ItemType;
  x: number;
  z: number;
  /** quarter turns */
  rot: number;
  /** the owner's own colour for this piece (hex) */
  color?: string;
}

export interface WorldConfig {
  v: 1;
  preset: PresetId;
  paint: { wall?: string; floor?: string; accent?: string };
  items: PlacedItem[];
  people: Record<string, PersonCfg>;
}

export const DEFAULT_CONFIG: WorldConfig = { v: 1, preset: 'cozy', paint: {}, items: [], people: {} };

export const MAX_ITEMS = 80;

/** Tidy anything that came back from the server so the scene never has to guess. */
export function normaliseConfig(raw: unknown): WorldConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorldConfig>;
  return {
    v: 1,
    preset: (r.preset as PresetId) || 'cozy',
    paint: r.paint ?? {},
    items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.x === 'number' && typeof i.z === 'number' && (ITEM_TYPES as readonly string[]).includes(i.type)) : [],
    people: r.people && typeof r.people === 'object' ? r.people : {},
  };
}
