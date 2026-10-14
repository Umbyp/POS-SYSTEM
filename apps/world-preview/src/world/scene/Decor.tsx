import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';
import { C } from '../palette';
import { Ball, Blob, Cyl, Glow, Rbox, type V3 } from './parts';

export function Tree({ pos, s = 1, tone = 0 }: { pos: V3; s?: number; tone?: number }) {
  const leaf = tone ? C.leafDark : C.leaf;
  return (
    <group position={pos} scale={s}>
      <Blob pos={[0, 0, 0]} r={1.1} />
      <Cyl pos={[0, 0.6, 0]} rTop={0.18} rBottom={0.26} h={1.2} color={C.trunk} seg={10} />
      <Ball pos={[0, 1.8, 0]} r={1.0} color={leaf} />
      <Ball pos={[-0.55, 1.4, 0.2]} r={0.6} color={leaf} />
      <Ball pos={[0.55, 1.5, -0.1]} r={0.65} color={leaf} />
      <Ball pos={[0.1, 2.5, 0.1]} r={0.55} color={C.leaf} />
    </group>
  );
}

const FLOWER_COLORS = [C.pink, C.yellow, C.lilac, C.white, C.pink];

export function Flowers({ pos, n = 5, spread = 0.6, s = 1 }: { pos: V3; n?: number; spread?: number; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Ball pos={[0, 0.12, 0]} r={spread} color={C.leafDark} scale={[1, 0.35, 0.8]} />
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.5;
        const rr = spread * (0.35 + ((i * 37) % 10) / 22);
        return (
          <Ball
            key={i}
            pos={[Math.cos(a) * rr, 0.3 + (i % 2) * 0.08, Math.sin(a) * rr * 0.8]}
            r={0.13}
            color={FLOWER_COLORS[i % FLOWER_COLORS.length]}
          />
        );
      })}
    </group>
  );
}

export function FlowerPot({ pos, s = 1 }: { pos: V3; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Cyl pos={[0, 0.2, 0]} rTop={0.26} rBottom={0.19} h={0.4} color={C.roof} seg={12} />
      <Ball pos={[0, 0.55, 0]} r={0.32} color={C.leaf} />
      <Ball pos={[0.1, 0.78, 0.05]} r={0.1} color={C.pink} />
      <Ball pos={[-0.12, 0.72, -0.05]} r={0.1} color={C.yellow} />
    </group>
  );
}

/** Tall lamp post with a glowing lantern. */
export function LampPost({ pos, glow }: { pos: V3; glow: number }) {
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0]} r={0.45} opacity={0.15} />
      <Cyl pos={[0, 1.1, 0]} rTop={0.06} rBottom={0.09} h={2.2} color={C.woodDark} seg={8} />
      <Rbox pos={[0, 2.35, 0]} size={[0.42, 0.1, 0.42]} r={0.04} color={C.woodDark} />
      <Glow pos={[0, 2.6, 0]} r={0.2} color={C.glow} strength={glow} />
    </group>
  );
}

/** Hanging paper lantern (used on strings and awnings). */
export function Lantern({ pos, color = C.glow, glow, r = 0.16 }: { pos: V3; color?: string; glow: number; r?: number }) {
  return <Glow pos={pos} r={r} color={color} strength={glow} />;
}

/** A string of fairy lights sagging between two points. */
export function StringLights({ from, to, glow, n = 7, sag = 0.5 }: { from: V3; to: V3; glow: number; n?: number; sag?: number }) {
  const colors = [C.glow, C.pink, C.yellow, C.lilac];
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const t = (i + 0.5) / n;
        const y = from[1] + (to[1] - from[1]) * t - Math.sin(Math.PI * t) * sag;
        return (
          <Glow
            key={i}
            pos={[from[0] + (to[0] - from[0]) * t, y, from[2] + (to[2] - from[2]) * t]}
            r={0.075}
            color={colors[i % colors.length]}
            strength={glow}
          />
        );
      })}
    </group>
  );
}

export function Pole({ pos, h = 2.6 }: { pos: V3; h?: number }) {
  return <Cyl pos={[pos[0], h / 2, pos[2]]} rTop={0.07} rBottom={0.09} h={h} color={C.woodDark} seg={8} />;
}

/** Drifting smoke puffs for the kitchen chimney. */
export function Smoke({ pos }: { pos: V3 }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    const grp = g.current;
    if (!grp) return;
    grp.children.forEach((puff, i) => {
      const t = (clock.elapsedTime * 0.35 + i / 3) % 1;
      puff.position.set(Math.sin(t * 5 + i) * 0.12 + t * 0.35, t * 1.5, 0);
      const s = 0.18 + t * 0.35;
      puff.scale.set(s, s, s);
    });
  });
  return (
    <group position={pos} ref={g}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} userData={{ noBake: true }}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
