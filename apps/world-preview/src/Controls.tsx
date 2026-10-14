import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Vector3 } from 'three';
import type { WorldPlan } from './world/layout';

export interface Focus {
  x: number;
  z: number;
  dist: number;
  /** look from this side (radians, 0 = from the front); default keeps the current side */
  az?: number;
  /** changes every time the user asks, so asking twice for the same place still flies there */
  n: number;
}

const FOV = 45;
const PITCH = 1.0; // radians above the horizon

/** Observer camera: drag to orbit/pan, wheel or pinch to zoom, never below the ground. */
export function Controls({
  plan,
  resetKey,
  focus,
  track,
  onUserMove,
}: {
  plan: WorldPlan;
  resetKey: number;
  focus: Focus | null;
  /** when set, the camera follows this moving point (e.g. a selected person) */
  track: (() => { x: number; z: number } | null) | null;
  onUserMove: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const ref = useRef<OrbitControls | null>(null);
  const goal = useRef<{ target: Vector3; offset: Vector3 } | null>(null);

  // Home view: the whole town fits the window, looking down at ~57 degrees.
  const aspect = size.width / Math.max(size.height, 1);
  const t = Math.tan((FOV * Math.PI) / 360);
  const distW = plan.size.w / 2 / (t * aspect);
  const distD = plan.size.d / 2 / (t * Math.sin(PITCH) * 0.95);
  const dist = Math.min(260, Math.max(26, Math.max(distW, distD) * 1.04));

  useEffect(() => {
    const { x, z } = plan.center;
    camera.position.set(x, Math.sin(PITCH) * dist, z + Math.cos(PITCH) * dist);
    const c = new OrbitControls(camera, dom);
    c.target.set(x, 0, z);
    c.enableDamping = true;
    c.minDistance = 9;
    c.maxDistance = 320;
    c.maxPolarAngle = Math.PI * 0.46;
    c.minPolarAngle = Math.PI * 0.1;
    c.update();
    ref.current = c;
    c.addEventListener('start', onUserMove);
    goal.current = null; // a new layout cancels any flight in progress
    return () => {
      c.removeEventListener('start', onUserMove);
      c.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, dom, resetKey, plan, Math.round(dist)]);

  // Fly to a station: slide the orbit target and keep the current viewing angle.
  useEffect(() => {
    const c = ref.current;
    if (!c || !focus) return;
    // keep the side we are looking from, but drop to a low angle so faces are visible
    const az = focus.az ?? Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
    const pitch = 0.5;
    const offset = new Vector3(Math.sin(az) * Math.cos(pitch), Math.sin(pitch), Math.cos(az) * Math.cos(pitch)).multiplyScalar(focus.dist);
    goal.current = { target: new Vector3(focus.x, 1.2, focus.z), offset };
  }, [focus, camera]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-dt * 5);
      const wantPos = g.target.clone().add(g.offset);
      c.target.lerp(g.target, k);
      camera.position.lerp(wantPos, k);
      if (c.target.distanceTo(g.target) < 0.05 && camera.position.distanceTo(wantPos) < 0.05) goal.current = null;
    }
    else if (track) {
      const p = track();
      if (p) {
        const k = 1 - Math.exp(-dt * 4);
        const dx = (p.x - c.target.x) * k;
        const dz = (p.z - c.target.z) * k;
        c.target.x += dx;
        c.target.z += dz;
        camera.position.x += dx;
        camera.position.z += dz;
      }
    }
    c.update();
  });
  return null;
}
