import { useEffect, useState, type ReactNode } from 'react';
import type { RestaurantTable, Role } from './types';
import type { Selection } from './selection';
import { registry, type Agent } from './world/sim/agent';
import { isLate, sortTables, type OrderView } from './world/sim/orders';
import { PET_NAME } from './world/characters/Pet';

const ROLE_TH: Record<Role, string> = { OWNER: 'เจ้าของร้าน', ADMIN: 'แอดมิน', CASHIER: 'แคชเชียร์', KITCHEN: 'ครัว', GUEST: 'ลูกค้า' };
const ROLE_ICON: Record<Role, string> = { OWNER: '👑', ADMIN: '👑', CASHIER: '🧾', KITCHEN: '👩‍🍳', GUEST: '🙂' };
const ROLE_TONE: Record<Role, string> = { OWNER: 'gold', ADMIN: 'gold', CASHIER: 'pink', KITCHEN: 'peach', GUEST: 'mint' };
const STATUS_TH: Record<OrderView['status'], string> = {
  DRAFT: 'ร่าง', PENDING: 'รอทำ', PREPARING: 'กำลังทำ', READY: 'พร้อมเสิร์ฟ', COMPLETED: 'จ่ายแล้ว', CANCELLED: 'ยกเลิก', REFUNDED: 'คืนเงิน',
};
const STATUS_ICON: Record<OrderView['status'], string> = {
  DRAFT: '📝', PENDING: '🕒', PREPARING: '🍳', READY: '🛎️', COMPLETED: '💰', CANCELLED: '💨', REFUNDED: '↩️',
};
const TABLE_TH: Record<RestaurantTable['status'], string> = {
  AVAILABLE: 'ว่าง', RESERVED: 'จองไว้', OCCUPIED: 'มีลูกค้า', BILLING: 'รอเช็คบิล', DIRTY: 'รอเก็บโต๊ะ',
};
const TABLE_ICON: Record<RestaurantTable['status'], string> = { AVAILABLE: '🪑', RESERVED: '📌', OCCUPIED: '😋', BILLING: '🧾', DIRTY: '🧽' };
const POSE_TH: Partial<Record<Agent['pose'], string>> = {
  stir: 'กำลังทำอาหาร', type: 'กำลังคีย์ออเดอร์', serve: 'กำลังเสิร์ฟ', carry: 'กำลังเสิร์ฟ', nap: 'งีบอยู่', walk: 'กำลังเดิน',
  sit: 'นั่งอยู่', eat: 'กำลังกินอาหาร', cheer: 'ดีใจ', wave: 'โบกมือ', stretch: 'บิดขี้เกียจ', dance: 'เต้นอยู่', think: 'กำลังคิด', pose: 'ถ่ายรูป',
};
const MOOD: Partial<Record<Agent['pose'], string>> = {
  cheer: '🤩', dance: '🥳', wave: '😄', eat: '😋', nap: '😴', stir: '😤', type: '🧐', think: '🤔', serve: '🙂', carry: '🙂', stretch: '😌',
};

function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s > 24 * 3600) return 'เกิน 1 วัน';
  if (s < 60) return `${s} วิ`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} นาที ${s % 60} วิ` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
}

const STEPS: OrderView['status'][] = ['PENDING', 'PREPARING', 'READY', 'COMPLETED'];

/** Little progress path: waiting → cooking → ready → paid. */
function Steps({ status }: { status: OrderView['status'] }) {
  if (status === 'CANCELLED' || status === 'REFUNDED') {
    return <div className="steps off">{STATUS_ICON[status]} {STATUS_TH[status]}</div>;
  }
  const at = Math.max(0, STEPS.indexOf(status));
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <div key={s} className={`step ${i < at ? 'done' : i === at ? 'now' : ''}`}>
          <span className="dot">{STATUS_ICON[s]}</span>
          <span className="lbl">{STATUS_TH[s]}</span>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ o, now }: { o: OrderView; now: number }) {
  const late = isLate(o, now);
  const waiting = o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY';
  return (
    <div className={`oc s-${o.status} ${late ? 'late' : ''}`}>
      <div className="oc-head">
        <b>#{o.number}</b>
        {late ? <span className="chip s-late">⚠️ ช้า!</span> : null}
        <span className="oc-age">{waiting ? `⏱ รอมา ${age(now - o.createdAt)}` : `เมื่อ ${age(now - o.since)} ก่อน`}</span>
      </div>
      <Steps status={o.status} />
      {o.items.length ? (
        <ul>
          {o.items.map((i, k) => (
            <li key={k}>
              <span className="qty">{i.qty}</span>
              <span>{i.name}</span>
              {i.note ? <em>💬 {i.note}</em> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="muted">ไม่มีรายการอาหารในข้อมูล</div>
      )}
      <div className="oc-foot">
        {o.total != null ? <span className="price">฿{o.total.toLocaleString()}</span> : null}
        {o.cashier ? <span className="muted">เปิดโดย {o.cashier}</span> : null}
      </div>
    </div>
  );
}

function Title({ icon, tone, title, sub }: { icon: string; tone: string; title: string; sub: ReactNode }) {
  return (
    <div className="sh-title">
      <span className={`sh-icon ${tone}`}>{icon}</span>
      <div>
        <h2>{title}</h2>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

/** Bottom sheet with the details of whatever was tapped. Read-only. */
export function Sheet({
  sel,
  tables,
  orders,
  onClose,
}: {
  sel: Selection;
  tables: RestaurantTable[];
  orders: OrderView[];
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sorted = sortTables(tables);

  let body: ReactNode = null;
  let gone = false;
  const open = (o: OrderView) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY';

  if (sel.kind === 'pet') {
    const doing = registry.pet?.doing ?? 'นั่งเฉยๆ';
    body = (
      <>
        <Title icon="🐱" tone="peach" title={PET_NAME} sub={<>แมวประจำร้าน · {doing}</>} />
        <div className="pet-card">
          <div>
            <b>ตำแหน่ง</b>
            <span>เจ้าหน้าที่ต้อนรับ (ไม่รับเงินเดือน รับแต่ขนม 🐟)</span>
          </div>
          <div>
            <b>ชอบ</b>
            <span>นอนบนโซฟามุมพักผ่อน ☁️</span>
          </div>
          <div>
            <b>ความน่ารัก</b>
            <span className="hearts">💖💖💖💖💖</span>
          </div>
        </div>
        <div className="muted pad small">ลองแตะอีกครั้งดูนะ เมี้ยว~</div>
      </>
    );
  } else if (sel.kind === 'table') {
    const t = sorted[sel.idx];
    if (!t) gone = true;
    else {
      const mine = orders.filter((o) => o.tableNumber === t.number);
      const active = mine.filter(open);
      const done = mine.filter((o) => !open(o)).slice(0, 2);
      body = (
        <>
          <Title
            icon={TABLE_ICON[t.status]}
            tone={t.status === 'AVAILABLE' ? 'mint' : t.status === 'BILLING' ? 'gold' : 'pink'}
            title={`โต๊ะ ${t.number}`}
            sub={
              <>
                🪑 {t.capacity} ที่นั่ง · {TABLE_TH[t.status]}
                {t.occupiedAt && (t.status === 'OCCUPIED' || t.status === 'BILLING') ? ` · ⏱ นั่งมา ${age(now - Date.parse(t.occupiedAt))}` : ''}
              </>
            }
          />
          {active.length ? active.map((o) => <OrderCard key={o.id} o={o} now={now} />) : <div className="empty">🍃 ตอนนี้ไม่มีออเดอร์ที่กำลังทำ</div>}
          {done.length ? (
            <>
              <div className="sh-sub">✨ เพิ่งเสร็จ</div>
              {done.map((o) => <OrderCard key={o.id} o={o} now={now} />)}
            </>
          ) : null}
        </>
      );
    }
  } else {
    const a = registry.agents.find((x) => x.staff.id === sel.id);
    if (!a || a.gone) gone = true;
    else {
      const role = a.staff.role;
      let title = a.staff.name || ROLE_TH[role];
      let related: OrderView[] = [];
      let relatedLabel = '';
      let note = '';
      if (role === 'GUEST') {
        const t = a.seat ? sorted[a.seat.table] : null;
        title = t ? `ลูกค้า · โต๊ะ ${t.number}` : 'ลูกค้า';
        related = t ? orders.filter((o) => o.tableNumber === t.number && open(o)) : [];
        relatedLabel = '🍽️ ออเดอร์ของโต๊ะนี้';
      } else if (role === 'KITCHEN') {
        related = orders.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING');
        relatedLabel = '🍳 ออเดอร์ที่ครัวต้องทำ';
        note = 'ระบบไม่ได้บอกว่าใครทำจานไหน เลยแสดงงานของครัวทั้งหมด';
      } else if (role === 'CASHIER') {
        related = orders.filter((o) => o.status === 'READY');
        relatedLabel = '🛎️ จานที่รอเสิร์ฟ';
      } else {
        related = orders.filter(open);
        relatedLabel = '📋 ออเดอร์ที่กำลังเดินอยู่';
      }
      const doing = POSE_TH[a.pose] ?? (a.mode === 'walk' ? 'กำลังเดิน' : 'ยืนประจำที่');
      const mood = a.status === 'late' ? '😰' : (MOOD[a.pose] ?? '😊');
      body = (
        <>
          <Title icon={ROLE_ICON[role]} tone={ROLE_TONE[role]} title={title} sub={<>{ROLE_TH[role]} · {doing} {mood}</>} />
          {a.status === 'late' ? <div className="warn">⚠️ มีงานที่ช้ากว่าที่ควร</div> : null}
          <div className="sh-sub">{relatedLabel}</div>
          {related.length ? related.slice(0, 4).map((o) => <OrderCard key={o.id} o={o} now={now} />) : <div className="empty">🍃 ไม่มีรายการ</div>}
          {related.length > 4 ? <div className="muted pad">และอีก {related.length - 4} รายการ</div> : null}
          {note ? <div className="muted pad small">{note}</div> : null}
        </>
      );
    }
  }

  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (!body) return null;
  return (
    <div className="sheet">
      <div className="sheet-grip" />
      <button className="sheet-x" onClick={onClose} aria-label="ปิด">
        ✕
      </button>
      {body}
    </div>
  );
}
