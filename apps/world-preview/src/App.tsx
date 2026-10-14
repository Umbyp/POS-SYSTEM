import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { WorldScene } from './world/scene/WorldScene';
import { MAX_TABLES, TIERS, planFor, type TableKind, type Theme, type Tier } from './world/layout';
import { restroomRect } from './world/scene/Interior';
import { sortTables } from './world/sim/orders';
import { Controls, type Focus } from './Controls';
import { clearToken, getToken, login } from './api';
import { useWorldData, type DataMode } from './useWorldData';
import type { FeedItem } from './world/sim/Director';
import { Sheet } from './Sheet';
import { FESTIVALS, type Festival } from './world/scene/Festival';
import { Pacer } from './Pacer';
import { registry } from './world/sim/agent';
import { isLate, isActive } from './world/sim/orders';
import type { PickFn, Selection } from './selection';
import { initAudio, setSoundEnabled, soundEnabled } from './world/sim/sound';

const hour = new Date().getHours();

export function App() {
  const [mode, setMode] = useState<DataMode | null>(getToken() ? 'live' : null);
  // day/night: follows the real clock unless the viewer picks one
  const [dayMode, setDayMode] = useState<'auto' | 'day' | 'night'>('auto');
  const [clockHour, setClockHour] = useState(hour);
  useEffect(() => {
    const id = setInterval(() => setClockHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);
  const isDark = dayMode === 'auto' ? clockHour >= 18 || clockHour < 6 : dayMode === 'night';
  const [resetKey, setResetKey] = useState(0);
  const [showNames, setShowNames] = useState(true);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [following, setFollowing] = useState(false);
  const [festival, setFestival] = useState<Festival>('none');
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const closeSheet = useCallback(() => {
    setSel(null);
    setFollowing(false);
  }, []);
  const stopFollow = useCallback(() => setFollowing(false), []);
  const track = useMemo(() => {
    if (!following || !sel || sel.kind === 'table') return null;
    if (sel.kind === 'pet') return () => registry.pet;
    const id = sel.id;
    return () => registry.agents.find((a) => a.staff.id === id) ?? null;
  }, [following, sel]);
  const onPick = useCallback<PickFn>((s, x, z) => {
    setSel(s);
    setFollowing(s.kind !== 'table');
    setFocus((f) => ({ x, z: z + 1.5, dist: 11, n: (f?.n ?? 0) + 1 }));
  }, []);
  // dev helper for checking the preview from the console
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __worldPickPet?: () => void }).__worldPickPet = () => {
      const p = registry.pet;
      if (p) onPick({ kind: 'pet' }, p.x, p.z);
    };
  }, [onPick]);
  const [sound, setSound] = useState(soundEnabled());
  // browsers only allow sound after a click or tap, so start the audio engine on the first one
  useEffect(() => {
    window.addEventListener('pointerdown', initAudio);
    return () => window.removeEventListener('pointerdown', initAudio);
  }, []);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedId = useRef(0);
  const onFeed = useCallback((f: Omit<FeedItem, 'id'>) => {
    const id = ++feedId.current;
    setFeed((l) => [{ ...f, id }, ...l].slice(0, 5));
    setTimeout(() => setFeed((l) => l.filter((x) => x.id !== id)), 12000);
  }, []);
  const [demoCount, setDemoCount] = useState(20);
  const [tierPick, setTierPick] = useState<Tier | 'auto'>('auto');
  const [theme, setTheme] = useState<Theme>('interior');
  const data = useWorldData(mode, () => setMode(null), demoCount);
  const tables = mode ? data.tables : [];
  // tables that seat six or more (or are marked LARGE) are drawn as long group tables
  const kindsKey = sortTables(tables).map((t) => (t.capacity >= 6 || t.size === 'LARGE' ? 'L' : 'R')).join('');
  const plan = useMemo(
    () =>
      planFor(
        theme,
        tables.length,
        tierPick === 'auto' ? undefined : tierPick,
        [...kindsKey].map((k): TableKind => (k === 'L' ? 'long' : 'round')),
      ),
    [theme, tables.length, tierPick, kindsKey],
  );
  // when the layout changes (data arrives, theme or size switched) settle the camera on the home view
  const planKey = `${theme}-${tables.length}-${tierPick}-${kindsKey}`;
  useEffect(() => {
    const id = setTimeout(() => setResetKey((k) => k + 1), 80);
    return () => clearTimeout(id);
  }, [planKey]);
  const nowSum = Date.now();
  const activeOrders = (mode ? data.orders : []).filter((o) => isActive(o.status));
  const lateCount = activeOrders.filter((o) => isLate(o, nowSum)).length;
  const avgWait = activeOrders.length
    ? `${Math.max(1, Math.round(activeOrders.reduce((t, o) => t + (nowSum - o.createdAt), 0) / activeOrders.length / 60_000))} น.`
    : '–';
  const occupied = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING').length;

  return (
    <div className={`app ${isDark ? 'dark' : ''}`}>
      <Canvas
        dpr={[1, 2]}
        frameloop="never"
        camera={{ fov: 45, near: 1, far: 800, position: [0, 27, 24] }}
        gl={{ antialias: true }}
        onPointerMissed={closeSheet}
      >
        <Pacer boostKey={focus?.n ?? resetKey} />
        <Controls plan={plan} resetKey={resetKey} focus={focus} track={track} onUserMove={stopFollow} />
        <WorldScene tables={tables} isDark={isDark} plan={plan} staff={mode ? data.staff : []} orders={mode ? data.orders : null} menu={mode ? data.menu : []} demo={mode === 'demo'} showNames={showNames} onFeed={onFeed} onPick={onPick} selection={sel} festival={festival} />
      </Canvas>

      <div className="vignette" />
      <header className="hud hud-left">
        {mode ? (
          <>
            <span className={`tag ${mode}`}>{mode === 'live' ? (data.connected ? 'LIVE' : 'LIVE · polling') : 'DEMO'}</span>
            <div className="stat">
              <b>
                {occupied}/{tables.length}
              </b>
              <span>โต๊ะมีลูกค้า</span>
            </div>
            <div className="stat">
              <b>{data.staff.length}</b>
              <span>พนักงาน</span>
            </div>
            <div className="stat">
              <b className="c-pending">{data.counts.PENDING}</b>
              <span>รอทำ</span>
            </div>
            <div className="stat">
              <b className="c-prep">{data.counts.PREPARING}</b>
              <span>กำลังทำ</span>
            </div>
            <div className="stat">
              <b className="c-ready">{data.counts.READY}</b>
              <span>พร้อมเสิร์ฟ</span>
            </div>
            <div className="stat">
              <b className={lateCount ? 'c-late' : ''}>{lateCount}</b>
              <span>ช้า</span>
            </div>
            <div className="stat">
              <b>{avgWait}</b>
              <span>รอเฉลี่ย</span>
            </div>
          </>
        ) : null}
      </header>

      {mode && sel ? <Sheet sel={sel} tables={tables} orders={mode ? data.orders : []} onClose={closeSheet} /> : null}

      {mode && !sel ? (
        <div className="dock">
          {panel ? (
            <div className="panel">
              <div className="row">
                <span className="label">ธีม</span>
                <button className={theme === 'interior' ? 'on' : ''} onClick={() => { setFocus(null); setTheme('interior'); setPanel(false); }}>
                  ห้องแอร์
                </button>
                <button className={theme === 'town' ? 'on' : ''} onClick={() => { setFocus(null); setTheme('town'); }}>
                  เมืองกลางแจ้ง
                </button>
              </div>
              {theme === 'town' ? (
                <div className="row">
                  <span className="label">ขนาดเมือง</span>
                  {(['auto', ...TIERS] as const).map((t) => (
                    <button key={t} className={tierPick === t ? 'on' : ''} onClick={() => setTierPick(t)}>
                      {t === 'auto' ? `Auto (${plan.tier})` : t}
                    </button>
                  ))}
                </div>
              ) : null}
              {mode === 'demo' ? (
                <div className="row">
                  <span className="label">โต๊ะ DEMO</span>
                  {[6, 20, 40, 70].map((n) => (
                    <button key={n} className={demoCount === n ? 'on' : ''} onClick={() => setDemoCount(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="row">
                <span className="label">เทศกาล</span>
                {FESTIVALS.map((f) => (
                  <button key={f.id} className={festival === f.id ? 'on' : ''} onClick={() => setFestival(f.id)}>
                    {f.emoji} {f.label}
                  </button>
                ))}
              </div>
              {plan.hiddenTables > 0 ? <div className="muted small">+{plan.hiddenTables} โต๊ะที่ไม่ได้แสดง (สูงสุด {MAX_TABLES})</div> : null}
            </div>
          ) : null}
          <div className="dock-bar">
            <button className={`gear ${panel ? 'on' : ''}`} onClick={() => setPanel((v) => !v)} title="ตั้งค่าฉาก">
              ⚙
            </button>
            <div className="chips">
              {(
                [
                  ['🍳 ครัว', plan.anchors.chefs, 12, 'c1'],
                  [plan.theme === 'interior' ? '☕ บาร์' : '🧾 เคาน์เตอร์', plan.anchors.cashiers, 12, 'c2'],
                  [plan.theme === 'interior' ? '🛎️ ต้อนรับ' : '🏠 ออฟฟิศ', plan.anchors.office, 12, 'c3'],
                  ['🛋️ มุมพักผ่อน', plan.anchors.lounge, 12, 'c4'],
                ] as const
              ).map(([label, p, d, c]) => (
                <button key={label} className={c} onClick={() => { setPanel(false); setFocus((f) => ({ x: p.x, z: p.z + 2.8, dist: d, n: (f?.n ?? 0) + 1 })); }}>
                  {label}
                </button>
              ))}
              {plan.theme === 'interior' ? (
                <>
                  <button
                    className="c5"
                    onClick={() => {
                      setPanel(false);
                      setFocus((f) => ({ x: plan.plate.x0 + 2, z: (plan.plaza.z0 + plan.plaza.z1) / 2, dist: 17, az: Math.PI / 2, n: (f?.n ?? 0) + 1 }));
                    }}
                  >
                    📋 ป้ายเมนู
                  </button>
                  <button
                    className="c6"
                    onClick={() => {
                      setPanel(false);
                      const r = restroomRect(plan);
                      setFocus((f) => ({ x: (r.x0 + r.x1) / 2 - 1, z: (r.z0 + r.z1) / 2, dist: 18, az: -Math.PI / 2, n: (f?.n ?? 0) + 1 }));
                    }}
                  >
                    🚻 ห้องน้ำ
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="hud hud-right">
        <button
          onClick={() => setDayMode((m) => (m === 'auto' ? 'day' : m === 'day' ? 'night' : 'auto'))}
          title={dayMode === 'auto' ? 'กลางวัน/กลางคืนตามเวลาจริง (กดเพื่อเลือกเอง)' : dayMode === 'day' ? 'กลางวัน' : 'กลางคืน'}
          className={dayMode === 'auto' ? 'on' : ''}
        >
          {dayMode === 'auto' ? '🕒' : dayMode === 'day' ? '☀️' : '🌙'}
        </button>
        <button
          onClick={() => {
            const on = !sound;
            setSound(on);
            setSoundEnabled(on);
            if (on) initAudio();
          }}
          title="เปิด/ปิดเสียง"
        >
          {sound ? '🔊' : '🔇'}
        </button>
        <button onClick={() => setShowNames((v) => !v)} title="แสดง/ซ่อนชื่อ" className={showNames ? 'on' : ''}>
          ชื่อ
        </button>
        <button
          onClick={() => {
            setFocus(null);
            setSel(null);
            setResetKey((k) => k + 1);
          }}
          title="กลับมุมมองหลัก"
        >
          ⌂
        </button>
        {mode ? (
          <button
            onClick={() => {
              clearToken();
              setMode(null);
            }}
          >
            ออก
          </button>
        ) : null}
      </div>

      {mode && feed.length ? (
        <div className="feed">
          {feed.map((f) => (
            <div key={f.id} className={`feed-item ${f.tone}`}>
              {f.text}
            </div>
          ))}
        </div>
      ) : null}

      {data.error && mode === 'live' ? <div className="toast">{data.error}</div> : null}
      {!mode ? <LoginCard onLive={() => setMode('live')} onDemo={() => setMode('demo')} /> : null}
    </div>
  );
}

function LoginCard({ onLive, onDemo }: { onLive: () => void; onDemo: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      onLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>โลกของร้าน</h1>
        <p>เข้าสู่ระบบด้วยบัญชีเจ้าของร้าน/แอดมิน เพื่อดูข้อมูลจริง (อ่านอย่างเดียว)</p>
        <input type="email" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input type="password" placeholder="รหัสผ่าน" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <div className="err">{error}</div> : null}
        <button className="primary" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
        <button type="button" className="ghost" onClick={onDemo}>
          ลองโหมด DEMO (ข้อมูลปลอม)
        </button>
      </form>
    </div>
  );
}
