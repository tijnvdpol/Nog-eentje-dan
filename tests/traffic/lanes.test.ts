import { expect, it } from 'vitest';
import { LaneIndex } from '../../src/traffic/lanes';
import type { TrafficCar } from '../../src/traffic/trafficLogic';

const car = (over: Partial<TrafficCar>): TrafficCar => ({ id: 0, edgeId: 'ring0', dir: 1, lane: 0, s: 0, speed: 0, ...over });

it('finds the nearest leader ahead on the same lane only', () => {
  const idx = new LaneIndex([car({ id: 1, s: 10 }), car({ id: 2, s: 40 }), car({ id: 3, s: 25, lane: 1 })]);
  expect(idx.leaderOnLane('ring0', 1, 0, 10, 1)?.id).toBe(2);
  expect(idx.leaderOnLane('ring0', 1, 0, 41)).toBeNull();
  expect(idx.leaderOnLane('ring0', -1, 0, 0)).toBeNull();
});
it('isFree respects behind/ahead window', () => {
  const idx = new LaneIndex([car({ id: 1, s: 50 })]);
  expect(idx.isFree('ring0', 1, 0, 70, 25, 25)).toBe(false); // venster 45..95 bevat 50
  expect(idx.isFree('ring0', 1, 0, 30, 25, 25)).toBe(false); // venster 5..55 bevat 50
  expect(idx.isFree('ring0', 1, 0, 80, 25, 25)).toBe(true);  // venster 55..105
  expect(idx.isFree('ring0', 1, 0, 50, 25, 25, 1)).toBe(true); // eigen auto telt niet
});
it('a car changing lanes occupies both lanes', () => {
  const idx = new LaneIndex([car({ id: 1, s: 50, lane: 1, laneFrom: 0, laneT: 0.5 })]);
  expect(idx.isFree('ring0', 1, 0, 50, 10, 10)).toBe(false);
  expect(idx.isFree('ring0', 1, 1, 50, 10, 10)).toBe(false);
});
it('a finished lane change occupies only the new lane', () => {
  const idx = new LaneIndex([car({ id: 1, s: 50, lane: 1, laneFrom: 0, laneT: 1 })]);
  expect(idx.isFree('ring0', 1, 0, 50, 10, 10)).toBe(true);
});
it('nearestBehind finds the closest car at or behind s', () => {
  const idx = new LaneIndex([car({ id: 1, s: 10 }), car({ id: 2, s: 60 }), car({ id: 3, s: 100 })]);
  expect(idx.nearestBehind('ring0', 1, 0, 90)?.id).toBe(2);
  expect(idx.nearestBehind('ring0', 1, 0, 5)).toBeNull();
});
