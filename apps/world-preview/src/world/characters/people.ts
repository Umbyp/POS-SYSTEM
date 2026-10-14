import type { Role, Staff } from '../../types';
import type { Pt, WorldPlan } from '../layout';
import type { PersonCfg } from '../../config';

export type HairStyle = 'tuft' | 'bun' | 'pigtails' | 'bowl' | 'twinbuns' | 'long' | 'curly' | 'sidepony';
const STYLES: HairStyle[] = ['tuft', 'bun', 'pigtails', 'bowl', 'twinbuns', 'long', 'curly', 'sidepony'];
// soft clay colours
const SKIN = ['#FFE0C8', '#F8CDB0', '#EDB894'];
const HAIR = ['#4A3328', '#7A4E36', '#2E2E3E', '#C98A3E', '#8B4A4A', '#4A3F52'];
const BOWS = ['#F2A7A0', '#B9DDB0', '#FFD36B', '#FFE9D0', '#E8896B'];
const SHOES = ['#8B5E4A', '#5E8A5B', '#5A4638', '#C0566F'];

export interface Look {
  extra?: 'glasses' | 'flower';
  style: HairStyle;
  skin: string;
  hair: string;
  bow: string;
  shoe: string;
  /** 0.9 (short) .. 1.12 (tall) */
  height: number;
  /** 0.95 (slim) .. 1.1 (round) */
  girth: number;
}

/** Stable pseudo-random pick from a string, so the same person always looks the same. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function lookFor(s: Staff): Look {
  const h = hash(s.id + s.name);
  return {
    style: STYLES[h % STYLES.length],
    skin: SKIN[(h >>> 3) % SKIN.length],
    hair: HAIR[(h >>> 5) % HAIR.length],
    bow: BOWS[(h >>> 9) % BOWS.length],
    shoe: SHOES[(h >>> 12) % SHOES.length],
    height: 0.9 + ((h >>> 15) % 5) * 0.055,
    girth: 0.95 + ((h >>> 18) % 4) * 0.05,
  };
}

/** 0..2π, so people do not all breathe in step. */
export const phaseFor = (s: Staff) => (hash(s.id) % 628) / 100;

export type Pattern = 'plain' | 'stripes' | 'dots' | 'stars';
const PATTERNS: Pattern[] = ['plain', 'stripes', 'dots', 'stars', 'plain', 'stripes'];

export interface Outfit {
  /** shirt / jacket colour */
  top: string;
  /** apron, skirt, scarf, vest: the second colour */
  accent: string;
  pattern: Pattern;
}
type Colourway = Omit<Outfit, 'pattern'>;
/** Five colourways per role (the last ones are the special colours) so a team does not look like clones. */
const OUTFITS: Record<Role, Colourway[]> = {
  // one family of colours for the whole shop: terracotta, rose, butter, sage, teal, cocoa on cream
  KITCHEN: [
    { top: '#FFFFFF', accent: '#D25E3B' },
    { top: '#FFF6E5', accent: '#5FA39A' },
    { top: '#FFFFFF', accent: '#8DB67A' },
    { top: '#FFE9E3', accent: '#C9677A' },
    { top: '#FFF6E5', accent: '#E8A33A' },
  ],
  CASHIER: [
    { top: '#FFE3DC', accent: '#E58B7C' },
    { top: '#E6F2DC', accent: '#8DB67A' },
    { top: '#FFF0D6', accent: '#D25E3B' },
    { top: '#F6E1E4', accent: '#C06A78' },
    { top: '#FFF3C4', accent: '#E8A33A' },
  ],
  ADMIN: [
    { top: '#DCEFE9', accent: '#4F8F83' },
    { top: '#F6E1E4', accent: '#B65F6E' },
    { top: '#E4F0D6', accent: '#5E9C4A' },
    { top: '#FFE3D1', accent: '#8A5A3B' },
    { top: '#FFF0D6', accent: '#C98A3E' },
  ],
  GUEST: [
    { top: '#FFD6A5', accent: '#E8A33A' },
    { top: '#DDF0EA', accent: '#5FA39A' },
    { top: '#E6F2DC', accent: '#8DB67A' },
    { top: '#FAD9D2', accent: '#C9677A' },
    { top: '#F6E1E4', accent: '#B65F6E' },
  ],
  OWNER: [
    { top: '#FFE08A', accent: '#E8A33A' },
    { top: '#FFD6CF', accent: '#C9677A' },
    { top: '#FFE9B8', accent: '#C98A3E' },
    { top: '#E4F3EE', accent: '#5FA39A' },
    { top: '#F6E1E4', accent: '#B65F6E' },
  ],
};
export const outfitFor = (role: Role, s: Staff): Outfit => {
  const h = hash(s.id);
  return { ...OUTFITS[role][(h >>> 7) % 5], pattern: PATTERNS[(h >>> 10) % PATTERNS.length] };
};

/** The generated look and outfit, with the owner's own choices (if any) laid on top. */
export function dressed(s: Staff, cfg?: PersonCfg): { look: Look; outfit: Outfit; name: string } {
  const look = lookFor(s);
  const base = outfitFor(s.role, s);
  if (!cfg) return { look, outfit: base, name: s.name };
  return {
    look: {
      ...look,
      style: cfg.style ?? look.style,
      skin: cfg.skin ?? look.skin,
      hair: cfg.hair ?? look.hair,
      bow: cfg.bow ?? look.bow,
      extra: cfg.extra,
      height: cfg.height ?? look.height,
      girth: cfg.girth ?? look.girth,
    },
    outfit: { top: cfg.top ?? base.top, accent: cfg.accent ?? base.accent, pattern: cfg.pattern ?? base.pattern },
    name: cfg.nick?.trim() ? cfg.nick.trim() : s.name,
  };
}

/** Choices offered in the dressing room. */
export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: 'tuft', name: 'ผมจุก' },
  { id: 'bun', name: 'มวยผม' },
  { id: 'pigtails', name: 'ผมแกละ' },
  { id: 'bowl', name: 'ทรงกะลา' },
  { id: 'twinbuns', name: 'สองมวย' },
  { id: 'long', name: 'ผมยาว' },
  { id: 'curly', name: 'ผมหยิก' },
  { id: 'sidepony', name: 'ม้าข้าง' },
];
export const SKIN_CHOICES = ['#FFE0C8', '#F8CDB0', '#EDB894', '#D9A07A', '#B97C58'];
export const HAIR_CHOICES = ['#2E2E3E', '#4A3328', '#7A4E36', '#9A5B3C', '#C98A3E', '#E8C170', '#8B4A4A', '#D9B8C9', '#B5C9A5'];
export const TOP_CHOICES = ['#FFFFFF', '#FFF6E5', '#FFE3DC', '#FAD9D2', '#FFD6A5', '#FFE08A', '#E6F2DC', '#DCEFE9', '#F6E1E4', '#D25E3B', '#8DB67A', '#5FA39A'];
export const ACCENT_CHOICES = ['#D25E3B', '#E58B7C', '#C9677A', '#E8A33A', '#C98A3E', '#8A5A3B', '#8DB67A', '#5E9C4A', '#5FA39A', '#4F8F83'];
export const BOW_CHOICES = ['#F2A7A0', '#FFD36B', '#B9DDB0', '#FFE9D0', '#E8896B', '#D9B8C9', '#9ED3CC'];
export const PATTERN_CHOICES: { id: Pattern; name: string }[] = [
  { id: 'plain', name: 'เรียบ' },
  { id: 'stripes', name: 'ริ้ว' },
  { id: 'dots', name: 'จุด' },
  { id: 'stars', name: 'ดาว' },
];

export type Status = 'working' | 'waiting' | 'late' | 'idle';
/** Ring colour under the feet: green working, yellow waiting, red late/error, grey idle. */
export const RING: Record<Status, string> = {
  working: '#4ADE80',
  waiting: '#FBBF24',
  late: '#F87171',
  idle: '#B8B2A8',
};

export interface Placed {
  staff: Staff;
  x: number;
  z: number;
  rotY: number;
  status: Status;
}

export const MAX_PEOPLE = 24;

type Group = 'kitchen' | 'counter' | 'office' | 'lounge';
const CAP: Record<Group, number> = { kitchen: 8, counter: 8, office: 8, lounge: 12 };
const HOME: Record<Role, Group> = { KITCHEN: 'kitchen', CASHIER: 'counter', ADMIN: 'office', OWNER: 'office', GUEST: 'lounge' };

/** Each role has its own station; anyone who does not fit hangs out at the lounge. */
export function placeStaff(plan: WorldPlan, staff: Staff[]): { placed: Placed[]; hidden: number } {
  const { ks } = plan;
  const groups: Record<Group, Staff[]> = { kitchen: [], counter: [], office: [], lounge: [] };
  let hidden = Math.max(0, staff.length - MAX_PEOPLE);
  for (const s of staff.slice(0, MAX_PEOPLE)) {
    const g = HOME[s.role];
    if (groups[g].length < CAP[g]) groups[g].push(s);
    else if (groups.lounge.length < CAP.lounge) groups.lounge.push(s);
    else hidden += 1;
  }

  // indoors the cooks and cashiers stand behind a counter, so extra rows go further back, not forward
  const back = plan.theme === 'interior' ? -1 : 1;
  const A = plan.anchors;
  const layout: Record<Group, { base: Pt; gap: number; rowGap: number }> = {
    kitchen: { base: A.chefs, gap: 1.25 * ks, rowGap: back * 1.35 * ks },
    counter: { base: A.cashiers, gap: 1.25 * ks, rowGap: back * 1.35 * ks },
    office: { base: A.office, gap: 1.25 * ks, rowGap: 1.35 * ks },
    lounge: { base: A.lounge, gap: 1.3, rowGap: 1.3 },
  };

  const PER_ROW = 4;
  const placed: Placed[] = [];
  for (const g of Object.keys(groups) as Group[]) {
    const members = groups[g];
    const { base, gap, rowGap } = layout[g];
    members.forEach((s, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, members.length - row * PER_ROW);
      const c = i % PER_ROW;
      placed.push({ staff: s, x: base.x + (c - (inRow - 1) / 2) * gap, z: base.z + row * rowGap, rotY: 0, status: 'idle' });
    });
  }
  return { placed, hidden };
}
