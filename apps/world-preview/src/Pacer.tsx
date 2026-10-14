import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * Saves battery and keeps things smooth: draws 30 frames a second while the scene is just being watched,
 * 60 while the viewer drags, zooms or the camera is gliding, and lowers the resolution if the device
 * cannot keep up. Pauses by itself when the tab is hidden (the browser stops requestAnimationFrame).
 */
export function Pacer({ boostKey }: { boostKey: unknown }) {
  const advance = useThree((s) => s.advance);
  const setDpr = useThree((s) => s.setDpr);
  const dom = useThree((s) => s.gl.domElement);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let boostUntil = performance.now() + 1800;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let slow = 0;
    let fast = 0;
    const boost = (ms = 1500) => {
      boostUntil = Math.max(boostUntil, performance.now() + ms);
    };
    const onPointer = () => boost(1500);
    dom.addEventListener('pointerdown', onPointer);
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons) boost(800);
    });
    dom.addEventListener('wheel', onPointer, { passive: true });
    (window as unknown as { __worldBoost?: () => void }).__worldBoost = () => boost(2000);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const want = now < boostUntil ? 1000 / 58 : 1000 / 30;
      if (now - last < want - 2) return;
      const dt = now - last;
      last = now;
      advance(now / 1000);
      // adapt the resolution: judge only against the speed we asked for
      const budget = want * 1.5;
      if (dt > budget && dt < 500) {
        slow++;
        fast = 0;
      } else {
        fast++;
        slow = Math.max(0, slow - 1);
      }
      if (slow > 25 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.5);
        setDpr(dpr);
        slow = 0;
      } else if (fast > 600 && dpr < Math.min(window.devicePixelRatio || 1, 2)) {
        dpr = Math.min(Math.min(window.devicePixelRatio || 1, 2), dpr + 0.5);
        setDpr(dpr);
        fast = 0;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      dom.removeEventListener('pointerdown', onPointer);
      dom.removeEventListener('wheel', onPointer);
    };
  }, [advance, setDpr, dom]);

  // anything that makes the camera glide asks for smooth frames
  useEffect(() => {
    (window as unknown as { __worldBoost?: () => void }).__worldBoost?.();
  }, [boostKey]);
  return null;
}
