import { CONFIG } from '../config';
import type { Axis } from '../world/roadGraph';
import type { SignalSpec } from '../world/types';

export type Light = 'green' | 'orange' | 'red';

/** Light for the axis whose half of the cycle starts at 0, at `t` seconds into that half-cycle-aligned cycle. */
function lightAt(t: number): Light {
  const { greenSec, orangeSec } = CONFIG.signals;
  if (t < greenSec) return 'green';
  if (t < greenSec + orangeSec) return 'orange';
  return 'red';
}

/** Cycle (spec §5.1): nz green → nz orange → all red → ow green → ow orange → all red. */
export function signalLights(spec: SignalSpec, timeSec: number): Record<Axis, Light> {
  const { greenSec, orangeSec, allRedSec } = CONFIG.signals;
  const half = greenSec + orangeSec + allRedSec;
  const cycle = 2 * half;
  const t = (((timeSec - spec.offsetSec) % cycle) + cycle) % cycle;
  return t < half ? { nz: lightAt(t), ow: 'red' } : { nz: 'red', ow: lightAt(t - half) };
}
