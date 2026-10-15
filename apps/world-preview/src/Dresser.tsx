import type { PersonCfg } from './config';
import type { Staff } from './types';
import {
  ACCENT_CHOICES, BOW_CHOICES, HAIR_CHOICES, HAIR_STYLES, PATTERN_CHOICES, SKIN_CHOICES, TOP_CHOICES, dressed,
} from './world/characters/people';

function Swatches({ list, value, onPick }: { list: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {list.map((c) => (
        <button key={c} className={`sw ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
      ))}
    </div>
  );
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** The dressing room: pick hair, colours, outfit, accessories and size; changes show on the character at once. */
export function Dresser({
  staff,
  cfg,
  onChange,
  onReplace,
  onClose,
}: {
  staff: Staff;
  cfg: PersonCfg | undefined;
  onChange: (patch: Partial<PersonCfg>) => void;
  onReplace: (next: PersonCfg | undefined) => void;
  onClose: () => void;
}) {
  const d = dressed(staff, cfg);
  const { look, outfit } = d;
  return (
    <div className="sheet dresser">
      <div className="sheet-grip" />
      <button className="sheet-x" onClick={onClose} aria-label="เสร็จ">
        ✕
      </button>
      <div className="sh-title">
        <span className="sh-icon pink">✏️</span>
        <div>
          <h2>แต่งตัว</h2>
          <div className="sub">{staff.name} · เปลี่ยนแล้วบันทึกให้เอง</div>
        </div>
      </div>

      <div className="drow">
        <label>ชื่อเล่น</label>
        <input value={cfg?.nick ?? ''} maxLength={24} placeholder={staff.name} onChange={(e) => onChange({ nick: e.target.value })} />
      </div>
      <div className="drow">
        <label>ทรงผม</label>
        <div className="chips2">
          {HAIR_STYLES.map((h) => (
            <button key={h.id} className={look.style === h.id ? 'on' : ''} onClick={() => onChange({ style: h.id })}>
              {h.name}
            </button>
          ))}
        </div>
      </div>
      <div className="drow">
        <label>สีผม</label>
        <Swatches list={HAIR_CHOICES} value={look.hair} onPick={(c) => onChange({ hair: c })} />
      </div>
      <div className="drow">
        <label>สีผิว</label>
        <Swatches list={SKIN_CHOICES} value={look.skin} onPick={(c) => onChange({ skin: c })} />
      </div>
      <div className="drow">
        <label>สีเสื้อ</label>
        <Swatches list={TOP_CHOICES} value={outfit.top} onPick={(c) => onChange({ top: c })} />
      </div>
      <div className="drow">
        <label>ลายเสื้อ</label>
        <div className="chips2">
          {PATTERN_CHOICES.map((p) => (
            <button key={p.id} className={outfit.pattern === p.id ? 'on' : ''} onClick={() => onChange({ pattern: p.id })}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="drow">
        <label>สีเสริม</label>
        <Swatches list={ACCENT_CHOICES} value={outfit.accent} onPick={(c) => onChange({ accent: c })} />
      </div>
      <div className="drow">
        <label>สีโบว์/ที่คาดผม</label>
        <Swatches list={BOW_CHOICES} value={look.bow} onPick={(c) => onChange({ bow: c })} />
      </div>
      <div className="drow">
        <label>ของแต่ง</label>
        <div className="chips2">
          <button className={!look.extra ? 'on' : ''} onClick={() => onChange({ extra: undefined })}>
            ไม่มี
          </button>
          <button className={look.extra === 'glasses' ? 'on' : ''} onClick={() => onChange({ extra: 'glasses' })}>
            👓 แว่น
          </button>
          <button className={look.extra === 'flower' ? 'on' : ''} onClick={() => onChange({ extra: 'flower' })}>
            🌸 ดอกไม้
          </button>
        </div>
      </div>
      <div className="drow">
        <label>ส่วนสูง</label>
        <input type="range" min={0.9} max={1.12} step={0.01} value={look.height} onChange={(e) => onChange({ height: Number(e.target.value) })} />
      </div>
      <div className="drow">
        <label>ความป้อม</label>
        <input type="range" min={0.95} max={1.1} step={0.01} value={look.girth} onChange={(e) => onChange({ girth: Number(e.target.value) })} />
      </div>

      <div className="dact">
        <button
          onClick={() =>
            onReplace({
              nick: cfg?.nick,
              style: pick(HAIR_STYLES).id,
              hair: pick(HAIR_CHOICES),
              skin: pick(SKIN_CHOICES),
              top: pick(TOP_CHOICES),
              accent: pick(ACCENT_CHOICES),
              pattern: pick(PATTERN_CHOICES).id,
              bow: pick(BOW_CHOICES),
              extra: pick([undefined, 'glasses', 'flower'] as const),
              height: 0.9 + Math.random() * 0.22,
              girth: 0.95 + Math.random() * 0.15,
            })
          }
        >
          🎲 สุ่ม
        </button>
        <button onClick={() => onReplace(undefined)}>↩ กลับค่าเดิม</button>
        <button className="go" onClick={onClose}>
          เสร็จ
        </button>
      </div>
    </div>
  );
}
