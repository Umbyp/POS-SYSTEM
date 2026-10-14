import type { Staff } from '../../types';
import type { Pt } from '../layout';
import type { Look, Outfit, Status } from '../characters/people';
import type { Bubble } from './effects';

export type Pose =
  | 'idle' | 'walk' | 'stir' | 'type' | 'cheer' | 'nap' | 'serve' | 'pose' | 'carry'
  | 'sit' | 'eat' | 'wave' | 'stretch' | 'dance' | 'think';

/** Every person currently in the world, so the details sheet can look them up. Filled by the Director. */
export const registry: { agents: Agent[]; pet: { x: number; z: number; doing: string } | null } = { agents: [], pet: null };

/** One staff member in the running world. Mutated by the Director every frame, read by the Character. */
export interface Agent {
  staff: Staff;
  look: Look;
  outfit: Outfit;
  phase: number;
  home: Pt;
  x: number;
  z: number;
  rotY: number;
  /** extra height, e.g. when sitting on a chair */
  sitY: number;
  status: Status;
  pose: Pose;
  bubble: Bubble | null;

  // --- brain ---
  mode: 'home' | 'walk' | 'do';
  path: Pt[];
  onArrive: (() => void) | null;
  timer: number;
  /** a short celebration or reaction that overrides the home behaviour */
  temp: { pose: Pose; bubble: Bubble | null; status: Status; until: number } | null;
  nextIdle: number;
  /** order id being delivered */
  carrying: string | null;
  /** guests only */
  seat: { table: number; chair: number } | null;
  /** set when a leaving guest has walked out and can be removed */
  gone: boolean;
}
