import { useState } from 'react';
import { MAX_ITEMS, type WorldConfig } from './config';
import { CATALOG, CATEGORIES, infoOf, isWall, type Category } from './world/build';
import { PRESETS } from './world/palette';
import type { BuildState } from './world/scene/BuildLayer';
import type { SaveState } from './useWorldConfig';

const WALLS = ['#F7E6CF', '#FFF6E5', '#FCE8EC', '#E8F0E0', '#EAF2EF', '#F3E3D3', '#E7D5C0', '#D9C7B0'];
const FLOORS = ['#DDAA6E', '#E8DCC8', '#B87B45', '#E3C791', '#F7D9B0', '#C9A27A', '#9C7B5A', '#D8C8B0'];
const ITEM_COLORS = ['#D25E3B', '#E58B7C', '#F2A7A0', '#C9677A', '#FFD36B', '#E8A33A', '#8DB67A', '#5FA39A', '#FFFFFF', '#FFF1DC', '#8A5A3B', '#4A3328'];
const ACCENTS = ['#D25E3B', '#C9677A', '#8DB67A', '#5FA39A', '#E8A33A', '#B65F6E', '#7A4A3A', '#6B8E7F'];

const SAVE_TEXT: Record<SaveState, string> = {
  loading: 'กำลังโหลด…',
  ready: '',
  saving: '💾 กำลังบันทึก…',
  saved: '✅ บันทึกแล้ว',
  error: '⚠️ บันทึกไม่สำเร็จ',
  readonly: '🔒 บัญชีนี้แก้ไขไม่ได้',
  demo: '🧪 DEMO: ไม่บันทึกถาวร',
};

function Swatches({ list, value, onPick }: { list: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {list.map((c) => (
        <button key={c} className={`sw ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  );
}

/** Decorate mode: add and move furniture, paint the walls and floor, or pick a ready-made style. */
export function BuildPanel({
  config,
  setConfig,
  build,
  setBuild,
  save,
  onExit,
}: {
  config: WorldConfig;
  setConfig: (fn: (c: WorldConfig) => WorldConfig) => void;
  build: BuildState;
  setBuild: (fn: (b: BuildState) => BuildState) => void;
  save: SaveState;
  onExit: () => void;
}) {
  const [tab, setTab] = useState<'items' | 'paint' | 'style'>('items');
  const [cat, setCat] = useState<Category>('plants');
  const sel = config.items.find((i) => i.id === build.selectedId);
  const full = config.items.length >= MAX_ITEMS;

  return (
    <div className="sheet build">
      <div className="sheet-grip" />
      <button className="sheet-x" onClick={onExit} aria-label="เสร็จ">
        ✕
      </button>
      <div className="sh-title">
        <span className="sh-icon gold">🔨</span>
        <div>
          <h2>ตกแต่งร้าน</h2>
          <div className="sub">
            {config.items.length}/{MAX_ITEMS} ชิ้น {SAVE_TEXT[save] ? `· ${SAVE_TEXT[save]}` : ''}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>
          🪴 ของตกแต่ง
        </button>
        <button className={tab === 'paint' ? 'on' : ''} onClick={() => setTab('paint')}>
          🎨 สีร้าน
        </button>
        <button className={tab === 'style' ? 'on' : ''} onClick={() => setTab('style')}>
          ✨ แบบสำเร็จรูป
        </button>
      </div>

      {tab === 'items' ? (
        <>
          <div className="hint">
            {build.type ? (isWall(build.type) ? '👆 เลื่อนไปใกล้ผนังซ้าย/ขวา แล้วแตะเพื่อติด (วงเขียว = ติดได้)' : '👆 แตะพื้นเพื่อวาง (วงเขียว = วางได้ วงแดง = วางไม่ได้)') : sel ? `✋ เลือก “${infoOf(sel.type).name}” อยู่` : 'เลือกของจากด้านล่างแล้วแตะพื้น หรือแตะของที่วางไว้เพื่อแก้'}
          </div>
          <div className="cats">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <div className="catalog">
            {CATALOG.filter((c) => c.cat === cat).map((c) => (
              <button
                key={c.type}
                disabled={full && build.type !== c.type}
                className={build.type === c.type && !build.movingId ? 'on' : ''}
                onClick={() => setBuild((b) => ({ ...b, type: b.type === c.type && !b.movingId ? null : c.type, movingId: null, selectedId: null }))}
              >
                <span>{c.emoji}</span>
                {c.name}
              </button>
            ))}
          </div>
          {build.type || sel ? (
            <div className="drow">
              <label>สีของชิ้นนี้</label>
              <div className="swatches">
                <button
                  className={`sw auto ${(sel ? !sel.color : !build.color) ? 'on' : ''}`}
                  onClick={() => (sel && !build.type ? setConfig((c) => ({ ...c, items: c.items.map((i) => (i.id === sel.id ? { ...i, color: undefined } : i)) })) : setBuild((b) => ({ ...b, color: null })))}
                  aria-label="สีเดิม"
                >
                  ↺
                </button>
                {ITEM_COLORS.map((col) => (
                  <button
                    key={col}
                    className={`sw ${(sel && !build.type ? sel.color : build.color)?.toLowerCase() === col.toLowerCase() ? 'on' : ''}`}
                    style={{ background: col }}
                    aria-label={col}
                    onClick={() => (sel && !build.type ? setConfig((c) => ({ ...c, items: c.items.map((i) => (i.id === sel.id ? { ...i, color: col } : i)) })) : setBuild((b) => ({ ...b, color: col })))}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="dact">
            {build.type ? (
              <>
                <button onClick={() => setBuild((b) => ({ ...b, rot: (b.rot + 1) % 4 }))}>↻ หมุน</button>
                <button onClick={() => setBuild((b) => ({ ...b, type: null, movingId: null }))}>ยกเลิก</button>
              </>
            ) : sel ? (
              <>
                <button onClick={() => setConfig((c) => ({ ...c, items: c.items.map((i) => (i.id === sel.id ? { ...i, rot: (i.rot + 1) % 4 } : i)) }))}>↻ หมุน</button>
                <button onClick={() => setBuild((b) => ({ ...b, type: sel.type, movingId: sel.id, rot: sel.rot }))}>✋ ย้าย</button>
                <button
                  onClick={() => {
                    setConfig((c) => ({ ...c, items: c.items.filter((i) => i.id !== sel.id) }));
                    setBuild((b) => ({ ...b, selectedId: null }));
                  }}
                >
                  🗑 ลบ
                </button>
              </>
            ) : null}
            {config.items.length ? (
              <button
                onClick={() => {
                  setConfig((c) => ({ ...c, items: [] }));
                  setBuild((b) => ({ ...b, selectedId: null, type: null, movingId: null }));
                }}
              >
                ล้างทั้งหมด
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'paint' ? (
        <>
          <div className="drow">
            <label>สีผนัง</label>
            <Swatches list={WALLS} value={config.paint.wall} onPick={(c) => setConfig((cf) => ({ ...cf, paint: { ...cf.paint, wall: c } }))} />
          </div>
          <div className="drow">
            <label>สีพื้น</label>
            <Swatches list={FLOORS} value={config.paint.floor} onPick={(c) => setConfig((cf) => ({ ...cf, paint: { ...cf.paint, floor: c } }))} />
          </div>
          <div className="drow">
            <label>สีเด่น (หลังคา โซฟา พรม)</label>
            <Swatches list={ACCENTS} value={config.paint.accent} onPick={(c) => setConfig((cf) => ({ ...cf, paint: { ...cf.paint, accent: c } }))} />
          </div>
          <div className="dact">
            <button onClick={() => setConfig((cf) => ({ ...cf, paint: {} }))}>↩ ใช้สีของแบบที่เลือก</button>
          </div>
          <div className="hint">เปลี่ยนสีแล้วฉากจะโหลดใหม่แป๊บหนึ่ง</div>
        </>
      ) : null}

      {tab === 'style' ? (
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={config.preset === p.id ? 'on' : ''} onClick={() => setConfig((cf) => ({ ...cf, preset: p.id, paint: {} }))}>
              <span className="pe">{p.emoji}</span>
              <b>{p.name}</b>
              <span className="dots">
                {[p.look.wall, p.look.floorA, p.tokens.sofa ?? '#E7876A', p.tokens.roof ?? '#D25E3B'].map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="dact">
        <button className="go" onClick={onExit}>
          เสร็จ
        </button>
      </div>
    </div>
  );
}
