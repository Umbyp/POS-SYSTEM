import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Bucket = 'lit' | 'flat' | 'glass';

/**
 * Merges every still, simple mesh below it into three meshes (lit / unlit / see-through)
 * with per-vertex colour. The scene is declared as many small parts for readability, but
 * drawing hundreds of meshes is slow on phones, so this turns them into a handful of draws.
 * Anything marked `userData={{ noBake: true }}` (animated parts) is left alone.
 * Re-bakes when `deps` change.
 */
export function Bake({ deps, children }: { deps: unknown[]; children: ReactNode }) {
  const group = useRef<Group>(null);
  const source = useRef<Group>(null);

  useLayoutEffect(() => {
    const root = group.current;
    const src = source.current;
    if (!root || !src) return;

    // The original parts stay out of the scene graph once merged (three.js would otherwise
    // walk hundreds of hidden objects every frame); bring them back only to (re)bake.
    if (!src.parent) root.add(src);
    root.updateWorldMatrix(true, true);
    const toLocal = root.matrixWorld.clone().invert();

    const geos: Record<Bucket, BufferGeometry[]> = { lit: [], flat: [], glass: [] };
    const sources: Mesh[] = [];

    src.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || m.userData.noBake || m.userData.baked) return;
      const mat = m.material as Material & { color?: { r: number; g: number; b: number }; opacity: number };
      if (!mat.color) return;
      const bucket: Bucket = mat.transparent
        ? 'glass'
        : mat instanceof MeshLambertMaterial
          ? 'lit'
          : mat instanceof MeshBasicMaterial
            ? 'flat'
            : 'lit';

      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute('uv');
      if (bucket === 'flat') g.deleteAttribute('normal');
      g.applyMatrix4(toLocal.clone().multiply(m.matrixWorld));

      const n = g.getAttribute('position').count;
      const size = bucket === 'glass' ? 4 : 3;
      const col = new Float32Array(n * size);
      for (let i = 0; i < n; i++) {
        col[i * size] = mat.color.r;
        col[i * size + 1] = mat.color.g;
        col[i * size + 2] = mat.color.b;
        if (size === 4) col[i * size + 3] = mat.opacity;
      }
      g.setAttribute('color', new Float32BufferAttribute(col, size));
      geos[bucket].push(g);
      sources.push(m);
    });

    const made: Mesh[] = [];
    const add = (bucket: Bucket, material: Material, order: number) => {
      if (!geos[bucket].length) return;
      // glass/flat parts have no normals; merging needs identical attribute sets
      const merged = mergeGeometries(geos[bucket], false);
      geos[bucket].forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new Mesh(merged, material);
      mesh.userData.baked = true;
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      root.add(mesh);
      made.push(mesh);
    };
    add('lit', new MeshLambertMaterial({ vertexColors: true }), 0);
    add('flat', new MeshBasicMaterial({ vertexColors: true }), 0);
    add('glass', new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }), 1);

    root.remove(src);

    return () => {
      if (!src.parent) root.add(src);
      made.forEach((m) => {
        root.remove(m);
        m.geometry.dispose();
        (m.material as Material).dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <group ref={group}>
      <group ref={source}>{children}</group>
    </group>
  );
}
