import type { PickFn } from '../../selection';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { CanvasTexture, Color, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial, type Sprite, type SpriteMaterial } from 'three';
import type { Role } from '../../types';
import { C } from '../palette';
import { Ball, Cyl, Rbox } from '../scene/parts';
import { RING, type Look, type Outfit, type Pattern } from './people';
import type { Agent } from '../sim/agent';
import { bubbleTexture } from '../sim/effects';

// Clay-toy proportions: a very big round head on a small bean body, stubby limbs.
const HEAD_Y = 1.36;
const HEAD_R = 0.72;
const INK = '#33252B';

const mix = (a: string, b: string, t: number) => `#${new Color(a).lerp(new Color(b), t).getHexString()}`;

function Bow({ pos, color, s = 1, rot = 0 }: { pos: [number, number, number]; color: string; s?: number; rot?: number }) {
  return (
    <group position={pos} scale={s} rotation={[0, 0, rot]}>
      <Ball pos={[-0.16, 0, 0]} r={0.15} color={color} scale={[1.15, 0.85, 0.6]} />
      <Ball pos={[0.16, 0, 0]} r={0.15} color={color} scale={[1.15, 0.85, 0.6]} />
      <Ball pos={[0, 0, 0.02]} r={0.07} color={mix(color, '#FFFFFF', 0.4)} />
    </group>
  );
}

function Star({ pos, color, s = 1 }: { pos: [number, number, number]; color: string; s?: number }) {
  return (
    <mesh position={pos} scale={s} rotation={[0.3, 0.4, 0.2]}>
      <octahedronGeometry args={[0.1, 0]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

/** Stripes, dots or stars printed on the shirt. */
function ShirtPattern({ kind, top, accent }: { kind: Pattern; top: string; accent: string }) {
  if (kind === 'plain') return null;
  // dark shirts get white prints, light shirts get the accent colour
  const color = new Color(top).getHSL({ h: 0, s: 0, l: 0 }).l > 0.72 ? accent : '#FFFFFF';
  const R = (dy: number) => Math.sqrt(Math.max(0.01, 0.43 * 0.43 - dy * dy));
  if (kind === 'stripes')
    return (
      <>
        {[-0.2, -0.03, 0.14, 0.3].map((dy) => (
          <mesh key={dy} position={[0, 0.62 + dy, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.03, 0.93, 1]}>
            <torusGeometry args={[R(dy) * 1.01, 0.028, 6, 24]} />
            <meshLambertMaterial color={color} />
          </mesh>
        ))}
      </>
    );
  const spots: [number, number][] = [];
  [0.42, 0.58, 0.74, 0.88].forEach((y, row) => {
    for (let a = -1.1 + (row % 2) * 0.3; a <= 1.15; a += 0.6) spots.push([a, y]);
  });
  return (
    <>
      {spots.map(([a, y], i) => {
        const r = R(y - 0.62) * 1.02;
        const p: [number, number, number] = [Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 0.93];
        return kind === 'dots' ? (
          <Ball key={i} pos={p} r={0.034} color={color} />
        ) : (
          <Star key={i} pos={p} color={color} s={0.55} />
        );
      })}
    </>
  );
}

/** Hair: soft clay lumps. Cap + fringe + one signature shape per style + a pretty clip. */
function Hair({ look, sway, lite }: { look: Look; sway: React.RefObject<Group | null>; lite: boolean }) {
  const { style, hair, bow } = look;
  if (lite)
    return (
      <>
        <Ball pos={[0, HEAD_Y + 0.12, -0.12]} r={0.76} color={hair} />
        {[-0.36, 0, 0.36].map((x) => (
          <Ball key={x} pos={[x, HEAD_Y + 0.4 - Math.abs(x) * 0.22, 0.5 - Math.abs(x) * 0.28]} r={0.26} color={hair} scale={[0.85, 1, 0.6]} />
        ))}
        {style === 'bun' || style === 'twinbuns' ? <Ball pos={[0, HEAD_Y + 0.88, -0.14]} r={0.26} color={hair} /> : null}
        {style === 'pigtails' || style === 'sidepony' ? (
          <>
            <Ball pos={[-0.72, HEAD_Y - 0.05, -0.1]} r={0.24} color={hair} />
            <Ball pos={[0.72, HEAD_Y - 0.05, -0.1]} r={0.24} color={hair} />
          </>
        ) : null}
        {style === 'long' ? <Ball pos={[0, HEAD_Y - 0.6, -0.5]} r={0.6} color={hair} scale={[1.05, 1.5, 0.55]} /> : null}
      </>
    );
  return (
    <>
      <Ball pos={[0, HEAD_Y + 0.12, -0.12]} r={0.76} color={hair} />
      {/* fringe: five soft strands + one swept to the side */}
      {[-0.46, -0.23, 0, 0.23, 0.46].map((x) => (
        <Ball
          key={x}
          pos={[x, HEAD_Y + 0.4 - Math.abs(x) * 0.22, 0.5 - Math.abs(x) * 0.28]}
          r={0.22}
          color={hair}
          scale={[0.8, 1.0 + (x === 0 ? 0.15 : 0), 0.6]}
        />
      ))}
      <Ball pos={[0.5, HEAD_Y + 0.18, 0.46]} r={0.14} color={mix(hair, '#FFFFFF', 0.12)} scale={[0.6, 1.4, 0.6]} />

      {style === 'tuft' ? (
        <>
          <group ref={sway} position={[0.02, HEAD_Y + 0.84, 0]}>
            <Ball pos={[0, 0, 0]} r={0.14} color={hair} scale={[0.8, 1.4, 0.8]} />
            <Ball pos={[0.11, 0.18, 0]} r={0.1} color={hair} />
          </group>
          <Bow pos={[-0.5, HEAD_Y + 0.58, 0.18]} color={bow} s={0.8} rot={0.5} />
        </>
      ) : null}
      {style === 'bun' ? (
        <>
          <Ball pos={[0, HEAD_Y + 0.88, -0.14]} r={0.28} color={hair} />
          <Ball pos={[0, HEAD_Y + 0.88, -0.14]} r={0.31} color={bow} scale={[1, 0.3, 1]} />
          <Star pos={[0.4, HEAD_Y + 0.68, 0.2]} color={C.yellow} s={1.2} />
        </>
      ) : null}
      {style === 'pigtails' ? (
        <>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Ball pos={[s * 0.74, HEAD_Y + 0.12, -0.12]} r={0.25} color={hair} />
              <Ball pos={[s * 0.8, HEAD_Y - 0.14, -0.1]} r={0.19} color={hair} />
              <Bow pos={[s * 0.64, HEAD_Y + 0.36, 0.02]} color={bow} s={0.85} rot={s * -0.5} />
            </group>
          ))}
        </>
      ) : null}
      {style === 'bowl' ? (
        <>
          {[-1, 1].map((s) => (
            <Ball key={s} pos={[s * 0.66, HEAD_Y - 0.1, 0.02]} r={0.22} color={hair} scale={[0.6, 1.5, 0.9]} />
          ))}
          <Star pos={[0.46, HEAD_Y + 0.58, 0.24]} color={bow} s={1.3} />
        </>
      ) : null}
      {style === 'twinbuns' ? (
        <>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Ball pos={[s * 0.5, HEAD_Y + 0.78, -0.1]} r={0.25} color={hair} />
              <Bow pos={[s * 0.5, HEAD_Y + 0.6, 0.06]} color={bow} s={0.6} rot={s * -0.3} />
            </group>
          ))}
        </>
      ) : null}
      {style === 'long' ? (
        <>
          <Ball pos={[0, HEAD_Y - 0.62, -0.5]} r={0.6} color={hair} scale={[1.05, 1.5, 0.55]} />
          <Ball pos={[0, HEAD_Y - 1.0, -0.5]} r={0.42} color={mix(hair, '#FFFFFF', 0.18)} scale={[1.1, 0.7, 0.55]} />
          {[-1, 1].map((s) => (
            <Ball key={s} pos={[s * 0.68, HEAD_Y - 0.4, 0.06]} r={0.22} color={hair} scale={[0.55, 1.6, 0.75]} />
          ))}
          <Bow pos={[0.5, HEAD_Y + 0.56, 0.16]} color={bow} s={0.8} rot={-0.4} />
        </>
      ) : null}
      {style === 'curly' ? (
        <>
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <Ball
                key={i}
                pos={[Math.cos(a) * 0.72, HEAD_Y + 0.12 + Math.sin(i * 2.1) * 0.22, Math.sin(a) * 0.55 - 0.15]}
                r={0.25}
                color={hair}
              />
            );
          })}
          {[-0.3, 0, 0.3].map((x) => (
            <Ball key={x} pos={[x, HEAD_Y + 0.78, -0.05]} r={0.22} color={hair} />
          ))}
          <Star pos={[0.5, HEAD_Y + 0.62, 0.24]} color={C.yellow} s={1.2} />
        </>
      ) : null}
      {style === 'sidepony' ? (
        <>
          <Ball pos={[-0.62, HEAD_Y + 0.38, -0.02]} r={0.1} color={bow} />
          {[0, 1, 2].map((i) => (
            <Ball key={i} pos={[-0.78 - i * 0.04, HEAD_Y + 0.2 - i * 0.26, -0.04]} r={0.22 - i * 0.03} color={hair} scale={[0.9, 1.1, 0.9]} />
          ))}
          <Bow pos={[-0.62, HEAD_Y + 0.52, 0.1]} color={bow} s={0.75} rot={0.4} />
        </>
      ) : null}
    </>
  );
}

function HeadWear({ role, accent }: { role: Role; accent: string }) {
  if (role === 'KITCHEN')
    return (
      <group position={[0, HEAD_Y + 0.8, -0.04]}>
        <Cyl pos={[0, 0.1, 0]} rTop={0.46} rBottom={0.4} h={0.3} color={C.white} />
        <Cyl pos={[0, 0.02, 0]} rTop={0.47} rBottom={0.47} h={0.07} color={accent} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Ball key={i} pos={[Math.cos(i * 1.2566) * 0.27, 0.4, Math.sin(i * 1.2566) * 0.27]} r={0.25} color={C.white} />
        ))}
        <Ball pos={[0, 0.52, 0]} r={0.28} color={C.white} />
      </group>
    );
  if (role === 'OWNER')
    return (
      <group position={[0, HEAD_Y + 0.74, -0.02]}>
        <Cyl pos={[0, 0.08, 0]} rTop={0.36} rBottom={0.32} h={0.2} color={C.gold} />
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} position={[Math.cos(i * 1.2566) * 0.32, 0.18, Math.sin(i * 1.2566) * 0.32]}>
            <mesh position={[0, 0.12, 0]}>
              <coneGeometry args={[0.1, 0.26, 4]} />
              <meshLambertMaterial color={C.gold} />
            </mesh>
            <Ball pos={[0, 0.27, 0]} r={0.05} color={[C.cherry, C.sky, C.mint][i % 3]} />
          </group>
        ))}
        <Ball pos={[0, 0.1, 0.35]} r={0.08} color={C.cherry} />
      </group>
    );
  return null;
}

/** Everything on the body: collar, belt, apron / vest / scarf, a skirt hem and the thing in the hand. */
function BodyWear({ role, outfit }: { role: Role; outfit: Outfit }) {
  const { top, accent } = outfit;
  if (role === 'KITCHEN')
    return (
      <>
        {/* double-breasted jacket + scarf */}
        {[0.66, 0.5, 0.34].map((y) => (
          <group key={y}>
            <Ball pos={[-0.1, y, 0.4]} r={0.04} color={accent} />
            <Ball pos={[0.1, y, 0.4]} r={0.04} color={accent} />
          </group>
        ))}
        <mesh position={[0, 0.92, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.07, 8, 18]} />
          <meshLambertMaterial color={accent} />
        </mesh>
        <Ball pos={[0.12, 0.88, 0.3]} r={0.09} color={accent} scale={[1.2, 1, 0.8]} />
        <Rbox pos={[0, 0.2, 0.05]} size={[0.62, 0.18, 0.44]} r={0.08} color="#4A4A58" />
      </>
    );
  if (role === 'CASHIER')
    return (
      <>
        {/* frilly collar, apron with pocket + heart, flared skirt with scalloped hem */}
        {[-1, 1].map((x) => (
          <Ball key={x} pos={[x * 0.15, 0.92, 0.3]} r={0.12} color={C.white} scale={[1.2, 0.7, 0.8]} />
        ))}
        <Ball pos={[0, 0.58, 0.3]} r={0.34} color={accent} scale={[1.0, 1.15, 0.5]} />
        <Ball pos={[0, 0.5, 0.44]} r={0.12} color={mix(accent, '#FFFFFF', 0.45)} scale={[1.3, 0.9, 0.4]} />
        <Ball pos={[-0.06, 0.7, 0.44]} r={0.05} color={C.cherry} />
        <Ball pos={[0.06, 0.7, 0.44]} r={0.05} color={C.cherry} />
        <Cyl pos={[0, 0.3, 0]} rTop={0.4} rBottom={0.62} h={0.3} color={mix(accent, '#FFFFFF', 0.25)} seg={22} />
        {Array.from({ length: 14 }).map((_, i) => (
          <Ball key={i} pos={[Math.cos((i / 14) * 6.283) * 0.6, 0.17, Math.sin((i / 14) * 6.283) * 0.6]} r={0.09} color={mix(accent, '#FFFFFF', 0.25)} />
        ))}
        <Bow pos={[0, 0.84, 0.4]} color={top === '#FFFFFF' ? C.pink : C.cherry} s={0.55} />
      </>
    );
  if (role === 'ADMIN')
    return (
      <>
        {/* shirt collar, vest, tie */}
        {[-1, 1].map((x) => (
          <Ball key={x} pos={[x * 0.13, 0.92, 0.32]} r={0.11} color={C.white} scale={[1.2, 0.7, 0.7]} />
        ))}
        <Ball pos={[0, 0.62, 0.22]} r={0.38} color={accent} scale={[1.02, 1.05, 0.6]} />
        <Rbox pos={[0, 0.74, 0.42]} size={[0.08, 0.34, 0.04]} r={0.02} color={C.cream2} />
        <Ball pos={[0, 0.9, 0.4]} r={0.07} color={C.cherry} />
        <Cyl pos={[0, 0.3, 0]} rTop={0.4} rBottom={0.58} h={0.28} color={mix(accent, '#000000', 0.15)} seg={22} />
      </>
    );
  return (
    <>
      {/* sweater with a star badge, pearls, flared skirt, little golden cape */}
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 8) * Math.PI - Math.PI;
        return <Ball key={i} pos={[Math.cos(a) * 0.2, 0.9 + Math.sin(a) * 0.09, 0.32 + Math.sin(a) * 0.03]} r={0.045} color={C.white} />;
      })}
      <Star pos={[0.18, 0.62, 0.42]} color={C.gold} s={1.4} />
      <Cyl pos={[0, 0.3, 0]} rTop={0.4} rBottom={0.6} h={0.3} color={accent} seg={22} />
      <Ball pos={[0, 0.62, -0.38]} r={0.42} color={accent} scale={[1.1, 1.2, 0.3]} />
    </>
  );
}

/** What each person holds, attached to the right hand so it moves with the arm. */
function Held({ role, accent }: { role: Role; accent: string }) {
  if (role === 'KITCHEN')
    return (
      <group position={[0.02, -0.02, 0.1]} rotation={[0.3, 0, -0.2]}>
        <Cyl pos={[0, 0.2, 0]} rTop={0.03} h={0.5} color={C.woodDark} seg={6} />
        <Ball pos={[0, 0.5, 0]} r={0.12} color={C.metal} scale={[1, 0.5, 1]} />
      </group>
    );
  if (role === 'CASHIER')
    return (
      <group position={[0.02, 0.0, 0.14]} rotation={[0.2, 0, 0.15]}>
        <Rbox pos={[0, 0.14, 0]} size={[0.24, 0.3, 0.04]} r={0.02} color={C.cream2} />
        <Ball pos={[0, 0.2, 0.03]} r={0.04} color={accent} />
        <Rbox pos={[0, 0.1, 0.03]} size={[0.14, 0.02, 0.01]} r={0.005} color={C.stone} />
      </group>
    );
  if (role === 'ADMIN')
    return (
      <group position={[0.02, 0.0, 0.14]} rotation={[0.2, 0, 0.1]}>
        <Rbox pos={[0, 0.16, 0]} size={[0.3, 0.38, 0.05]} r={0.03} color={C.wood} />
        <Rbox pos={[0, 0.16, 0.03]} size={[0.24, 0.3, 0.02]} r={0.01} color={C.white} />
        <Rbox pos={[0, 0.33, 0.04]} size={[0.1, 0.06, 0.03]} r={0.01} color={C.metal} />
      </group>
    );
  return (
    <group position={[0.02, 0.0, 0.14]}>
      <Cyl pos={[0, 0.1, 0]} rTop={0.11} h={0.03} color={C.gold} seg={16} rot={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function nameTexture(name: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.roundRect(4, 6, 248, 60, 30);
  g.fill();
  g.fillStyle = '#1F1F1F';
  g.font = '700 38px system-ui, "Noto Sans Thai", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.length > 12 ? `${name.slice(0, 11)}…` : name, 128, 38);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * A clay-toy person: huge round head, bean body, stubby limbs, sparkly dot eyes, soft hair lumps with
 * a pretty clip, a role outfit with an item in hand, and a status ring. Idle: squash-and-stretch hops,
 * head tilt, blinking, arm wiggle and hair sway.
 */
export function Character({
  agent,
  showName,
  s = 1,
  onPick,
  selected = false,
}: {
  agent: Agent;
  showName: boolean;
  s?: number;
  onPick?: PickFn;
  selected?: boolean;
}) {
  const { look, outfit, staff, phase } = agent;
  const role = staff.role;
  const name = staff.name;
  const lite = role === 'GUEST';
  const outer = useRef<Group>(null);
  const root = useRef<Group>(null);
  const squish = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const hairSway = useRef<Group>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const bubble = useRef<Sprite>(null);
  const marker = useRef<Group>(null);
  // face parts, switched by mood
  const happyEyes = useRef<Group>(null);
  const smile = useRef<Mesh>(null);
  const frown = useRef<Mesh>(null);
  const mouthO = useRef<Mesh>(null);
  const browL = useRef<Mesh>(null);
  const browR = useRef<Mesh>(null);
  const cheekL = useRef<Mesh>(null);
  const cheekR = useRef<Mesh>(null);
  const prevPose = useRef<string>('');
  const settleAt = useRef(-9);
  const selRef = useRef(selected);
  selRef.current = selected;
  const lastBubble = useRef<string | null>('init');
  const lastStatus = useRef<string>('');
  const tex = useMemo(() => (showName ? nameTexture(name) : null), [showName, name]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const pose = agent.pose;
    if (outer.current) {
      outer.current.position.set(agent.x, 0.14 + agent.sitY, agent.z);
      outer.current.rotation.y = agent.rotY;
    }
    if (marker.current) {
      marker.current.visible = selRef.current;
      if (selRef.current) marker.current.position.y = 3.1 + Math.sin(clock.elapsedTime * 5) * 0.12;
    }
    if (ring.current && lastStatus.current !== agent.status) {
      ring.current.color.set(RING[agent.status]);
      lastStatus.current = agent.status;
    }
    if (bubble.current && lastBubble.current !== agent.bubble) {
      lastBubble.current = agent.bubble;
      bubble.current.visible = !!agent.bubble;
      if (agent.bubble) {
        const m = bubble.current.material as SpriteMaterial;
        m.map = bubbleTexture(agent.bubble);
        m.needsUpdate = true;
      }
    }

    // landing squash when a walk (or any pose) ends, a little bow when serving
    if (prevPose.current !== pose) {
      if (prevPose.current === 'walk' || prevPose.current === 'carry') settleAt.current = t;
      prevPose.current = pose;
    }
    const since = t - settleAt.current;
    const settle = since < 0.6 ? Math.sin(since * 20) * Math.exp(-since * 6) * 0.14 : 0;
    // each pose is a small variation on the same rig
    const walking = pose === 'walk' || pose === 'carry';
    const freq = walking ? 7 : pose === 'cheer' ? 6 : 2.2;
    const hop = pose === 'cheer' ? Math.abs(Math.sin(t * freq)) * 0.45 : walking ? Math.abs(Math.sin(t * freq)) * 0.17 : Math.max(0, Math.sin(t * 2.2)) ** 2 * 0.1;
    const seated = pose === 'sit' || pose === 'eat';
    const dancing = pose === 'dance';
    if (root.current) root.current.position.y = seated ? -0.3 : pose === 'nap' ? -0.08 : dancing ? Math.abs(Math.sin(t * 6)) * 0.22 : hop;
    if (squish.current) {
      const k = (pose === 'nap' ? -0.06 : Math.sin(t * freq * (walking ? 2 : 1)) * (walking ? 0.09 : 0.035)) + settle;
      squish.current.scale.set(1 - k * 0.6, 1 + k, 1 - k * 0.6);
      squish.current.rotation.x = walking ? 0.12 : pose === 'serve' ? 0.25 + Math.max(0, Math.sin(t * 2.5)) * 0.2 : 0;
      squish.current.rotation.z = walking ? Math.sin(t * freq * 0.5) * 0.06 : dancing ? Math.sin(t * 6) * 0.2 : 0;
      if (pose === 'stretch') squish.current.rotation.x = -0.15;
    }
    if (head.current) {
      head.current.rotation.z = pose === 'nap' ? 0.35 + Math.sin(t) * 0.04 : Math.sin(t * 1.1) * 0.07;
      head.current.rotation.y = walking ? 0 : Math.sin(t * 0.55) * 0.3;
      head.current.rotation.x = pose === 'stir' || pose === 'type' ? 0.22 : pose === 'nap' ? 0.2 : pose === 'stretch' ? -0.2 : pose === 'eat' ? 0.12 : 0;
      if (pose === 'think') head.current.rotation.z = 0.18;
    }
    // mood -> face
    const b = agent.bubble;
    const mood: 'happy' | 'angry' | 'yum' | 'sleep' | 'calm' =
      pose === 'nap' ? 'sleep'
      : b === 'angry' || b === 'late' || agent.status === 'late' ? 'angry'
      : pose === 'eat' ? 'yum'
      : pose === 'cheer' || pose === 'dance' || pose === 'wave' || b === 'paid' || b === 'ready' || b === 'happy' || b === 'hi' || b === 'music' ? 'happy'
      : 'calm';
    const blink = (t * 0.25) % 1 > 0.96;
    if (eyes.current) eyes.current.visible = mood !== 'happy' && mood !== 'sleep' && !(mood === 'yum' && Math.sin(t * 4) > 0.2);
    if (eyes.current) eyes.current.scale.y = blink ? 0.1 : 1;
    if (happyEyes.current) happyEyes.current.visible = mood === 'happy' || mood === 'sleep' || (mood === 'yum' && Math.sin(t * 4) > 0.2);
    if (smile.current) smile.current.visible = mood === 'happy' || mood === 'calm' || mood === 'sleep';
    if (smile.current) smile.current.scale.set(mood === 'happy' ? 1.7 : 1, mood === 'happy' ? 1.5 : 1, 1);
    if (frown.current) frown.current.visible = mood === 'angry';
    if (mouthO.current) {
      mouthO.current.visible = mood === 'yum';
      mouthO.current.scale.y = 0.7 + Math.abs(Math.sin(t * 4)) * 0.6;
    }
    const k = mood === 'angry' ? 1 : 0;
    if (browL.current) browL.current.rotation.z = k * -0.5;
    if (browR.current) browR.current.rotation.z = k * 0.5;
    const cheek = mood === 'happy' || mood === 'yum' ? 1.5 : mood === 'angry' ? 0.6 : 1;
    if (cheekL.current) cheekL.current.scale.set(cheek, 0.65 * cheek, 0.25);
    if (cheekR.current) cheekR.current.scale.set(cheek, 0.65 * cheek, 0.25);


    // arms
    let l = 0.3 + Math.sin(t * 2.2) * 0.25;
    let r = -0.3 - Math.sin(t * 2.2 + 1) * 0.25;
    let rx = 0;
    if (walking) {
      l = 0.3 + Math.sin(t * freq) * 0.5;
      r = -0.3 - Math.sin(t * freq + Math.PI) * 0.5;
    }
    if (pose === 'carry') {
      r = -0.1;
      rx = -1.0; // forearm forward, holding the plate
      l = 0.3;
    }
    if (pose === 'cheer') {
      l = 2.4 + Math.sin(t * 9) * 0.3;
      r = -2.4 - Math.sin(t * 9) * 0.3;
    }
    if (pose === 'pose') {
      l = 2.0;
      r = -2.0;
    }
    if (pose === 'stir') {
      r = -0.5 - Math.sin(t * 7) * 0.3;
      rx = -0.9 + Math.cos(t * 7) * 0.25;
      l = 0.4;
    }
    if (pose === 'type') {
      l = 0.5 + Math.sin(t * 14) * 0.12;
      r = -0.5 - Math.sin(t * 14 + 1.5) * 0.12;
      rx = -0.6;
    }
    if (pose === 'serve') {
      r = -0.4;
      rx = -1.1;
    }
    if (seated) {
      l = 0.55;
      r = -0.55;
      rx = -0.9;
    }
    if (pose === 'eat') {
      r = -0.35;
      rx = -1.3 + Math.sin(t * 4) * 0.5; // spoon to mouth and back
    }
    if (pose === 'wave') {
      r = -2.6 + Math.sin(t * 10) * 0.35;
      l = 0.3;
    }
    if (pose === 'stretch') {
      l = 2.9 + Math.sin(t * 2) * 0.1;
      r = -2.9 - Math.sin(t * 2) * 0.1;
    }
    if (pose === 'dance') {
      l = 1.6 + Math.sin(t * 6) * 1.0;
      r = -1.6 + Math.sin(t * 6 + Math.PI) * 1.0;
    }
    if (pose === 'think') {
      r = -1.5;
      rx = -1.6;
      l = 0.3;
    }
    if (armL.current) armL.current.rotation.z = l;
    if (armR.current) {
      armR.current.rotation.z = r;
      armR.current.rotation.x = rx;
    }
    if (hairSway.current) hairSway.current.rotation.z = Math.sin(t * 1.8) * 0.2;
  });

  const { top, accent } = outfit;
  const trousers = role === 'KITCHEN' || (lite && look.height > 1.0);
  return (
    <group
      ref={outer}
      scale={[s * look.girth * look.height, s * look.height, s * look.girth * look.height]}
      onClick={
        onPick
          ? (e) => {
              e.stopPropagation();
              onPick({ kind: 'person', id: agent.staff.id }, agent.x, agent.z);
            }
          : undefined
      }
    >
      {/* "this one" marker: a bobbing arrow above the selected person */}
      <group ref={marker} visible={false}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.32, 0.6, 14]} />
          <meshBasicMaterial color="#FFB020" depthTest={false} transparent />
        </mesh>
      </group>
      {/* status ring on the ground */}
      {lite ? null : (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.8, 28]} />
          <meshBasicMaterial ref={ring} color={RING[agent.status]} />
        </mesh>
      )}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62, 24]} />
        <meshBasicMaterial color="#5B3A1E" transparent opacity={0.2} depthWrite={false} />
      </mesh>

      <group ref={root}>
        <group ref={squish}>
          {/* legs, frilly socks, little shoes */}
          {[-1, 1].map((x) => (
            <group key={x} position={[x * 0.2, 0, 0.04]}>
              <Cyl pos={[0, 0.28, 0]} rTop={0.1} h={0.2} color={trousers ? '#4A4A58' : look.skin} seg={10} />
              {!trousers ? <Cyl pos={[0, 0.2, 0]} rTop={0.115} h={0.12} color={C.white} seg={12} /> : null}
              <Ball pos={[0, 0.1, 0.05]} r={0.17} color={look.shoe} scale={[1, 0.7, 1.35]} />
              <Ball pos={[0, 0.17, 0.17]} r={0.05} color={mix(look.shoe, '#FFFFFF', 0.4)} />
            </group>
          ))}

          {/* bean body + stubby arms */}
          <Ball pos={[0, 0.62, 0]} r={0.42} color={top} scale={[1.02, 1.08, 0.92]} />
          {lite ? null : <ShirtPattern kind={outfit.pattern} top={top} accent={accent} />}
          {lite ? null : <BodyWear role={role} outfit={outfit} />}
          {[-1, 1].map((x, k) => (
            <group key={x} ref={k === 0 ? armL : armR} position={[x * 0.4, 0.78, 0]}>
              <Ball pos={[x * 0.1, -0.12, 0.03]} r={0.14} color={top} scale={[0.9, 1.2, 0.9]} />
              <Ball pos={[x * 0.13, -0.27, 0.05]} r={0.095} color={look.skin} />
              {k === 1 && !lite ? (
                <group position={[x * 0.13, -0.27, 0.05]}>
                  <Held role={role} accent={accent} />
                </group>
              ) : null}
            </group>
          ))}

          {/* huge round head */}
          <group ref={head}>
            <Ball pos={[0, HEAD_Y, 0]} r={HEAD_R} color={look.skin} scale={[1.03, 0.95, 0.95]} />
            <Hair look={look} sway={hairSway} lite={lite} />
            {/* face: big sparkly dot eyes, rosy cheeks, a tiny smile */}
            <group ref={eyes} position={[0, HEAD_Y - 0.1, 0.62]}>
              {[-1, 1].map((x) => (
                <group key={x} position={[x * 0.25, 0, 0]}>
                  <Ball pos={[0, 0, 0]} r={0.105} color={INK} scale={[1, 1.4, 0.5]} />
                  <Ball pos={[0.03, 0.06, 0.05]} r={0.04} color={C.white} scale={[1, 1, 0.5]} />
                  <Ball pos={[-0.03, -0.05, 0.05]} r={0.02} color={C.white} scale={[1, 1, 0.5]} />
                </group>
              ))}
            </group>
            {/* happy ^ ^ eyes (shown when cheerful, tasting or asleep) */}
            <group ref={happyEyes} position={[0, HEAD_Y - 0.1, 0.62]} visible={false}>
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * 0.25, -0.02, 0.02]}>
                  <torusGeometry args={[0.09, 0.025, 6, 12, Math.PI]} />
                  <meshLambertMaterial color={INK} />
                </mesh>
              ))}
            </group>
            <mesh ref={browL} position={[-0.27, HEAD_Y + 0.13, 0.62]} scale={[2.2, 0.45, 0.4]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshLambertMaterial color={INK} />
            </mesh>
            <mesh ref={browR} position={[0.27, HEAD_Y + 0.13, 0.62]} scale={[2.2, 0.45, 0.4]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshLambertMaterial color={INK} />
            </mesh>
            <mesh ref={cheekL} position={[-0.47, HEAD_Y - 0.26, 0.48]} scale={[1, 0.65, 0.25]}>
              <sphereGeometry args={[0.13, 10, 8]} />
              <meshLambertMaterial color="#FF9FB0" />
            </mesh>
            <mesh ref={cheekR} position={[0.47, HEAD_Y - 0.26, 0.48]} scale={[1, 0.65, 0.25]}>
              <sphereGeometry args={[0.13, 10, 8]} />
              <meshLambertMaterial color="#FF9FB0" />
            </mesh>
            <mesh ref={smile} position={[0, HEAD_Y - 0.22, 0.68]} rotation={[0, 0, Math.PI]}>
              <torusGeometry args={[0.075, 0.017, 6, 12, Math.PI]} />
              <meshLambertMaterial color={INK} />
            </mesh>
            <mesh ref={frown} position={[0, HEAD_Y - 0.28, 0.68]} visible={false}>
              <torusGeometry args={[0.07, 0.017, 6, 12, Math.PI]} />
              <meshLambertMaterial color={INK} />
            </mesh>
            <mesh ref={mouthO} position={[0, HEAD_Y - 0.25, 0.68]} scale={[1, 1, 0.4]} visible={false}>
              <sphereGeometry args={[0.07, 10, 8]} />
              <meshLambertMaterial color="#7A2E2E" />
            </mesh>
            {role === 'ADMIN' || look.extra === 'glasses' ? (
              <>
                {[-1, 1].map((x) => (
                  <mesh key={x} position={[x * 0.25, HEAD_Y - 0.1, 0.66]}>
                    <torusGeometry args={[0.15, 0.018, 6, 20]} />
                    <meshLambertMaterial color={accent} />
                  </mesh>
                ))}
                <Rbox pos={[0, HEAD_Y - 0.1, 0.68]} size={[0.1, 0.02, 0.02]} r={0.005} color={accent} />
              </>
            ) : null}
            {look.extra === 'flower' ? (
              <group position={[0.5, HEAD_Y + 0.42, 0.28]}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Ball key={i} pos={[Math.cos(i * 1.2566) * 0.1, Math.sin(i * 1.2566) * 0.1, 0]} r={0.065} color="#FFB5C0" />
                ))}
                <Ball pos={[0, 0, 0.03]} r={0.055} color="#FFD36B" />
              </group>
            ) : null}
            <HeadWear role={role} accent={accent} />
          </group>
        </group>
      </group>

      {tex ? (
        <sprite position={[0, 3.2, 0]} scale={[1.25, 0.36, 1]} renderOrder={10}>
          <spriteMaterial map={tex} transparent depthTest={false} />
        </sprite>
      ) : null}
      {/* speech bubble: shows what this person is doing right now */}
      <sprite ref={bubble} position={[0, showName ? 3.95 : 3.6, 0]} scale={[1.0, 1.0, 1]} renderOrder={12} visible={false}>
        <spriteMaterial transparent depthTest={false} />
      </sprite>
    </group>
  );
}
