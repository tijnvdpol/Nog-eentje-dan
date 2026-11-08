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

it('has the 6 signals from the spec with 4s offsets', () => {
  expect(g.signals.map((s) => s.nodeId)).toEqual(['g3_1', 'g3_3', 'g3_5', 'g1_3', 'g5_3', 'g3_6']);
  expect(g.signals.map((s) => s.offsetSec)).toEqual([0, 4, 8, 12, 16, 20]);
});
it('has a crossing on every city arm of every signal, 10 m from the node', () => {
  for (const sig of g.signals) for (const e of g.edgesAt(sig.nodeId).filter((x) => x.zone === 'city')) {
    const c = g.crossings.find((x) => x.edgeId === e.id && Math.abs((e.from === sig.nodeId ? x.s : g.edgeLength(e.id) - x.s) - 10) < 1e-6);
    expect(c, `${sig.nodeId}/${e.id}`).toBeDefined();
  }
});
it('has the four extra crossings', () => {
  for (const [edgeId, s] of [['cv4_2', 70], ['cv4_3', 30], ['ch1_5', 70], ['cv2_5', 30]] as const)
    expect(g.crossings.some((c) => c.edgeId === edgeId && c.s === s)).toBe(true);
  expect(g.crossings.length).toBe(27);
});
it('crossing ids are unique and follow x_<edgeId>_<s>', () => {
  expect(new Set(g.crossings.map((c) => c.id)).size).toBe(g.crossings.length);
  for (const c of g.crossings) expect(c.id).toBe(`x_${c.edgeId}_${c.s}`);
});
it('no crossing on a ramp', () => { expect(g.crossings.every((c) => g.edge(c.edgeId).zone === 'city')).toBe(true); });
