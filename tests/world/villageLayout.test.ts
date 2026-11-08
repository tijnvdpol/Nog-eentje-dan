import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { generateVillageLayout, houseBox } from '../../src/world/villageLayout';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());
const L = generateVillageLayout(g, 1337);
it('is deterministic', () => expect(generateVillageLayout(g, 1337)).toEqual(L));
it('places houses only along dorp edges, clear of the road and of nodes', () => {
  expect(L.houses.length).toBeGreaterThan(15);
  for (const h of L.houses) {
    expect(g.nearestEdge(h.x, h.z).distance).toBeGreaterThanOrEqual(7 + 9 / 2 - 0.01);
    expect(g.nearestEdge(h.x, h.z).edge.kind).toBe('dorp');
    for (const n of g.nodes.filter((q) => q.id.startsWith('d'))) expect(Math.hypot(h.x - n.x, h.z - n.z)).toBeGreaterThanOrEqual(20);
  }
});
it('houses do not overlap each other, the café or the church', () => {
  const boxes = [
    ...L.houses.map(houseBox),
    { x: L.cafe.x, z: L.cafe.z, hx: L.cafe.w / 2, hz: L.cafe.d / 2 },
    { x: L.church.x, z: L.church.z, hx: L.church.w / 2, hz: L.church.d / 2 },
  ];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    expect(Math.abs(a.x - b.x) >= a.hx + b.hx || Math.abs(a.z - b.z) >= a.hz + b.hz, `${i}/${j}`).toBe(true);
  }
});
it('church and café stand where the spec says', () => {
  expect(L.church).toEqual({ x: 2850, z: 0, w: 14, d: 24, towerH: 30 });
  expect([L.cafe.x, L.cafe.z, L.cafe.w, L.cafe.d, L.cafe.h]).toEqual([2700, 18, 12, 10, 5]);
});
