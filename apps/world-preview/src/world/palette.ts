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
