import { C } from '../palette';
import type { ItemType, PlacedItem } from '../../config';
import { Ball, Cyl, Glow, Rbox, type V3 } from './parts';

/** One piece of decoration, built from the same soft toy parts as the rest of the shop. */
export function Piece({ type, glow = 1 }: { type: ItemType; glow?: number }) {
  switch (type) {
    case 'plant':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.34} rBottom={0.26} h={0.6} color={C.roof} seg={14} />
          <Ball pos={[0, 0.85, 0]} r={0.5} color={C.leaf} scale={[1, 0.9, 1]} />
          <Ball pos={[0.22, 1.1, 0.1]} r={0.3} color={C.leafDark} />
          <Ball pos={[-0.2, 1.05, -0.1]} r={0.08} color={C.pink} />
          <Ball pos={[0.1, 1.3, 0.2]} r={0.08} color={C.yellow} />
        </>
      );
    case 'tallplant':
      return (
        <>
          <Cyl pos={[0, 0.35, 0]} rTop={0.4} rBottom={0.3} h={0.7} color={C.cream2} seg={14} />
          <Cyl pos={[0, 1.3, 0]} rTop={0.05} h={1.2} color={C.trunk} seg={6} />
          <Ball pos={[0, 2.1, 0]} r={0.55} color={C.leaf} scale={[1.1, 1.0, 1.1]} />
          <Ball pos={[0.35, 1.7, 0.1]} r={0.38} color={C.leafDark} />
          <Ball pos={[-0.3, 1.5, -0.1]} r={0.35} color={C.leaf} />
        </>
      );
    case 'tree':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.7} rBottom={0.6} h={0.6} color={C.roof} seg={16} />
          <Cyl pos={[0, 1.5, 0]} rTop={0.16} rBottom={0.22} h={2.2} color={C.trunk} seg={8} />
          <Ball pos={[0, 3.0, 0]} r={1.15} color={C.leaf} scale={[1.1, 0.95, 1.1]} />
          <Ball pos={[0.6, 2.5, 0.2]} r={0.7} color={C.leafDark} />
          <Ball pos={[-0.55, 2.4, -0.2]} r={0.65} color={C.leaf} />
          <Ball pos={[0.2, 3.6, 0.3]} r={0.12} color={C.pink} />
          <Ball pos={[-0.5, 3.1, 0.6]} r={0.12} color={C.yellow} />
        </>
      );
    case 'lamp':
      return (
        <>
          <Cyl pos={[0, 0.05, 0]} rTop={0.3} h={0.1} color={C.woodDark} seg={14} />
          <Cyl pos={[0, 1.2, 0]} rTop={0.05} h={2.2} color={C.woodDark} seg={6} />
          <Cyl pos={[0, 2.5, 0]} rTop={0.28} rBottom={0.42} h={0.5} color={C.cream2} seg={14} />
          <Glow pos={[0, 2.4, 0]} r={0.17} color={C.glow} strength={glow} />
        </>
      );
    case 'lantern':
      return (
        <>
          <Cyl pos={[0, 0.05, 0]} rTop={0.3} h={0.1} color={C.woodDark} seg={12} />
          <Ball pos={[0, 0.65, 0]} r={0.5} color="#FFF1DC" scale={[1, 1.15, 1]} />
          <Cyl pos={[0, 1.22, 0]} rTop={0.2} h={0.1} color={C.woodDark} seg={10} />
          <Glow pos={[0, 0.65, 0]} r={0.2} color={C.glow} strength={glow} />
        </>
      );
    case 'rug':
      return (
        <>
          <Cyl pos={[0, 0.03, 0]} rTop={1.8} h={0.06} color={C.rug} seg={32} />
          <Cyl pos={[0, 0.07, 0]} rTop={1.3} h={0.04} color={C.cream} seg={32} />
          <Cyl pos={[0, 0.1, 0]} rTop={0.6} h={0.04} color={C.pink} seg={24} />
        </>
      );
    case 'rugsq':
      return (
        <>
          <Rbox pos={[0, 0.03, 0]} size={[3.6, 0.06, 2.6]} r={0.1} color={C.rug} />
          <Rbox pos={[0, 0.07, 0]} size={[2.9, 0.04, 1.9]} r={0.08} color={C.cream} />
          <Rbox pos={[0, 0.1, 0]} size={[1.6, 0.04, 0.8]} r={0.06} color={C.pink} />
        </>
      );
    case 'bench':
      return (
        <>
          <Rbox pos={[0, 0.5, 0]} size={[2.2, 0.16, 0.8]} r={0.06} color={C.wood} />
          <Rbox pos={[0, 0.7, 0]} size={[2.2, 0.18, 0.7]} r={0.1} color={C.sofa} />
          {[-0.9, 0.9].map((x) => (
            <Rbox key={x} pos={[x, 0.22, 0]} size={[0.12, 0.44, 0.6]} r={0.03} color={C.woodDark} />
          ))}
        </>
      );
    case 'sofa':
      return (
        <>
          <Rbox pos={[0, 0.4, 0]} size={[2.6, 0.7, 1.1]} r={0.2} color={C.sofa} />
          <Rbox pos={[0, 0.95, -0.4]} size={[2.6, 0.8, 0.4]} r={0.18} color={C.sofa} />
          {[-1.3, 1.3].map((x) => (
            <Rbox key={x} pos={[x, 0.7, 0]} size={[0.3, 0.8, 1.1]} r={0.14} color={C.sofa} />
          ))}
          <Ball pos={[-0.6, 0.95, 0.1]} r={0.28} color={C.yellow} scale={[1, 1, 0.5]} />
          <Ball pos={[0.6, 0.95, 0.1]} r={0.28} color={C.pink} scale={[1, 1, 0.5]} />
        </>
      );
    case 'shelf':
      return (
        <>
          <Rbox pos={[0, 1.2, 0]} size={[2.0, 2.4, 0.6]} r={0.06} color={C.woodDark} />
          {[0.5, 1.2, 1.9].map((y, i) => (
            <group key={y}>
              <Rbox pos={[0, y, 0.05]} size={[1.8, 0.06, 0.5]} r={0.02} color={C.wood} />
              {[-0.6, -0.25, 0.1, 0.45].map((x, j) => (
                <Rbox key={x} pos={[x + (i % 2) * 0.1, y + 0.25, 0.05]} size={[0.22, 0.42 + ((i + j) % 3) * 0.06, 0.34]} r={0.02} color={[C.sofa, C.mint, C.yellow, C.pink][(i + j) % 4]} />
              ))}
            </group>
          ))}
        </>
      );
  }
}

/** Placed items, drawn together (the caller bakes them into a few draw calls). */
export function FurnitureStatic({ items, glow }: { items: PlacedItem[]; glow: number }) {
  return (
    <>
      {items.map((it) => (
        <group key={it.id} position={[it.x, 0.14, it.z] as V3} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
          <Piece type={it.type} glow={glow} />
        </group>
      ))}
    </>
  );
}
