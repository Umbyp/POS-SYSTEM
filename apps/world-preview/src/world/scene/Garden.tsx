import { C } from '../palette';
import { Ball, Blob, Cyl, Rbox, type V3 } from './parts';
import { Flowers, Tree } from './Decor';

/** A pond with a stone rim and lily pads. */
export function Pond({ pos, rx, rz }: { pos: V3; rx: number; rz: number }) {
  const stones = Array.from({ length: 22 }).map((_, i) => {
    const a = (i / 22) * Math.PI * 2;
    return { x: Math.cos(a) * (rx + 0.2), z: Math.sin(a) * (rz + 0.2), r: 0.32 + ((i * 7) % 5) / 25 };
  });
  return (
    <group position={pos}>
      <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx, rz, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshLambertMaterial color={C.water} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx * 0.55, rz * 0.55, 1]}>
        <circleGeometry args={[1, 20]} />
        <meshLambertMaterial color={C.waterDeep} />
      </mesh>
      {stones.map((s, i) => (
        <Ball key={i} pos={[s.x, 0.24, s.z]} r={s.r} color={i % 3 ? C.stone : '#DDD5C8'} scale={[1, 0.7, 1]} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[Math.cos(i * 1.7) * rx * 0.5, 0.2, Math.sin(i * 1.7) * rz * 0.5]}>
          <Cyl pos={[0, 0, 0]} rTop={0.4} h={0.04} color={C.leaf} seg={12} />
          {i % 2 === 0 ? <Ball pos={[0.05, 0.1, 0]} r={0.12} color={C.pink} /> : null}
        </group>
      ))}
    </group>
  );
}

/** Round tiered fountain. */
export function Fountain({ pos, s = 1 }: { pos: V3; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <Blob pos={[0, 0, 0]} r={3} opacity={0.15} />
      <Cyl pos={[0, 0.25, 0]} rTop={2.4} rBottom={2.5} h={0.5} color={C.stone} seg={28} />
      <Cyl pos={[0, 0.54, 0]} rTop={2.1} h={0.06} color={C.water} seg={28} />
      <Cyl pos={[0, 0.9, 0]} rTop={0.25} rBottom={0.4} h={0.8} color={C.stone} seg={12} />
      <Cyl pos={[0, 1.35, 0]} rTop={1.1} rBottom={0.7} h={0.18} color={C.stone} seg={20} />
      <Cyl pos={[0, 1.46, 0]} rTop={0.95} h={0.05} color={C.water} seg={20} />
      <Cyl pos={[0, 1.8, 0]} rTop={0.12} rBottom={0.2} h={0.7} color={C.stone} seg={10} />
      <Ball pos={[0, 2.25, 0]} r={0.28} color={C.water} />
    </group>
  );
}

export function Gazebo({ pos }: { pos: V3 }) {
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0]} r={2.6} opacity={0.15} />
      <Cyl pos={[0, 0.1, 0]} rTop={2.2} rBottom={2.3} h={0.2} color={C.cream} seg={6} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Cyl key={i} pos={[Math.cos((i / 6) * 6.283) * 1.8, 1.3, Math.sin((i / 6) * 6.283) * 1.8]} rTop={0.1} h={2.2} color={C.white} seg={8} />
      ))}
      <mesh position={[0, 3.1, 0]}>
        <coneGeometry args={[2.7, 1.5, 6]} />
        <meshLambertMaterial color={C.pink} />
      </mesh>
      <Ball pos={[0, 3.95, 0]} r={0.2} color={C.gold} />
      <Rbox pos={[0, 0.5, 0]} size={[1.1, 0.5, 1.1]} r={0.1} color={C.wood} />
    </group>
  );
}

export function Bench({ pos, rotY = 0 }: { pos: V3; rotY?: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0.45, 0]} size={[1.8, 0.14, 0.6]} r={0.05} color={C.wood} />
      <Rbox pos={[0, 0.85, -0.25]} size={[1.8, 0.5, 0.1]} r={0.05} color={C.wood} />
      <Rbox pos={[-0.75, 0.22, 0]} size={[0.12, 0.44, 0.5]} r={0.03} color={C.woodDark} />
      <Rbox pos={[0.75, 0.22, 0]} size={[0.12, 0.44, 0.5]} r={0.03} color={C.woodDark} />
    </group>
  );
}

export function Hedge({ pos, len, rotY = 0 }: { pos: V3; len: number; rotY?: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0.4, 0]} size={[len, 0.8, 0.7]} r={0.3} color={C.leafDark} />
      {Array.from({ length: Math.floor(len / 1.6) }).map((_, i) => (
        <Ball key={i} pos={[-len / 2 + 0.8 + i * 1.6, 0.85, 0]} r={0.22} color={['#F7A8B8', '#FFD36B', '#FFFFFF'][i % 3]} />
      ))}
    </group>
  );
}

/** A market-side garden strip: pond, gazebo, flower beds and a few trees, laid out along z. */
export function GardenWing({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const xc = (x0 + x1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const mid = (z0 + z1) / 2;
  return (
    <group>
      <Pond pos={[xc, 0, mid]} rx={Math.min(4.4, w / 2 - 1.4)} rz={Math.min(5.5, d / 4)} />
      <Gazebo pos={[xc, 0, z0 + 4.5]} />
      <Fountain pos={[xc, 0, z1 - 4.5]} s={0.8} />
      <Hedge pos={[xc, 0, z0 + 0.8]} len={w - 2} />
      <Hedge pos={[xc, 0, z1 - 0.8]} len={w - 2} />
      <Bench pos={[x0 + 1.4, 0, mid - 3.5]} rotY={Math.PI / 2} />
      <Bench pos={[x1 - 1.4, 0, mid + 3.5]} rotY={-Math.PI / 2} />
      <Flowers pos={[x0 + 1.6, 0, mid + 2]} n={7} spread={1.0} />
      <Flowers pos={[x1 - 1.6, 0, mid - 2]} n={7} spread={1.0} />
      <Flowers pos={[xc - 3.6, 0, z0 + 8.5]} n={6} spread={0.9} />
      <Flowers pos={[xc + 3.6, 0, z1 - 9]} n={6} spread={0.9} />
      <Tree pos={[x0 + 1.4, 0, z0 + 3]} s={0.9} />
      <Tree pos={[x1 - 1.4, 0, z1 - 3]} s={1} tone={1} />
      <Tree pos={[x1 - 1.6, 0, z0 + 9]} s={0.85} />
      <Tree pos={[x0 + 1.6, 0, z1 - 9]} s={0.9} tone={1} />
    </group>
  );
}

