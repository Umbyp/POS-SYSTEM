import { C } from '../palette';
import { Ball, Blob, Rbox, type V3 } from './parts';
import { Roof } from './Buildings';
import { Lantern } from './Decor';
import { FOODS, GiantFood } from './Foods';

const WALLS = ['#FFE3C2', '#FBD0D8', '#E4F3EE', '#E4F4C8', '#FFF0B8', '#F6E1E4'];
const ROOFS = ['#D25E3B', '#E58FA8', '#5FA39A', '#7DB661', '#F2B33C', '#C06A78'];

/** A small food stall with a giant food item on the roof. `variant` picks colours + food. */
export function Stall({ pos, rotY, variant, glow }: { pos: V3; rotY: number; variant: number; glow: number }) {
  const wall = WALLS[variant % WALLS.length];
  const roof = ROOFS[(variant * 5 + 2) % ROOFS.length];
  const food = FOODS[(variant * 7 + 1) % FOODS.length];
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <Blob pos={[0, 0, 0.3]} r={2.3} scale={[1, 0.8]} opacity={0.18} />
      <Rbox pos={[0, 0.85, 0]} size={[3.0, 1.7, 2.3]} r={0.16} color={wall} />
      <Roof pos={[0, 1.7, 0]} w={3.2} d={2.5} h={1.0} color={roof} />
      {/* serving counter + striped awning */}
      <Rbox pos={[0, 0.5, 1.45]} size={[2.6, 1.0, 0.6]} r={0.08} color={C.wood} />
      <Rbox pos={[0, 1.02, 1.45]} size={[2.8, 0.08, 0.8]} r={0.04} color={C.cream} />
      {[-1.0, -0.5, 0, 0.5, 1.0].map((x, i) => (
        <Rbox key={x} pos={[x, 1.75, 1.55]} size={[0.5, 0.1, 1.1]} r={0.04} color={i % 2 ? C.cream : roof} rot={[0.3, 0, 0]} />
      ))}
      <Rbox pos={[0, 1.15, 1.1]} size={[1.6, 0.8, 0.06]} r={0.03} color={C.sky} />
      <Ball pos={[1.0, 1.2, 1.5]} r={0.16} color={C.yellow} />
      <Ball pos={[-0.9, 1.18, 1.5]} r={0.16} color={C.pink} />
      <Lantern pos={[-1.5, 1.9, 1.9]} glow={glow} />
      <Lantern pos={[1.5, 1.9, 1.9]} glow={glow} color={C.pink} />
      {/* the giant food on the roof tells what is sold */}
      <GiantFood kind={food} pos={[0, 2.5, 0]} s={1.5} />
    </group>
  );
}
