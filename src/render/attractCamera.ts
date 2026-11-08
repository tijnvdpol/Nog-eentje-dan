import { CONFIG } from '../config';

/** Floating camera behind the start screen: a slow circle around the city centre, looking at (0, 0, 0). */
export function attractPose(timeSec: number): { x: number; y: number; z: number } {
  const a = (2 * Math.PI * timeSec) / CONFIG.attract.periodSec;
  return { x: CONFIG.attract.radiusM * Math.cos(a), y: CONFIG.attract.heightM, z: CONFIG.attract.radiusM * Math.sin(a) };
}
