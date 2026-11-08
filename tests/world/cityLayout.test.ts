import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';
import { generateCityLayout } from '../../src/world/cityLayout';
import type { BuildingSpec } from '../../src/world/types';
const g = RoadGraph.fromData(buildRoadData());
const corners = (b: BuildingSpec): [number, number][] =>
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => [b.x + (sx * b.w) / 2, b.z + (sz * b.d) / 2]);
it('is deterministic per seed', () => { expect(generateCityLayout(g, 1)).toEqual(generateCityLayout(g, 1)); });
it('keeps buildings off the road (>= 8m from any edge centre line)', () => {
  for (const b of generateCityLayout(g, 1337)) for (const [cx, cz] of corners(b)) expect(g.nearestEdge(cx, cz).distance).toBeGreaterThanOrEqual(8);
});
it('fills the centre with buildings', () => { expect(generateCityLayout(g, 1337).length).toBeGreaterThan(100); });
