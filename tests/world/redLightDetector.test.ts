import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RedLightDetector } from '../../src/world/redLightDetector';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());
// drive north over cv3_2 (x = −1.75) into g3_3 (0, 0); g3_3 has offset 4 → nz red at t = 15, orange at t = 13
const drive = (d: RedLightDetector, t: number, fromZ: number, toZ: number) => {
  let fired = 0;
  for (let z = fromZ; z <= toZ; z += 0.5) if (d.update({ x: -1.75, z }, t)) fired++;
  return fired;
};
it('fires once when entering a signal box on red', () => {
  const d = new RedLightDetector(g); expect(drive(d, 15, -60, 5)).toBe(1);
});
it('never fires on orange or green', () => {
  expect(drive(new RedLightDetector(g), 13, -60, 5)).toBe(0);
  expect(drive(new RedLightDetector(g), 5, -60, 5)).toBe(0);
});
it('re-arms only after the player is more than 15 m away', () => {
  const d = new RedLightDetector(g); expect(drive(d, 15, -60, 5)).toBe(1);
  // back out to 12 m and in again: still disarmed
  for (let z = 5; z >= -12; z -= 0.5) d.update({ x: -1.75, z }, 15);
  expect(drive(d, 15, -12, 5)).toBe(0);
  for (let z = 5; z >= -30; z -= 0.5) d.update({ x: -1.75, z }, 15);
  expect(drive(d, 15, -30, 5)).toBe(1);
});
it('ignores unsignalized intersections and reset re-arms', () => {
  const d = new RedLightDetector(g);
  for (let z = 40; z <= 105; z += 0.5) expect(d.update({ x: -1.75, z }, 15)).toBe(false); // g3_4 has no signal
  drive(d, 15, -60, 5); d.reset(); expect(drive(d, 15, -60, 5)).toBe(1);
});
