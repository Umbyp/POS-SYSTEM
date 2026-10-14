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

export type ItemType = 'plant' | 'tallplant' | 'tree' | 'lamp' | 'lantern' | 'rug' | 'rugsq' | 'bench' | 'sofa' | 'shelf';

export interface PlacedItem {
  id: string;
  type: ItemType;
  x: number;
  z: number;
  /** quarter turns */
  rot: number;
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
    items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.x === 'number' && typeof i.z === 'number') : [],
    people: r.people && typeof r.people === 'object' ? r.people : {},
  };
}
