import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { IntersectionManager } from '../../src/traffic/intersections';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());
const nzIn = { edgeId: 'cv3_2', dir: 1 as const };   // naar g3_3 vanuit het zuiden
const owIn = { edgeId: 'ch2_3', dir: 1 as const };   // naar g3_3 vanuit het westen
it('signal: green yes, red no', () => {
  const m = new IntersectionManager(g);
  expect(m.mayEnter(1, 'g3_3', nzIn, 4 + 1, true)).toBe(true);   // offset 4 → nz groen
  expect(m.mayEnter(2, 'g3_3', owIn, 4 + 1, true)).toBe(false);
});
it('signal: orange only when the car cannot stop', () => {
  const m = new IntersectionManager(g);
  expect(m.mayEnter(1, 'g3_3', nzIn, 4 + 9, true)).toBe(false);
  expect(m.mayEnter(1, 'g3_3', nzIn, 4 + 9, false)).toBe(true);
});
it('signal: waits while a car of the other axis is still inside', () => {
  const m = new IntersectionManager(g); m.enter(9, 'g3_3', nzIn);
  expect(m.mayEnter(2, 'g3_3', owIn, 4 + 12, true)).toBe(false); // ow groen, maar nz-auto staat er nog
  m.leave(9, 'g3_3'); expect(m.mayEnter(2, 'g3_3', owIn, 4 + 12, true)).toBe(true);
});
it('unsignalized: first come first served, same approach may follow', () => {
  const m = new IntersectionManager(g); const a = { edgeId: 'ch1_2', dir: 1 as const }, b = { edgeId: 'cv2_1', dir: 1 as const };
  expect(m.mayEnter(1, 'g2_2', a, 0, true)).toBe(true); m.enter(1, 'g2_2', a);
  expect(m.mayEnter(2, 'g2_2', b, 0.1, true)).toBe(false);
  expect(m.mayEnter(3, 'g2_2', a, 0.2, true)).toBe(true);
});
it('unsignalized: the longest-waiting approach goes next', () => {
  const m = new IntersectionManager(g); const a = { edgeId: 'ch1_2', dir: 1 as const }, b = { edgeId: 'cv2_1', dir: 1 as const }, c = { edgeId: 'ch2_2', dir: -1 as const };
  m.enter(1, 'g2_2', a);
  m.mayEnter(2, 'g2_2', b, 1, true); m.mayEnter(3, 'g2_2', c, 2, true);
  m.leave(1, 'g2_2');
  expect(m.mayEnter(3, 'g2_2', c, 3, true)).toBe(false);
  expect(m.mayEnter(2, 'g2_2', b, 3, true)).toBe(true);
});
it('inside lists the cars on the intersection', () => {
  const m = new IntersectionManager(g); m.enter(1, 'g2_2', { edgeId: 'ch1_2', dir: 1 }); m.enter(2, 'g2_2', { edgeId: 'ch1_2', dir: 1 });
  expect([...m.inside('g2_2')].sort()).toEqual([1, 2]); m.leave(1, 'g2_2'); expect(m.inside('g2_2')).toEqual([2]);
  expect(m.inside('g4_4')).toEqual([]);
});
it('prune forgets despawned cars, so a vanished waiter does not block', () => {
  const m = new IntersectionManager(g); const a = { edgeId: 'ch1_2', dir: 1 as const }, b = { edgeId: 'cv2_1', dir: 1 as const };
  m.mayEnter(7, 'g2_2', a, 0, true); m.enter(8, 'g2_2', a);
  expect(m.mayEnter(2, 'g2_2', b, 1, true)).toBe(false);
  m.prune(new Set([2]));
  expect(m.inside('g2_2')).toEqual([]);
  expect(m.mayEnter(2, 'g2_2', b, 2, true)).toBe(true);
});
it('reset clears everything', () => {
  const m = new IntersectionManager(g); m.enter(1, 'g3_3', nzIn); m.reset();
  expect(m.inside('g3_3')).toEqual([]); expect(m.mayEnter(2, 'g3_3', owIn, 4 + 12, true)).toBe(true);
});
