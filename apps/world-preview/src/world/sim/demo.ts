import type { RestaurantTable } from '../../types';
import { isActive, type OrderView } from './orders';

/**
 * DEMO order simulator (development preview only): orders appear, get cooked, become ready and
 * get paid on a short timer so every behaviour in the world can be watched. Never used for live data.
 */
const DEMO_DISHES: [string, number][] = [
  ['ผัดกะเพราหมูกรอบ', 79], ['ต้มยำกุ้ง', 129], ['ข้าวผัดปู', 99], ['ชาไทยเย็น', 45],
  ['กาแฟลาเต้', 65], ['สปาเก็ตตี้คาโบนาร่า', 149], ['พิซซ่าซีฟู้ด', 199], ['ก๋วยเตี๋ยวเรือ', 55],
];
/** A few made-up dishes for a DEMO order (picked from its number, so it never changes). */
function demoBasket(n: number) {
  const items = [0, 1, 2].slice(0, 1 + (n % 3)).map((k) => {
    const [name, price] = DEMO_DISHES[(n * 3 + k * 5) % DEMO_DISHES.length];
    return { name, qty: 1 + ((n + k) % 2), price, note: k === 0 && n % 4 === 0 ? 'ไม่เผ็ด' : undefined };
  });
  return {
    items: items.map(({ name, qty, note }) => ({ name, qty, note })),
    total: items.reduce((t, i) => t + i.price * i.qty, 0),
    cashier: 'DEMO',
  };
}

export class DemoOrders {
  private tables: RestaurantTable[];
  private lastChurn = 0;
  constructor(tables: RestaurantTable[]) {
    this.tables = tables;
  }
  private list: OrderView[] = [];
  private counter = 101;
  private lastSpawn = -99_000;
  private clock = 0;

  /** Advance by dt seconds; returns a fresh snapshot (newest first). `tables` keeps its identity unless something changed. */
  step(dt: number): { orders: OrderView[]; tables: RestaurantTable[] } {
    this.clock += dt * 1000;
    this.churnTables();
    const now = Date.now();
    const age = (o: OrderView) => now - o.since;
    for (const o of this.list) {
      if (o.status === 'PENDING' && age(o) > 6000 && !this.late(o)) this.move(o, 'PREPARING', now);
      else if (o.status === 'PREPARING' && age(o) > 9000 && !this.late(o)) this.move(o, 'READY', now);
      else if (o.status === 'READY' && age(o) > 17000 && !this.late(o)) this.move(o, 'COMPLETED', now);
    }
    // late demo orders eventually get sorted out so the scene does not stay red forever
    for (const o of this.list) if (this.late(o) && age(o) > 22000) this.move(o, o.status === 'PENDING' ? 'CANCELLED' : 'COMPLETED', now);
    this.list = this.list.filter((o) => isActive(o.status) || age(o) < 25_000);

    const active = this.list.filter((o) => isActive(o.status)).length;
    if (this.clock - this.lastSpawn > 9000 && active < 6) {
      this.lastSpawn = this.clock;
      const seated = this.tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING');
      const pick = seated.length ? seated[Math.floor(Math.random() * seated.length)] : null;
      const late = this.counter % 5 === 0;
      this.list.unshift({
        id: `demo-order-${this.counter}`,
        number: String(this.counter++),
        status: 'PENDING',
        createdAt: late ? now - 20 * 60_000 : now,
        since: now,
        tableNumber: pick?.number ?? null,
        ...demoBasket(this.counter),
      });
    }
    // copies, like a real API response, so the world can compare this snapshot with the last one
    return { orders: this.list.map((o) => ({ ...o })), tables: this.tables };
  }

  /** Guests come and go: every so often one table fills up and a finished one empties. */
  private churnTables() {
    if (this.clock - this.lastChurn < 14_000) return;
    this.lastChurn = this.clock;
    const busy = new Set(this.list.filter((o) => isActive(o.status)).map((o) => o.tableNumber));
    const leaving = this.tables.filter((t) => t.status === 'OCCUPIED' && !busy.has(t.number));
    const free = this.tables.filter((t) => t.status === 'AVAILABLE');
    const next = this.tables.map((t) => ({ ...t }));
    const set = (n: string, status: RestaurantTable['status']) => {
      const t = next.find((x) => x.number === n);
      if (t) t.status = status;
    };
    if (free.length) set(free[Math.floor(Math.random() * free.length)].number, 'OCCUPIED');
    if (leaving.length) set(leaving[Math.floor(Math.random() * leaving.length)].number, 'AVAILABLE');
    this.tables = next;
  }

  /** Orders flagged late on purpose have a backdated createdAt. */
  private late(o: OrderView) {
    return Date.now() - o.createdAt > 10 * 60_000;
  }

  private move(o: OrderView, to: OrderView['status'], now: number) {
    o.status = to;
    o.since = now;
  }
}
