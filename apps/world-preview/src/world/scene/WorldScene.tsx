import { Ambient } from './Ambient';
import { FestivalLive, FestivalStatic, type Festival } from './Festival';
import { Pet } from '../characters/Pet';
import type { PickFn, Selection } from '../../selection';
import { useMemo } from 'react';
import type { MenuItem, RestaurantTable, Staff } from '../../types';
import { Director, type FeedItem } from '../sim/Director';
import type { OrderView } from '../sim/orders';
import { C, DAY, NIGHT } from '../palette';
import { inRect, rng, type Rect, type WorldPlan } from '../layout';
import { Ball, Rbox } from './parts';
import { Bake } from './Bake';
import { Counter, Kitchen, Lounge, Office, PhotoCorner, Table } from './Buildings';
import { Flowers, FlowerPot, LampPost, Pole, StringLights, Tree } from './Decor';
import { GiantFood } from './Foods';
import { GardenWing } from './Garden';
import { FerrisWheel, ParkLawn, Tower, WheelLegs } from './Landmarks';
import { Stall } from './Stall';
import { InteriorLive, InteriorStatic } from './Interior';

const cx = (r: Rect) => (r.x0 + r.x1) / 2;
const cz = (r: Rect) => (r.z0 + r.z1) / 2;

function Cobbles({ plaza, seed }: { plaza: Rect; seed: number }) {
  const stones = useMemo(() => {
    const r = rng(seed);
    const area = (plaza.x1 - plaza.x0) * (plaza.z1 - plaza.z0);
    return Array.from({ length: Math.min(160, Math.round(area / 4.5)) }).map(() => ({
      x: plaza.x0 + 0.6 + r() * (plaza.x1 - plaza.x0 - 1.2),
      z: plaza.z0 + 0.6 + r() * (plaza.z1 - plaza.z0 - 1.2),
      s: 0.22 + r() * 0.2,
      c: r() < 0.33 ? C.cobbleDark : C.cream,
    }));
  }, [plaza, seed]);
  return (
    <group>
      {stones.map((st, i) => (
        <mesh key={i} position={[st.x, 0.135, st.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[st.s, 8]} />
          <meshLambertMaterial color={st.c} />
        </mesh>
      ))}
    </group>
  );
}

function Ground({ plan }: { plan: WorldPlan }) {
  const { plate, plaza } = plan;
  const w = plate.x1 - plate.x0;
  const d = plate.z1 - plate.z0;
  return (
    <group>
      <Rbox pos={[cx(plate), -0.35, cz(plate)]} size={[w + 1.4, 0.7, d + 1.4]} r={0.5} color={C.slabEdge} />
      <Rbox pos={[cx(plate), -0.02, cz(plate)]} size={[w, 0.3, d]} r={0.45} color={C.grass} />
      {plan.roads.map((r, i) => (
        <Rbox
          key={i}
          pos={[cx(r), 0.07 + (i === 0 ? 0 : 0.0), cz(r)]}
          size={[r.x1 - r.x0, i === 0 ? 0.16 : 0.14, r.z1 - r.z0]}
          r={0.18}
          color={C.cobble}
        />
      ))}
      <Cobbles plaza={plaza} seed={7} />
    </group>
  );
}

/** Trees, bushes and flower beds on every patch of grass that nothing else uses. */
function Scatter({ plan }: { plan: WorldPlan }) {
  const items = useMemo(() => {
    const r = rng(plan.tier.charCodeAt(0) * 31 + plan.tableSpots.length);
    const { plate, occupied } = plan;
    const out: { kind: 'tree' | 'bush' | 'flower' | 'pot'; x: number; z: number; s: number; tone: number }[] = [];
    const free = (x: number, z: number, pad: number) => !occupied.some((o) => inRect(o, x, z, pad));
    const spaced = (x: number, z: number, gap: number) => !out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap);

    // dense ring of trees along the edge of the plate
    const margin = 1.3;
    const ring = (x: number, z: number) => {
      if (!spaced(x, z, 2.2)) return;
      out.push({ kind: 'tree', x, z, s: 0.95 + r() * 0.45, tone: r() < 0.4 ? 1 : 0 });
    };
    for (let x = plate.x0 + margin; x <= plate.x1 - margin; x += 3.2 + r()) {
      ring(x, plate.z0 + margin + r() * 0.5);
      ring(x, plate.z1 - margin - r() * 0.5);
    }
    for (let z = plate.z0 + margin + 3; z <= plate.z1 - margin - 3; z += 3.2 + r()) {
      ring(plate.x0 + margin + r() * 0.5, z);
      ring(plate.x1 - margin - r() * 0.5, z);
    }
    // fill the rest
    const area = (plate.x1 - plate.x0) * (plate.z1 - plate.z0);
    const tries = Math.round(area / 3);
    for (let i = 0; i < tries; i++) {
      const x = plate.x0 + 2 + r() * (plate.x1 - plate.x0 - 4);
      const z = plate.z0 + 2 + r() * (plate.z1 - plate.z0 - 4);
      if (!free(x, z, 1.2)) continue;
      const k = r();
      if (k < 0.34 && spaced(x, z, 2.6)) out.push({ kind: 'tree', x, z, s: 0.8 + r() * 0.5, tone: r() < 0.4 ? 1 : 0 });
      else if (k < 0.6 && spaced(x, z, 1.6)) out.push({ kind: 'bush', x, z, s: 0.7 + r() * 0.5, tone: r() < 0.5 ? 1 : 0 });
      else if (k < 0.92 && spaced(x, z, 1.7)) out.push({ kind: 'flower', x, z, s: 0.8 + r() * 0.5, tone: 0 });
      else if (spaced(x, z, 1.4)) out.push({ kind: 'pot', x, z, s: 1, tone: 0 });
    }
    return out;
  }, [plan]);

  return (
    <group>
      {items.map((p, i) =>
        p.kind === 'tree' ? (
          <Tree key={i} pos={[p.x, 0, p.z]} s={p.s} tone={p.tone} />
        ) : p.kind === 'bush' ? (
          <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
            <Ball pos={[0, 0.45, 0]} r={0.7} color={p.tone ? C.leafDark : C.leaf} scale={[1.2, 0.8, 1]} />
            <Ball pos={[0.5, 0.35, 0.2]} r={0.45} color={C.leaf} />
          </group>
        ) : p.kind === 'flower' ? (
          <Flowers key={i} pos={[p.x, 0, p.z]} n={6} spread={0.8} s={p.s} />
        ) : (
          <FlowerPot key={i} pos={[p.x, 0, p.z]} />
        ),
      )}
    </group>
  );
}

function Town({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { ks, kitchen, counter, office, photo, lounge, plaza } = plan;
  return (
    <>
      <Ground plan={plan} />

      {/* the three work buildings grow with the town; giant food on the roofs */}
      <group position={[kitchen.x, 0, kitchen.z]} scale={ks}>
        <Kitchen pos={[0, 0, 0]} glow={glow} />
        <GiantFood kind="noodle" pos={[0, 4.2, 0]} s={1.5} />
      </group>
      <group position={[counter.x, 0, counter.z]} scale={ks}>
        <Counter pos={[0, 0, 0]} glow={glow} />
        <GiantFood kind="donut" pos={[0, 2.5, -1.2]} s={1.3} />
      </group>
      <group position={[office.x, 0, office.z]} scale={ks}>
        <Office pos={[0, 0, 0]} glow={glow} />
      </group>
      <PhotoCorner pos={[photo.x, 0, photo.z]} glow={glow} />
      <Lounge pos={[lounge.x, 0, lounge.z]} glow={glow} />

      {plan.stalls.map((s, i) => (
        <Stall key={i} pos={[s.x, 0, s.z]} rotY={s.rotY} variant={s.variant} glow={glow} />
      ))}
      {plan.wings
        .filter((w) => w.kind === 'garden')
        .map((w, i) => (
          <GardenWing key={i} x0={w.x0} x1={w.x1} z0={w.z0} z1={w.z1} />
        ))}
      {plan.park ? (
        <>
          <ParkLawn park={plan.park} glow={glow} />
          <WheelLegs pos={[plan.park.x1 - 9, 0, cz(plan.park)]} s={1.1} />
        </>
      ) : null}
      {plan.towers.map((t, i) => (
        <Tower key={i} pos={[t.x, 0, t.z]} s={t.s} glow={glow} />
      ))}

      {plan.lamps.map((p, i) => (
        <LampPost key={i} pos={[p.x, 0, p.z]} glow={glow} />
      ))}
      {/* string lights over the plaza */}
      {[plaza.z0 + 1.2, plaza.z1 - 1.2].map((z) => (
        <group key={z}>
          <Pole pos={[plaza.x0 - 1.2, 0, z]} h={2.7} />
          <Pole pos={[plaza.x1 + 1.2, 0, z]} h={2.7} />
          <StringLights
            from={[plaza.x0 - 1.2, 2.7, z]}
            to={[plaza.x1 + 1.2, 2.7, z]}
            glow={glow}
            n={Math.round((plaza.x1 - plaza.x0) / 1.7)}
            sag={0.8}
          />
        </group>
      ))}

      <Scatter plan={plan} />
    </>
  );
}

export function WorldScene({
  tables,
  isDark,
  plan,
  staff,
  orders,
  menu,
  demo,
  showNames,
  onFeed,
  onPick,
  selection,
  festival,
}: {
  tables: RestaurantTable[];
  isDark: boolean;
  plan: WorldPlan;
  staff: Staff[];
  orders: OrderView[] | null;
  menu: MenuItem[];
  demo: boolean;
  showNames: boolean;
  onFeed: (f: Omit<FeedItem, 'id'>) => void;
  onPick: PickFn;
  selection: Selection | null;
  festival: Festival;
}) {
  const base = isDark ? NIGHT : DAY;
  // indoors the lamps are on, so the night room stays bright and warm
  const mood = isDark && plan.theme === 'interior' ? { ...base, background: '#5C4458', ambient: '#F2DDE0', ambientIntensity: 1.6, sunIntensity: 1.3 } : base;
  const sorted = useMemo(
    () => [...tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [tables],
  );
  return (
    <>
      <color attach="background" args={[mood.background]} />
      {plan.theme === 'town' ? <fog attach="fog" args={[mood.background, 140, 460]} /> : null}
      <ambientLight color={mood.ambient} intensity={mood.ambientIntensity} />
      <directionalLight color={mood.sun} intensity={mood.sunIntensity} position={[plan.center.x - 10, 22, plan.center.z + 14]} />

      <Bake deps={[isDark, plan]}>
        {plan.theme === 'interior' ? <InteriorStatic plan={plan} glow={mood.glow} /> : <Town plan={plan} glow={mood.glow} />}
      </Bake>
      {plan.theme === 'interior' ? <InteriorLive plan={plan} menu={menu} demo={demo} /> : null}
      <Bake deps={[isDark, plan, festival]}>
        <FestivalStatic plan={plan} festival={festival} />
      </Bake>
      <FestivalLive plan={plan} festival={festival} />
      <Ambient plan={plan} isDark={isDark} festival={festival} />
      <Pet plan={plan} selected={selection?.kind === 'pet'} onPick={onPick} />
      {plan.park ? <FerrisWheel pos={[plan.park.x1 - 9, 0, cz(plan.park)]} s={1.1} /> : null}

      {/* tables follow the real data, so they are baked separately */}
      <Bake deps={[isDark, tables, plan]}>
        {plan.tableSpots.map((s, i) => (
          <Table
            key={sorted[i]?.id ?? i}
            pos={[s.x, 0.14, s.z]}
            scale={s.scale}
            variant={i}
            long={s.kind === 'long'}
            lit={sorted[i]?.status === 'OCCUPIED' || sorted[i]?.status === 'BILLING'}
          />
        ))}
      </Bake>

      {/* invisible tap targets on the real tables (the tables themselves are baked) */}
      {plan.tableSpots.slice(0, sorted.length).map((s, i) => (
        <mesh
          key={sorted[i].id}
          position={[s.x, 0.6, s.z]}
          onClick={(e) => {
            e.stopPropagation();
            onPick({ kind: 'table', idx: i }, s.x, s.z);
          }}
        >
          {s.kind === 'long' ? <boxGeometry args={[4.2, 0.5, 1.8]} /> : <cylinderGeometry args={[1.15 * s.scale, 1.15 * s.scale, 0.5, 18]} />}
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {/* ring around the selected table */}
      {selection?.kind === 'table' && plan.tableSpots[selection.idx] ? (
        <mesh position={[plan.tableSpots[selection.idx].x, 0.2, plan.tableSpots[selection.idx].z]} rotation={[-Math.PI / 2, 0, 0]}>
          {plan.tableSpots[selection.idx].kind === 'long' ? <ringGeometry args={[2.6, 2.85, 40]} /> : <ringGeometry args={[1.9 * plan.tableSpots[selection.idx].scale, 2.1 * plan.tableSpots[selection.idx].scale, 40]} />}
          <meshBasicMaterial color="#FFB020" transparent opacity={0.9} depthTest={false} />
        </mesh>
      ) : null}

      <Director
        plan={plan}
        staff={staff}
        tables={tables}
        orders={orders}
        showNames={showNames}
        onFeed={onFeed}
        onPick={onPick}
        selectedId={selection?.kind === 'person' ? selection.id : null}
      />
    </>
  );
}
