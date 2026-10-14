import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import { CanvasTexture, type Group, type Sprite, type SpriteMaterial } from 'three';
import type { WorldPlan } from '../layout';
import { Ball } from '../scene/parts';
import { bubbleTexture, type Bubble } from '../sim/effects';
import { registry } from '../sim/agent';
import { playSound } from '../sim/sound';
import type { PickFn } from '../../selection';

const FUR = '#FFD9A0';
const FUR_DARK = '#F0B878';
const INK = '#4A2E2A';

export const PET_NAME = 'ข้าวปั้น';

type State = 'walk' | 'sit' | 'sleep' | 'poked';

/**
 * The shop cat. A round clay-style kitten that strolls along the front of the shop, sits to wash,
 * naps on the lounge sofa and meows when tapped. Purely decorative: it never touches real data.
 */
export function Pet({ plan, selected, onPick }: { plan: WorldPlan; selected: boolean; onPick: PickFn }) {
  const outer = useRef<Group>(null);
  const body = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const earL = useRef<Group>(null);
  const earR = useRef<Group>(null);
  const bubble = useRef<Sprite>(null);
  const marker = useRef<Group>(null);
  const selRef = useRef(selected);
  selRef.current = selected;

  // places the cat likes: the lounge sofa, the host stand, and a few spots along the shop front
  const spots = useMemo(() => {
    const { plaza, anchors } = plan;
    const zf = plaza.z1 + 2.2;
    const xs = [plaza.x0 + 3, (plaza.x0 + plaza.x1) / 2 - 3, (plaza.x0 + plaza.x1) / 2 + 5, plaza.x1 - 3];
    return {
      sleep: { x: plan.lounge.x + 2.8, z: plan.lounge.z + 0.4 },
      walk: [...xs.map((x) => ({ x, z: zf })), { x: anchors.office.x - 2, z: anchors.office.z }, { x: anchors.lounge.x - 3, z: anchors.lounge.z + 2 }],
    };
  }, [plan]);

  const s = useRef({
    x: spots.sleep.x,
    z: spots.sleep.z,
    rot: 0,
    state: 'sleep' as State,
    timer: 8,
    target: spots.sleep,
    bubble: null as Bubble | null,
    bubbleUntil: 0,
    jump: -9,
    poke: false,
    seed: Math.random() * 10,
  });
  const lastBubble = useRef<Bubble | null>(null);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = clock.elapsedTime;
    const p = s.current;
    if (p.poke) {
      p.poke = false;
      p.jump = t;
      p.bubbleUntil = t + 2.5;
    }

    if (p.state === 'walk') {
      const dx = p.target.x - p.x;
      const dz = p.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        const atSleep = Math.hypot(p.target.x - spots.sleep.x, p.target.z - spots.sleep.z) < 0.5;
        p.state = atSleep ? 'sleep' : 'sit';
        p.timer = atSleep ? 12 + Math.random() * 12 : 4 + Math.random() * 6;
      } else {
        const v = Math.min(d, 1.5 * dt);
        p.x += (dx / d) * v;
        p.z += (dz / d) * v;
        const want = Math.atan2(dx, dz);
        let diff = want - p.rot;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.rot += diff * Math.min(1, dt * 8);
      }
    } else {
      p.timer -= dt;
      if (p.timer <= 0 && p.state !== 'poked') {
        // pick somewhere new: nap on the sofa now and then
        p.target = Math.random() < 0.3 ? spots.sleep : spots.walk[Math.floor(Math.random() * spots.walk.length)];
        p.state = 'walk';
      }
    }
    if (p.state === 'poked' && t > p.jump + 2.6) {
      p.state = 'sit';
      p.timer = 3;
    }
    p.bubble = t < p.bubbleUntil ? 'love' : p.state === 'sleep' ? 'nap' : null;

    registry.pet = { x: p.x, z: p.z, doing: p.state === 'walk' ? 'กำลังเดินเล่น' : p.state === 'sleep' ? 'หลับอยู่' : p.state === 'poked' ? 'ดีใจที่ถูกเรียก' : 'นั่งเลียขน' };

    const walking = p.state === 'walk';
    const sleeping = p.state === 'sleep';
    const jt = t - p.jump;
    const jumpY = jt >= 0 && jt < 0.5 ? Math.sin((jt / 0.5) * Math.PI) * 0.7 : 0;
    if (outer.current) {
      outer.current.position.set(p.x, 0.14 + jumpY, p.z);
      outer.current.rotation.y = p.rot;
    }
    if (body.current) {
      const bob = walking ? Math.abs(Math.sin(t * 9 + p.seed)) * 0.1 : sleeping ? Math.sin(t * 1.6) * 0.02 : 0;
      body.current.position.y = bob;
      // loaf down when sitting, curl when sleeping
      body.current.scale.set(1, sleeping ? 0.7 : p.state === 'sit' ? 0.9 : 1 + Math.sin(t * 9) * 0.04 * (walking ? 1 : 0), 1);
    }
    if (tail.current) tail.current.rotation.z = Math.sin(t * (walking ? 5 : 2.2) + p.seed) * (sleeping ? 0.1 : 0.55);
    if (earL.current && earR.current) {
      const tw = Math.sin(t * 0.9 + p.seed) > 0.97 ? 0.4 : 0;
      earL.current.rotation.z = 0.3 + tw;
      earR.current.rotation.z = -0.3;
    }
    if (marker.current) {
      marker.current.visible = selRef.current;
      if (selRef.current) marker.current.position.y = 1.7 + Math.sin(t * 5) * 0.1;
    }
    if (bubble.current && lastBubble.current !== p.bubble) {
      lastBubble.current = p.bubble;
      bubble.current.visible = !!p.bubble;
      if (p.bubble) {
        const m = bubble.current.material as SpriteMaterial;
        m.map = bubbleTexture(p.bubble) as CanvasTexture;
        m.needsUpdate = true;
      }
    }
  });

  return (
    <group
      ref={outer}
      onClick={(e) => {
        e.stopPropagation();
        const p = s.current;
        p.state = 'poked';
        p.poke = true;
        onPick({ kind: 'pet' }, p.x, p.z);
        playSound('meow');
      }}
    >
      <group ref={marker} visible={false}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.22, 0.4, 14]} />
          <meshBasicMaterial color="#FFB020" depthTest={false} transparent />
        </mesh>
      </group>
      {/* soft shadow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#5B3A1E" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <Ball pos={[0, 0.42, 0]} r={0.42} color={FUR} scale={[1, 0.9, 1.25]} />
        <Ball pos={[0, 0.3, 0.1]} r={0.3} color="#FFF3DE" scale={[1, 0.8, 1.2]} />
        {/* paws */}
        {[
          [-0.2, 0.1],
          [0.2, 0.1],
          [-0.2, -0.3],
          [0.2, -0.3],
        ].map(([x, z], i) => (
          <Ball key={i} pos={[x, 0.08, z + 0.2]} r={0.11} color="#FFF3DE" />
        ))}
        {/* head */}
        <group position={[0, 0.78, 0.5]}>
          <Ball pos={[0, 0, 0]} r={0.36} color={FUR} scale={[1.1, 0.95, 1]} />
          <group ref={earL} position={[-0.24, 0.3, 0]}>
            <mesh>
              <coneGeometry args={[0.13, 0.28, 4]} />
              <meshLambertMaterial color={FUR_DARK} />
            </mesh>
          </group>
          <group ref={earR} position={[0.24, 0.3, 0]}>
            <mesh>
              <coneGeometry args={[0.13, 0.28, 4]} />
              <meshLambertMaterial color={FUR_DARK} />
            </mesh>
          </group>
          {[-1, 1].map((x) => (
            <group key={x}>
              <Ball pos={[x * 0.15, 0.04, 0.32]} r={0.05} color={INK} scale={[1, 1.3, 0.5]} />
              <Ball pos={[x * 0.2, -0.1, 0.26]} r={0.07} color="#FF9FB0" scale={[1, 0.6, 0.3]} />
            </group>
          ))}
          <Ball pos={[0, -0.04, 0.35]} r={0.035} color="#F28B9B" scale={[1.2, 0.8, 0.6]} />
          {/* stripes */}
          {[-0.08, 0, 0.08].map((x) => (
            <Ball key={x} pos={[x, 0.3, 0.2]} r={0.03} color={FUR_DARK} scale={[0.6, 1.6, 0.4]} />
          ))}
        </group>
        {/* tail */}
        <group ref={tail} position={[0, 0.5, -0.5]}>
          <Ball pos={[0, 0.15, -0.1]} r={0.1} color={FUR_DARK} />
          <Ball pos={[0, 0.34, -0.14]} r={0.09} color={FUR} />
          <Ball pos={[0, 0.5, -0.1]} r={0.08} color="#FFF3DE" />
        </group>
      </group>
      <sprite ref={bubble} position={[0, 1.9, 0]} scale={[0.9, 0.9, 1]} renderOrder={12} visible={false}>
        <spriteMaterial transparent depthTest={false} />
      </sprite>
    </group>
  );
}
