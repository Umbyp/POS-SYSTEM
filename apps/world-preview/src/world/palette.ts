// Warm cream / terracotta palette built on the app's primary (#D25E3B).
export const C = {
  grass: '#B9D68A',
  grassDark: '#9CC070',
  slab: '#E9D3B0',
  slabEdge: '#C9A67A',
  cobble: '#EBDCC0',
  cobbleDark: '#D8C3A0',
  wood: '#C58B5A',
  woodDark: '#9A6540',
  cream: '#FFF1DC',
  wall: '#FBE3C4',
  roof: '#D25E3B',
  roofDark: '#B24A2B',
  white: '#FFFFFF',
  stone: '#CFC7BB',
  leaf: '#7DB661',
  leafDark: '#5E9C4A',
  trunk: '#8A5A3B',
  pink: '#F7A8B8',
  yellow: '#FFD36B',
  lilac: '#D9B8C9',
  sky: '#B7DCD3',
  glow: '#FFC46B',
  metal: '#B8B2A8',
  gold: '#F2C14E',
  sofa: '#E7876A',
  rug: '#F4C9A8',
  tableTop: '#F3DDB8',
  chair: '#E0A06C',
  water: '#9ED3CC',
  waterDeep: '#7BBDB3',
  tan: '#E8B36B',
  cherry: '#D9553F',
  cocoa: '#6B3F2A',
  mint: '#B9DDB0',
  navy: '#7A4A3A',
  cream2: '#FFF6E5',
} as const;

export interface Mood {
  background: string;
  ambient: string;
  ambientIntensity: number;
  sun: string;
  sunIntensity: number;
  /** 0..1 — how strongly lanterns glow */
  glow: number;
}

export const DAY: Mood = {
  background: '#FFF1DC',
  ambient: '#FFF4E3',
  ambientIntensity: 1.15,
  sun: '#FFE2B8',
  sunIntensity: 1.5,
  glow: 0.35,
};

export const NIGHT: Mood = {
  background: '#4B3B5A',
  ambient: '#EAD5DA',
  ambientIntensity: 1.4,
  sun: '#F0DCD0',
  sunIntensity: 1.15,
  glow: 1,
};


// ---------------------------------------------------------------------------------------------
// Runtime "look" of the shop: preset + the owner's own paint. The scene reads these values while it
// renders (and is remounted when they change), so a whole new look is just a different set of numbers.
// ---------------------------------------------------------------------------------------------
export interface ShopLook {
  wall: string;
  wainscot: string;
  floorA: string;
  floorB: string;
  tileA: string;
  tileB: string;
  rug: string;
}
export type PresetId = 'cozy' | 'minimal' | 'walnut' | 'japan' | 'pastel';
export interface Preset {
  id: PresetId;
  name: string;
  emoji: string;
  look: ShopLook;
  /** overrides of the shared colour tokens */
  tokens: Partial<Record<keyof typeof C, string>>;
}

export const PRESETS: Preset[] = [
  {
    id: 'cozy',
    name: 'คาเฟ่อบอุ่น',
    emoji: '🧡',
    look: { wall: '#F7E6CF', wainscot: '#C28A5A', floorA: '#DDAA6E', floorB: '#D19B5E', tileA: '#F1EBDD', tileB: '#DCD3BF', rug: '#EAD3B0' },
    tokens: {},
  },
  {
    id: 'minimal',
    name: 'มินิมอล',
    emoji: '🤍',
    look: { wall: '#F4F1EC', wainscot: '#CFC7BB', floorA: '#E8DCC8', floorB: '#DDD0BA', tileA: '#F6F4F0', tileB: '#E6E2DA', rug: '#E8E2D8' },
    tokens: { woodDark: '#6E6259', wood: '#B8A58F', tableTop: '#FAF6EE', chair: '#9C8F80', sofa: '#B7B0A5', roof: '#8C8176', glow: '#FFE9C8', rug: '#E8E2D8', pink: '#E6D5D0', cherry: '#B8837A' },
  },
  {
    id: 'walnut',
    name: 'ไม้เข้ม',
    emoji: '🪵',
    look: { wall: '#E8CFAF', wainscot: '#8A5A3B', floorA: '#B87B45', floorB: '#A96D3B', tileA: '#E5D6BE', tileB: '#D2BF9F', rug: '#C98A5A' },
    tokens: { woodDark: '#5E3A24', wood: '#9A6540', tableTop: '#E6C79A', chair: '#7A4A2E', sofa: '#B5513A', roof: '#8E3F2A', rug: '#C98A5A' },
  },
  {
    id: 'japan',
    name: 'ญี่ปุ่นนุ่ม',
    emoji: '🍵',
    look: { wall: '#F3EBD8', wainscot: '#B89B6E', floorA: '#E3C791', floorB: '#D8BA80', tileA: '#EFEADB', tileB: '#E0D9C4', rug: '#B9C9A5' },
    tokens: { woodDark: '#7A5B3A', wood: '#C9A56E', tableTop: '#F1E2BE', chair: '#B89B6E', sofa: '#7FA187', roof: '#B6403A', glow: '#FFD9A0', rug: '#B9C9A5' },
  },
  {
    id: 'pastel',
    name: 'พาสเทลหวาน',
    emoji: '🍡',
    look: { wall: '#FCE8EC', wainscot: '#F2B5C0', floorA: '#F7D9B0', floorB: '#F2CFA0', tileA: '#FFF6EE', tileB: '#F7E3E8', rug: '#CFE8D8' },
    tokens: { woodDark: '#B98878', wood: '#E8B49A', tableTop: '#FFF1E0', chair: '#F2A7A0', sofa: '#F7A8B8', roof: '#F2A7A0', glow: '#FFD6A5', rug: '#CFE8D8', cherry: '#F28B82' },
  },
];

export const LOOK: ShopLook = { ...PRESETS[0].look };
const C_ORIGINAL = { ...C } as Record<string, string>;

export const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
};

export interface Paint {
  wall?: string;
  floor?: string;
  accent?: string;
}

/** Make the shared colours match a preset plus the owner's own paint. Returns a key that changes with the look. */
export function applyLook(presetId: string, paint: Paint): string {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  Object.assign(C as Record<string, string>, C_ORIGINAL, preset.tokens);
  Object.assign(LOOK, preset.look);
  if (paint.wall) {
    LOOK.wall = paint.wall;
    LOOK.wainscot = shade(paint.wall, -0.22);
  }
  if (paint.floor) {
    LOOK.floorA = paint.floor;
    LOOK.floorB = shade(paint.floor, -0.06);
  }
  if (paint.accent) {
    (C as Record<string, string>).roof = paint.accent;
    (C as Record<string, string>).sofa = shade(paint.accent, 0.12);
    LOOK.rug = shade(paint.accent, 0.55);
    (C as Record<string, string>).rug = LOOK.rug;
  }
  return `${preset.id}|${paint.wall ?? ''}|${paint.floor ?? ''}|${paint.accent ?? ''}`;
}
