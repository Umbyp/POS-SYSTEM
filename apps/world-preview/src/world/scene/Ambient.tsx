import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { BufferAttribute, CanvasTexture, Color, SRGBColorSpace, type Points, type PointsMaterial } from 'three';
import type { WorldPlan } from '../layout';
import type { Festival } from './Festival';

let dot: CanvasTexture | null = null;
function dotTexture(): CanvasTexture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new CanvasTexture(c);
  dot.colorSpace = SRGBColorSpace;
  return dot;
}

type Kind = 'motes' | 'fireflies' | 'snow' | 'confetti' | 'water' | 'sparks';
const KIND_CFG: Record<Kind, { colors: string[]; size: number; vy: [number, number]; sway: number; n: number }> = {
  motes: { colors: ['#FFF4D6', '#FFE7B8', '#FFFFFF'], size: 0.16, vy: [0.08, 0.2], sway: 0.25, n: 46 },
  fireflies: { colors: ['#D8FF8A', '#FFF59A', '#B6FF9E'], size: 0.24, vy: [0.02, 0.12], sway: 0.6, n: 40 },
  snow: { colors: ['#FFFFFF', '#EEF6F2'], size: 0.2, vy: [-0.9, -0.5], sway: 0.35, n: 90 },
  confetti: { colors: ['#F2C14E', '#D9553F', '#FFD36B', '#FF8A3D'], size: 0.2, vy: [-0.8, -0.4], sway: 0.45, n: 80 },
  water: { colors: ['#B7DCD3', '#DCEFE9', '#7BBDB3'], size: 0.2, vy: [-1.6, -1.0], sway: 0.15, n: 80 },
  sparks: { colors: ['#FFC46B', '#FFE3A8', '#FFB347'], size: 0.22, vy: [0.2, 0.5], sway: 0.4, n: 60 },
};

const kindFor = (festival: Festival, isDark: boolean): Kind =>
  festival === 'xmas' ? 'snow' : festival === 'cny' ? 'confetti' : festival === 'songkran' ? 'water' : festival === 'loy' ? 'sparks' : isDark ? 'fireflies' : 'motes';

/** Tiny things drifting in the air: dust motes by day, fireflies at night, and festival confetti, snow or water. */
function Floaters({ plan, kind }: { plan: WorldPlan; kind: Kind }) {
  const cfg = KIND_CFG[kind];
  const ref = useRef<Points>(null);
  const mat = useRef<PointsMaterial>(null);
  const { plaza } = plan;
  const box = useMemo(() => ({ x0: plaza.x0 - 4, x1: plaza.x1 + 4, z0: plaza.z0 - 3, z1: plaza.z1 + 6 }), [plaza]);
  const data = useMemo(() => {
    const pos = new Float32Array(cfg.n * 3);
    const col = new Float32Array(cfg.n * 3);
    const meta = Array.from({ length: cfg.n }, (_, i) => ({
      vy: cfg.vy[0] + Math.random() * (cfg.vy[1] - cfg.vy[0]),
      phase: Math.random() * 6.28,
      ox: 0,
      i,
    }));
    for (let i = 0; i < cfg.n; i++) {
      pos[i * 3] = box.x0 + Math.random() * (box.x1 - box.x0);
      pos[i * 3 + 1] = 0.3 + Math.random() * 6;
      pos[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0);
      const c = new Color(cfg.colors[i % cfg.colors.length]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { pos, col, meta };
  }, [cfg, box]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = clock.elapsedTime;
    const g = ref.current?.geometry;
    if (!g) return;
    const a = g.getAttribute('position') as BufferAttribute;
    for (const m of data.meta) {
      const i = m.i;
      a.array[i * 3] += Math.sin(t * 0.7 + m.phase) * cfg.sway * dt;
      a.array[i * 3 + 1] += m.vy * dt;
      a.array[i * 3 + 2] += Math.cos(t * 0.6 + m.phase) * cfg.sway * dt * 0.7;
      if (a.array[i * 3 + 1] > 6.5) a.array[i * 3 + 1] = 0.2;
      else if (a.array[i * 3 + 1] < 0.1) a.array[i * 3 + 1] = 6.4;
    }
    a.needsUpdate = true;
    // fireflies blink together in a soft slow pulse
    if (mat.current) mat.current.opacity = kind === 'fireflies' ? 0.55 + Math.sin(t * 1.6) * 0.35 : 0.85;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={mat} size={cfg.size * 4} sizeAttenuation vertexColors map={dotTexture()} transparent depthWrite={false} alphaTest={0.01} />
    </points>
  );
}

/** Steam curling up from the kitchen stoves. */
function Steam({ plan }: { plan: WorldPlan }) {
  const ref = useRef<Points>(null);
  const N = 18;
  const base = plan.anchors.chefs;
  const data = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const meta = Array.from({ length: N }, (_, i) => ({ col: i % 3, off: Math.random() * 3 }));
    return { pos, meta };
  }, []);
  useFrame(({ clock }) => {
    const g = ref.current?.geometry;
    if (!g) return;
    const a = g.getAttribute('position') as BufferAttribute;
    const t = clock.elapsedTime;
    data.meta.forEach((m, i) => {
      const k = ((t * 0.5 + m.off) % 3) / 3; // 0..1 along its rise
      a.array[i * 3] = base.x - 3 + m.col * 3 + Math.sin(t + i) * 0.25 * k;
      a.array[i * 3 + 1] = 1.9 + k * 2.2;
      a.array[i * 3 + 2] = base.z - 1.9;
    });
    a.needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.9} sizeAttenuation color="#FFFFFF" map={dotTexture()} transparent opacity={0.35} depthWrite={false} />
    </points>
  );
}

export function Ambient({ plan, isDark, festival }: { plan: WorldPlan; isDark: boolean; festival: Festival }) {
  const kind = kindFor(festival, isDark);
  return (
    <>
      <Floaters key={kind} plan={plan} kind={kind} />
      {plan.theme === 'interior' ? <Steam plan={plan} /> : null}
    </>
  );
}
