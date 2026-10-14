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
  lilac: '#C7A6F0',
  sky: '#9ED8F0',
  glow: '#FFC46B',
  metal: '#B8B2A8',
  gold: '#F2C14E',
  sofa: '#E7876A',
  rug: '#F4C9A8',
  tableTop: '#F3DDB8',
  chair: '#E0A06C',
  water: '#8FD3F0',
  waterDeep: '#6CB9E0',
  tan: '#E8B36B',
  cherry: '#E23B4E',
  cocoa: '#6B3F2A',
  mint: '#9EE6C4',
  navy: '#3D5A99',
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
  background: '#3B3A6E',
  ambient: '#C3C1F0',
  ambientIntensity: 1.4,
  sun: '#CBD3FF',
  sunIntensity: 1.15,
  glow: 1,
};
