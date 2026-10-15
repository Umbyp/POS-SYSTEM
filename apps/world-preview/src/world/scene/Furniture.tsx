import { C } from '../palette';
import type { ItemType, PlacedItem } from '../../config';
import { Ball, Cyl, Glow, Rbox, Torus, type V3 } from './parts';

/** Main colour of each piece when the owner has not picked one (read while rendering, so styles apply). */
export const defaultColor = (t: ItemType): string => {
  switch (t) {
    case 'plant': case 'cactus': case 'flowerbox': case 'bonsai': case 'tallplant': case 'tree': case 'bamboo': return C.roof;
    case 'sofa': case 'armchair': case 'bench': case 'stool': return C.sofa;
    case 'rug': case 'rugsq': case 'runner': return C.rug;
    case 'teddy': return '#D9A066';
    case 'balloons': return C.pink;
    case 'giftpile': return C.cherry;
    case 'poster': case 'frame': case 'garland': return C.leaf;
    case 'neon': return '#FF9AA8';
    default: return C.sofa;
  }
};

const FLOWER = ['#F7A8B8', '#FFD36B', '#FFFFFF', '#F2A7A0'];

/** One piece of decoration, built from the same soft toy parts as the rest of the shop. */
export function Piece({ type, glow = 1, color }: { type: ItemType; glow?: number; color?: string }) {
  const m = color ?? defaultColor(type);
  switch (type) {
    // ---------- plants ----------
    case 'plant':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.34} rBottom={0.26} h={0.6} color={m} seg={14} />
          <Ball pos={[0, 0.85, 0]} r={0.5} color={C.leaf} scale={[1, 0.9, 1]} />
          <Ball pos={[0.22, 1.1, 0.1]} r={0.3} color={C.leafDark} />
          <Ball pos={[-0.2, 1.05, -0.1]} r={0.08} color={C.pink} />
          <Ball pos={[0.1, 1.3, 0.2]} r={0.08} color={C.yellow} />
        </>
      );
    case 'tallplant':
      return (
        <>
          <Cyl pos={[0, 0.35, 0]} rTop={0.4} rBottom={0.3} h={0.7} color={m} seg={14} />
          <Cyl pos={[0, 1.3, 0]} rTop={0.05} h={1.2} color={C.trunk} seg={6} />
          <Ball pos={[0, 2.1, 0]} r={0.55} color={C.leaf} scale={[1.1, 1.0, 1.1]} />
          <Ball pos={[0.35, 1.7, 0.1]} r={0.38} color={C.leafDark} />
          <Ball pos={[-0.3, 1.5, -0.1]} r={0.35} color={C.leaf} />
        </>
      );
    case 'tree':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.7} rBottom={0.6} h={0.6} color={m} seg={16} />
          <Cyl pos={[0, 1.5, 0]} rTop={0.16} rBottom={0.22} h={2.2} color={C.trunk} seg={8} />
          <Ball pos={[0, 3.0, 0]} r={1.15} color={C.leaf} scale={[1.1, 0.95, 1.1]} />
          <Ball pos={[0.6, 2.5, 0.2]} r={0.7} color={C.leafDark} />
          <Ball pos={[-0.55, 2.4, -0.2]} r={0.65} color={C.leaf} />
          <Ball pos={[0.2, 3.6, 0.3]} r={0.12} color={C.pink} />
          <Ball pos={[-0.5, 3.1, 0.6]} r={0.12} color={C.yellow} />
        </>
      );
    case 'cactus':
      return (
        <>
          <Cyl pos={[0, 0.2, 0]} rTop={0.3} rBottom={0.24} h={0.4} color={m} seg={12} />
          <Cyl pos={[0, 0.8, 0]} rTop={0.2} h={1.0} color="#7DB68A" seg={10} />
          <Ball pos={[0, 1.3, 0]} r={0.2} color="#7DB68A" />
          <Cyl pos={[0.3, 0.9, 0]} rTop={0.09} h={0.4} color="#7DB68A" seg={8} rot={[0, 0, 0.9]} />
          <Ball pos={[0.45, 1.1, 0]} r={0.1} color="#7DB68A" />
          <Ball pos={[0, 1.5, 0.05]} r={0.07} color={C.pink} />
        </>
      );
    case 'flowerbox':
      return (
        <>
          <Rbox pos={[0, 0.25, 0]} size={[1.8, 0.5, 0.6]} r={0.08} color={m} />
          {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
            <group key={x}>
              <Ball pos={[x, 0.6, 0]} r={0.22} color={C.leaf} />
              <Ball pos={[x, 0.85, 0.04]} r={0.13} color={FLOWER[i % 4]} />
            </group>
          ))}
        </>
      );
    case 'bonsai':
      return (
        <>
          <Rbox pos={[0, 0.2, 0]} size={[0.9, 0.4, 0.6]} r={0.06} color={m} />
          <Cyl pos={[0, 0.7, 0]} rTop={0.07} rBottom={0.1} h={0.6} color={C.trunk} seg={6} rot={[0, 0, 0.15]} />
          <Ball pos={[-0.1, 1.15, 0]} r={0.38} color={C.leaf} scale={[1.3, 0.8, 1]} />
          <Ball pos={[0.25, 0.9, 0.1]} r={0.22} color={C.leafDark} />
        </>
      );
    case 'bamboo':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.35} rBottom={0.3} h={0.6} color={m} seg={12} />
          {[-0.15, 0.05, 0.2].map((x, i) => (
            <group key={x}>
              <Cyl pos={[x, 1.2 + i * 0.25, 0]} rTop={0.05} h={1.6 + i * 0.5} color="#8DB67A" seg={6} />
              <Ball pos={[x, 2.1 + i * 0.5, 0]} r={0.2} color={C.leaf} scale={[1, 0.6, 1]} />
            </group>
          ))}
        </>
      );
    // ---------- furniture ----------
    case 'bench':
      return (
        <>
          <Rbox pos={[0, 0.5, 0]} size={[2.2, 0.16, 0.8]} r={0.06} color={C.wood} />
          <Rbox pos={[0, 0.7, 0]} size={[2.2, 0.18, 0.7]} r={0.1} color={m} />
          {[-0.9, 0.9].map((x) => (
            <Rbox key={x} pos={[x, 0.22, 0]} size={[0.12, 0.44, 0.6]} r={0.03} color={C.woodDark} />
          ))}
        </>
      );
    case 'sofa':
      return (
        <>
          <Rbox pos={[0, 0.4, 0]} size={[2.6, 0.7, 1.1]} r={0.2} color={m} />
          <Rbox pos={[0, 0.95, -0.4]} size={[2.6, 0.8, 0.4]} r={0.18} color={m} />
          {[-1.3, 1.3].map((x) => (
            <Rbox key={x} pos={[x, 0.7, 0]} size={[0.3, 0.8, 1.1]} r={0.14} color={m} />
          ))}
          <Ball pos={[-0.6, 0.95, 0.1]} r={0.28} color={C.yellow} scale={[1, 1, 0.5]} />
          <Ball pos={[0.6, 0.95, 0.1]} r={0.28} color={C.pink} scale={[1, 1, 0.5]} />
        </>
      );
    case 'armchair':
      return (
        <>
          <Rbox pos={[0, 0.35, 0]} size={[1.2, 0.6, 1.0]} r={0.2} color={m} />
          <Rbox pos={[0, 0.9, -0.35]} size={[1.2, 0.8, 0.35]} r={0.16} color={m} />
          {[-0.6, 0.6].map((x) => (
            <Rbox key={x} pos={[x, 0.6, 0]} size={[0.25, 0.6, 1.0]} r={0.12} color={m} />
          ))}
          <Ball pos={[0, 0.72, 0.1]} r={0.3} color={C.cream} scale={[1, 0.4, 1]} />
        </>
      );
    case 'stool':
      return (
        <>
          <Cyl pos={[0, 0.55, 0]} rTop={0.4} h={0.14} color={m} seg={16} />
          {[0, 1, 2].map((i) => (
            <Cyl key={i} pos={[Math.cos(i * 2.09) * 0.22, 0.25, Math.sin(i * 2.09) * 0.22]} rTop={0.05} h={0.5} color={C.woodDark} seg={6} />
          ))}
        </>
      );
    case 'sidetable':
      return (
        <>
          <Cyl pos={[0, 0.7, 0]} rTop={0.5} h={0.1} color={C.tableTop} seg={20} />
          <Cyl pos={[0, 0.35, 0]} rTop={0.08} h={0.7} color={C.woodDark} seg={8} />
          <Cyl pos={[0, 0.03, 0]} rTop={0.34} h={0.06} color={C.woodDark} seg={14} />
          <Cyl pos={[0.05, 0.95, 0]} rTop={0.13} rBottom={0.1} h={0.4} color={m} seg={10} />
          <Ball pos={[0.05, 1.25, 0]} r={0.14} color={FLOWER[0]} />
          <Ball pos={[-0.1, 1.2, 0.05]} r={0.1} color={FLOWER[1]} />
        </>
      );
    case 'shelf':
      return (
        <>
          <Rbox pos={[0, 1.2, -0.24]} size={[2.0, 2.4, 0.1]} r={0.03} color={C.woodDark} />
          {[-0.95, 0.95].map((x) => (
            <Rbox key={x} pos={[x, 1.2, 0]} size={[0.1, 2.4, 0.6]} r={0.03} color={C.woodDark} />
          ))}
          <Rbox pos={[0, 2.4, 0]} size={[2.0, 0.1, 0.6]} r={0.03} color={C.woodDark} />
          {[0.05, 0.8, 1.55].map((y, i) => (
            <group key={y}>
              <Rbox pos={[0, y, 0]} size={[1.9, 0.08, 0.58]} r={0.02} color={C.wood} />
              {[-0.7, -0.4, -0.1, 0.2, 0.5].map((x, j) => (
                <Rbox key={x} pos={[x + (i % 2) * 0.1, y + 0.3, 0.02]} size={[0.22, 0.48 + ((i + j) % 3) * 0.1, 0.34]} r={0.02} color={[m, C.mint, C.yellow, C.pink, C.cream][(i + j) % 5]} />
              ))}
            </group>
          ))}
        </>
      );
    case 'cakecase':
      return (
        <>
          <Rbox pos={[0, 0.5, 0]} size={[1.8, 1.0, 0.8]} r={0.08} color={m} />
          <Rbox pos={[0, 1.4, 0]} size={[1.7, 0.8, 0.7]} r={0.05} color="#EAF4F1" />
          {[-0.5, 0, 0.5].map((x, i) => (
            <group key={x}>
              <Cyl pos={[x, 1.1, 0]} rTop={0.22} h={0.06} color={C.white} seg={12} />
              <Ball pos={[x, 1.28, 0]} r={0.16} color={[C.pink, C.yellow, C.mint][i]} scale={[1, 0.8, 1]} />
            </group>
          ))}
        </>
      );
    case 'screen':
      return (
        <>
          {[-0.75, 0, 0.75].map((x, i) => (
            <group key={x} rotation={[0, i === 1 ? 0 : i === 0 ? 0.35 : -0.35, 0]} position={[x, 0, i === 1 ? 0 : -0.1]}>
              <Rbox pos={[0, 1.0, 0]} size={[0.8, 2.0, 0.08]} r={0.03} color={C.woodDark} />
              <Rbox pos={[0, 1.0, 0.045]} size={[0.65, 1.8, 0.02]} r={0.01} color={m} />
              <Ball pos={[0, 1.0 + (i - 1) * 0.2, 0.07]} r={0.1} color={C.cream} scale={[1, 1, 0.3]} />
            </group>
          ))}
        </>
      );
    // ---------- lights ----------
    case 'lamp':
      return (
        <>
          <Cyl pos={[0, 0.05, 0]} rTop={0.3} h={0.1} color={C.woodDark} seg={14} />
          <Cyl pos={[0, 1.2, 0]} rTop={0.05} h={2.2} color={C.woodDark} seg={6} />
          <Cyl pos={[0, 2.5, 0]} rTop={0.28} rBottom={0.42} h={0.5} color={m} seg={14} />
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
    case 'fairytree':
      return (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.4} rBottom={0.34} h={0.6} color={m} seg={12} />
          <Cyl pos={[0, 1.3, 0]} rTop={0.06} h={1.5} color={C.trunk} seg={6} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Glow key={i} pos={[Math.cos(i * 1.7) * (0.35 + (i % 3) * 0.12), 1.5 + (i % 4) * 0.3, Math.sin(i * 1.7) * (0.35 + (i % 3) * 0.12)]} r={0.07} color={i % 2 ? C.glow : '#FFE9A8'} strength={glow} />
          ))}
        </>
      );
    case 'candles':
      return (
        <>
          <Cyl pos={[0, 0.04, 0]} rTop={0.7} h={0.08} color={m} seg={16} />
          {[
            [0, 0, 0.5],
            [0.3, 0.2, 0.35],
            [-0.3, -0.15, 0.3],
          ].map(([x, z, h], i) => (
            <group key={i}>
              <Cyl pos={[x, 0.08 + h / 2, z]} rTop={0.1} h={h} color={C.cream} seg={10} />
              <Glow pos={[x, 0.14 + h, z]} r={0.05} color="#FFC46B" strength={glow} />
            </group>
          ))}
        </>
      );
    case 'lamppost':
      return (
        <>
          <Cyl pos={[0, 1.4, 0]} rTop={0.07} rBottom={0.1} h={2.8} color={m} seg={8} />
          <Cyl pos={[0, 0.1, 0]} rTop={0.28} h={0.2} color={m} seg={10} />
          <Ball pos={[0, 2.9, 0]} r={0.3} color="#FFF3D6" />
          <Glow pos={[0, 2.9, 0]} r={0.14} color={C.glow} strength={glow} />
          <Cyl pos={[0, 3.2, 0]} rTop={0.02} rBottom={0.3} h={0.22} color={m} seg={10} />
        </>
      );
    // ---------- cute ----------
    case 'teddy':
      return (
        <>
          <Ball pos={[0, 0.5, 0]} r={0.5} color={m} scale={[1, 1.05, 0.9]} />
          <Ball pos={[0, 1.15, 0.05]} r={0.4} color={m} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <Ball pos={[s * 0.3, 1.5, 0]} r={0.14} color={m} />
              <Ball pos={[s * 0.15, 1.2, 0.36]} r={0.05} color="#3A2A24" />
              <Ball pos={[s * 0.5, 0.65, 0.2]} r={0.16} color={m} />
              <Ball pos={[s * 0.25, 0.1, 0.3]} r={0.17} color={m} />
            </group>
          ))}
          <Ball pos={[0, 1.08, 0.38]} r={0.12} color="#F3D5B0" />
          <Ball pos={[0, 1.1, 0.46]} r={0.05} color="#3A2A24" />
          <Ball pos={[0, 0.8, 0.35]} r={0.12} color={C.cherry} scale={[1.6, 0.5, 0.5]} />
        </>
      );
    case 'balloons':
      return (
        <>
          <Cyl pos={[0, 0.08, 0]} rTop={0.3} h={0.16} color={C.woodDark} seg={12} />
          {[
            [0, 2.4, '#F7A8B8'],
            [-0.4, 2.1, '#FFD36B'],
            [0.4, 2.15, '#9ED3CC'],
            [0, 1.8, '#F2A7A0'],
          ].map(([x, y, c], i) => (
            <group key={i}>
              <Cyl pos={[(x as number) * 0.5, (y as number) / 2 + 0.1, 0]} rTop={0.01} h={y as number} color="#FFFFFF" seg={4} />
              <Ball pos={[x as number, y as number, 0]} r={0.34} color={i === 0 ? m : (c as string)} scale={[1, 1.2, 1]} />
            </group>
          ))}
        </>
      );
    case 'giftpile':
      return (
        <>
          <Rbox pos={[0, 0.3, 0]} size={[0.9, 0.6, 0.9]} r={0.05} color={m} />
          <Rbox pos={[0, 0.3, 0]} size={[0.95, 0.1, 0.95]} r={0.03} color={C.yellow} />
          <Rbox pos={[0.7, 0.2, 0.2]} size={[0.6, 0.4, 0.6]} r={0.05} color={C.mint} />
          <Rbox pos={[-0.6, 0.25, 0.3]} size={[0.5, 0.5, 0.5]} r={0.05} color={C.pink} />
          <Rbox pos={[0, 0.8, 0]} size={[0.6, 0.4, 0.6]} r={0.05} color={C.cream} />
          <Ball pos={[0, 1.05, 0]} r={0.13} color={C.cherry} />
        </>
      );
    case 'cakestand':
      return (
        <>
          <Cyl pos={[0, 0.5, 0]} rTop={0.06} h={1.0} color={C.woodDark} seg={8} />
          <Cyl pos={[0, 0.04, 0]} rTop={0.35} h={0.08} color={C.woodDark} seg={14} />
          <Cyl pos={[0, 1.04, 0]} rTop={0.6} h={0.06} color={C.white} seg={20} />
          <Cyl pos={[0, 1.3, 0]} rTop={0.4} h={0.45} color={m} seg={18} />
          <Cyl pos={[0, 1.58, 0]} rTop={0.41} h={0.1} color={C.cream} seg={18} />
          <Ball pos={[0, 1.72, 0]} r={0.1} color={C.cherry} />
        </>
      );
    case 'coffeecart':
      return (
        <>
          <Rbox pos={[0, 0.7, 0]} size={[1.6, 0.12, 0.8]} r={0.05} color={C.wood} />
          <Rbox pos={[0, 0.3, 0]} size={[1.6, 0.08, 0.8]} r={0.05} color={C.wood} />
          {[-0.7, 0.7].map((x) => (
            <Rbox key={x} pos={[x, 0.5, 0]} size={[0.08, 1.0, 0.7]} r={0.03} color={m} />
          ))}
          {[-0.5, -0.15, 0.2].map((x, i) => (
            <Cyl key={x} pos={[x, 0.86, 0.1]} rTop={0.1} rBottom={0.08} h={0.2} color={[C.cream, C.pink, C.mint][i]} seg={10} />
          ))}
          <Cyl pos={[0.55, 0.95, -0.1]} rTop={0.16} h={0.4} color="#B8B2A8" seg={12} />
          {[-0.6, 0.6].map((x) => (
            <Cyl key={x} pos={[x, 0.15, 0.45]} rTop={0.15} h={0.08} color={C.woodDark} seg={12} rot={[Math.PI / 2, 0, 0]} />
          ))}
        </>
      );
    case 'easel':
      return (
        <>
          {[-0.5, 0, 0.5].map((x, i) => (
            <Cyl key={x} pos={[x * 0.9, 0.9, i === 1 ? -0.4 : 0]} rTop={0.04} h={1.9} color={C.wood} seg={6} rot={[i === 1 ? -0.25 : 0, 0, i === 0 ? -0.18 : i === 2 ? 0.18 : 0]} />
          ))}
          <Rbox pos={[0, 1.2, 0.08]} size={[1.0, 1.3, 0.06]} r={0.03} color={C.woodDark} />
          <Rbox pos={[0, 1.2, 0.12]} size={[0.85, 1.15, 0.02]} r={0.01} color={C.cream} />
          <Ball pos={[0, 1.35, 0.14]} r={0.2} color={m} scale={[1, 1, 0.15]} />
          <Rbox pos={[0, 0.95, 0.14]} size={[0.8, 0.3, 0.02]} r={0.01} color={C.leaf} />
        </>
      );
    case 'flowerarch':
      return (
        <>
          {[-1.1, 1.1].map((x) => (
            <Cyl key={x} pos={[x, 1.2, 0]} rTop={0.08} h={2.4} color={C.cream} seg={8} />
          ))}
          <Torus pos={[0, 2.2, 0]} r={1.1} tube={0.08} color={C.cream} scale={[1, 0.55, 1]} />
          {Array.from({ length: 11 }).map((_, i) => {
            const a = (i / 10) * Math.PI;
            return <Ball key={i} pos={[Math.cos(a) * 1.1, 2.2 + Math.sin(a) * 0.6, 0]} r={0.15} color={i % 3 === 0 ? m : FLOWER[i % 4]} />;
          })}
          {[-1.1, 1.1].map((x) => (
            <Ball key={x} pos={[x, 0.4, 0]} r={0.2} color={C.leaf} />
          ))}
        </>
      );
    case 'fountain':
      return (
        <>
          <Cyl pos={[0, 0.2, 0]} rTop={1.2} rBottom={1.3} h={0.4} color={C.stone} seg={24} />
          <Cyl pos={[0, 0.36, 0]} rTop={1.05} h={0.1} color={C.water} seg={24} />
          <Cyl pos={[0, 0.8, 0]} rTop={0.12} rBottom={0.2} h={0.9} color={C.stone} seg={10} />
          <Cyl pos={[0, 1.25, 0]} rTop={0.5} rBottom={0.12} h={0.15} color={C.stone} seg={16} />
          <Ball pos={[0, 1.5, 0]} r={0.14} color={m} />
          {[0, 1, 2, 3].map((i) => (
            <Ball key={i} pos={[Math.cos(i * 1.57) * 0.7, 0.45, Math.sin(i * 1.57) * 0.7]} r={0.1} color={FLOWER[i]} scale={[1, 0.6, 1]} />
          ))}
        </>
      );
    // ---------- rugs ----------
    case 'rug':
      return (
        <>
          <Cyl pos={[0, 0.03, 0]} rTop={1.8} h={0.06} color={m} seg={32} />
          <Cyl pos={[0, 0.07, 0]} rTop={1.3} h={0.04} color={C.cream} seg={32} />
          <Cyl pos={[0, 0.1, 0]} rTop={0.6} h={0.04} color={C.pink} seg={24} />
        </>
      );
    case 'rugsq':
      return (
        <>
          <Rbox pos={[0, 0.03, 0]} size={[3.6, 0.06, 2.6]} r={0.1} color={m} />
          <Rbox pos={[0, 0.07, 0]} size={[2.9, 0.04, 1.9]} r={0.08} color={C.cream} />
          <Rbox pos={[0, 0.1, 0]} size={[1.6, 0.04, 0.8]} r={0.06} color={C.pink} />
        </>
      );
    case 'runner':
      return (
        <>
          <Rbox pos={[0, 0.03, 0]} size={[1.4, 0.06, 4.0]} r={0.1} color={m} />
          <Rbox pos={[0, 0.07, 0]} size={[1.0, 0.04, 3.6]} r={0.08} color={C.cream} />
          {[-1.4, -0.7, 0, 0.7, 1.4].map((z) => (
            <Ball key={z} pos={[0, 0.1, z]} r={0.16} color={C.pink} scale={[1, 0.2, 1]} />
          ))}
        </>
      );
    // ---------- wall decor (built facing +z, centred on the wall surface) ----------
    case 'poster':
      return (
        <>
          <Rbox pos={[0, 0, 0.04]} size={[1.2, 1.6, 0.08]} r={0.03} color={C.woodDark} />
          <Rbox pos={[0, 0, 0.09]} size={[1.0, 1.4, 0.04]} r={0.02} color={C.cream} />
          <Ball pos={[0, 0.3, 0.12]} r={0.26} color={m} scale={[1, 1, 0.2]} />
          <Rbox pos={[0, -0.35, 0.12]} size={[0.8, 0.4, 0.02]} r={0.01} color={C.sky} />
          <Ball pos={[-0.2, -0.28, 0.14]} r={0.22} color={C.leaf} scale={[1.2, 0.7, 0.2]} />
        </>
      );
    case 'frame':
      return (
        <>
          <Rbox pos={[0, 0, 0.04]} size={[1.9, 1.3, 0.08]} r={0.03} color={C.woodDark} />
          <Rbox pos={[0, 0, 0.09]} size={[1.7, 1.1, 0.04]} r={0.02} color={C.sky} />
          <Ball pos={[0.4, 0.25, 0.12]} r={0.18} color={C.yellow} scale={[1, 1, 0.2]} />
          <Ball pos={[-0.3, -0.35, 0.12]} r={0.5} color={m} scale={[1.6, 0.8, 0.2]} />
          <Ball pos={[0.35, -0.4, 0.13]} r={0.4} color={C.leafDark} scale={[1.6, 0.8, 0.2]} />
        </>
      );
    case 'mirror':
      return (
        <>
          <Torus pos={[0, 0, 0.06]} r={0.62} tube={0.08} color={m} />
          <Cyl pos={[0, 0, 0.05]} rTop={0.6} h={0.04} color="#E8F2F0" seg={24} rot={[Math.PI / 2, 0, 0]} />
        </>
      );
    case 'clock':
      return (
        <>
          <Cyl pos={[0, 0, 0.06]} rTop={0.5} h={0.1} color={C.cream} seg={24} rot={[Math.PI / 2, 0, 0]} />
          <Torus pos={[0, 0, 0.06]} r={0.5} tube={0.06} color={m} />
          <Rbox pos={[0, 0.14, 0.13]} size={[0.05, 0.3, 0.02]} r={0.01} color="#3A2A24" />
          <Rbox pos={[0.1, 0, 0.13]} size={[0.22, 0.05, 0.02]} r={0.01} color="#3A2A24" />
          <Ball pos={[0, 0, 0.14]} r={0.04} color={C.cherry} />
        </>
      );
    case 'neon':
      return (
        <>
          <Rbox pos={[0, 0, 0.03]} size={[1.9, 0.8, 0.06]} r={0.05} color="#3A2A24" />
          {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
            <Glow key={x} pos={[x, Math.sin(i * 1.3) * 0.15, 0.12]} r={0.09} color={m} strength={glow} />
          ))}
        </>
      );
    case 'wallshelf':
      return (
        <>
          <Rbox pos={[0, 0, 0.22]} size={[1.7, 0.08, 0.44]} r={0.03} color={C.wood} />
          {[-0.55, 0, 0.55].map((x, i) => (
            <group key={x} position={[x, 0.04, 0.22]}>
              <Cyl pos={[0, 0.12, 0]} rTop={0.13} rBottom={0.1} h={0.24} color={i === 1 ? m : C.cream} seg={10} />
              <Ball pos={[0, 0.34, 0]} r={0.17} color={C.leaf} />
            </group>
          ))}
        </>
      );
    case 'banner':
      return (
        <>
          <Rbox pos={[0, 0.35, 0.04]} size={[2.4, 0.04, 0.04]} r={0.01} color={C.cream} />
          {[-1, -0.6, -0.2, 0.2, 0.6, 1].map((x, i) => (
            <mesh key={x} position={[x, 0.1, 0.06]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.2, 0.45, 3]} />
              <meshLambertMaterial color={i % 3 === 0 ? m : [C.pink, C.yellow, C.mint][i % 3]} />
            </mesh>
          ))}
        </>
      );
    case 'garland':
      return (
        <>
          {Array.from({ length: 9 }).map((_, i) => {
            const x = -1.2 + i * 0.3;
            return (
              <group key={i}>
                <Ball pos={[x, 0.3 - Math.sin((i / 8) * Math.PI) * 0.35, 0.08]} r={0.14} color={m} />
                {i % 2 === 0 ? <Ball pos={[x, 0.3 - Math.sin((i / 8) * Math.PI) * 0.35, 0.18]} r={0.07} color={FLOWER[(i / 2) % 4]} /> : null}
              </group>
            );
          })}
        </>
      );
    case 'wreath':
      return (
        <>
          <Torus pos={[0, 0, 0.08]} r={0.45} tube={0.13} color={C.leaf} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Ball key={i} pos={[Math.cos(i * 1.2566 + 0.4) * 0.45, Math.sin(i * 1.2566 + 0.4) * 0.45, 0.2]} r={0.08} color={FLOWER[i % 4]} />
          ))}
          <Ball pos={[0, -0.5, 0.18]} r={0.14} color={m} scale={[1.6, 0.8, 0.5]} />
        </>
      );
  }
}

/** Placed items, drawn together (the caller bakes them into a few draw calls). */
export function FurnitureStatic({ items, glow }: { items: PlacedItem[]; glow: number }) {
  return (
    <>
      {items.map((it) => (
        <group key={it.id} position={[it.x, WALL_Y[it.type] ?? 0.14, it.z] as V3} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
          <Piece type={it.type} glow={glow} color={it.color} />
        </group>
      ))}
    </>
  );
}

/** Wall pieces hang at this height; everything else stands on the floor. */
export const WALL_Y: Partial<Record<ItemType, number>> = {
  poster: 2.7, frame: 2.8, mirror: 2.7, clock: 3.2, neon: 3.2, wallshelf: 2.4, banner: 3.4, garland: 3.2, wreath: 2.8,
};
