import type { Pt, WorldPlan } from '../layout';

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** The walkable loop around the tables (top aisle, outer sides, bottom aisle). */
function loop(plan: WorldPlan): Pt[] {
  const { xL, xR, zTop, zBot } = plan.grid;
  return [
    { x: xL, z: zTop },
    { x: xR, z: zTop },
    { x: xR, z: zBot },
    { x: xL, z: zBot },
  ];
}

const loopLength = (pts: Pt[]) => pts.reduce((acc, p, i) => acc + dist(p, pts[(i + 1) % pts.length]), 0);

/** Nearest point on the loop to p, plus how far along the loop that point is. */
function project(pts: Pt[], p: Pt): { pt: Pt; s: number } {
  let best = { pt: pts[0], s: 0, d: Infinity };
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = dist(a, b);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)));
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const d = dist(p, q);
    if (d < best.d) best = { pt: q, s: acc + len * t, d };
    acc += len;
  }
  return best;
}

/** Walk from `from` to `to` by way of the loop around the plaza (used for strolls). */
export function loopRoute(plan: WorldPlan, from: Pt, to: Pt): Pt[] {
  const pts = loop(plan);
  const total = loopLength(pts);
  const a = project(pts, from);
  const b = project(pts, to);
  const fwd = (b.s - a.s + total) % total;
  const dir = fwd <= total - fwd ? 1 : -1;
  const steps = dir === 1 ? fwd : total - fwd;

  // corners we pass on the way, in travel order
  let acc = 0;
  const mids: { d: number; p: Pt }[] = [];
  pts.forEach((p, i) => {
    const d = dir === 1 ? (acc - a.s + total) % total : (a.s - acc + total) % total;
    if (d > 0.01 && d < steps - 0.01) mids.push({ d, p });
    acc += dist(p, pts[(i + 1) % pts.length]);
  });
  mids.sort((m, n) => m.d - n.d);
  return [a.pt, ...mids.map((m) => m.p), b.pt, to];
}

/**
 * Walk a plate to a table: out of the building front, along the top aisle, down the nearest
 * column aisle, and stop in the aisle just below the table.
 */
export function deliveryRoute(plan: WorldPlan, from: Pt, tableIndex: number): { path: Pt[]; stand: Pt } {
  const { zTop, aisles } = plan.grid;
  const spot = plan.tableSpots[tableIndex];
  const aisleX = aisles.reduce((best, x) => (Math.abs(x - spot.x) < Math.abs(best - spot.x) ? x : best), aisles[0]);
  const stand = { x: spot.x, z: spot.z + 1.7 };
  const path: Pt[] = [
    { x: from.x, z: zTop },
    { x: aisleX, z: zTop },
    { x: aisleX, z: stand.z },
    stand,
  ];
  return { path, stand };
}

/** Back from the aisle to the post, retracing the same aisles (and through the gate in a counter, if there is one). */
export function returnRoute(plan: WorldPlan, from: Pt, home: Pt): Pt[] {
  const { zTop, aisles } = plan.grid;
  const aisleX = aisles.reduce((best, x) => (Math.abs(x - from.x) < Math.abs(best - from.x) ? x : best), aisles[0]);
  const gate = plan.anchors.gate;
  const tail: Pt[] = gate
    ? [{ x: gate.x, z: zTop }, { x: gate.x, z: gate.z + 0.9 }, gate, { x: gate.x, z: gate.z - 1.2 }, home]
    : [{ x: home.x, z: zTop }, home];
  return [{ x: aisleX, z: from.z }, { x: aisleX, z: zTop }, ...tail];
}

/** The front door: guests walk in from here and leave through it. */
export function entrance(plan: WorldPlan): Pt {
  return { x: 0, z: plan.plaza.z1 + 4 };
}

/** World position of chair number `k` at a table. */
export function chairSpot(plan: WorldPlan, idx: number, k: number): Pt & { rotY: number } {
  const sp = plan.tableSpots[idx];
  const c = sp.chairs[k % sp.chairs.length];
  return { x: sp.x + c.x, z: sp.z + c.z, rotY: c.rotY };
}

/**
 * From the front door along the bottom aisle, up a column aisle, then along the aisle below the table's
 * row (or above it, for the far side of a long table), and finally onto the chair.
 */
export function seatRoute(plan: WorldPlan, idx: number, k: number): Pt[] {
  const { zBot, aisles } = plan.grid;
  const sp = plan.tableSpots[idx];
  const chair = chairSpot(plan, idx, k);
  const aisleX = aisles.reduce((best, x) => (Math.abs(x - chair.x) < Math.abs(best - chair.x) ? x : best), aisles[0]);
  const farSide = chair.z < sp.z - 0.5; // the chair on the table's back side
  const rowZ = farSide ? sp.z - 1.9 : sp.z + 1.9;
  const door = entrance(plan);
  return [
    { x: door.x, z: zBot },
    { x: aisleX, z: zBot },
    { x: aisleX, z: rowZ },
    { x: chair.x, z: rowZ },
    { x: chair.x, z: chair.z },
  ];
}

export function leaveRoute(plan: WorldPlan, idx: number, k: number): Pt[] {
  return seatRoute(plan, idx, k).reverse().slice(1).concat(entrance(plan));
}
