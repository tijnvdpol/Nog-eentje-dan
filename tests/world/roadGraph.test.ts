import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';
const g = RoadGraph.fromData(buildRoadData());
it('rejects edges to unknown nodes', () => {
  expect(() => RoadGraph.fromData({ nodes: [{ id: 'a', x: 0, z: 0 }], edges: [{ id: 'e', from: 'a', to: 'x', lanesPerDir: 1, speedLimitKmh: 50, zone: 'city' }], places: [] })).toThrow();
});
it('rejects duplicate ids', () => {
  expect(() => RoadGraph.fromData({ nodes: [{ id: 'a', x: 0, z: 0 }, { id: 'a', x: 1, z: 0 }], edges: [], places: [] })).toThrow();
});
it('nearestEdge and zoneAt', () => {
  expect(g.zoneAt(0, 2)).toEqual({ zone: 'city', speedLimitKmh: 50 });
  expect(g.zoneAt(640, 0)).toEqual({ zone: 'snelweg', speedLimitKmh: 130 });
  expect(g.nearestEdge(50, 3).distance).toBeCloseTo(3);
});
