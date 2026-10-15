import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { C, LOOK } from '../palette';
import type { MenuItem } from '../../types';
import type { Rect, WorldPlan } from '../layout';
import { Ball, Blob, Cyl, Glow, Rbox, type V3 } from './parts';
import { Flowers, FlowerPot } from './Decor';
import { Lounge, PhotoCorner } from './Buildings';

const STEEL = '#C9CFD6';
const STEEL_DARK = '#7B848E';

const mid = (a: number, b: number) => (a + b) / 2;

// ---------- floor ----------
function Floor({ plan }: { plan: WorldPlan }) {
  const { plate: r, plaza } = plan;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const kitchenZ1 = plan.anchors.window.z + 0.4; // the back-of-house floor ends at the pass counter
  const strips = useMemo(() => {
    const out: { z: number; depth: number; color: string }[] = [];
    let i = 0;
    for (let z = kitchenZ1; z < r.z1; z += 1.6, i++) out.push({ z: z + 0.8, depth: Math.min(1.6, r.z1 - z), color: i % 2 ? LOOK.floorB : LOOK.floorA });
    return out;
  }, [kitchenZ1, r.z1]);
  const tiles = useMemo(() => {
    const out: { x: number; z: number; d: number; color: string }[] = [];
    let i = 0;
    for (let z = r.z0; z < kitchenZ1; z += 1.8, i++) {
      const d = Math.min(1.8, kitchenZ1 - z); // the last row stops exactly where the wood floor begins
      for (let x = r.x0, j = 0; x < r.x1; x += 1.8, j++) out.push({ x: x + 0.9, z: z + d / 2, d, color: (i + j) % 2 ? LOOK.tileB : LOOK.tileA });
    }
    return out;
  }, [r, kitchenZ1]);
  return (
    <group>
      {/* the sidewalk around the building */}
      <Rbox pos={[mid(r.x0, r.x1), -0.42, mid(r.z0, r.z1)]} size={[w + 9, 0.5, d + 9]} r={0.4} color="#D8CBB8" />
      <Rbox pos={[mid(r.x0, r.x1), -0.2, mid(r.z0, r.z1)]} size={[w + 0.8, 0.5, d + 0.8]} r={0.3} color="#8A5A3A" />
      {strips.map((s, i) => (
        <Rbox key={`s${i}`} pos={[mid(r.x0, r.x1), 0.12, s.z]} size={[w, 0.06, s.depth - 0.04]} r={0.02} color={s.color} />
      ))}
      {tiles.map((t, i) => (
        <Rbox key={`t${i}`} pos={[t.x, 0.12, t.z]} size={[1.76, 0.06, Math.max(0.1, t.d - 0.04)]} r={0.02} color={t.color} />
      ))}
      {/* a rug under the dining hall */}
      <Rbox pos={[mid(plaza.x0, plaza.x1), 0.16, mid(plaza.z0, plaza.z1)]} size={[plaza.x1 - plaza.x0 - 2, 0.03, plaza.z1 - plaza.z0 - 2]} r={0.3} color={LOOK.rug} />
      {/* door mat */}
      <Rbox pos={[0, 0.16, r.z1 - 1.2]} size={[3.4, 0.04, 1.6]} r={0.1} color={C.roof} />
    </group>
  );
}

// ---------- walls, windows, air-conditioners ----------
const H = 5;

function WallPanel({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <group>
      <Rbox pos={[x, H / 2, z]} size={[w, H, d]} r={0.08} color={LOOK.wall} />
      <Rbox pos={[x, 0.75, z]} size={[w + (w > d ? 0 : 0.06), 1.5, d + (w > d ? 0.06 : 0)]} r={0.06} color={LOOK.wainscot} />
      <Rbox pos={[x, 1.55, z]} size={[w + (w > d ? 0 : 0.14), 0.12, d + (w > d ? 0.14 : 0)]} r={0.04} color={C.woodDark} />
      <Rbox pos={[x, 0.12, z]} size={[w + (w > d ? 0 : 0.14), 0.24, d + (w > d ? 0.14 : 0)]} r={0.04} color={C.woodDark} />
    </group>
  );
}

function Window({ pos, rotY }: { pos: V3; rotY: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0, 0]} size={[3.2, 2.3, 0.2]} r={0.06} color={C.white} />
      <Rbox pos={[0, 0, 0.1]} size={[2.8, 1.9, 0.04]} r={0.02} color={C.sky} />
      <Rbox pos={[0, 0, 0.13]} size={[0.08, 1.9, 0.04]} r={0.01} color={C.white} />
      <Rbox pos={[0, 0, 0.13]} size={[2.8, 0.08, 0.04]} r={0.01} color={C.white} />
      {[-1, 1].map((s) => (
        <Rbox key={s} pos={[s * 1.55, 0, 0.22]} size={[0.7, 2.5, 0.2]} r={0.1} color="#F3D5D0" />
      ))}
      <Rbox pos={[0, 1.3, 0.22]} size={[3.8, 0.1, 0.1]} r={0.04} color={C.woodDark} />
    </group>
  );
}

function Aircon({ pos, rotY }: { pos: V3; rotY: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0, 0]} size={[3.0, 0.9, 0.7]} r={0.18} color="#F6F7F8" />
      <Rbox pos={[0, -0.28, 0.3]} size={[2.7, 0.14, 0.14]} r={0.05} color={STEEL_DARK} />
      {[0.12, 0.0, -0.12].map((y) => (
        <Rbox key={y} pos={[0, y + 0.1, 0.355]} size={[2.5, 0.02, 0.02]} r={0.005} color="#D5D9DE" />
      ))}
      <Ball pos={[1.2, 0.22, 0.36]} r={0.05} color="#52E08E" />
      <Ball pos={[1.05, 0.22, 0.36]} r={0.05} color="#B9E0DA" />
    </group>
  );
}

/** Little cold-air puffs sliding down from an air-conditioner (animated, so not baked). */
function ColdAir({ pos, rotY }: { pos: V3; rotY: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.45 + i / 6) % 1;
      c.position.set(Math.sin(t * 6 + i) * 0.25 + (i - 3) * 0.35, -t * 2.6, t * 1.6);
      c.scale.setScalar(0.5 + t * 0.9);
      (c as unknown as { material: { opacity: number } }).material.opacity = 0.5 * (1 - t);
    });
  });
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <group ref={g} position={[0, -0.4, 0.3]}>
        {Array.from({ length: 7 }).map((_, i) => (
          <mesh key={i} userData={{ noBake: true }}>
            <sphereGeometry args={[0.16, 8, 6]} />
            <meshBasicMaterial color="#E4F3EE" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Frame({ pos, w, h, colors }: { pos: V3; w: number; h: number; colors: [string, string] }) {
  return (
    <group position={pos}>
      <Rbox pos={[0, 0, 0]} size={[w, h, 0.12]} r={0.04} color={C.woodDark} />
      <Rbox pos={[0, 0, 0.07]} size={[w - 0.3, h - 0.3, 0.04]} r={0.02} color={colors[0]} />
      <Ball pos={[-w * 0.15, -h * 0.1, 0.1]} r={Math.min(w, h) * 0.18} color={colors[1]} scale={[1, 1, 0.3]} />
    </group>
  );
}

function Walls({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { plate: r } = plan;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const xs = (a: number, b: number, step: number) => {
    const out: number[] = [];
    for (let x = a; x <= b; x += step) out.push(x);
    return out;
  };
  // the big menu board hangs on the left wall; windows keep clear of it
  const boardZ = mid(plan.plaza.z0, plan.plaza.z1);
  const sideZ = xs(r.z0 + 8, r.z1 - 6, 9);
  return (
    <group>
      <WallPanel x={mid(r.x0, r.x1)} z={r.z0 - 0.3} w={w + 1.2} d={0.6} />
      <WallPanel x={r.x0 - 0.3} z={mid(r.z0, r.z1)} w={0.6} d={d} />
      <WallPanel x={r.x1 + 0.3} z={mid(r.z0, r.z1)} w={0.6} d={d} />

      {/* side windows + wall lamps */}
      {sideZ.map((z) => (
        <group key={z}>
          {Math.abs(z - boardZ) > 6 ? <Window pos={[r.x0 + 0.02, 2.9, z]} rotY={Math.PI / 2} /> : null}
          <Window pos={[r.x1 - 0.02, 2.9, z]} rotY={-Math.PI / 2} />
          <Glow pos={[r.x0 + 0.3, 3.1, z + 4.5]} r={0.16} color={C.glow} strength={glow} />
          <Glow pos={[r.x1 - 0.3, 3.1, z + 4.5]} r={0.16} color={C.glow} strength={glow} />
        </group>
      ))}

      {/* air-conditioners high on the walls */}
      <Aircon pos={[-w / 4, 4.1, r.z0 + 0.45]} rotY={0} />
      <Aircon pos={[w / 4, 4.1, r.z0 + 0.45]} rotY={0} />
      <Aircon pos={[r.x0 + 0.45, 4.1, mid(plan.plaza.z0, plan.plaza.z1) + 6.4]} rotY={Math.PI / 2} />
      <Aircon pos={[r.x1 - 0.45, 4.1, mid(r.z0, r.z1) + 3]} rotY={-Math.PI / 2} />

      {/* front: a low glass storefront with a doorway in the middle */}
      {[
        [r.x0, -2],
        [2, r.x1],
      ].map(([a, b], i) => (
        <group key={i}>
          <Rbox pos={[mid(a, b), 0.45, r.z1 + 0.2]} size={[b - a, 0.9, 0.5]} r={0.1} color={LOOK.wainscot} />
          <Rbox pos={[mid(a, b), 2.2, r.z1 + 0.2]} size={[b - a, 2.6, 0.08]} r={0.02} color="#DCEFE9" />
          {xs(a, b, 6).map((x) => (
            <Rbox key={x} pos={[x, 1.8, r.z1 + 0.2]} size={[0.22, 3.6, 0.3]} r={0.06} color={C.woodDark} />
          ))}
        </group>
      ))}
      <Rbox pos={[-2, 1.8, r.z1 + 0.2]} size={[0.3, 3.6, 0.4]} r={0.08} color={C.woodDark} />
      <Rbox pos={[2, 1.8, r.z1 + 0.2]} size={[0.3, 3.6, 0.4]} r={0.08} color={C.woodDark} />
      <Rbox pos={[0, 3.7, r.z1 + 0.2]} size={[4.6, 0.4, 0.4]} r={0.1} color={C.woodDark} />

      {/* pictures on the back wall */}
      <Frame pos={[-w / 2 + 3, 3.3, r.z0 + 0.1]} w={1.8} h={1.3} colors={['#DDF0EA', C.pink]} />
      <Frame pos={[0, 3.2, r.z0 + 0.1]} w={2.2} h={1.5} colors={['#FFE6B3', C.leaf]} />
      <Frame pos={[w / 2 - 3, 3.3, r.z0 + 0.1]} w={1.8} h={1.3} colors={['#F6E1E4', C.yellow]} />
    </group>
  );
}

// ---------- signs (textured, so kept out of the bake) ----------
function sign(text: string, fg: string, bg: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(6, 6, 500, 148, 34);
  g.fill();
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.shadowColor = fg;
  g.shadowBlur = 18;
  g.stroke();
  g.fillStyle = fg;
  g.font = '700 84px system-ui, "Noto Sans Thai", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 84);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function Sign({ pos, w, text, fg, bg, rotY = 0 }: { pos: V3; w: number; text: string; fg: string; bg: string; rotY?: number }) {
  const tex = useMemo(() => sign(text, fg, bg), [text, fg, bg]);
  return (
    <mesh position={pos} rotation={[0, rotY, 0]} userData={{ noBake: true }}>
      <planeGeometry args={[w, w * 0.3125]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

// ---------- kitchen + bar along the back ----------
function Stove({ pos }: { pos: V3 }) {
  return (
    <group position={pos}>
      <Rbox pos={[0, 0.5, 0]} size={[2.3, 1.0, 1.5]} r={0.1} color={STEEL} />
      <Rbox pos={[0, 1.02, 0]} size={[2.34, 0.06, 1.54]} r={0.02} color={STEEL_DARK} />
      {[-0.55, 0.55].map((x) => (
        <group key={x}>
          <Cyl pos={[x, 1.08, 0]} rTop={0.3} h={0.06} color="#3B3F46" seg={16} />
          <Cyl pos={[x, 1.28, 0]} rTop={0.28} rBottom={0.24} h={0.34} color={x < 0 ? C.metal : '#4A4F57'} seg={16} />
        </group>
      ))}
      {[-0.6, -0.2, 0.2, 0.6].map((x) => (
        <Ball key={x} pos={[x, 0.78, 0.76]} r={0.07} color={C.cherry} scale={[1, 1, 0.5]} />
      ))}
    </group>
  );
}

function Kitchen({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { plate: r, anchors } = plan;
  const kx = anchors.chefs.x;
  const passZ = anchors.window.z;
  const left = r.x0 + 2;
  const right = -1.4;
  const stoveZ = r.z0 + 1.6;
  return (
    <group>
      {/* tiled backsplash */}
      <Rbox pos={[mid(left - 1, right), 2.0, r.z0 + 0.12]} size={[right - left + 2, 2.4, 0.12]} r={0.03} color="#EAF2F0" />
      {/* stoves, hood, pipe */}
      {[kx - 3.4, kx, kx + 3.4].map((x, i) => (
        <Stove key={i} pos={[x, 0.12, stoveZ]} />
      ))}
      <Rbox pos={[kx, 3.7, stoveZ + 0.1]} size={[10.6, 1.0, 1.9]} r={0.12} color="#555B64" />
      <Rbox pos={[kx, 3.0, stoveZ + 0.4]} size={[10.2, 0.3, 1.3]} r={0.08} color={STEEL_DARK} />
      <Cyl pos={[kx, 4.7, stoveZ - 0.3]} rTop={0.45} h={1.2} color={STEEL_DARK} seg={14} />
      <Glow pos={[kx - 3.4, 2.85, stoveZ + 0.5]} r={0.12} color={C.glow} strength={glow} />
      <Glow pos={[kx + 3.4, 2.85, stoveZ + 0.5]} r={0.12} color={C.glow} strength={glow} />
      {/* fridge + prep counter + hanging pans */}
      <Rbox pos={[left + 0.4, 1.7, r.z0 + 1.0]} size={[1.8, 3.4, 1.4]} r={0.12} color="#F4F6F7" />
      <Rbox pos={[left + 0.4, 2.4, r.z0 + 1.72]} size={[0.08, 0.9, 0.06]} r={0.02} color={STEEL_DARK} />
      <Rbox pos={[left + 0.4, 1.0, r.z0 + 1.72]} size={[0.08, 0.5, 0.06]} r={0.02} color={STEEL_DARK} />
      <Rbox pos={[right - 1.2, 0.62, r.z0 + 1.4]} size={[2.6, 1.0, 1.4]} r={0.08} color={STEEL} />
      {[-0.6, 0.6].map((x) => (
        <Ball key={x} pos={[right - 1.2 + x, 1.35, r.z0 + 1.4]} r={0.25} color={x < 0 ? C.leaf : C.cherry} scale={[1, 0.7, 1]} />
      ))}
      {[-4.5, -2.2, 2.2, 4.5].map((x, i) => (
        <group key={x} position={[kx + x, 2.9, r.z0 + 0.4]}>
          <Cyl pos={[0, 0, 0.05]} rTop={0.3} h={0.06} color={i % 2 ? C.metal : '#3B3F46'} seg={14} rot={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* the pass: counter between the kitchen and the dining hall */}
      <Rbox pos={[mid(left - 1, right), 0.55, passZ - 0.1]} size={[right - left + 2, 1.1, 0.95]} r={0.08} color={STEEL} />
      <Rbox pos={[mid(left - 1, right), 1.13, passZ - 0.1]} size={[right - left + 2.1, 0.1, 1.15]} r={0.04} color="#C9915F" />
      <Rbox pos={[kx - 0.9, 1.2, passZ + 0.25]} size={[2.6, 0.06, 0.5]} r={0.03} color={STEEL_DARK} />
      {/* ticket rail + heat lamp over the pick-up window */}
      <Rbox pos={[kx - 0.9, 2.4, passZ - 0.2]} size={[2.8, 0.08, 0.1]} r={0.02} color={STEEL_DARK} />
      {[-1.0, -0.5, 0, 0.5, 1.0].map((x) => (
        <Rbox key={x} pos={[kx - 0.9 + x, 2.15, passZ - 0.18]} size={[0.28, 0.4, 0.02]} r={0.01} color={C.white} />
      ))}
      <Glow pos={[kx - 0.9, 2.0, passZ + 0.1]} r={0.18} color="#FFB36B" strength={Math.max(glow, 0.5)} />
    </group>
  );
}

function Bar({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { plate: r, anchors } = plan;
  const bx = anchors.cashiers.x;
  const passZ = anchors.window.z;
  const left = 1.4;
  const right = r.x1 - 2;
  const cx = mid(left, right);
  const bottles = ['#8DBFB5', '#F2A7A0', '#7DB661', '#F2C14E', '#D9B8C9'];
  return (
    <group>
      {/* back shelves with bottles + a chalk menu */}
      <Rbox pos={[cx, 2.2, r.z0 + 0.3]} size={[right - left, 0.1, 0.7]} r={0.03} color={C.wood} />
      <Rbox pos={[cx, 3.2, r.z0 + 0.3]} size={[right - left, 0.1, 0.7]} r={0.03} color={C.wood} />
      {Array.from({ length: Math.floor((right - left) / 0.9) }).map((_, i) => (
        <group key={i} position={[left + 0.6 + i * 0.9, 0, r.z0 + 0.3]}>
          <Cyl pos={[0, 2.5, 0]} rTop={0.13} h={0.6} color={bottles[i % bottles.length]} seg={10} />
          <Cyl pos={[0, 2.88, 0]} rTop={0.05} h={0.2} color={bottles[i % bottles.length]} seg={8} />
          {i % 2 ? <Ball pos={[0, 3.5, 0]} r={0.24} color={C.cream2} scale={[1, 0.7, 1]} /> : <Cyl pos={[0, 3.45, 0]} rTop={0.18} h={0.4} color={C.white} seg={10} />}
        </group>
      ))}
      <Rbox pos={[bx - 2.6, 1.5, r.z0 + 0.4]} size={[2.6, 1.5, 0.12]} r={0.06} color="#3A3A44" />
      {[0, 1, 2].map((i) => (
        <Rbox key={i} pos={[bx - 3.3 + i * 0.7, 1.5 + (i % 2) * 0.3, r.z0 + 0.5]} size={[0.5, 0.08, 0.02]} r={0.01} color={['#FFE08A', '#F7A8B8', '#B9DDB0'][i]} />
      ))}
      {/* counter + stools */}
      <Rbox pos={[cx, 0.55, passZ - 0.1]} size={[right - left, 1.1, 0.95]} r={0.1} color={C.wood} />
      <Rbox pos={[cx, 1.13, passZ - 0.1]} size={[right - left + 0.1, 0.1, 1.2]} r={0.04} color={C.cream} />
      {[bx + 1.6, bx + 3.3, bx + 5.0].map((x, i) => (
        <group key={x} position={[x, 0, passZ + 1.3]}>
          <Cyl pos={[0, 0.45, 0]} rTop={0.06} h={0.9} color={STEEL_DARK} seg={8} />
          <Cyl pos={[0, 0.95, 0]} rTop={0.34} h={0.18} color={[C.cherry, C.roof, C.pink][i]} seg={16} />
          <Cyl pos={[0, 0.04, 0]} rTop={0.3} h={0.06} color={STEEL_DARK} seg={14} />
        </group>
      ))}
      {/* register, espresso machine, cake case, the service bell */}
      <Rbox pos={[bx - 0.6, 1.4, passZ - 0.3]} size={[0.9, 0.45, 0.6]} r={0.08} color={STEEL} />
      <Rbox pos={[bx - 0.6, 1.72, passZ - 0.38]} size={[0.7, 0.2, 0.3]} r={0.05} color="#B9DDB0" />
      <Rbox pos={[bx + 2.3, 1.55, passZ - 0.3]} size={[1.3, 0.8, 0.7]} r={0.1} color="#A33B3B" />
      <Rbox pos={[bx + 2.3, 1.2, passZ + 0.1]} size={[0.5, 0.1, 0.3]} r={0.03} color={STEEL_DARK} />
      <Rbox pos={[bx + 4.4, 1.6, passZ - 0.2]} size={[1.6, 0.9, 0.7]} r={0.08} color="#E8F5F0" />
      {[-0.4, 0.4].map((x) => (
        <Ball key={x} pos={[bx + 4.4 + x, 1.35, passZ - 0.2]} r={0.2} color={x < 0 ? C.pink : C.yellow} scale={[1, 0.8, 1]} />
      ))}
      <Cyl pos={[anchors.bell.x, 1.2, anchors.bell.z]} rTop={0.28} h={0.05} color={C.gold} seg={16} />
      <Ball pos={[anchors.bell.x, 1.36, anchors.bell.z]} r={0.19} color={C.gold} scale={[1, 0.85, 1]} />
      <Glow pos={[bx + 1.4, 2.0, passZ - 0.2]} r={0.14} color={C.glow} strength={glow} />
    </group>
  );
}

// ---------- front: host stand, waiting area, planters ----------
function Planter({ pos, len, flowers = true }: { pos: V3; len: number; flowers?: boolean }) {
  return (
    <group position={pos}>
      <Rbox pos={[0, 0.35, 0]} size={[len, 0.7, 0.9]} r={0.12} color={C.wood} />
      <Rbox pos={[0, 0.78, 0]} size={[len - 0.2, 0.3, 0.7]} r={0.14} color={C.leafDark} />
      {Array.from({ length: Math.max(2, Math.floor(len / 1.4)) }).map((_, i, a) => (
        <Ball key={i} pos={[-len / 2 + (i + 0.5) * (len / a.length), 1.05, 0]} r={0.32} color={C.leaf} />
      ))}
      {flowers
        ? Array.from({ length: Math.floor(len / 1.6) }).map((_, i) => (
            <Ball key={i} pos={[-len / 2 + 0.8 + i * 1.6, 1.38, 0.05]} r={0.1} color={[C.pink, C.yellow, C.white][i % 3]} />
          ))
        : null}
    </group>
  );
}

function Host({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { office } = plan.anchors;
  const x = office.x + 3.6;
  return (
    <group position={[x, 0.14, office.z]}>
      <Blob pos={[0, 0, 0]} r={1.4} opacity={0.2} />
      <Rbox pos={[0, 0.55, 0]} size={[1.4, 1.1, 0.8]} r={0.1} color={C.woodDark} />
      <Rbox pos={[0, 1.14, 0]} size={[1.5, 0.1, 0.9]} r={0.04} color={C.wood} />
      <Rbox pos={[0.2, 1.3, 0]} size={[0.5, 0.22, 0.36]} r={0.03} color={C.cream2} rot={[0, 0.3, 0]} />
      <Cyl pos={[-0.45, 1.3, 0]} rTop={0.04} h={0.4} color={STEEL_DARK} seg={8} />
      <Glow pos={[-0.45, 1.55, 0]} r={0.14} color={C.glow} strength={glow} />
    </group>
  );
}

function Front({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { plate: r, plaza, photo, lounge } = plan;
  const frontLine = plaza.z1 + 1.8;
  return (
    <group>
      {/* planters divide the dining hall from the waiting area, leaving the walkway open */}
      <Planter pos={[mid(r.x0 + 0.8, -3.6), 0.14, frontLine]} len={-3.6 - (r.x0 + 0.8) - 0.4} />
      <Planter pos={[mid(3.6, r.x1 - 0.8), 0.14, frontLine]} len={r.x1 - 0.8 - 3.6 - 0.4} />
      <Lounge pos={[lounge.x, 0, lounge.z]} glow={glow} />
      <PhotoCorner pos={[photo.x, 0, photo.z]} glow={glow} />
      <Host plan={plan} glow={glow} />
      {/* corner plants */}
      <FlowerPot pos={[r.x0 + 1.2, 0.14, r.z1 - 1.2]} s={1.6} />
      <FlowerPot pos={[r.x1 - 1.2, 0.14, r.z1 - 1.2]} s={1.6} />
      <FlowerPot pos={[-2.4, 0.14, r.z1 - 1.0]} s={1.3} />
      <FlowerPot pos={[2.4, 0.14, r.z1 - 1.0]} s={1.3} />
      <Flowers pos={[r.x0 + 1.4, 0.14, mid(plaza.z0, plaza.z1)]} n={6} spread={0.9} />
      <Flowers pos={[r.x1 - 1.4, 0.14, mid(plaza.z0, plaza.z1)]} n={6} spread={0.9} />
    </group>
  );
}

// ---------- restroom (front-right corner) ----------
export const RESTROOM_W = 4.6;
export const RESTROOM_D = 5.8;

export function restroomRect(plan: WorldPlan) {
  const r = plan.plate;
  return { x0: r.x1 - RESTROOM_W - 0.3, x1: r.x1 - 0.3, z0: r.z1 - RESTROOM_D - 0.8, z1: r.z1 - 0.8 };
}

function Toilet({ pos, rotY }: { pos: V3; rotY: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0.55, -0.3]} size={[0.62, 0.8, 0.28]} r={0.08} color={C.white} />
      <Cyl pos={[0, 0.3, 0.1]} rTop={0.3} rBottom={0.22} h={0.5} color={C.white} seg={16} />
      <Cyl pos={[0, 0.56, 0.1]} rTop={0.3} h={0.06} color="#EEF4F0" seg={16} />
      <Ball pos={[0, 1.0, -0.3]} r={0.06} color={STEEL_DARK} />
    </group>
  );
}

function Sink({ pos, rotY }: { pos: V3; rotY: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Rbox pos={[0, 0.9, 0]} size={[0.9, 0.12, 0.55]} r={0.06} color={C.white} />
      <Rbox pos={[0, 0.45, -0.05]} size={[0.14, 0.9, 0.14]} r={0.04} color={C.stone} />
      <Cyl pos={[0, 1.02, -0.15]} rTop={0.03} h={0.22} color={STEEL_DARK} seg={6} />
      <Rbox pos={[0, 1.7, -0.27]} size={[0.8, 0.9, 0.05]} r={0.04} color="#DCEFE9" />
      <Rbox pos={[0, 1.7, -0.3]} size={[0.9, 1.0, 0.04]} r={0.03} color={C.woodDark} />
    </group>
  );
}

/** Two single cubicles (men / women) with their doors facing into the room. */
function Restroom({ plan }: { plan: WorldPlan }) {
  const rr = restroomRect(plan);
  const cz = mid(rr.z0, rr.z1);
  const hgt = 2.7;
  const wall = '#D6EFE5';
  const tileBand = '#B9DDB0';
  const doorZ = [mid(rr.z0, cz), mid(cz, rr.z1)];
  return (
    <group>
      <Rbox pos={[mid(rr.x0, rr.x1), 0.06, cz]} size={[rr.x1 - rr.x0, 0.08, rr.z1 - rr.z0]} r={0.03} color="#F2F7F5" />
      {/* back (east) and side walls */}
      <Rbox pos={[rr.x1, hgt / 2, cz]} size={[0.25, hgt, rr.z1 - rr.z0 + 0.25]} r={0.06} color={wall} />
      <Rbox pos={[mid(rr.x0, rr.x1), hgt / 2, rr.z0]} size={[rr.x1 - rr.x0, hgt, 0.25]} r={0.06} color={wall} />
      <Rbox pos={[mid(rr.x0, rr.x1), hgt / 2, rr.z1]} size={[rr.x1 - rr.x0, hgt, 0.25]} r={0.06} color={wall} />
      <Rbox pos={[mid(rr.x0, rr.x1), hgt / 2, cz]} size={[rr.x1 - rr.x0, hgt, 0.2]} r={0.05} color={wall} />
      <Rbox pos={[rr.x1 - 0.1, 0.55, cz]} size={[0.06, 1.1, rr.z1 - rr.z0]} r={0.02} color={tileBand} />
      {/* the west wall (facing the room) has a doorway for each cubicle */}
      {[
        [rr.z0, doorZ[0] - 0.6],
        [doorZ[0] + 0.6, cz],
        [cz, doorZ[1] - 0.6],
        [doorZ[1] + 0.6, rr.z1],
      ].map(([a, b], i) => (
        <Rbox key={i} pos={[rr.x0, hgt / 2, mid(a, b)]} size={[0.25, hgt, Math.max(0.1, b - a)]} r={0.05} color={wall} />
      ))}
      {doorZ.map((z) => (
        <group key={z}>
          <Rbox pos={[rr.x0, 2.3, z]} size={[0.3, 0.2, 1.4]} r={0.04} color={C.woodDark} />
          <Rbox pos={[rr.x0 - 0.05, 1.05, z + 0.62]} size={[0.1, 2.1, 0.08]} r={0.02} color={C.woodDark} />
          <Rbox pos={[rr.x0 - 0.05, 1.05, z - 0.62]} size={[0.1, 2.1, 0.08]} r={0.02} color={C.woodDark} />
        </group>
      ))}
      {/* fixtures inside each cubicle */}
      {doorZ.map((z, i) => (
        <group key={i}>
          <Toilet pos={[rr.x1 - 0.7, 0.1, z + 0.5]} rotY={-Math.PI / 2} />
          <Sink pos={[rr.x1 - 0.45, 0.1, z - 0.6]} rotY={-Math.PI / 2} />
          <Ball pos={[rr.x0 + 0.9, 0.14, z]} r={0.0} color={C.white} />
        </group>
      ))}
      <Glow pos={[mid(rr.x0, rr.x1), 2.6, mid(rr.z0, cz)]} r={0.12} color={C.glow} strength={0.6} />
      <Glow pos={[mid(rr.x0, rr.x1), 2.6, mid(cz, rr.z1)]} r={0.12} color={C.glow} strength={0.6} />
    </group>
  );
}

/** The frame, ledge and chalk for the big menu board (the board itself is textured, in InteriorLive). */
function BoardFrame({ plan }: { plan: WorldPlan }) {
  const r = plan.plate;
  const z = mid(plan.plaza.z0, plan.plaza.z1);
  return (
    <group position={[r.x0 + 0.1, 0, z]}>
      <Rbox pos={[0.04, 3.0, 0]} size={[0.14, 4.5, 9.0]} r={0.08} color={C.woodDark} />
      <Rbox pos={[0.12, 0.85, 0]} size={[0.4, 0.14, 7.2]} r={0.05} color={C.wood} />
      <Glow pos={[0.4, 5.3, -3]} r={0.12} color={C.glow} strength={0.7} />
      <Glow pos={[0.4, 5.3, 3]} r={0.12} color={C.glow} strength={0.7} />
    </group>
  );
}

/** Pendant lights hanging low over the aisles. */
function Pendants({ plan, glow }: { plan: WorldPlan; glow: number }) {
  const { aisles, zTop, zBot } = plan.grid;
  const pts: [number, number][] = [];
  const stepX = Math.max(1, Math.ceil(aisles.length / 4));
  for (let i = 1; i < aisles.length - 1; i += stepX) {
    pts.push([aisles[i], zTop]);
    pts.push([aisles[i], zBot]);
  }
  return (
    <group>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Cyl pos={[0, 4.4, 0]} rTop={0.02} h={1.2} color={STEEL_DARK} seg={6} />
          <Cyl pos={[0, 3.9, 0]} rTop={0.12} rBottom={0.32} h={0.3} color={i % 2 ? C.cherry : C.roof} seg={14} />
          <Glow pos={[0, 3.7, 0]} r={0.14} color={C.glow} strength={glow} />
        </group>
      ))}
    </group>
  );
}

/** The whole indoor restaurant except the tables and people. */
export function InteriorStatic({ plan, glow }: { plan: WorldPlan; glow: number }) {
  return (
    <>
      <Floor plan={plan} />
      <Walls plan={plan} glow={glow} />
      <Kitchen plan={plan} glow={glow} />
      <Bar plan={plan} glow={glow} />
      <Front plan={plan} glow={glow} />
      <Pendants plan={plan} glow={glow} />
      <Restroom plan={plan} />
      <BoardFrame plan={plan} />
    </>
  );
}

/** Signs and cold air: textured/animated parts that must stay out of the bake. */
function menuTexture(items: MenuItem[], demo: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1536;
  c.height = 768;
  const g = c.getContext('2d')!;
  g.fillStyle = '#26342F';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#4A5E56';
  g.lineWidth = 6;
  g.strokeRect(18, 18, c.width - 36, c.height - 36);
  g.textBaseline = 'middle';
  g.fillStyle = '#FFB5AA';
  g.font = '700 78px system-ui, "Noto Sans Thai", sans-serif';
  g.textAlign = 'center';
  g.fillText('เมนูแนะนำวันนี้', c.width / 2, 92);
  g.font = '500 30px system-ui, "Noto Sans Thai", sans-serif';
  g.fillStyle = '#9DB8AE';
  g.fillText(demo ? 'ตัวอย่างเมนู (DEMO)' : 'ราคาเป็นบาท', c.width / 2, 150);
  if (!items.length) {
    g.fillStyle = '#E8DCC4';
    g.font = '600 56px system-ui, "Noto Sans Thai", sans-serif';
    g.fillText('ยังไม่มีเมนูในระบบ', c.width / 2, 400);
  }
  const rows = Math.ceil(Math.min(items.length, 12) / 2);
  items.slice(0, 12).forEach((it, i) => {
    const col = i < rows ? 0 : 1;
    const row = i % rows;
    const x0 = 70 + col * 750;
    const y = 230 + row * 90;
    g.textAlign = 'left';
    g.fillStyle = '#F4E8D0';
    g.font = '600 46px system-ui, "Noto Sans Thai", sans-serif';
    let name = it.name;
    while (name.length > 1 && g.measureText(name).width > 600) name = `${name.slice(0, -2)}…`;
    g.fillText(name, x0, y);
    g.textAlign = 'right';
    g.fillStyle = '#FFD36B';
    g.fillText(`฿${it.price % 1 ? it.price.toFixed(2) : it.price}`, x0 + 660, y);
    g.strokeStyle = '#3E524A';
    g.setLineDash([6, 10]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0, y + 36);
    g.lineTo(x0 + 660, y + 36);
    g.stroke();
    g.setLineDash([]);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function InteriorLive({ plan, menu = [], demo }: { plan: WorldPlan; menu?: MenuItem[]; demo: boolean }) {
  const menuTex = useMemo(() => menuTexture(menu, demo), [menu, demo]);
  const rr = restroomRect(plan);
  const cz = mid(rr.z0, rr.z1);
  const boardZ = mid(plan.plaza.z0, plan.plaza.z1);
  const { plate: r, anchors } = plan;
  const w = r.x1 - r.x0;
  return (
    <>
      <Sign pos={[anchors.cashiers.x + 0.6, 3.4, r.z0 + 0.62]} w={4.2} text="CAFÉ & BAR" fg="#FFB36B" bg="#3A2A24" />
      <Sign pos={[anchors.chefs.x, 5.6, r.z0 + 1.0]} w={4.4} text="ครัวสด ใหม่" fg="#B9DDB0" bg="#22302B" />
      <Sign pos={[0, 4.35, r.z1 + 0.45]} w={3.8} text="OPEN" fg="#FFB5A8" bg="#3A2A24" />
      {/* the big menu board on the left wall */}
      <mesh position={[r.x0 + 0.32, 3.0, boardZ]} rotation={[0, Math.PI / 2, 0]} userData={{ noBake: true }}>
        <planeGeometry args={[8.6, 4.3]} />
        <meshBasicMaterial map={menuTex} />
      </mesh>
      {/* restroom signs */}
      <Sign pos={[rr.x0 - 0.2, 3.25, cz]} w={2.6} text="ห้องน้ำ WC" fg="#B9DDB0" bg="#22302B" rotY={-Math.PI / 2} />
      <Sign pos={[rr.x0 - 0.2, 2.62, mid(rr.z0, cz)]} w={1.1} text="ชาย" fg="#9ED3CC" bg="#2F3A36" rotY={-Math.PI / 2} />
      <Sign pos={[rr.x0 - 0.2, 2.62, mid(cz, rr.z1)]} w={1.1} text="หญิง" fg="#FFB5AA" bg="#3A2A24" rotY={-Math.PI / 2} />
      <ColdAir pos={[-w / 4, 3.7, r.z0 + 0.45]} rotY={0} />
      <ColdAir pos={[w / 4, 3.7, r.z0 + 0.45]} rotY={0} />
      <ColdAir pos={[r.x0 + 0.45, 3.7, mid(plan.plaza.z0, plan.plaza.z1) + 6.4]} rotY={Math.PI / 2} />
      <ColdAir pos={[r.x1 - 0.45, 3.7, mid(r.z0, r.z1) + 3]} rotY={-Math.PI / 2} />
    </>
  );
}

export type { Rect };


/** Stretches of side wall that are already taken (windows, the menu board, the restroom) as {z, half}. */
export function wallBlocks(plan: WorldPlan, side: 'L' | 'R'): { z: number; half: number }[] {
  const r = plan.plate;
  const boardZ = mid(plan.plaza.z0, plan.plaza.z1);
  const out: { z: number; half: number }[] = [];
  for (let z = r.z0 + 8; z <= r.z1 - 6; z += 9) {
    if (side === 'R' || Math.abs(z - boardZ) > 6) out.push({ z, half: 2.2 });
  }
  if (side === 'L') out.push({ z: boardZ, half: 4.9 });
  else {
    const rr = restroomRect(plan);
    out.push({ z: mid(rr.z0, rr.z1), half: (rr.z1 - rr.z0) / 2 + 0.5 });
  }
  return out;
}
