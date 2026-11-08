import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';

const data = buildRoadData();
const g = RoadGraph.fromData(data);
it('city is 6x6 blocks of 100m', () => {
  expect(g.edges.filter((e) => e.zone === 'city').length).toBe(2 * 7 * 6);
});
it('ring is ~4 km', () => {
  const len = g.edges.filter((e) => e.speedLimitKmh === 130).reduce((s, e) => s + g.edgeLength(e.id), 0);
  expect(len).toBeGreaterThan(3800); expect(len).toBeLessThan(4200);
});
it('has 3 ramps and all 4 places', () => {
  expect(g.edges.filter((e) => e.speedLimitKmh === 80).length).toBe(3);
  expect(g.places.map((p) => p.id).sort()).toEqual(['feestje', 'huis', 'snackbar', 'supermarkt']);
});
it('every node is reachable from every other', () => {
  const seen = new Set([data.nodes[0].id]); const q = [data.nodes[0].id];
  while (q.length) for (const e of g.edgesAt(q.pop()!)) for (const id of [e.from, e.to]) if (!seen.has(id)) { seen.add(id); q.push(id); }
  expect(seen.size).toBe(data.nodes.length);
});
it('committed roads.json equals generator output', () => {
  expect(JSON.parse(readFileSync('public/content/roads.json', 'utf8'))).toEqual(data);
});
