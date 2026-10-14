import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';
import type { WorldPlan } from '../layout';
import { Ball, Cyl, Glow, Rbox, type V3 } from './parts';

export type Festival = 'none' | 'xmas' | 'cny' | 'songkran' | 'loy';

export const FESTIVALS: { id: Festival; label: string; emoji: string }[] = [
  { id: 'none', label: 'ปกติ', emoji: '🏠' },
  { id: 'xmas', label: 'คริสต์มาส', emoji: '🎄' },
  { id: 'cny', label: 'ตรุษจีน', emoji: '🧧' },
  { id: 'songkran', label: 'สงกรานต์', emoji: '💦' },
  { id: 'loy', label: 'ลอยกระทง', emoji: '🪔' },
];

const STRING_Y = 5.3;

/** Evenly spaced points along the two rows above the aisles (where decorations hang). */
function rowPoints(plan: WorldPlan, step: number): V3[] {
  const { plaza } = plan;
  const pts: V3[] = [];
  for (const z of [plaza.z0 + 0.6, plaza.z1 - 0.6]) {
    for (let x = plaza.x0 + 0.8; x <= plaza.x1 - 0.8; x += step) {
      pts.push([x, STRING_Y - Math.sin(((x - plaza.x0) / (plaza.x1 - plaza.x0)) * Math.PI * 6) * 0.12, z]);
    }
  }
  return pts;
}

function Tree({ pos, s = 1 }: { pos: V3; s?: number }) {
  const orn = ['#D9553F', '#FFD36B', '#7BBDB3', '#F7A8B8'];
  return (
    <group position={pos} scale={s}>
      <Cyl pos={[0, 0.3, 0]} rTop={0.2} h={0.6} color="#8A5A3B" seg={8} />
      <Cyl pos={[0, 1.2, 0]} rTop={0.35} rBottom={1.25} h={1.3} color="#4FA05A" seg={14} />
      <Cyl pos={[0, 2.2, 0]} rTop={0.2} rBottom={0.95} h={1.2} color="#5BB066" seg={14} />
      <Cyl pos={[0, 3.1, 0]} rTop={0.02} rBottom={0.65} h={1.1} color="#68BF72" seg={14} />
      <Ball pos={[0, 3.75, 0]} r={0.2} color="#FFD36B" />
      <Glow pos={[0, 3.75, 0]} r={0.1} color="#FFE08A" strength={0.8} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = i * 2.4;
        const h = 0.9 + (i % 6) * 0.45;
        const rad = Math.max(0.15, 1.15 - h * 0.28);
        return <Ball key={i} pos={[Math.cos(a) * rad, h, Math.sin(a) * rad]} r={0.1} color={orn[i % 4]} />;
      })}
    </group>
  );
}

function Gift({ pos, color, ribbon, s = 1 }: { pos: V3; color: string; ribbon: string; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Rbox pos={[0, 0.3, 0]} size={[0.6, 0.6, 0.6]} r={0.05} color={color} />
      <Rbox pos={[0, 0.3, 0]} size={[0.64, 0.1, 0.64]} r={0.03} color={ribbon} />
      <Rbox pos={[0, 0.3, 0]} size={[0.1, 0.64, 0.64]} r={0.03} color={ribbon} />
      <Ball pos={[0, 0.7, 0]} r={0.1} color={ribbon} />
    </group>
  );
}

function Lantern({ pos, s = 1 }: { pos: V3; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Cyl pos={[0, 0.5, 0]} rTop={0.01} h={0.6} color="#8A5A3B" seg={4} />
      <Cyl pos={[0, 0.2, 0]} rTop={0.16} h={0.08} color="#F2C14E" seg={10} />
      <Ball pos={[0, -0.05, 0]} r={0.36} color="#D9553F" scale={[1, 0.85, 1]} />
      <Cyl pos={[0, -0.36, 0]} rTop={0.14} h={0.08} color="#F2C14E" seg={10} />
      <Cyl pos={[0, -0.62, 0]} rTop={0.02} h={0.4} color="#F2C14E" seg={4} />
      <Glow pos={[0, -0.05, 0]} r={0.14} color="#FFB36B" strength={0.7} />
    </group>
  );
}

function Flower({ pos, color }: { pos: V3; color: string }) {
  return <Ball pos={pos} r={0.17} color={color} scale={[1, 0.8, 1]} />;
}

/** The still part of a festival: baked into a few draw calls together with the room. */
export function FestivalStatic({ plan, festival }: { plan: WorldPlan; festival: Festival }) {
  if (festival === 'none') return null;
  const { plaza } = plan;
  // the side margins of the dining area are free of furniture, and visible from the usual camera
  const left: V3 = [plaza.x0 - 2.7, 0.14, plaza.z0 + 4];
  const right: V3 = [plaza.x1 + 2.7, 0.14, plaza.z0 + 4];

  if (festival === 'xmas') {
    const bulbs = ['#D9553F', '#5BB066', '#FFD36B', '#7BBDB3'];
    return (
      <>
        {rowPoints(plan, 1.2).map((p, i) => (
          <group key={i}>
            <Ball pos={p} r={0.13} color={bulbs[i % 4]} />
            {i % 3 === 0 ? <Glow pos={[p[0], p[1] - 0.05, p[2]]} r={0.06} color={bulbs[i % 4]} strength={0.8} /> : null}
          </group>
        ))}
        <Tree pos={left} s={1.15} />
        <Gift pos={[left[0] + 1.6, 0.14, left[2] + 0.4]} color="#D9553F" ribbon="#FFD36B" />
        <Gift pos={[left[0] + 2.2, 0.14, left[2] - 0.2]} color="#7BBDB3" ribbon="#FFFFFF" s={0.8} />
        <Gift pos={[left[0] - 1.6, 0.14, left[2] + 0.3]} color="#5BB066" ribbon="#D9553F" s={0.9} />
        {/* snowman */}
        <group position={right}>
          <Ball pos={[0, 0.55, 0]} r={0.62} color="#FFFFFF" />
          <Ball pos={[0, 1.4, 0]} r={0.45} color="#FFFFFF" />
          <Ball pos={[0, 2.05, 0]} r={0.33} color="#FFFFFF" />
          <Cyl pos={[0, 2.45, 0]} rTop={0.22} h={0.3} color="#3D3A4A" seg={12} />
          <Cyl pos={[0, 2.32, 0]} rTop={0.36} h={0.05} color="#3D3A4A" seg={12} />
          <mesh position={[0, 2.05, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.06, 0.3, 8]} />
            <meshLambertMaterial color="#FF8A3D" />
          </mesh>
          {[-1, 1].map((x) => (
            <Ball key={x} pos={[x * 0.12, 2.12, 0.29]} r={0.035} color="#3A2A24" />
          ))}
          {[0.5, 1.3].map((y) => (
            <Ball key={y} pos={[0, y, y > 1 ? 0.42 : 0.6]} r={0.05} color="#3A2A24" />
          ))}
          <Cyl pos={[0, 1.78, 0]} rTop={0.36} h={0.12} color="#D9553F" seg={12} />
        </group>
      </>
    );
  }

  if (festival === 'cny') {
    return (
      <>
        {rowPoints(plan, 2.6).map((p, i) => (
          <Lantern key={i} pos={[p[0], p[1] - 0.1, p[2]]} s={0.9} />
        ))}
        {/* mandarin tree */}
        <group position={left}>
          <Cyl pos={[0, 0.4, 0]} rTop={0.5} rBottom={0.35} h={0.8} color="#D9553F" seg={12} />
          <Cyl pos={[0, 0.82, 0]} rTop={0.52} h={0.06} color="#F2C14E" seg={12} />
          <Ball pos={[0, 1.6, 0]} r={1.0} color="#5BB066" scale={[1, 1.1, 1]} />
          {Array.from({ length: 9 }).map((_, i) => (
            <Ball key={i} pos={[Math.cos(i * 2.1) * 0.8, 1.2 + (i % 4) * 0.35, Math.sin(i * 2.1) * 0.8]} r={0.17} color="#FF9A2E" />
          ))}
        </group>
        {/* gold ingots and a big lantern post */}
        <group position={right}>
          {[
            [-0.4, 0],
            [0.4, 0],
            [0, 0.38],
          ].map(([x, y], i) => (
            <Ball key={i} pos={[x, 0.25 + y, 0]} r={0.36} color="#F2C14E" scale={[1.4, 0.7, 0.9]} />
          ))}
          <Cyl pos={[1.6, 1.4, 0]} rTop={0.06} h={2.8} color="#8A5A3B" seg={6} />
          <Lantern pos={[1.6, 2.6, 0]} s={1.6} />
        </group>
      </>
    );
  }

  if (festival === 'songkran') {
    const petals = ['#FFB02E', '#FF8A3D', '#F7A8B8', '#FFFFFF'];
    return (
      <>
        {rowPoints(plan, 0.9).map((p, i) => (
          <Flower key={i} pos={p} color={petals[i % 4]} />
        ))}
        {/* water bowl with floating flowers */}
        <group position={left}>
          <Cyl pos={[0, 0.35, 0]} rTop={1.3} rBottom={0.9} h={0.7} color="#D8B26A" seg={18} />
          <Cyl pos={[0, 0.62, 0]} rTop={1.15} h={0.12} color="#9ED3CC" seg={18} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Flower key={i} pos={[Math.cos(i * 1.1) * 0.7, 0.74, Math.sin(i * 1.1) * 0.7]} color={petals[i % 4]} />
          ))}
        </group>
        {/* bucket with a ladle and a little garland of flowers */}
        <group position={right}>
          <Cyl pos={[0, 0.45, 0]} rTop={0.7} rBottom={0.55} h={0.9} color="#7BBDB3" seg={16} />
          <Cyl pos={[0, 0.82, 0]} rTop={0.62} h={0.1} color="#CBE6DF" seg={16} />
          <Cyl pos={[0.9, 0.7, 0]} rTop={0.04} h={1.4} color="#8A5A3B" seg={6} rot={[0, 0, 0.9]} />
          <Cyl pos={[1.35, 1.25, 0]} rTop={0.2} rBottom={0.14} h={0.18} color="#E9C46A" seg={10} />
          {Array.from({ length: 5 }).map((_, i) => (
            <Flower key={i} pos={[-1 + i * 0.5, 0.15, 0.9]} color={petals[i % 4]} />
          ))}
        </group>
      </>
    );
  }

  // loy krathong: a little pond of krathongs by the entrance, lanterns float in FestivalLive
  const kr = [
    [-1.1, -0.6],
    [0.2, 0.7],
    [1.2, -0.3],
    [-0.2, -1.0],
    [0.9, 1.0],
  ];
  return (
    <>
      <group position={left}>
        <Cyl pos={[0.5, 0.05, 0]} rTop={2.0} h={0.12} color="#7BBDB3" seg={24} />
        {kr.map(([x, z], i) => (
          <group key={i} position={[x + 0.5, 0.18, z]}>
            <Cyl pos={[0, 0.06, 0]} rTop={0.34} rBottom={0.3} h={0.14} color="#7DB661" seg={12} />
            <Ball pos={[0, 0.2, 0]} r={0.2} color={['#F7A8B8', '#FFFFFF', '#D9B8C9'][i % 3]} scale={[1, 0.7, 1]} />
            <Cyl pos={[0, 0.34, 0]} rTop={0.03} h={0.22} color="#FFF1DC" seg={6} />
            <Glow pos={[0, 0.5, 0]} r={0.06} color="#FFC46B" strength={0.9} />
          </group>
        ))}
      </group>
      <group position={right}>
        <Cyl pos={[0, 0.3, 0]} rTop={1.0} rBottom={0.9} h={0.6} color="#7DB661" seg={18} />
        {Array.from({ length: 7 }).map((_, i) => (
          <Ball key={i} pos={[Math.cos(i * 0.9) * 0.55, 0.7, Math.sin(i * 0.9) * 0.55]} r={0.24} color={['#F7A8B8', '#FFFFFF', '#FFD36B'][i % 3]} scale={[1, 0.7, 1]} />
        ))}
        <Glow pos={[0, 1.0, 0]} r={0.12} color="#FFC46B" strength={1} />
      </group>
    </>
  );
}

/** Floating paper lanterns that bob gently (Loy Krathong only). */
function Floater({ pos, phase }: { pos: V3; phase: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = pos[1] + Math.sin(clock.elapsedTime * 0.9 + phase) * 0.25;
  });
  return (
    <group ref={g} position={pos}>
      <Ball pos={[0, 0, 0]} r={0.32} color="#FFE3A8" scale={[1, 1.25, 1]} />
      <Glow pos={[0, -0.05, 0]} r={0.16} color="#FFB347" strength={0.9} />
    </group>
  );
}

export function FestivalLive({ plan, festival }: { plan: WorldPlan; festival: Festival }) {
  if (festival !== 'loy') return null;
  const { plaza } = plan;
  const list: { pos: V3; phase: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const fx = (i * 0.618) % 1;
    const fz = (i * 0.382 + 0.17) % 1;
    list.push({
      pos: [plaza.x0 + 1 + fx * (plaza.x1 - plaza.x0 - 2), 5.2 + (i % 4) * 0.6, plaza.z0 + 0.5 + fz * (plaza.z1 - plaza.z0 - 1)],
      phase: i * 1.7,
    });
  }
  return (
    <>
      {list.map((l, i) => (
        <Floater key={i} pos={l.pos} phase={l.phase} />
      ))}
    </>
  );
}
