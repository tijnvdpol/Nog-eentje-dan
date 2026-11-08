import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';

const data = buildRoadData();
const g = RoadGraph.fromData(data);
it('city is 6x6 blocks of 100m', () => {
  expect(g.edgesOfKind('stad').length).toBe(2 * 7 * 6);
});
it('ring is ~4 km', () => {
  const len = g.edgesOfKind('ring').reduce((s, e) => s + g.edgeLength(e.id), 0);
  expect(len).toBeGreaterThan(3800); expect(len).toBeLessThan(4200);
});
it('has 4 opritten and 6 places, each within 15 m of an edge', () => {
  expect(g.edgesOfKind('oprit').length).toBe(4);
  expect(g.places.map((p) => p.id).sort()).toEqual(['dorpscafe', 'feestje', 'huis', 'snackbar', 'supermarkt', 'tankstation']);
  for (const p of g.places) expect(g.nearestEdge(p.x, p.z).distance).toBeLessThanOrEqual(15);
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

it('every edge has a kind; 84 stad, 32 ring, 4 oprit', () => {
  expect(g.edges.every((e) => !!e.kind)).toBe(true);
  expect(g.edgesOfKind('stad').length).toBe(84);
  expect(g.edgesOfKind('ring').length).toBe(32);
  expect(g.edgesOfKind('oprit').length).toBe(4);
});

it('has the N-road: opr3 n0→r0, nw0..nw7, 80 km/h, zone nweg, 1.7–1.9 km', () => {
  const opr3 = g.edges.find((e) => e.id === 'opr3')!;
  expect([opr3.from, opr3.to, opr3.kind, opr3.zone, opr3.speedLimitKmh]).toEqual(['n0', 'r0', 'oprit', 'nweg', 80]);
  const nw = g.edgesOfKind('nweg'); expect(nw.length).toBe(8);
  expect(nw.every((e) => e.speedLimitKmh === 80 && e.zone === 'nweg' && e.lanesPerDir === 1)).toBe(true);
  const len = nw.reduce((s, e) => s + g.edgeLength(e.id), 0); expect(len).toBeGreaterThan(1700); expect(len).toBeLessThan(1900);
});
it('no N-road bend sharper than 12°', () => {
  const nw = g.edgesOfKind('nweg');
  for (let i = 0; i < nw.length - 1; i++) {
    const dir = (e: typeof nw[0]) => { const a = g.node(e.from), b = g.node(e.to); return Math.atan2(b.z - a.z, b.x - a.x); };
    expect(Math.abs(dir(nw[i + 1]) - dir(nw[i])) * 180 / Math.PI).toBeLessThanOrEqual(12);
  }
});
it('has the village: 6 dorp edges, 30 km/h, zone city; d1 and d2 are intersections', () => {
  const d = g.edgesOfKind('dorp'); expect(d.length).toBe(6);
  expect(d.every((e) => e.speedLimitKmh === 30 && e.zone === 'city')).toBe(true);
  expect(g.isIntersection('d1')).toBe(true); expect(g.isIntersection('d2')).toBe(true); expect(g.isIntersection('d3')).toBe(false);
});
