import { useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ItemType, PlacedItem } from '../../config';
import type { WorldPlan } from '../layout';
import { canPlace, infoOf, isWall, snap, wallSnap } from '../build';
import { WALL_Y } from './Furniture';
import { Piece } from './Furniture';

export interface BuildState {
  /** the thing being placed (null = just looking / selecting) */
  type: ItemType | null;
  /** when moving an existing item */
  movingId: string | null;
  rot: number;
  /** colour chosen for the next placement (null = the piece's own colour) */
  color: string | null;
  selectedId: string | null;
}

/** Everything that only exists in decorate mode: the floor you tap, the preview, and tap targets on items. */
export function BuildLayer({
  plan,
  items,
  build,
  onPlace,
  onSelect,
}: {
  plan: WorldPlan;
  items: PlacedItem[];
  build: BuildState;
  onPlace: (x: number, z: number, rot: number) => void;
  onSelect: (id: string | null) => void;
}) {
  const [ghost, setGhost] = useState<{ x: number; z: number; rot?: number } | null>(null);
  const { plate } = plan;
  const placing = build.type;
  const ok = placing && ghost ? canPlace(plan, placing, ghost.x, ghost.z, items, build.movingId ?? undefined) : false;
  const sel = items.find((i) => i.id === build.selectedId);

  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const x = snap(e.point.x);
    const z = snap(e.point.z);
    return placing && isWall(placing) ? wallSnap(plan, placing, x, z, items, build.movingId ?? undefined) : { x, z };
  };

  return (
    <>
      {/* the floor: move to preview, tap to place (or tap empty floor to deselect) */}
      <mesh
        position={[(plate.x0 + plate.x1) / 2, 0.2, (plate.z0 + plate.z1) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          if (!placing) return;
          const p = at(e);
          setGhost((g) => (g && g.x === p.x && g.z === p.z ? g : p));
        }}
        onClick={(e) => {
          e.stopPropagation();
          const p = at(e);
          if (placing) {
            setGhost(p);
            if (canPlace(plan, placing, p.x, p.z, items, build.movingId ?? undefined)) onPlace(p.x, p.z, 'rot' in p && p.rot !== undefined ? p.rot : build.rot);
          } else onSelect(null);
        }}
      >
        <planeGeometry args={[plate.x1 - plate.x0 + 16, plate.z1 - plate.z0 + 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* grid hint while placing */}
      {placing ? (
        <gridHelper args={[Math.max(plate.x1 - plate.x0, plate.z1 - plate.z0), Math.round(Math.max(plate.x1 - plate.x0, plate.z1 - plate.z0) / 2), '#C9A67A', '#E3CDAA']} position={[(plate.x0 + plate.x1) / 2, 0.19, (plate.z0 + plate.z1) / 2]} />
      ) : null}

      {/* preview */}
      {placing && ghost ? (
        <group position={[ghost.x, WALL_Y[placing] ?? 0.14, ghost.z]}>
          <group rotation={[0, ((ghost.rot ?? build.rot) * Math.PI) / 2, 0]} scale={ok ? 1 : 0.92}>
            <Piece type={placing} color={build.color ?? undefined} />
          </group>
          <mesh position={[0, isWall(placing) ? -(WALL_Y[placing] ?? 0) + 0.2 : 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[infoOf(placing).r * 0.8, infoOf(placing).r * 0.8 + 0.18, 32]} />
            <meshBasicMaterial color={ok ? '#4ADE80' : '#F87171'} transparent opacity={0.9} depthTest={false} />
          </mesh>
        </group>
      ) : null}

      {/* tap targets on existing items */}
      {!placing
        ? items.map((it) => (
            <mesh
              key={it.id}
              position={[it.x, WALL_Y[it.type] ?? 0.7, it.z]}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(it.id);
              }}
            >
              <cylinderGeometry args={[infoOf(it.type).r * 0.8, infoOf(it.type).r * 0.8, 1.4, 14]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          ))
        : null}
      {sel && !placing ? (
        <mesh position={[sel.x, isWall(sel.type) ? 0.3 : 0.3, sel.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[infoOf(sel.type).r * 0.85, infoOf(sel.type).r * 0.85 + 0.2, 32]} />
          <meshBasicMaterial color="#FFB020" transparent opacity={0.95} depthTest={false} />
        </mesh>
      ) : null}
    </>
  );
}
