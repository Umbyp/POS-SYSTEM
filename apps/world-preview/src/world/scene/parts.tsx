import { useEffect, useMemo, type ReactNode } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

/** Soft-cornered box — the building block of the toy look. */
export function Rbox({
  pos = [0, 0, 0],
  size,
  r = 0.12,
  color,
  rot,
  children,
}: {
  pos?: V3;
  size: V3;
  r?: number;
  color: string;
  rot?: V3;
  children?: ReactNode;
}) {
  const [w, h, d] = size;
  const geo = useMemo(
    () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)),
    [w, h, d, r],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh position={pos} rotation={rot} geometry={geo}>
      <meshLambertMaterial color={color} />
      {children}
    </mesh>
  );
}

export function Ball({ pos, r, color, scale }: { pos: V3; r: number; color: string; scale?: V3 }) {
  return (
    <mesh position={pos} scale={scale}>
      <sphereGeometry args={[r, 12, 8]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

export function Cyl({
  pos,
  rTop,
  rBottom = rTop,
  h,
  color,
  seg = 20,
  rot,
}: {
  pos: V3;
  rTop: number;
  rBottom?: number;
  h: number;
  color: string;
  seg?: number;
  rot?: V3;
}) {
  return (
    <mesh position={pos} rotation={rot}>
      <cylinderGeometry args={[rTop, rBottom, h, seg]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

/** Fake soft shadow: a flat translucent disc on the ground. */
export function Blob({ pos, r, opacity = 0.18, scale }: { pos: V3; r: number; opacity?: number; scale?: [number, number] }) {
  return (
    <mesh position={[pos[0], 0.02, pos[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={scale ? [scale[0], scale[1], 1] : undefined}>
      <circleGeometry args={[r, 16]} />
      <meshBasicMaterial color="#5B3A1E" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** Lantern-style glow: a bright core with a larger additive halo. */
export function Glow({ pos, r, color, strength }: { pos: V3; r: number; color: string; strength: number }) {
  return (
    <group position={pos}>
      <mesh>
        <sphereGeometry args={[r, 8, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh>
        <sphereGeometry args={[r * (2.2 + strength * 1.2), 10, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.1 + 0.28 * strength} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Torus({
  pos,
  r,
  tube,
  color,
  rot,
  scale,
}: {
  pos: V3;
  r: number;
  tube: number;
  color: string;
  rot?: V3;
  scale?: V3;
}) {
  return (
    <mesh position={pos} rotation={rot} scale={scale}>
      <torusGeometry args={[r, tube, 8, 18]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}
