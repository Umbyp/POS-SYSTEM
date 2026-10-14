import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiGet, getToken } from './api';
import type { LiveOrder, MenuItem, RestaurantTable, Role, Staff } from './types';
import { DemoOrders } from './world/sim/demo';
import { isActive, toOrderView, type OrderView } from './world/sim/orders';

export type DataMode = 'live' | 'demo';

export interface WorldData {
  tables: RestaurantTable[];
  staff: Staff[];
  /** What the big menu board shows (real products when logged in). */
  menu: MenuItem[];
  /** Newest orders (in-flight ones plus recently finished), for the behaviours. */
  orders: OrderView[];
  /** Orders that are still in flight, by status. */
  counts: Record<'PENDING' | 'PREPARING' | 'READY', number>;
  connected: boolean;
  error: string | null;
}

const EMPTY: WorldData['counts'] = { PENDING: 0, PREPARING: 0, READY: 0 };

const DEMO_NAMES = ['มะลิ', 'โบ', 'ปุ้ย', 'เจ', 'น้ำ', 'ต้อม', 'ฟ้า', 'พีท', 'แพร', 'บอล', 'ไผ่', 'ใหม่', 'ก้อย', 'ภูมิ', 'ออม', 'นุ่น'];
const DEMO_ROLES: Role[] = ['OWNER', 'ADMIN', 'CASHIER', 'KITCHEN', 'KITCHEN', 'CASHIER', 'KITCHEN', 'CASHIER'];

function demoStaff(count: number): Staff[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `demo-staff-${i}`,
    name: DEMO_NAMES[i % DEMO_NAMES.length],
    role: DEMO_ROLES[i % DEMO_ROLES.length],
  }));
}

function countOf(orders: OrderView[]): WorldData['counts'] {
  const c = { ...EMPTY };
  for (const o of orders) if (isActive(o.status)) c[o.status as keyof typeof c] += 1;
  return c;
}

/** Same tables with the same statuses? (keeps the scene from re-baking on every poll) */
function sameTables(a: RestaurantTable[], b: RestaurantTable[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i].id && t.status === b[i].status && t.number === b[i].number);
}

const DEMO_MENU: MenuItem[] = [
  { name: 'ข้าวผัดกุ้ง', price: 89 },
  { name: 'ผัดกะเพราหมูกรอบ', price: 79 },
  { name: 'ต้มยำกุ้งน้ำข้น', price: 129 },
  { name: 'ส้มตำไทย', price: 59 },
  { name: 'ไก่ย่างสมุนไพร', price: 99 },
  { name: 'ก๋วยเตี๋ยวเรือ', price: 55 },
  { name: 'พิซซ่าซีฟู้ด', price: 199 },
  { name: 'สปาเกตตี้คาโบนาร่า', price: 149 },
  { name: 'ชาไทยเย็น', price: 45 },
  { name: 'กาแฟลาเต้', price: 65 },
  { name: 'สมูทตี้สตรอว์เบอร์รี', price: 75 },
  { name: 'บัวลอยไข่หวาน', price: 49 },
];

function demoTables(count: number): RestaurantTable[] {
  const statuses = ['AVAILABLE', 'OCCUPIED', 'OCCUPIED', 'BILLING', 'AVAILABLE', 'RESERVED'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `demo-${i}`,
    number: String(i + 1),
    // every 4th table seats six and every 9th eight, so group tables show up in the demo
    capacity: i % 9 === 5 ? 8 : i % 4 === 3 ? 6 : 4,
    size: i % 9 === 5 ? 'LARGE' : 'MEDIUM',
    status: statuses[i % statuses.length],
    occupiedAt: null,
  }));
}

/**
 * Read-only view of the real store: tables + in-flight orders from the existing API,
 * refreshed on socket events and every few seconds as a safety net.
 * "demo" mode shows fake tables and is labelled DEMO everywhere it appears.
 */
export function useWorldData(mode: DataMode | null, onAuthLost: () => void, demoCount = 12): WorldData {
  const [data, setData] = useState<WorldData>({ tables: [], staff: [], menu: [], orders: [], counts: EMPTY, connected: false, error: null });
  const authLost = useRef(onAuthLost);
  authLost.current = onAuthLost;

  const refresh = useCallback(async () => {
    try {
      const [tables, active, recent, menu, staff] = await Promise.all([
        apiGet<RestaurantTable[]>('/tables'),
        apiGet<{ data: LiveOrder[] }>('/orders?status=PENDING,PREPARING,READY&limit=200'),
        // recent orders of any status, so the world notices when something was paid or cancelled
        apiGet<{ data: LiveOrder[] }>('/orders?limit=40'),
        apiGet<{ name: string; sellingPrice?: number | string; price?: number | string; isActive?: boolean; isAvailable?: boolean }[]>('/products?limit=40')
          .then((all) =>
            (Array.isArray(all) ? all : [])
              .filter((p) => p.isActive !== false && p.isAvailable !== false)
              .slice(0, 12)
              .map((p) => ({ name: p.name, price: Number(p.sellingPrice ?? p.price) || 0 })),
          )
          .catch(() => [] as MenuItem[]),
        // the staff list is OWNER/ADMIN only; other roles just see an empty town
        apiGet<(Staff & { isActive: boolean })[]>('/employees')
          .then((all) => all.filter((e) => e.isActive).map(({ id, name, role }) => ({ id, name, role })))
          .catch(() => [] as Staff[]),
      ]);
      const byId = new Map<string, OrderView>();
      for (const o of [...recent.data, ...active.data]) byId.set(o.id, toOrderView(o));
      const orders = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
      setData((d) => ({ ...d, tables: sameTables(d.tables, tables) ? d.tables : tables, staff, menu, orders, counts: countOf(orders), error: null }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ';
      if (!getToken()) authLost.current();
      setData((d) => ({ ...d, error: msg }));
    }
  }, []);

  useEffect(() => {
    if (mode === null) return; // not logged in yet: no requests
    if (mode === 'demo') {
      const staff = demoStaff(Math.min(16, Math.max(4, Math.round(demoCount / 3))));
      const sim = new DemoOrders(demoTables(demoCount));
      const tick = () => {
        const { orders, tables } = sim.step(1);
        setData({ tables, staff, menu: DEMO_MENU, orders, counts: countOf(orders), connected: false, error: null });
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
    refresh();
    const timer = setInterval(refresh, 8000);

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 300);
    };
    const socket = io({ auth: { token: getToken() }, transports: ['websocket'] });
    socket.on('connect', () => setData((d) => ({ ...d, connected: true })));
    socket.on('disconnect', () => setData((d) => ({ ...d, connected: false })));
    socket.on('table:updated', soon);
    socket.on('order:status', soon);
    socket.on('kds:new', soon);

    return () => {
      clearInterval(timer);
      clearTimeout(debounce);
      socket.close();
    };
  }, [mode, refresh, demoCount]);

  return data;
}
