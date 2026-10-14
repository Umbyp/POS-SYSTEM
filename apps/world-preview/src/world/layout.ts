// Pure layout maths: how big the town is and where everything sits.
// x = right, z = toward the viewer, y = up. No three.js in here, so it is easy to tune.

export type Tier = 'S' | 'M' | 'L' | 'XL';
export const TIERS: Tier[] = ['S', 'M', 'L', 'XL'];

/** Tables beyond this are not drawn; the rest are summarised as "+N". */
export const MAX_TABLES = 80;

/** Real table count -> town size. */
export function tierFor(tableCount: number): Tier {
  if (tableCount <= 8) return 'S';
  if (tableCount <= 24) return 'M';
  if (tableCount <= 48) return 'L';
  return 'XL';
}

/** Buildings grow with the town. */
const BUILDING_SCALE: Record<Tier, number> = { S: 1, M: 1.15, L: 1.35, XL: 1.5 };

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface Pt {
  x: number;
  z: number;
}
export type TableKind = 'round' | 'long';
export interface Chair extends Pt {
  /** which way a person sitting here faces */
  rotY: number;
}
export interface TableSpot extends Pt {
  scale: number;
  kind: TableKind;
  /** chair positions relative to the table centre, already scaled */
  chairs: Chair[];
}

/** Round tables seat two (left and right); long group tables seat six (three a side). */
export function chairsFor(kind: TableKind, scale: number): Chair[] {
  if (kind === 'round')
    return [
      { x: -1.1 * scale, z: 0, rotY: Math.PI / 2 },
      { x: 1.1 * scale, z: 0, rotY: -Math.PI / 2 },
    ];
  const out: Chair[] = [];
  for (const side of [-1, 1])
    for (const col of [-1, 0, 1]) out.push({ x: col * 1.25 * scale, z: side * 1.1 * scale, rotY: side === -1 ? 0 : Math.PI });
  return out;
}
export interface StallSpot extends Pt {
  rotY: number;
  variant: number;
}
export type WingKind = 'market' | 'garden';
export interface Wing extends Rect {
  kind: WingKind;
}

export type Theme = 'interior' | 'town';

export interface Anchors {
  /** where the cooks stand */
  chefs: Pt;
  /** where the cashiers stand */
  cashiers: Pt;
  /** where the owner / admin stand (the host stand at the door, or the office porch) */
  office: Pt;
  /** where idle people end up when they are sent to rest */
  lounge: Pt;
  /** the pick-up window: finished plates appear here */
  window: { x: number; y: number; z: number };
  /** where a cashier stands to take a plate from the window */
  pickup: Pt;
  /** the service bell (coins pop here) */
  bell: { x: number; y: number; z: number };
  /** a take-away plate is handed over here */
  handover: Pt;
  /** where a take-away plate is set down */
  counterPlate: { x: number; y: number; z: number };
  /** an opening in a counter that staff walk through (indoors only) */
  gate: Pt | null;
}

export interface WorldPlan {
  theme: Theme;
  anchors: Anchors;
  tier: Tier;
  /** building scale for kitchen / counter / office */
  ks: number;
  plate: Rect;
  center: Pt;
  size: { w: number; d: number };
  plaza: Rect;
  core: Rect;
  tableSpots: TableSpot[];
  /** the table grid and the walkable aisles around it */
  grid: { cols: number; rows: number; zTop: number; zBot: number; xL: number; xR: number; aisles: number[] };
  hiddenTables: number;
  kitchen: Pt;
  counter: Pt;
  office: Pt;
  photo: Pt;
  lounge: Pt;
  wings: Wing[];
  stalls: StallSpot[];
  /** front lawn with fountain + ferris wheel (L, XL) */
  park: Rect | null;
  towers: (Pt & { s: number })[];
  /** thin cobbled roads */
  roads: Rect[];
  /** footprints scenery must keep clear of */
  occupied: Rect[];
  lamps: Pt[];
}

// table pitch: wide enough that guests at neighbouring tables are not shoulder to shoulder
const SX = 5.0;
const SZ = 4.4;

export function planWorld(tableCount: number, tierOverride?: Tier, kinds: TableKind[] = []): WorldPlan {
  const n = Math.min(tableCount, MAX_TABLES);
  const tier = tierOverride ?? tierFor(tableCount);
  const ks = BUILDING_SCALE[tier];

  // ---- plaza with the real tables ----
  const cols = n <= 8 ? 4 : n <= 24 ? 6 : n <= 48 ? 8 : 10;
  const rows = Math.max(1, Math.ceil(n / cols));
  const plazaW = Math.max(cols * SX + 3, 17);
  const plazaD = rows * SZ + 3;
  const plaza: Rect = { x0: -plazaW / 2, x1: plazaW / 2, z0: -plazaD / 2, z1: plazaD / 2 };
  const scale = n > 48 ? 0.85 : 1;
  const tableSpots: TableSpot[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i % cols;
    const kind = kinds[i] ?? 'round';
    tableSpots.push({ x: (c - (inRow - 1) / 2) * SX, z: (r - (rows - 1) / 2) * SZ, scale, kind, chairs: chairsFor(kind, scale) });
  }

  const firstRowZ = (0 - (rows - 1) / 2) * SZ;
  const lastRowZ = ((rows - 1) / 2) * SZ;
  const aisles = Array.from({ length: cols + 1 }, (_, c) => (c - 1 - (cols - 1) / 2) * SX + SX / 2);
  const grid = {
    cols,
    rows,
    zTop: firstRowZ - SZ / 2,
    zBot: lastRowZ + SZ / 2,
    xL: plaza.x0 - 2.4,
    xR: plaza.x1 + 2.4,
    aisles,
  };

  // ---- the three work buildings along the back of the plaza ----
  const backZ = plaza.z0 - 2.6 * ks - 2;
  const bx = Math.max(plazaW * 0.33, 6.8 * ks);
  const kitchen = { x: -bx, z: backZ };
  const counter = { x: 0, z: backZ };
  const office = { x: bx, z: backZ };
  const frontZ = plaza.z1 + 4.2;
  const cornerX = Math.max(plazaW / 2 - 1.5, 6);
  const photo = { x: -cornerX, z: frontZ };
  const lounge = { x: cornerX, z: frontZ };

  const coreW = Math.max(plazaW, 2 * bx + 7 * ks) + 4;
  const core: Rect = { x0: -coreW / 2, x1: coreW / 2, z0: backZ - 3.5 * ks - 1.5, z1: frontZ + 3.5 };

  // ---- wings (bigger towns only) ----
  const wingW = tier === 'S' ? 0 : tier === 'XL' ? 24 : 12;
  const parkD = tier === 'L' || tier === 'XL' ? 14 : 0;
  const towerD = tier === 'L' || tier === 'XL' ? 14 : 0;
  const wings: Wing[] = [];
  if (tier !== 'S') {
    const inner = 12;
    const z0 = core.z0 + 0.5;
    const z1 = core.z1 - 0.5;
    wings.push({ kind: 'market', x0: core.x0 - inner, x1: core.x0, z0, z1 });
    wings.push({ kind: 'garden', x0: core.x1, x1: core.x1 + inner, z0, z1 });
    if (tier === 'XL') {
      wings.push({ kind: 'market', x0: core.x0 - inner * 2, x1: core.x0 - inner, z0, z1 });
      wings.push({ kind: 'market', x0: core.x1 + inner, x1: core.x1 + inner * 2, z0, z1 });
    }
  }

  const plate: Rect = {
    x0: core.x0 - wingW - 2,
    x1: core.x1 + wingW + 2,
    z0: core.z0 - towerD - 2,
    z1: core.z1 + parkD + 2,
  };

  // ---- market stalls ----
  const stalls: StallSpot[] = [];
  let variant = 0;
  for (const w of wings.filter((w) => w.kind === 'market')) {
    const xc = (w.x0 + w.x1) / 2;
    for (let z = w.z0 + 3; z <= w.z1 - 2.5; z += 4.6) {
      stalls.push({ x: xc - 4.1, z, rotY: Math.PI / 2, variant: variant++ });
      stalls.push({ x: xc + 4.1, z: z + 0.6, rotY: -Math.PI / 2, variant: variant++ });
    }
  }

  // ---- park + towers ----
  const park: Rect | null = parkD ? { x0: plate.x0 + 2, x1: plate.x1 - 2, z0: core.z1 + 1, z1: plate.z1 - 2 } : null;
  const towerZ = core.z0 - towerD / 2 - 0.5;
  const towers: WorldPlan['towers'] = [];
  if (tier === 'L') towers.push({ x: 0, z: towerZ, s: 1.2 });
  if (tier === 'XL') {
    towers.push({ x: 0, z: towerZ, s: 1.5 });
    towers.push({ x: -17, z: towerZ, s: 1.1 });
    towers.push({ x: 17, z: towerZ, s: 1.1 });
  }

  // ---- roads ----
  const roads: Rect[] = [
    { x0: plaza.x0 - 0.4, x1: plaza.x1 + 0.4, z0: plaza.z0 - 0.4, z1: plaza.z1 + 0.4 },
    // stations down to the plaza
    ...[kitchen, counter, office].map((p) => ({ x0: p.x - 0.9, x1: p.x + 0.9, z0: p.z + 1.5, z1: plaza.z0 })),
  ];
  for (const w of wings) {
    const xc = (w.x0 + w.x1) / 2;
    roads.push({ x0: xc - 1.1, x1: xc + 1.1, z0: w.z0, z1: w.z1 });
  }
  if (tier !== 'S') {
    // cross road between core and wings, and in front of the core
    roads.push({ x0: plate.x0 + 2, x1: plate.x1 - 2, z0: core.z1 - 0.1, z1: core.z1 + 1.2 });
  }
  if (towerD) roads.push({ x0: plate.x0 + 2, x1: plate.x1 - 2, z0: core.z0 - 1.2, z1: core.z0 + 0.1 });

  // ---- keep-clear footprints for scenery ----
  const occupied: Rect[] = [
    ...roads,
    { x0: kitchen.x - 3.2 * ks, x1: kitchen.x + 3.2 * ks, z0: kitchen.z - 2.4 * ks, z1: kitchen.z + 3 * ks },
    { x0: counter.x - 3.4 * ks, x1: counter.x + 3.4 * ks, z0: counter.z - 1.8 * ks, z1: counter.z + 2.2 * ks },
    { x0: office.x - 2.6 * ks, x1: office.x + 2.6 * ks, z0: office.z - 1.8 * ks, z1: office.z + 3.2 * ks },
    { x0: photo.x - 3, x1: photo.x + 3, z0: photo.z - 3, z1: photo.z + 3 },
    { x0: lounge.x - 3.5, x1: lounge.x + 3.5, z0: lounge.z - 3, z1: lounge.z + 3 },
    ...wings.map((w) => ({ x0: w.x0 + 0.3, x1: w.x1 - 0.3, z0: w.z0, z1: w.z1 })),
    ...towers.map((t) => ({ x0: t.x - 4.2 * t.s, x1: t.x + 4.2 * t.s, z0: t.z - 4.2 * t.s, z1: t.z + 4.2 * t.s })),
  ];
  if (park) occupied.push({ x0: park.x0 + 6, x1: park.x1 - 6, z0: park.z0 + 2, z1: park.z1 - 2 });

  // ---- lamp posts at the plaza corners and along the roads ----
  const lamps: Pt[] = [
    { x: plaza.x0 - 1.2, z: plaza.z0 + 1 },
    { x: plaza.x1 + 1.2, z: plaza.z0 + 1 },
    { x: plaza.x0 - 1.2, z: plaza.z1 - 1 },
    { x: plaza.x1 + 1.2, z: plaza.z1 - 1 },
  ];
  for (const w of wings) {
    const xc = (w.x0 + w.x1) / 2;
    for (let z = w.z0 + 6; z < w.z1 - 3; z += 9) lamps.push({ x: xc, z });
  }

  const anchors: Anchors = {
    chefs: { x: kitchen.x - 0.2 * ks, z: kitchen.z + 3.3 * ks },
    cashiers: { x: counter.x, z: counter.z + 2.5 * ks },
    office: { x: office.x, z: office.z + 3.5 * ks },
    lounge: { x: lounge.x, z: lounge.z + 1.2 },
    window: { x: kitchen.x - 0.9 * ks, y: 1.1 * ks + 0.14, z: kitchen.z + 2.05 * ks },
    pickup: { x: kitchen.x - 0.9 * ks, z: kitchen.z + 3.1 * ks },
    bell: { x: counter.x + 0.9 * ks, y: 1.7 * ks, z: counter.z + 0.4 * ks },
    handover: { x: counter.x + 1.6 * ks, z: counter.z + 2.6 * ks },
    counterPlate: { x: counter.x + 1.6 * ks, y: 1.3 * ks + 0.14, z: counter.z + 0.5 * ks },
    gate: null,
  };

  return {
    theme: 'town',
    anchors,
    tier,
    ks,
    plate,
    center: { x: (plate.x0 + plate.x1) / 2, z: (plate.z0 + plate.z1) / 2 },
    size: { w: plate.x1 - plate.x0, d: plate.z1 - plate.z0 },
    plaza,
    core,
    tableSpots,
    grid,
    hiddenTables: Math.max(0, tableCount - MAX_TABLES),
    kitchen,
    counter,
    office,
    photo,
    lounge,
    wings,
    stalls,
    park,
    towers,
    roads,
    occupied,
    lamps,
  };
}

/** Small deterministic random generator so the town looks the same every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/**
 * The indoor, air-conditioned restaurant: one big room. The kitchen and the bar run along the back
 * wall behind a pass counter, the dining hall is in the middle, and the door, host stand, waiting
 * sofa and photo wall are at the front. Wall and furniture positions all come from the numbers here.
 */
export function planInterior(tableCount: number, tierOverride?: Tier, kinds: TableKind[] = []): WorldPlan {
  const base = planWorld(tableCount, tierOverride, kinds);
  const { plaza, tableSpots, grid } = base;
  const plazaW = plaza.x1 - plaza.x0;
  const roomW = plazaW + 10;
  const BACK = 13; // kitchen + bar zone behind the dining hall
  const FRONT = 10; // door, host stand, waiting area
  const room: Rect = { x0: -roomW / 2, x1: roomW / 2, z0: plaza.z0 - BACK, z1: plaza.z1 + FRONT };

  const passZ = plaza.z0 - 3.4; // the pass counter / bar counter line
  const kx = -roomW / 4;
  const bx = roomW / 4;
  const cornerX = Math.max(plazaW / 2 - 3.4, 7); // leaves room for the restroom in the front-right corner
  const anchors: Anchors = {
    chefs: { x: kx, z: passZ - 1.6 },
    cashiers: { x: bx, z: passZ - 1.6 },
    office: { x: 3.6, z: plaza.z1 + 3.6 },
    lounge: { x: -cornerX, z: plaza.z1 + 4.4 },
    window: { x: kx - 0.9, y: 1.35, z: passZ },
    pickup: { x: kx - 0.9, z: passZ + 1.2 },
    bell: { x: bx + 1.0, y: 1.7, z: passZ },
    handover: { x: bx - 1.2, z: passZ + 1.2 },
    counterPlate: { x: bx - 1.2, y: 1.45, z: passZ },
    gate: { x: 0, z: passZ },
  };

  return {
    ...base,
    theme: 'interior',
    anchors,
    ks: 1,
    plate: room,
    center: { x: 0, z: (room.z0 + room.z1) / 2 },
    size: { w: roomW, d: room.z1 - room.z0 },
    core: room,
    kitchen: { x: kx, z: passZ - 1.6 },
    counter: { x: bx, z: passZ - 1.6 },
    office: { x: 3.6, z: plaza.z1 + 3.6 },
    photo: { x: cornerX, z: plaza.z1 + 4.4 },
    lounge: { x: -cornerX, z: plaza.z1 + 4.4 },
    wings: [],
    stalls: [],
    park: null,
    towers: [],
    roads: [],
    occupied: [],
    lamps: [],
    grid: { ...grid, xL: plaza.x0 - 2.6, xR: plaza.x1 + 2.6 },
    tableSpots,
  };
}

export function planFor(theme: Theme, tableCount: number, tierOverride?: Tier, kinds: TableKind[] = []): WorldPlan {
  return theme === 'interior' ? planInterior(tableCount, tierOverride, kinds) : planWorld(tableCount, tierOverride, kinds);
}
