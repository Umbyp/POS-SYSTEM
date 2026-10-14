import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { C } from '../palette';
import { Ball, Cyl } from '../scene/parts';

// ---------- speech bubbles ----------
export type Bubble =
  | 'wait' | 'cook' | 'ready' | 'late' | 'paid' | 'type' | 'chat' | 'nap' | 'photo' | 'serve' | 'cancel'
  | 'eat' | 'angry' | 'hi' | 'think' | 'music' | 'relax' | 'happy' | 'love';
const EMOJI: Record<Bubble, string> = {
  wait: '⏳',
  cook: '🍳',
  ready: '✨',
  late: '❗',
  paid: '💰',
  type: '🧾',
  chat: '💬',
  nap: '💤',
  photo: '📸',
  serve: '🍽️',
  cancel: '💨',
  eat: '😋',
  angry: '😠',
  hi: '👋',
  think: '🤔',
  music: '🎵',
  relax: '😌',
  happy: '😊',
  love: '💖',
};

const cache = new Map<Bubble, CanvasTexture>();
export function bubbleTexture(kind: Bubble): CanvasTexture {
  let t = cache.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // rounded speech bubble with a little tail
  g.fillStyle = kind === 'late' || kind === 'angry' ? '#FFE3E3' : 'rgba(255,255,255,0.96)';
  g.strokeStyle = kind === 'late' || kind === 'angry' ? '#F87171' : '#E6E6E6';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(10, 8, 108, 88, 40);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(54, 94);
  g.lineTo(64, 120);
  g.lineTo(76, 94);
  g.fill();
  g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(EMOJI[kind], 64, 54);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

// ---------- plates ----------
export interface PlateEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  /** 0..1 pop-in / pop-out scale */
  scale: number;
  dying: boolean;
  /** which dish, 0..5 */
  dish: number;
}

/** A little serving plate with a dish on it. Position is driven from outside every frame. */
export function PlateView({ plate }: { plate: PlateEntity }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.set(plate.x, plate.y + Math.sin(clock.elapsedTime * 3 + plate.dish) * 0.02, plate.z);
    g.current.scale.setScalar(Math.max(0.001, plate.scale));
    g.current.rotation.y = clock.elapsedTime * 0.8;
  });
  const dishes = [C.cherry, C.tan, C.mint, C.yellow, C.pink, C.sofa];
  return (
    <group ref={g}>
      <Cyl pos={[0, 0, 0]} rTop={0.34} rBottom={0.24} h={0.06} color={C.white} seg={20} />
      <Ball pos={[0, 0.14, 0]} r={0.2} color={dishes[plate.dish % dishes.length]} scale={[1.1, 0.8, 1.1]} />
      <Ball pos={[0.06, 0.28, 0.02]} r={0.07} color={C.leaf} />
    </group>
  );
}

// ---------- particle bursts ----------
export type BurstKind = 'sparkle' | 'coin' | 'poof';
export interface BurstEntity {
  id: number;
  kind: BurstKind;
  x: number;
  y: number;
  z: number;
}

const BURST_COLORS: Record<BurstKind, string[]> = {
  sparkle: ['#FFE08A', '#FFFFFF', '#F7A8B8', '#B9DDB0'],
  coin: ['#F2C14E', '#FFE08A'],
  poof: ['#FFFFFF', '#E8E4DC'],
};

/** A short burst of small balls that fly outward and fade. Calls onDone when finished. */
export function Burst({ burst, onDone }: { burst: BurstEntity; onDone: (id: number) => void }) {
  const g = useRef<Group>(null);
  const t0 = useRef<number | null>(null);
  const parts = useMemo(
    () =>
      Array.from({ length: burst.kind === 'coin' ? 7 : 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 + burst.id;
        const up = burst.kind === 'coin' ? 2.4 + (i % 3) * 0.5 : 0.8 + (i % 4) * 0.4;
        const out = burst.kind === 'coin' ? 0.4 : 1.0 + (i % 3) * 0.3;
        return { vx: Math.cos(a) * out, vz: Math.sin(a) * out, vy: up, color: BURST_COLORS[burst.kind][i % BURST_COLORS[burst.kind].length] };
      }),
    [burst],
  );
  useFrame(({ clock }) => {
    if (!g.current) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current;
    if (t > 1.3) return;
    g.current.children.forEach((c, i) => {
      const p = parts[i];
      c.position.set(p.vx * t, p.vy * t - 2.6 * t * t * (burst.kind === 'poof' ? 0.2 : 1), p.vz * t);
      c.scale.setScalar(Math.max(0.001, 1 - t / 1.3));
    });
  });
  useEffect(() => {
    const id = setTimeout(() => onDone(burst.id), 1400);
    return () => clearTimeout(id);
  }, [burst.id, onDone]);
  return (
    <group ref={g} position={[burst.x, burst.y, burst.z]}>
      {parts.map((p, i) =>
        burst.kind === 'coin' ? (
          <Cyl key={i} pos={[0, 0, 0]} rTop={0.1} h={0.03} color={p.color} seg={10} rot={[Math.PI / 2, 0, 0]} />
        ) : (
          <Ball key={i} pos={[0, 0, 0]} r={burst.kind === 'poof' ? 0.16 : 0.07} color={p.color} />
        ),
      )}
    </group>
  );
}

// ---------- "late" marker above a table ----------
export function AlertMark({ x, z }: { x: number; z: number }) {
  const ref = useRef<Group>(null);
  const tex = useMemo(() => bubbleTexture('late'), []);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 2.6 + Math.abs(Math.sin(clock.elapsedTime * 4)) * 0.25;
  });
  return (
    <group ref={ref} position={[x, 2.6, z]}>
      <sprite scale={[1.1, 1.1, 1]} renderOrder={11}>
        <spriteMaterial map={tex} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

// ---------- flying order ticket ----------
export interface TicketEntity {
  id: number;
  from: { x: number; z: number };
  to: { x: number; y: number; z: number };
}

/** A little order slip that hops from the table (or counter) to the kitchen window. */
export function Ticket({ ticket, onDone }: { ticket: TicketEntity; onDone: (t: TicketEntity) => void }) {
  const g = useRef<Group>(null);
  const t0 = useRef<number | null>(null);
  const done = useRef(false);
  const DUR = 1.3;
  useFrame(({ clock }) => {
    if (!g.current) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - t0.current) / DUR);
    const e = k * k * (3 - 2 * k);
    const { from, to } = ticket;
    g.current.position.set(from.x + (to.x - from.x) * e, 1.2 + (to.y - 1.2) * e + Math.sin(k * Math.PI) * 3.2, from.z + (to.z - from.z) * e);
    g.current.rotation.set(k * 5, k * 8, Math.sin(k * 12) * 0.4);
    g.current.scale.setScalar(k > 0.9 ? Math.max(0.01, (1 - k) * 10) : 1);
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone(ticket);
    }
  });
  return (
    <group ref={g} position={[ticket.from.x, 1.2, ticket.from.z]}>
      <Cyl pos={[0, 0, 0]} rTop={0.01} h={0.01} color={C.white} seg={4} />
      <mesh>
        <boxGeometry args={[0.34, 0.46, 0.03]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.14, 0.02]}>
        <boxGeometry args={[0.34, 0.08, 0.01]} />
        <meshBasicMaterial color="#F28B6B" />
      </mesh>
      <mesh position={[0, -0.04, 0.02]}>
        <boxGeometry args={[0.22, 0.03, 0.01]} />
        <meshBasicMaterial color="#C9C2B8" />
      </mesh>
      <mesh position={[0, -0.12, 0.02]}>
        <boxGeometry args={[0.18, 0.03, 0.01]} />
        <meshBasicMaterial color="#C9C2B8" />
      </mesh>
    </group>
  );
}
