import { useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';
import { C } from '../palette';
import type { Rect } from '../layout';
import { Ball, Blob, Rbox, Torus, type V3 } from './parts';
import { Roof } from './Buildings';
import { Flowers, FlowerPot, Lantern, Tree } from './Decor';
import { GiantFood } from './Foods';
import { Bench, Fountain, Hedge } from './Garden';

/** A tall three-tier tower with a giant cake on top: the big landmark of a large town. */
export function Tower({ pos, s = 1, glow }: { pos: V3; s?: number; glow: number }) {
  return (
    <group position={pos} scale={s}>
      <Blob pos={[0, 0, 0]} r={4.4} opacity={0.2} />
      <Rbox pos={[0, 1.4, 0]} size={[6.4, 2.8, 6.4]} r={0.25} color={C.wall} />
      <Roof pos={[0, 2.8, 0]} w={7.2} d={7.2} h={1.1} color={C.navy} />
      <Rbox pos={[0, 4.4, 0]} size={[4.8, 2.4, 4.8]} r={0.22} color={C.cream2} />
      <Roof pos={[0, 5.6, 0]} w={5.6} d={5.6} h={1.0} color={C.roof} />
      <Rbox pos={[0, 7.0, 0]} size={[3.2, 2.0, 3.2]} r={0.2} color={C.wall} />
      <Roof pos={[0, 8.0, 0]} w={4.0} d={4.0} h={1.0} color={C.navy} />
      <GiantFood kind="cake" pos={[0, 8.9, 0]} s={1.9} />
      {/* windows + door */}
      {[-1.8, 0, 1.8].map((x) => (
        <Rbox key={x} pos={[x, 1.6, 3.25]} size={[0.8, 1.0, 0.08]} r={0.04} color={glow > 0.5 ? C.glow : C.sky} />
      ))}
      <Rbox pos={[0, 0.9, 3.25]} size={[1.1, 1.8, 0.1]} r={0.06} color={C.wood} />
      {[-1.4, 1.4].map((x) => (
        <Rbox key={x} pos={[x, 4.5, 2.45]} size={[0.8, 0.9, 0.08]} r={0.04} color={glow > 0.5 ? C.glow : C.sky} />
      ))}
      <Lantern pos={[-2.6, 2.2, 3.6]} glow={glow} />
      <Lantern pos={[2.6, 2.2, 3.6]} glow={glow} color={C.pink} />
      <FlowerPot pos={[-1.8, 0, 3.9]} s={1.2} />
      <FlowerPot pos={[1.8, 0, 3.9]} s={1.2} />
    </group>
  );
}

/** Ferris wheel: static A-frame legs (baked with the town) + a slowly turning wheel (live). */
export function WheelLegs({ pos, s = 1 }: { pos: V3; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Blob pos={[0, 0, 0]} r={3.2} opacity={0.18} />
      <Rbox pos={[-1.7, 3.0, 0.5]} size={[0.35, 6.4, 0.35]} r={0.1} color={C.white} rot={[0, 0, -0.28]} />
      <Rbox pos={[1.7, 3.0, 0.5]} size={[0.35, 6.4, 0.35]} r={0.1} color={C.white} rot={[0, 0, 0.28]} />
      <Rbox pos={[-1.7, 3.0, -0.5]} size={[0.35, 6.4, 0.35]} r={0.1} color={C.white} rot={[0, 0, -0.28]} />
      <Rbox pos={[1.7, 3.0, -0.5]} size={[0.35, 6.4, 0.35]} r={0.1} color={C.white} rot={[0, 0, 0.28]} />
      <Ball pos={[0, 6.2, 0]} r={0.55} color={C.gold} />
    </group>
  );
}

const GONDOLA_COLORS = [C.pink, C.yellow, C.mint, C.lilac, C.sofa, C.sky];

export function FerrisWheel({ pos, s = 1 }: { pos: V3; s?: number }) {
  const spin = useRef<Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.z += dt * 0.12;
  });
  const N = 10;
  return (
    <group position={[pos[0], pos[1] + 6.2 * s, pos[2]]} scale={s}>
      <group ref={spin}>
        <Torus pos={[0, 0, 0.6]} r={4.2} tube={0.14} color={C.white} />
        <Torus pos={[0, 0, -0.6]} r={4.2} tube={0.14} color={C.white} />
        {Array.from({ length: N }).map((_, i) => {
          const a = (i / N) * Math.PI * 2;
          return (
            <group key={i}>
              <mesh position={[Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0]} rotation={[0, 0, a]}>
                <boxGeometry args={[4.2, 0.1, 0.1]} />
                <meshLambertMaterial color={C.white} />
              </mesh>
              <mesh position={[Math.cos(a) * 4.3, Math.sin(a) * 4.3 - 0.4, 0]}>
                <boxGeometry args={[0.9, 0.75, 1.1]} />
                <meshLambertMaterial color={GONDOLA_COLORS[i % GONDOLA_COLORS.length]} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/** Front lawn: central fountain, flower rings, benches, and trees at the edges. */
export function ParkLawn({ park, glow }: { park: Rect; glow: number }) {
  const cx = (park.x0 + park.x1) / 2;
  const cz = (park.z0 + park.z1) / 2;
  const w = park.x1 - park.x0;
  return (
    <group>
      <Fountain pos={[cx, 0, cz]} s={1.15} />
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <Flowers key={i} pos={[cx + Math.cos(a) * 5.2, 0, cz + Math.sin(a) * 4]} n={5} spread={0.7} />;
      })}
      <Bench pos={[cx - 7.5, 0, cz]} rotY={Math.PI / 2} />
      <Bench pos={[cx + 7.5, 0, cz]} rotY={-Math.PI / 2} />
      <Hedge pos={[cx - w / 4, 0, park.z1 - 0.6]} len={w / 2 - 4} />
      <Hedge pos={[cx + w / 4, 0, park.z1 - 0.6]} len={w / 2 - 4} />
      <Lantern pos={[cx - 7.5, 1.6, cz - 1.2]} glow={glow} />
      <Lantern pos={[cx + 7.5, 1.6, cz + 1.2]} glow={glow} color={C.pink} />
      <Tree pos={[park.x0 + 2, 0, cz]} s={1.2} />
      <Tree pos={[park.x1 - 2, 0, cz]} s={1.2} tone={1} />
    </group>
  );
}

