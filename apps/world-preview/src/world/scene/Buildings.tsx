import { C } from '../palette';
import { Ball, Blob, Cyl, Glow, Rbox, type V3 } from './parts';
import { FlowerPot, Lantern, Smoke, StringLights } from './Decor';

/** Four-sided hip roof (a squat pyramid with a soft eave). */
export function Roof({ pos, w, d, h, color }: { pos: V3; w: number; d: number; h: number; color: string }) {
  const k = Math.SQRT2 / 2;
  return (
    <group position={pos}>
      <mesh rotation={[0, Math.PI / 4, 0]} scale={[w * k, 1, d * k]} position={[0, h / 2, 0]}>
        <coneGeometry args={[1, h, 4]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <Rbox pos={[0, 0.04, 0]} size={[w + 0.35, 0.16, d + 0.35]} r={0.07} color={C.roofDark} />
    </group>
  );
}

function Window({ pos, w = 0.7, h = 0.7, lit }: { pos: V3; w?: number; h?: number; lit: number }) {
  return (
    <group position={pos}>
      <Rbox size={[w + 0.16, h + 0.16, 0.08]} r={0.04} color={C.white} />
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={lit > 0.5 ? C.glow : C.sky} />
      </mesh>
    </group>
  );
}

/** Kitchen: wooden cottage with orange roof, chimney smoke and a pickup window. */
export function Kitchen({ pos, glow }: { pos: V3; glow: number }) {
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0.3]} r={3.2} scale={[1, 0.75]} opacity={0.2} />
      <Rbox pos={[0, 1.2, 0]} size={[5, 2.4, 3.6]} r={0.22} color={C.wall} />
      <Roof pos={[0, 2.4, 0]} w={5.2} d={3.8} h={1.7} color={C.roof} />
      {/* chimney */}
      <Rbox pos={[1.5, 3.4, -0.5]} size={[0.6, 1.3, 0.6]} r={0.1} color={C.stone} />
      <Smoke pos={[1.5, 4.2, -0.5]} />
      {/* pickup window with a shelf where finished plates will wait */}
      <Window pos={[-0.9, 1.45, 1.84]} w={1.5} h={0.8} lit={glow} />
      <Rbox pos={[-0.9, 0.95, 2.05]} size={[1.9, 0.14, 0.5]} r={0.05} color={C.wood} />
      {/* door */}
      <Rbox pos={[1.45, 0.9, 1.84]} size={[0.9, 1.8, 0.1]} r={0.06} color={C.wood} />
      <Ball pos={[1.7, 0.9, 1.92]} r={0.05} color={C.gold} />
      {/* little stove seen through side: pan on a burner */}
      <Rbox pos={[2.7, 0.45, 0.3]} size={[0.7, 0.9, 1.3]} r={0.1} color={C.metal} />
      <Cyl pos={[2.7, 0.98, 0.3]} rTop={0.3} rBottom={0.25} h={0.12} color="#4B4B4B" seg={14} />
      <Lantern pos={[-2.3, 2.0, 1.95]} glow={glow} />
      <FlowerPot pos={[-2.0, 0, 2.2]} />
      <FlowerPot pos={[2.2, 0, 2.3]} s={0.9} />
    </group>
  );
}

/** Counter: curved wooden bar with a striped awning, register and golden bell. */
export function Counter({ pos, glow }: { pos: V3; glow: number }) {
  const stripes = [-2.2, -1.32, -0.44, 0.44, 1.32, 2.2];
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0.6]} r={3} scale={[1.1, 0.6]} opacity={0.2} />
      {/* posts + awning */}
      <Cyl pos={[-2.5, 1.35, -0.8]} rTop={0.07} h={2.7} color={C.woodDark} seg={8} />
      <Cyl pos={[2.5, 1.35, -0.8]} rTop={0.07} h={2.7} color={C.woodDark} seg={8} />
      {stripes.map((x, i) => (
        <Rbox
          key={x}
          pos={[x, 2.75, 0.1]}
          size={[0.88, 0.14, 2.1]}
          r={0.05}
          color={i % 2 === 0 ? C.roof : C.cream}
          rot={[0.22, 0, 0]}
        />
      ))}
      {/* back wall shelf */}
      <Rbox pos={[0, 1.2, -1.2]} size={[5.2, 2.4, 0.3]} r={0.1} color={C.wall} />
      <Rbox pos={[0, 1.55, -1.0]} size={[4.2, 0.1, 0.4]} r={0.04} color={C.wood} />
      {/* counter body: flat front + rounded ends */}
      <Rbox pos={[0, 0.55, 0.4]} size={[4.2, 1.1, 1.2]} r={0.12} color={C.wood} />
      <Cyl pos={[-2.1, 0.55, 0.4]} rTop={0.6} h={1.1} color={C.wood} seg={20} />
      <Cyl pos={[2.1, 0.55, 0.4]} rTop={0.6} h={1.1} color={C.wood} seg={20} />
      <Rbox pos={[0, 1.14, 0.4]} size={[4.2, 0.1, 1.4]} r={0.05} color={C.cream} />
      <Cyl pos={[-2.1, 1.14, 0.4]} rTop={0.7} h={0.1} color={C.cream} seg={20} />
      <Cyl pos={[2.1, 1.14, 0.4]} rTop={0.7} h={0.1} color={C.cream} seg={20} />
      {/* register */}
      <Rbox pos={[-0.9, 1.45, 0.4]} size={[0.9, 0.5, 0.6]} r={0.08} color={C.metal} />
      <Rbox pos={[-0.9, 1.78, 0.28]} size={[0.7, 0.2, 0.34]} r={0.05} color="#8FE3C0" rot={[-0.5, 0, 0]} />
      {/* golden bell */}
      <Cyl pos={[0.9, 1.32, 0.4]} rTop={0.3} h={0.05} color={C.gold} seg={16} />
      <Ball pos={[0.9, 1.45, 0.4]} r={0.2} color={C.gold} scale={[1, 0.85, 1]} />
      <Ball pos={[0.9, 1.67, 0.4]} r={0.05} color={C.gold} />
      {/* menu board + lanterns */}
      <Rbox pos={[1.8, 1.9, -1.0]} size={[1.0, 0.7, 0.08]} r={0.04} color="#5C4033" />
      <Lantern pos={[-1.7, 2.45, 0.9]} glow={glow} />
      <Lantern pos={[0, 2.35, 1.05]} color={C.pink} glow={glow} />
      <Lantern pos={[1.7, 2.45, 0.9]} glow={glow} />
    </group>
  );
}

/** Office: small hut with a desk, desk lamp and a map on the wall. */
export function Office({ pos, glow }: { pos: V3; glow: number }) {
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0.2]} r={2.4} scale={[1, 0.8]} opacity={0.2} />
      <Rbox pos={[0, 1.05, 0]} size={[3.6, 2.1, 3]} r={0.2} color={C.wall} />
      <Roof pos={[0, 2.1, 0]} w={3.8} d={3.2} h={1.4} color={C.roofDark} />
      <Window pos={[-0.8, 1.2, 1.54]} w={0.9} h={0.8} lit={glow} />
      <Rbox pos={[1.0, 0.8, 1.54]} size={[0.8, 1.6, 0.1]} r={0.06} color={C.wood} />
      {/* desk with lamp on the porch */}
      <Rbox pos={[-1.3, 0.45, 2.3]} size={[1.2, 0.1, 0.7]} r={0.04} color={C.wood} />
      <Cyl pos={[-1.8, 0.2, 2.3]} rTop={0.05} h={0.4} color={C.woodDark} seg={8} />
      <Cyl pos={[-0.8, 0.2, 2.3]} rTop={0.05} h={0.4} color={C.woodDark} seg={8} />
      <Cyl pos={[-1.3, 0.55, 2.3]} rTop={0.12} h={0.08} color={C.metal} seg={12} />
      <Glow pos={[-1.3, 0.8, 2.3]} r={0.13} color={C.glow} strength={glow} />
      {/* wall map */}
      <Rbox pos={[0, 1.65, 1.53]} size={[0.8, 0.5, 0.05]} r={0.03} color={C.rug} />
      <FlowerPot pos={[1.9, 0, 1.9]} />
      <Lantern pos={[1.0, 1.95, 1.7]} glow={glow} color={C.pink} />
    </group>
  );
}

/** A round table with two chairs and a candle (or vase). Lit when occupied. */
export function Table({
  pos,
  scale = 1,
  lit,
  variant,
  long = false,
}: {
  pos: V3;
  scale?: number;
  lit: boolean;
  variant: number;
  /** a long group table: six chairs, three along each side */
  long?: boolean;
}) {
  if (long)
    return (
      <group position={pos} scale={scale}>
        <Blob pos={[0, 0, 0]} r={2.3} scale={[1.2, 0.75]} opacity={0.2} />
        {[-1.3, 1.3].map((x) => (
          <Rbox key={x} pos={[x, 0.38, 0]} size={[0.2, 0.76, 1.0]} r={0.06} color={C.woodDark} />
        ))}
        <Rbox pos={[0, 0.8, 0]} size={[3.9, 0.1, 1.45]} r={0.07} color={C.tableTop} />
        <Rbox pos={[0, 0.73, 0]} size={[4.0, 0.06, 1.55]} r={0.05} color={C.wood} />
        {[-1, 1].flatMap((side) =>
          [-1, 0, 1].map((col) => (
            <group key={`${side}${col}`} position={[col * 1.25, 0, side * 1.1]}>
              <Cyl pos={[0, 0.3, 0]} rTop={0.09} rBottom={0.12} h={0.6} color={C.woodDark} seg={8} />
              <Cyl pos={[0, 0.62, 0]} rTop={0.32} h={0.12} color={C.chair} seg={16} />
              <Ball pos={[0, 0.8, 0]} r={0.25} color={side === 1 ? C.pink : C.sofa} scale={[1, 0.5, 1]} />
            </group>
          )),
        )}
        {[-1.0, 1.0].map((x, i) => (
          <group key={x}>
            <Cyl pos={[x, 0.98, 0]} rTop={0.06} h={0.26} color={C.cream} seg={8} />
            <Glow pos={[x, 1.2, 0]} r={0.06} color={C.glow} strength={lit ? 1 : 0.2} />
            <Ball pos={[x * 0.0, 0.95, i ? 0.4 : -0.4]} r={0.12} color={i ? C.pink : C.yellow} />
          </group>
        ))}
        <Ball pos={[0, 0.98, 0]} r={0.16} color={C.leaf} scale={[1.4, 0.7, 1]} />
      </group>
    );
  return (
    <group position={pos} scale={scale}>
      <Blob pos={[0, 0, 0]} r={1.25} opacity={0.2} />
      <Cyl pos={[0, 0.38, 0]} rTop={0.1} rBottom={0.16} h={0.76} color={C.woodDark} seg={10} />
      <Cyl pos={[0, 0.8, 0]} rTop={0.78} h={0.1} color={C.tableTop} seg={24} />
      <Cyl pos={[0, 0.73, 0]} rTop={0.82} h={0.06} color={C.wood} seg={24} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.1, 0, 0]}>
          <Cyl pos={[0, 0.3, 0]} rTop={0.09} rBottom={0.12} h={0.6} color={C.woodDark} seg={8} />
          <Cyl pos={[0, 0.62, 0]} rTop={0.32} h={0.12} color={C.chair} seg={16} />
          <Ball pos={[0, 0.8, 0]} r={0.25} color={C.sofa} scale={[1, 0.5, 1]} />
        </group>
      ))}
      {variant % 2 === 0 ? (
        <>
          <Cyl pos={[0, 0.98, 0]} rTop={0.06} h={0.26} color={C.cream} seg={8} />
          <Glow pos={[0, 1.2, 0]} r={0.06} color={C.glow} strength={lit ? 1 : 0.2} />
        </>
      ) : (
        <>
          <Cyl pos={[0, 0.98, 0]} rTop={0.1} rBottom={0.07} h={0.24} color={C.sky} seg={10} />
          <Ball pos={[0, 1.18, 0]} r={0.1} color={variant % 3 === 0 ? C.pink : C.yellow} />
          <Ball pos={[0.08, 1.12, 0.05]} r={0.07} color={C.leaf} />
        </>
      )}
    </group>
  );
}

/** Photo corner: flower arch on a little stage with glowing lanterns. */
export function PhotoCorner({ pos, glow }: { pos: V3; glow: number }) {
  const flowers = Array.from({ length: 14 }).map((_, i) => {
    const a = Math.PI * (i / 13);
    return { x: Math.cos(a) * 1.5, y: Math.sin(a) * 1.5, c: [C.pink, C.white, C.yellow, C.lilac][i % 4] };
  });
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0]} r={2.4} opacity={0.18} />
      <Cyl pos={[0, 0.1, 0]} rTop={2.0} rBottom={2.1} h={0.2} color={C.cream} seg={32} />
      <Cyl pos={[0, 0.24, 0]} rTop={1.8} h={0.08} color={C.rug} seg={32} />
      <group position={[0, 0.2, -0.4]}>
        {flowers.map((f, i) => (
          <group key={i}>
            <Ball pos={[f.x, 0.1 + f.y, 0]} r={0.26} color={C.leaf} />
            <Ball pos={[f.x, 0.1 + f.y + 0.1, 0.18]} r={0.2} color={f.c} />
          </group>
        ))}
        <Ball pos={[-1.5, 0.15, 0]} r={0.4} color={C.leaf} />
        <Ball pos={[1.5, 0.15, 0]} r={0.4} color={C.leaf} />
        <Glow pos={[0, 1.2, 0.2]} r={0.2} color={C.glow} strength={glow} />
        <Glow pos={[-0.7, 1.35, 0.2]} r={0.12} color={C.pink} strength={glow} />
        <Glow pos={[0.7, 1.35, 0.2]} r={0.12} color={C.pink} strength={glow} />
      </group>
      {/* heart-shaped hanging sign + stools */}
      <Cyl pos={[1.5, 0.45, 1.0]} rTop={0.3} h={0.5} color={C.chair} seg={14} />
      <FlowerPot pos={[-1.7, 0.2, 1.0]} />
      <StringLights from={[-1.5, 2.0, -0.4]} to={[1.5, 2.0, -0.4]} glow={glow} n={6} sag={0.35} />
    </group>
  );
}

/** Lounge: round sofa, rug, floor lamp and plants. */
export function Lounge({ pos, glow }: { pos: V3; glow: number }) {
  return (
    <group position={pos}>
      <Blob pos={[0, 0, 0]} r={2.6} opacity={0.15} />
      <Cyl pos={[0, 0.03, 0.2]} rTop={2.1} h={0.06} color={C.rug} seg={32} />
      <Cyl pos={[0, 0.07, 0.2]} rTop={1.5} h={0.04} color={C.cream} seg={32} />
      {/* sofa: three soft blobs */}
      <Rbox pos={[0, 0.4, -0.7]} size={[3.0, 0.8, 0.9]} r={0.32} color={C.sofa} />
      <Rbox pos={[0, 0.78, -1.0]} size={[3.0, 0.8, 0.45]} r={0.2} color={C.sofa} />
      <Ball pos={[-0.7, 0.85, -0.5]} r={0.28} color={C.yellow} scale={[1, 0.85, 0.5]} />
      <Ball pos={[0.8, 0.85, -0.5]} r={0.28} color={C.pink} scale={[1, 0.85, 0.5]} />
      {/* coffee table */}
      <Cyl pos={[0, 0.3, 0.9]} rTop={0.5} h={0.08} color={C.wood} seg={20} />
      <Cyl pos={[0, 0.15, 0.9]} rTop={0.08} h={0.3} color={C.woodDark} seg={8} />
      <Cyl pos={[0.1, 0.4, 0.9]} rTop={0.12} rBottom={0.09} h={0.16} color={C.white} seg={12} />
      {/* floor lamp */}
      <Cyl pos={[2.0, 0.95, -0.9]} rTop={0.05} h={1.9} color={C.woodDark} seg={8} />
      <Glow pos={[2.0, 2.0, -0.9]} r={0.28} color={C.glow} strength={glow} />
      <FlowerPot pos={[-2.1, 0, -0.8]} s={1.3} />
      <FlowerPot pos={[2.3, 0, 0.7]} />
    </group>
  );
}
