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
import { Dresser } from './Dresser';
import { BuildPanel } from './BuildPanel';
import type { BuildState } from './world/scene/BuildLayer';
import { useWorldConfig } from './useWorldConfig';
import { applyLook } from './world/palette';
import { MAX_ITEMS, type PersonCfg, type PlacedItem } from './config';
import { isWall } from './world/build';
import { FESTIVALS, type Festival } from './world/scene/Festival';
import { Pacer } from './Pacer';
import { registry } from './world/sim/agent';
import { isLate, isActive } from './world/sim/orders';
import type { PickFn, Selection } from './selection';
import { initAudio, setSoundEnabled, soundEnabled } from './world/sim/sound';

const hour = new Date().getHours();

/** Camera target for an item: wall pieces are viewed from inside the room, everything else from the front. */
function focusItem(it: PlacedItem, dist: number, n: number): Focus {
  if (isWall(it.type)) return { x: it.x, z: it.z, dist, az: it.rot === 1 ? Math.PI / 2 : -Math.PI / 2, n: n + 1 };
  return { x: it.x, z: it.z + 2.8, dist, n: n + 1 };
}

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
  const [dressingId, setDressingId] = useState<string | null>(null);
  const [build, setBuild] = useState<BuildState | null>(null);
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
    // while the dressing room is open the character is kept in the upper part of the screen
    const lift = dressingId ? 3.6 : 0;
    return () => {
      const p = registry.agents.find((a) => a.staff.id === id);
      return p ? { x: p.x, z: p.z + lift } : null;
    };
  }, [following, sel, dressingId]);
  const buildRef = useRef<BuildState | null>(null);
  buildRef.current = build;
  const onPick = useCallback<PickFn>((s, x, z) => {
    if (buildRef.current) return; // decorating: taps place things instead
    setSel(s);
    setFollowing(s.kind !== 'table');
    setFocus((f) => ({ x, z: z + 1.5, dist: 11, n: (f?.n ?? 0) + 1 }));
  }, []);
  // dev helper for checking the preview from the console
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { __worldFocusItem?: (i: number, dist?: number) => string }).__worldFocusItem = (i, dist = 9) => {
        const it = itemsRef.current[i];
        if (!it) return 'none';
        setFocus((f) => focusItem(it, dist, f?.n ?? 0));
        return it.type;
      };
  }, []);
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
  const { config, setConfig, state: saveState, canEdit } = useWorldConfig(mode);
  // the colours of the shop follow the saved preset and paint; a new look remounts the scene
  const itemsRef = useRef(config.items);
  itemsRef.current = config.items;
  const lookKey = useMemo(() => applyLook(config.preset, config.paint), [config.preset, config.paint]);
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
  const onBuildPlace = useCallback(
    (x: number, z: number, rot: number) => {
      const b = buildRef.current;
      if (!b?.type) return;
      const type = b.type;
      if (b.movingId) {
        const id = b.movingId;
        setConfig((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? { ...i, x, z, rot } : i)) }));
        setBuild((cur) => (cur ? { ...cur, type: null, movingId: null, selectedId: id } : cur));
      } else {
        const id = `i${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
        setConfig((c) => (c.items.length >= MAX_ITEMS ? c : { ...c, items: [...c.items, { id, type, x, z, rot, ...(b.color ? { color: b.color } : {}) }] }));
      }
    },
    [setConfig],
  );
  const onBuildSelect = useCallback((id: string | null) => {
    setBuild((b) => (b ? { ...b, selectedId: id } : b));
    const it = id ? itemsRef.current.find((i) => i.id === id) : null;
    if (it) setFocus((f) => focusItem(it, 10, f?.n ?? 0));
  }, []);
  const patchPerson = useCallback(
    (id: string, patch: Partial<PersonCfg>) =>
      setConfig((c) => {
        const next: PersonCfg = { ...(c.people[id] ?? {}), ...patch };
        (Object.keys(next) as (keyof PersonCfg)[]).forEach((k) => next[k] === undefined && delete next[k]);
        return { ...c, people: { ...c.people, [id]: next } };
      }),
    [setConfig],
  );
  const replacePerson = useCallback(
    (id: string, next: PersonCfg | undefined) =>
      setConfig((c) => {
        const people = { ...c.people };
        if (next) people[id] = next;
        else delete people[id];
        return { ...c, people };
      }),
    [setConfig],
  );
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
        <WorldScene key={lookKey} tables={tables} isDark={isDark} plan={plan} staff={mode ? data.staff : []} orders={mode ? data.orders : null} menu={mode ? data.menu : []} demo={mode === 'demo'} showNames={showNames} onFeed={onFeed} onPick={onPick}
          selection={sel}
          festival={festival}
          people={config.people}
          items={config.items}
          build={build}
          onBuildPlace={onBuildPlace}
          onBuildSelect={onBuildSelect}
        />
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

      {mode && sel && !dressingId && !build ? (
        <Sheet sel={sel} tables={tables} orders={mode ? data.orders : []} onClose={closeSheet} onDress={
            canEdit
              ? (id) => {
                  setDressingId(id);
                  const p = registry.agents.find((x) => x.staff.id === id);
                  if (p) setFocus((f) => ({ x: p.x, z: p.z + 3.6, dist: 9, n: (f?.n ?? 0) + 1 }));
                  setFollowing(true);
                }
              : undefined
          } />
      ) : null}
      {mode && dressingId && !build
        ? (() => {
            const ag = registry.agents.find((x) => x.staff.id === dressingId);
            if (!ag) return null;
            const base = data.staff.find((x) => x.id === dressingId) ?? ag.staff;
            return (
              <Dresser
                staff={base}
                cfg={config.people[dressingId]}
                onChange={(patch) => patchPerson(dressingId, patch)}
                onReplace={(next) => replacePerson(dressingId, next)}
                onClose={() => setDressingId(null)}
              />
            );
          })()
        : null}
      {mode && build ? (
        <BuildPanel config={config} setConfig={setConfig} build={build} setBuild={(fn) => setBuild((b) => (b ? fn(b) : b))} save={saveState} onExit={() => setBuild(null)} />
      ) : null}

      {mode && !sel && !build ? (
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
              {plan.theme === 'interior' && canEdit ? (
                <button
                  className="c7"
                  onClick={() => {
                    setPanel(false);
                    setSel(null);
                    setFollowing(false);
                    setDressingId(null);
                    setBuild({ type: null, movingId: null, rot: 0, selectedId: null, color: null });
                  }}
                >
                  🔨 ตกแต่ง
                </button>
              ) : null}
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
