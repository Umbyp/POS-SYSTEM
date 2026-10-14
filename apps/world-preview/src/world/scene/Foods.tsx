import { C } from '../palette';
import { Ball, Cyl, Rbox, Torus, type V3 } from './parts';

export type FoodKind = 'donut' | 'cake' | 'icecream' | 'burger' | 'drink' | 'noodle';
export const FOODS: FoodKind[] = ['donut', 'cake', 'icecream', 'burger', 'drink', 'noodle'];

/**
 * Giant toy food that sits on a roof and tells you what the building is about,
 * so no text is needed. About 1 unit wide at s = 1.
 */
export function GiantFood({ kind, pos = [0, 0, 0], s = 1 }: { kind: FoodKind; pos?: V3; s?: number }) {
  return (
    <group position={pos} scale={s}>
      {kind === 'donut' ? (
        <>
          <Torus pos={[0, 0.34, 0]} r={0.5} tube={0.27} color={C.tan} rot={[Math.PI / 2, 0, 0]} />
          <Torus pos={[0, 0.46, 0]} r={0.5} tube={0.25} color={C.pink} rot={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Ball
              key={i}
              pos={[Math.cos(i * 1.05) * 0.5, 0.74, Math.sin(i * 1.05) * 0.5]}
              r={0.05}
              color={[C.white, C.yellow, C.mint][i % 3]}
            />
          ))}
        </>
      ) : null}
      {kind === 'cake' ? (
        <>
          <Cyl pos={[0, 0.2, 0]} rTop={0.62} h={0.4} color={C.cream} />
          <Cyl pos={[0, 0.55, 0]} rTop={0.62} h={0.3} color={C.pink} />
          <Cyl pos={[0, 0.8, 0]} rTop={0.55} h={0.2} color={C.cream} />
          <Ball pos={[0, 1.0, 0]} r={0.14} color={C.cherry} />
        </>
      ) : null}
      {kind === 'icecream' ? (
        <>
          <mesh position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.38, 1.0, 10]} />
            <meshLambertMaterial color={C.tan} />
          </mesh>
          <Ball pos={[0, 1.1, 0]} r={0.42} color={C.pink} />
          <Ball pos={[0, 1.5, 0]} r={0.34} color={C.mint} />
          <Ball pos={[0, 1.82, 0]} r={0.1} color={C.cherry} />
        </>
      ) : null}
      {kind === 'burger' ? (
        <>
          <Ball pos={[0, 0.2, 0]} r={0.6} color={C.tan} scale={[1, 0.35, 1]} />
          <Cyl pos={[0, 0.4, 0]} rTop={0.6} h={0.2} color={C.cocoa} />
          <Cyl pos={[0, 0.56, 0]} rTop={0.66} h={0.1} color={C.leaf} />
          <Cyl pos={[0, 0.66, 0]} rTop={0.6} h={0.08} color={C.yellow} />
          <Ball pos={[0, 0.7, 0]} r={0.62} color={C.tan} scale={[1, 0.7, 1]} />
          {[0, 1, 2, 3].map((i) => (
            <Ball key={i} pos={[Math.cos(i * 1.6) * 0.28, 1.08 - (i % 2) * 0.06, Math.sin(i * 1.6) * 0.28]} r={0.04} color={C.white} />
          ))}
        </>
      ) : null}
      {kind === 'drink' ? (
        <>
          <Cyl pos={[0, 0.5, 0]} rTop={0.4} rBottom={0.3} h={1.0} color={C.pink} />
          <Cyl pos={[0, 1.04, 0]} rTop={0.43} h={0.1} color={C.white} />
          <Ball pos={[0, 1.12, 0]} r={0.36} color={C.cream} scale={[1, 0.6, 1]} />
          <Cyl pos={[0.1, 1.5, 0]} rTop={0.05} h={0.8} color={C.cherry} rot={[0, 0, -0.25]} seg={8} />
          {[0, 1, 2, 3].map((i) => (
            <Ball key={i} pos={[(i - 1.5) * 0.14, 0.12, 0.05 * (i % 2)]} r={0.07} color={C.cocoa} />
          ))}
        </>
      ) : null}
      {kind === 'noodle' ? (
        <>
          <Cyl pos={[0, 0.3, 0]} rTop={0.72} rBottom={0.42} h={0.6} color={C.roof} />
          <Cyl pos={[0, 0.62, 0]} rTop={0.64} h={0.1} color={C.yellow} />
          <Ball pos={[-0.15, 0.7, 0.1]} r={0.2} color={C.white} scale={[1, 0.6, 1]} />
          <Ball pos={[-0.15, 0.76, 0.1]} r={0.1} color={C.gold} />
          <Rbox pos={[0.25, 0.72, -0.15]} size={[0.28, 0.1, 0.28]} r={0.03} color={C.leaf} />
          <Cyl pos={[0.5, 1.0, 0]} rTop={0.03} h={1.0} color={C.woodDark} rot={[0, 0, -0.5]} seg={6} />
          <Cyl pos={[0.62, 1.0, 0]} rTop={0.03} h={1.0} color={C.woodDark} rot={[0, 0, -0.5]} seg={6} />
        </>
      ) : null}
    </group>
  );
}
