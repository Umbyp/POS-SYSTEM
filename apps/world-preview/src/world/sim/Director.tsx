import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { RestaurantTable, Staff } from '../../types';
import type { Pt, WorldPlan } from '../layout';
import { Character } from '../characters/Character';
import { dressed, phaseFor, placeStaff, type Placed, type Status } from '../characters/people';
import { registry, type Agent } from './agent';
import type { PickFn } from '../../selection';
import type { PersonCfg } from '../../config';
import { AlertMark, Burst, PlateView, Ticket, type BurstEntity, type BurstKind, type PlateEntity, type TicketEntity } from './effects';
import { isActive, isLate, sortTables, type OrderView } from './orders';
import { chairSpot, deliveryRoute, entrance, leaveRoute, loopRoute, returnRoute, seatRoute } from './paths';
import { playSound } from './sound';

export interface FeedItem {
  id: number;
  text: string;
  tone: 'new' | 'cook' | 'ready' | 'paid' | 'late' | 'cancel';
}

const SPEED = 2.8;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeAgent(p: Placed, cfg?: PersonCfg): Agent {
  const d = dressed(p.staff, cfg);
  return {
    staff: d.name === p.staff.name ? p.staff : { ...p.staff, name: d.name },
    look: d.look,
    outfit: d.outfit,
    phase: phaseFor(p.staff),
    home: { x: p.x, z: p.z },
    x: p.x,
    z: p.z,
    rotY: 0,
    sitY: 0,
    status: 'idle',
    pose: 'idle',
    bubble: null,
    mode: 'home',
    path: [],
    onArrive: null,
    timer: 0,
    temp: null,
    nextIdle: rand(4, 14),
    carrying: null,
    seat: null,
    gone: false,
  };
}

const GUEST_CAP = 36;
/** Which chairs get filled first: opposite each other, so a table looks naturally shared. */
const seatOrder = (sp: { chairs: unknown[]; kind: string }, h: number): number[] =>
  sp.kind === 'long' ? [1, 4, 0, 3, 2, 5] : h % 2 ? [1, 0] : [0, 1];
const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface PlateRec {
  ent: PlateEntity;
  order: OrderView;
  state: 'window' | 'carried' | 'table' | 'counter';
  tableIdx: number;
  carrier: Agent | null;
  claimed: boolean;
  /** sim time when it reached its table */
  since: number;
}

/**
 * Turns the stream of real (or demo) orders into behaviour: chefs cook, a cashier carries each ready
 * plate to its table, everyone cheers when an order is paid, warnings show when something is late,
 * and anyone with nothing to do wanders off, chats or naps. Rendering stays in Character.
 */
export function Director({
  plan,
  staff,
  tables,
  orders,
  showNames,
  onFeed,
  onPick,
  selectedId,
  people,
}: {
  plan: WorldPlan;
  staff: Staff[];
  tables: RestaurantTable[];
  orders: OrderView[] | null;
  showNames: boolean;
  onFeed: (f: Omit<FeedItem, 'id'>) => void;
  onPick: PickFn;
  selectedId: string | null;
  people: Record<string, PersonCfg>;
}) {
  const placed = useMemo(() => placeStaff(plan, staff).placed, [plan, staff]);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const agents = useMemo(() => placed.map((p) => makeAgent(p, peopleRef.current[p.staff.id])), [placed]);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // the dressing room changed someone: update that person in place (position and behaviour stay)
  useEffect(() => {
    for (const a of agentsRef.current) {
      const d = dressed(a.staff, people[a.staff.id]);
      a.look = d.look;
      a.outfit = d.outfit;
      if (d.name !== a.staff.name) a.staff = { ...a.staff, name: d.name };
    }
  }, [people]);

  const tableIdx = useMemo(() => {
    const m = new Map<string, number>();
    sortTables(tables).forEach((t, i) => m.set(t.number, i));
    return m;
  }, [tables]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const tableIdxRef = useRef(tableIdx);
  tableIdxRef.current = tableIdx;
  const feedRef = useRef(onFeed);
  feedRef.current = onFeed;

  const [plates, setPlates] = useState<PlateEntity[]>([]);
  const [bursts, setBursts] = useState<BurstEntity[]>([]);
  const [tickets, setTickets] = useState<TicketEntity[]>([]);
  const [lateAt, setLateAt] = useState<number[]>([]);
  const [guests, setGuests] = useState<Agent[]>([]);
  const guestsRef = useRef<Agent[]>([]);
  guestsRef.current = guests;
  const sortedTables = useMemo(() => sortTables(tables), [tables]);
  const sortedRef = useRef(sortedTables);
  sortedRef.current = sortedTables;

  const sim = useRef({
    now: 0,
    ready: false,
    prev: new Map<string, OrderView>(),
    plates: new Map<string, PlateRec>(),
    counts: { PENDING: 0, PREPARING: 0, READY: 0 },
    recentNew: -99,
    lateKitchen: false,
    lateReady: false,
    lateKey: '',
    lateClock: 0,
    burstId: 0,
    lateSet: new Set<number>(),
    guestSeq: 0,
    guestInit: false,
    guestPlan: null as WorldPlan | null,
    guestsByTable: new Map<number, Agent[]>(),
  });

  const addBurst = useCallback((kind: BurstKind, x: number, y: number, z: number) => {
    setBursts((b) => [...b, { id: ++sim.current.burstId, kind, x, y, z }]);
  }, []);
  const landTicket = useCallback((t: TicketEntity) => {
    setTickets((l) => l.filter((x) => x.id !== t.id));
    setBursts((b) => [...b, { id: ++sim.current.burstId, kind: 'sparkle', x: t.to.x, y: t.to.y, z: t.to.z }]);
  }, []);
  const removeBurst = useCallback((id: number) => setBursts((b) => b.filter((x) => x.id !== id)), []);
  const syncPlates = () => setPlates([...sim.current.plates.values()].map((r) => r.ent));

  // ---- where things are, in world coordinates ----
  const spots = () => {
    const A = planRef.current.anchors;
    return { window: A.window, pickup: A.pickup, bell: A.bell, handover: A.handover, counterPlate: A.counterPlate, gate: A.gate };
  };
  const tableTop = (idx: number) => {
    const sp = planRef.current.tableSpots[idx];
    return { x: sp.x, y: 0.14 + 0.95 * sp.scale + 0.04, z: sp.z };
  };

  // ---- small helpers for agent behaviour ----
  const walk = (a: Agent, path: Pt[], then: (() => void) | null) => {
    a.mode = 'walk';
    a.path = path.slice();
    a.onArrive = then;
  };
  const doFor = (a: Agent, pose: Agent['pose'], bubble: Agent['bubble'], status: Status, seconds: number, then: (() => void) | null) => {
    a.mode = 'do';
    a.pose = pose;
    a.bubble = bubble;
    a.status = status;
    a.timer = seconds;
    a.onArrive = then;
  };
  const goHome = (a: Agent) => {
    a.carrying = null;
    // indoors the counters have a gate: staff on the dining side walk back through it
    const gate = planRef.current.anchors.gate;
    const back = gate && (a.staff.role === 'CASHIER' || a.staff.role === 'KITCHEN') && a.z > gate.z + 0.3;
    const via: Pt[] = back && gate ? [{ x: gate.x, z: gate.z + 0.9 }, gate, { x: gate.x, z: gate.z - 1.2 }] : [];
    walk(a, [...via, { x: a.home.x, z: a.home.z }], () => {
      a.mode = 'home';
      a.rotY = 0;
    });
  };
  const react = (a: Agent | undefined, pose: Agent['pose'], bubble: Agent['bubble'], status: Status, seconds: number) => {
    if (a && a.mode === 'home') a.temp = { pose, bubble, status, until: sim.current.now + seconds };
  };
  const byRole = (role: Staff['role'][]) => agentsRef.current.filter((a) => role.includes(a.staff.role));
  const feed = (text: string, tone: FeedItem['tone']) => feedRef.current({ text, tone });
  const label = (o: OrderView) => `#${o.number}${o.tableNumber ? ` · โต๊ะ ${o.tableNumber}` : ''}`;

  // ---- order events ----
  const makePlate = (o: OrderView, state: PlateRec['state'], at: { x: number; y: number; z: number }, idx: number, pop: boolean) => {
    const s = sim.current;
    let dish = 0;
    for (let i = 0; i < o.id.length; i++) dish = (dish + o.id.charCodeAt(i)) % 6;
    const ent: PlateEntity = { id: o.id, x: at.x, y: at.y, z: at.z, scale: pop ? 0 : 1, dying: false, dish };
    s.plates.set(o.id, { ent, order: o, state, tableIdx: idx, carrier: null, claimed: state !== 'window', since: s.now });
    syncPlates();
  };
  const dropPlate = (id: string, withPoof: boolean) => {
    const rec = sim.current.plates.get(id);
    if (!rec) return;
    rec.ent.dying = true;
    if (withPoof) addBurst('poof', rec.ent.x, rec.ent.y + 0.2, rec.ent.z);
    const c = rec.carrier;
    if (c) goHome(c);
  };

  const process = (list: OrderView[]) => {
    const s = sim.current;
    const first = !s.ready;
    const sp = spots();
    const cur = new Map(list.map((o) => [o.id, o]));

    for (const o of list) {
      const p = s.prev.get(o.id);
      if (first) {
        if (o.status === 'READY') {
          const idx = o.tableNumber ? (tableIdxRef.current.get(o.tableNumber) ?? -1) : -1;
          if (idx >= 0) makePlate(o, 'table', tableTop(idx), idx, false);
          else makePlate(o, 'window', sp.window, -1, false);
        }
        continue;
      }
      if (!p) {
        if (isActive(o.status)) {
          s.recentNew = s.now;
          feed(`ออเดอร์ใหม่ ${label(o)}`, 'new');
          playSound('new');
          const ti = o.tableNumber ? (tableIdxRef.current.get(o.tableNumber) ?? -1) : -1;
          const from = ti >= 0 && planRef.current.tableSpots[ti] ? planRef.current.tableSpots[ti] : sp.bell;
          setTickets((l) => [...l.slice(-5), { id: ++sim.current.burstId, from: { x: from.x, z: from.z }, to: { x: sp.window.x, y: sp.window.y + 0.6, z: sp.window.z } }]);
        }
        continue;
      }
      if (p.status === o.status) continue;
      if (o.status === 'PREPARING') {
        feed(`เริ่มทำ ${label(o)}`, 'cook');
        playSound('cook');
      }
      else if (o.status === 'READY') {
        feed(`พร้อมเสิร์ฟ ${label(o)}`, 'ready');
        playSound('ready');
        const idx = o.tableNumber ? (tableIdxRef.current.get(o.tableNumber) ?? -1) : -1;
        makePlate(o, 'window', sp.window, idx, true);
        addBurst('sparkle', sp.window.x, sp.window.y + 0.4, sp.window.z);
        react(byRole(['KITCHEN'])[0], 'cheer', 'ready', 'working', 2.2);
      } else if (o.status === 'COMPLETED') paid(o);
      else if (o.status === 'CANCELLED' || o.status === 'REFUNDED') cancelled(o);
    }
    // orders that fell out of the list while still active
    if (!first) {
      for (const [id, p] of s.prev) {
        if (cur.has(id) || !isActive(p.status)) continue;
        if (p.status === 'READY') paid(p);
        else cancelled(p);
      }
    }
    s.prev = cur;
    s.ready = true;
    s.counts = { PENDING: 0, PREPARING: 0, READY: 0 };
    for (const o of list) if (isActive(o.status)) s.counts[o.status as 'PENDING' | 'PREPARING' | 'READY'] += 1;
  };

  const paid = (o: OrderView) => {
    const sp = spots();
    feed(`จ่ายเงินแล้ว ${label(o)}`, 'paid');
    addBurst('coin', sp.bell.x, sp.bell.y, sp.bell.z);
    playSound('paid');
    const idx = o.tableNumber ? (tableIdxRef.current.get(o.tableNumber) ?? -1) : -1;
    sim.current.guestsByTable.get(idx)?.forEach((g) => react(g, 'wave', 'happy', 'idle', 2));
    // now and then the cooks celebrate a sale with a little dance
    if (Math.random() < 0.4) react(byRole(['KITCHEN']).find((c) => c.mode === 'home' && c.status === 'idle'), 'dance', 'music', 'idle', 3.5);
    byRole(['CASHIER']).forEach((a, i) => react(a, 'cheer', 'paid', 'working', i === 0 ? 2.4 : 1.6));
    dropPlate(o.id, true);
  };
  const cancelled = (o: OrderView) => {
    const sp = spots();
    feed(`ยกเลิก ${label(o)}`, 'cancel');
    playSound('cancel');
    addBurst('poof', sp.window.x, sp.window.y, sp.window.z);
    react(byRole(['KITCHEN'])[0], 'idle', 'cancel', 'idle', 2);
    dropPlate(o.id, false);
  };

  // dev-only peek at the running simulation (browser console: __worldSim())
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __worldSim: () => unknown }).__worldSim = () => ({
      now: Math.round(sim.current.now),
      counts: sim.current.counts,
      plates: [...sim.current.plates.values()].map((r) => ({ id: r.order.number, state: r.state, claimed: r.claimed, table: r.tableIdx, x: +r.ent.x.toFixed(1), y: +r.ent.y.toFixed(1), z: +r.ent.z.toFixed(1), scale: +r.ent.scale.toFixed(2) })),
      guests: guestsRef.current.length,
      agents: agentsRef.current.map((a) => ({ n: a.staff.name, role: a.staff.role, mode: a.mode, pose: a.pose, status: a.status, bubble: a.bubble, x: +a.x.toFixed(1), z: +a.z.toFixed(1) })),
    });
  }, []);

  useEffect(() => {
    if (orders) process(orders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // ---- delivering a ready plate ----
  const startDelivery = (a: Agent, rec: PlateRec) => {
    const p = planRef.current;
    const sp = spots();
    rec.claimed = true;
    a.carrying = rec.order.id;
    walk(a, sp.gate ? [{ x: sp.gate.x, z: sp.gate.z - 1.2 }, sp.gate, { x: sp.gate.x, z: sp.gate.z + 0.9 }, sp.pickup] : [sp.pickup], () => {
      if (rec.ent.dying) return goHome(a);
      rec.state = 'carried';
      rec.carrier = a;
      if (rec.tableIdx >= 0) {
        const { path, stand } = deliveryRoute(p, sp.pickup, rec.tableIdx);
        walk(a, path, () => {
          a.rotY = Math.PI;
          doFor(a, 'serve', 'serve', 'working', 1.1, () => {
            rec.state = 'table';
            rec.since = sim.current.now;
            rec.carrier = null;
            playSound('serve');
            Object.assign(rec.ent, tableTop(rec.tableIdx));
            walk(a, returnRoute(p, stand, a.home), () => {
              a.mode = 'home';
              a.carrying = null;
              a.rotY = 0;
            });
          });
        });
      } else {
        walk(a, [sp.handover], () => {
          doFor(a, 'serve', 'serve', 'working', 1.0, () => {
            rec.state = 'counter';
            rec.carrier = null;
            Object.assign(rec.ent, sp.counterPlate);
            goHome(a);
          });
        });
      }
    });
  };

  // ---- what to do when standing at home ----
  const startIdle = (a: Agent) => {
    const p = planRef.current;
    const s = sim.current;
    a.nextIdle = s.now + rand(12, 26);
    const role = a.staff.role;
    if (role === 'KITCHEN' || role === 'CASHIER') {
      const r = Math.random();
      if (r < 0.3) react(a, 'idle', 'chat', 'idle', 4);
      else if (r < 0.5) react(a, 'stretch', 'relax', 'idle', 3.5);
      else if (r < 0.7) react(a, 'wave', 'hi', 'idle', 2.6);
      else if (r < 0.9) react(a, 'think', 'think', 'idle', 3.2);
      else react(a, 'dance', 'music', 'idle', 4);
      return;
    }
    // bosses wander to the lounge for a nap or the photo corner for a picture
    const spot = Math.random() < 0.5 ? p.lounge : p.photo;
    const isLounge = spot === p.lounge;
    const there = { x: spot.x + (isLounge ? 0 : 0), z: spot.z + (isLounge ? 1.6 : 1.4) };
    walk(a, loopRoute(p, a.home, there), () => {
      doFor(a, isLounge ? 'nap' : 'pose', isLounge ? 'nap' : 'photo', 'idle', rand(6, 10), () => {
        walk(a, loopRoute(p, there, a.home), () => {
          a.mode = 'home';
          a.rotY = 0;
        });
      });
    });
  };

  const homeBehaviour = (a: Agent) => {
    const s = sim.current;
    if (a.temp && s.now < a.temp.until) {
      a.pose = a.temp.pose;
      a.bubble = a.temp.bubble;
      a.status = a.temp.status;
      return;
    }
    a.temp = null;
    const role = a.staff.role;
    let pose: Agent['pose'] = 'idle';
    let bubble: Agent['bubble'] = null;
    let status: Status = 'idle';

    if (role === 'KITCHEN') {
      const chefs = byRole(['KITCHEN']);
      const i = chefs.indexOf(a);
      const { PENDING, PREPARING } = s.counts;
      if (i < PREPARING) {
        pose = 'stir';
        bubble = 'cook';
        status = 'working';
      } else if (i - PREPARING < PENDING) {
        bubble = 'wait';
        status = 'waiting';
      }
      if (i === 0 && s.lateKitchen) {
        bubble = 'late';
        status = 'late';
      }
    } else if (role === 'CASHIER') {
      const cashiers = byRole(['CASHIER']);
      const i = cashiers.indexOf(a);
      if (i === 0 && s.now - s.recentNew < 7) {
        pose = 'type';
        bubble = 'type';
        status = 'working';
      }
      if (i === 0 && s.lateReady) {
        bubble = 'late';
        status = 'late';
      }
      // pick up the next ready plate that nobody has claimed
      for (const rec of s.plates.values()) {
        if (rec.state === 'window' && !rec.claimed && !rec.ent.dying) {
          startDelivery(a, rec);
          return;
        }
      }
    }
    a.pose = pose;
    a.bubble = bubble;
    a.status = status;
    if (status === 'idle' && !bubble && s.now > a.nextIdle) startIdle(a);
  };


  // ---- customers: they come in, sit at their table, eat when the plate arrives, and leave ----
  const sitDown = (a: Agent) => {
    const seat = a.seat;
    if (!seat) return;
    const sp = planRef.current.tableSpots[seat.table];
    a.x = a.home.x;
    a.z = a.home.z;
    a.rotY = chairSpot(planRef.current, seat.table, seat.chair).rotY;
    a.sitY = 0.68 * (sp?.scale ?? 1);
    a.pose = 'sit';
    a.mode = 'home';
    a.nextIdle = sim.current.now + rand(8, 20);
  };
  const spawnGuest = (idx: number, chairNo: number, k: number, instant: boolean) => {
    const p = planRef.current;
    const tbl = sortedRef.current[idx];
    const staff: Staff = { id: `guest-${tbl?.id ?? idx}-${k}-${++sim.current.guestSeq}`, name: '', role: 'GUEST' };
    const a = makeAgent({ staff, x: 0, z: 0, rotY: 0, status: 'idle' });
    const chair = chairSpot(p, idx, chairNo);
    a.seat = { table: idx, chair: chairNo };
    a.home = chair;
    if (instant) {
      a.x = chair.x;
      a.z = chair.z;
      sitDown(a);
    } else {
      const door = entrance(p);
      a.x = door.x;
      a.z = door.z;
      walk(a, seatRoute(p, idx, chairNo), () => sitDown(a));
    }
    return a;
  };
  const leaveGuest = (a: Agent) => {
    const seat = a.seat;
    if (!seat) return;
    a.sitY = 0;
    a.temp = null;
    a.bubble = null;
    walk(a, leaveRoute(planRef.current, seat.table, seat.chair), () => {
      a.gone = true;
      setGuests((g) => g.filter((x) => x !== a));
    });
  };
  const syncGuests = () => {
    const s = sim.current;
    const p = planRef.current;
    if (s.guestPlan !== p) {
      // the layout changed: start over with everyone already seated
      s.guestsByTable.clear();
      setGuests([]);
    }
    const first = !s.guestInit || s.guestPlan !== p;
    s.guestInit = true;
    s.guestPlan = p;

    const occupied: number[] = [];
    sortedRef.current.forEach((t, i) => {
      if (i < p.tableSpots.length && (t.status === 'OCCUPIED' || t.status === 'BILLING')) occupied.push(i);
    });
    // one guest per busy table first, then more where the budget allows: a second at a round table,
    // three to five at a long group table
    const want = new Map<number, number>();
    let budget = GUEST_CAP;
    for (const i of occupied) {
      if (budget <= 0) break;
      want.set(i, 1);
      budget--;
    }
    for (const i of occupied) {
      const sp = p.tableSpots[i];
      const h = hashStr(sortedRef.current[i].id);
      const target = sp.kind === 'long' ? 3 + (h % 3) : h % 3 !== 0 ? 2 : 1;
      while ((want.get(i) ?? 1) < target && budget > 0) {
        want.set(i, (want.get(i) ?? 1) + 1);
        budget--;
      }
    }

    for (const [idx, list] of [...s.guestsByTable]) {
      const n = want.get(idx) ?? 0;
      while (list.length > n) leaveGuest(list.pop() as Agent);
      if (!list.length) s.guestsByTable.delete(idx);
    }
    const added: Agent[] = [];
    for (const [idx, n] of want) {
      const list = s.guestsByTable.get(idx) ?? [];
      const order = seatOrder(p.tableSpots[idx], hashStr(sortedRef.current[idx].id));
      while (list.length < n) {
        const g = spawnGuest(idx, order[list.length % order.length], list.length, first);
        list.push(g);
        added.push(g);
        if (!first && list.length === 1) {
          feed(`ลูกค้าเข้านั่ง โต๊ะ ${sortedRef.current[idx].number}`, 'new');
          playSound('arrive');
          react(byRole(['CASHIER'])[0], 'wave', 'hi', 'idle', 2.6);
        }
      }
      s.guestsByTable.set(idx, list);
    }
    if (added.length) setGuests((g) => [...g, ...added]);
  };
  useEffect(() => {
    syncGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, plan]);

  const guestBehaviour = (a: Agent) => {
    const s = sim.current;
    const seat = a.seat;
    if (!seat) return;
    if (a.temp && s.now < a.temp.until) {
      a.pose = a.temp.pose;
      a.bubble = a.temp.bubble;
      return;
    }
    a.temp = null;
    let pose: Agent['pose'] = 'sit';
    let bubble: Agent['bubble'] = null;
    let plate: PlateRec | undefined;
    for (const r of s.plates.values()) if (r.state === 'table' && r.tableIdx === seat.table) plate = r;
    if (plate && s.now - plate.since < 7) {
      pose = 'eat';
      bubble = 'eat';
    } else if (s.lateSet.has(seat.table)) {
      bubble = 'angry';
    } else if (s.now > a.nextIdle) {
      a.temp = { pose: 'sit', bubble: 'chat', status: 'idle', until: s.now + 4 };
      a.nextIdle = s.now + rand(10, 24);
    }
    a.pose = pose;
    a.bubble = bubble;
    a.status = 'idle';
  };

  // ---- the clock ----
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = sim.current;
    s.now += dt;

    // plates: pop in/out and follow whoever carries them
    let changed = false;
    for (const [id, rec] of s.plates) {
      const e = rec.ent;
      if (e.dying) {
        e.scale -= dt * 3;
        if (e.scale <= 0) {
          s.plates.delete(id);
          changed = true;
        }
        continue;
      }
      if (e.scale < 1) e.scale = Math.min(1, e.scale + dt * 3);
      if (rec.state === 'carried' && rec.carrier) {
        const c = rec.carrier;
        e.x = c.x + Math.sin(c.rotY) * 0.55;
        e.z = c.z + Math.cos(c.rotY) * 0.55;
        e.y = 0.14 + 1.0;
      }
    }
    if (changed) syncPlates();

    // lateness, once a second
    s.lateClock += dt;
    if (s.lateClock > 1) {
      s.lateClock = 0;
      const now = Date.now();
      const tablesLate: number[] = [];
      let lateKitchen = false;
      let lateReady = false;
      for (const o of s.prev.values()) {
        if (!isLate(o, now)) continue;
        if (o.status === 'READY') lateReady = true;
        else lateKitchen = true;
        const idx = o.tableNumber ? (tableIdxRef.current.get(o.tableNumber) ?? -1) : -1;
        if (idx >= 0) tablesLate.push(idx);
      }
      if (lateKitchen && !s.lateKitchen) {
        feed('มีออเดอร์ช้า', 'late');
        playSound('late');
      }
      s.lateSet = new Set(tablesLate);
      s.lateKitchen = lateKitchen;
      s.lateReady = lateReady;
      const key = tablesLate.sort().join(',');
      if (key !== s.lateKey) {
        s.lateKey = key;
        setLateAt(tablesLate);
      }
    }

    // people
    for (const a of [...agentsRef.current, ...guestsRef.current]) {
      if (a.gone) continue;
      if (a.mode === 'walk') {
        let step = SPEED * dt;
        a.pose = a.carrying && plateCarried(a) ? 'carry' : 'walk';
        a.bubble = null;
        while (step > 0 && a.path.length) {
          const t = a.path[0];
          const dx = t.x - a.x;
          const dz = t.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.001) a.rotY = Math.atan2(dx, dz);
          if (d <= step) {
            a.x = t.x;
            a.z = t.z;
            a.path.shift();
            step -= d;
          } else {
            a.x += (dx / d) * step;
            a.z += (dz / d) * step;
            step = 0;
          }
        }
        if (!a.path.length) {
          const then = a.onArrive;
          a.onArrive = null;
          a.mode = 'home';
          then?.();
          if (a.mode === 'home' && !then) a.rotY = 0;
        }
      } else if (a.mode === 'do') {
        a.timer -= dt;
        if (a.timer <= 0) {
          const then = a.onArrive;
          a.onArrive = null;
          a.mode = 'home';
          a.pose = 'idle';
          a.bubble = null;
          then?.();
        }
      } else if (a.seat) {
        guestBehaviour(a);
      } else {
        // standing at (or returning to) the post
        if (Math.hypot(a.x - a.home.x, a.z - a.home.z) > 0.05) {
          goHome(a);
        } else homeBehaviour(a);
      }
    }
  });

  registry.agents = [...agents, ...guests];

  const plateCarried = (a: Agent) => {
    const rec = a.carrying ? sim.current.plates.get(a.carrying) : undefined;
    return !!rec && rec.state === 'carried';
  };

  return (
    <>
      {agents.map((a) => (
        <Character key={`${a.staff.id}:${JSON.stringify(people[a.staff.id] ?? 0)}`} agent={a} showName={showNames} onPick={onPick} selected={selectedId === a.staff.id} />
      ))}
      {guests.map((a) => (
        <Character key={a.staff.id} agent={a} showName={false} s={0.82} onPick={onPick} selected={selectedId === a.staff.id} />
      ))}
      {plates.map((p) => (
        <PlateView key={p.id} plate={p} />
      ))}
      {tickets.map((t) => (
        <Ticket key={t.id} ticket={t} onDone={landTicket} />
      ))}
      {bursts.map((b) => (
        <Burst key={b.id} burst={b} onDone={removeBurst} />
      ))}
      {lateAt.map((i) => {
        const sp = plan.tableSpots[i];
        return sp ? <AlertMark key={i} x={sp.x} z={sp.z} /> : null;
      })}
    </>
  );
}
