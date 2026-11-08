import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { inForecourt, nwegDecor } from '../../src/world/nwegDecor';
import { RoadGraph } from '../../src/world/roadGraph';
import { mulberry32 } from '../../src/util/rng';

const g = RoadGraph.fromData(buildRoadData());
it('trees and reflectors stay off the road and off the forecourt', () => {
  const D = nwegDecor(g, mulberry32(1));
  expect(D.trees.length).toBeGreaterThan(100); expect(D.reflectors.length).toBeGreaterThan(30);
  for (const t of D.trees) { expect(g.nearestEdge(t.x, t.z).distance).toBeGreaterThan(8); expect(inForecourt(t)).toBe(false); }
  for (const r of D.reflectors) { expect(g.nearestEdge(r.x, r.z).distance).toBeGreaterThan(4); expect(inForecourt(r)).toBe(false); }
});
it('is deterministic for a seed', () => expect(nwegDecor(g, mulberry32(1))).toEqual(nwegDecor(g, mulberry32(1))));
