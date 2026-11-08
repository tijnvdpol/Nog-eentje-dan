import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';
import { TrafficManager, lanePose, type TrafficCar } from '../../src/traffic/trafficLogic';
import { mulberry32 } from '../../src/util/rng';

const g = RoadGraph.fromData(buildRoadData());
const FAR = { x: 9999, z: 9999 };
const edgeId = 'cv3_3'; // x=0, z from 0 to 100 (+z)
const car = (over: Partial<TrafficCar>): TrafficCar => ({ id: 1, edgeId, dir: 1, lane: 0, s: 0, speed: 0, ...over });
// keep cars "near" the player so they are not despawned
const NEAR = { x: 0, z: 50 };

it('accelerates to the speed limit', () => {
  const c = car({ s: 1 }); const m = TrafficManager.forTest(g, [c]);
  // Edge is short; keep resetting s so it stays on the edge and measure speed
  for (let i = 0; i < 200; i++) { m.update(0.1, NEAR); if (m.cars[0].edgeId !== edgeId) break; }
  const max = Math.max(...m.cars.map((x) => x.speed));
  expect(max).toBeGreaterThan(0);
  const c2 = car({ s: 1 }); const m2 = TrafficManager.forTest(g, [c2]);
  for (let i = 0; i < 200; i++) { m2.cars[0].edgeId = edgeId; m2.cars[0].dir = 1; m2.cars[0].s = 1; m2.update(0.1, NEAR); }
  expect(m2.cars[0].speed).toBeCloseTo(50 / 3.6, 1);
});

it('stops behind a stopped car with >= 8m gap', () => {
  const front = car({ id: 2, s: 90, speed: 0 }); const rear = car({ id: 1, s: 5, speed: 0 });
  const m = TrafficManager.forTest(g, [rear, front]);
  for (let i = 0; i < 200; i++) { front.s = 90; front.speed = 0; m.update(0.1, NEAR); }
  expect(front.s - rear.s).toBeGreaterThanOrEqual(8);
  expect(rear.speed).toBeCloseTo(0, 1);
});

it('brakes for the player in its lane', () => {
  const c = car({ s: 5, speed: 0 }); const m = TrafficManager.forTest(g, [c]);
  const lane = lanePose(car({ s: 30 }), g); // player stands in the lane, 25m ahead
  for (let i = 0; i < 200; i++) m.update(0.1, { x: lane.x, z: lane.z });
  expect(c.s).toBeLessThan(30 - 4.5); expect(c.speed).toBeCloseTo(0, 1);
});

it('continues onto a connected edge at the end, not straight back when alternatives exist', () => {
  const c = car({ s: 99.9, speed: 10 }); const m = TrafficManager.forTest(g, [c], mulberry32(5));
  m.update(0.1, NEAR);
  expect(c.edgeId).not.toBe(edgeId);
  const endNode = g.edge(edgeId).to;
  const e = g.edge(c.edgeId);
  expect([e.from, e.to]).toContain(endNode);
});

it('lanePose drives on the right', () => {
  const p = lanePose(car({ s: 10 }), g);
  expect(p.x).toBeCloseTo(-1.75, 5); expect(p.heading).toBeCloseTo(0, 5);
  const q = lanePose(car({ s: 10, dir: -1 }), g); // driving -z → right is +x
  expect(q.x).toBeCloseTo(1.75, 5); expect(Math.abs(q.heading)).toBeCloseTo(Math.PI, 5);
});

it('never exceeds 30 cars and only within 300m', () => {
  const m = new TrafficManager(g, mulberry32(3));
  for (let i = 0; i < 600; i++) {
    m.update(1 / 10, { x: 0, z: 0 });
    expect(m.cars.length).toBeLessThanOrEqual(30);
    for (const c of m.cars) { const p = lanePose(c, g); expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(300 + 50); }
  }
  expect(m.cars.length).toBeGreaterThan(10);
});

it('stops in time for a stopped player at highway speed', () => {
  // straight 1 km highway (+z), so lookahead is not limited by edge length
  const hw = RoadGraph.fromData({
    nodes: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 0, z: 1000 }],
    edges: [{ id: 'hw', from: 'a', to: 'b', lanesPerDir: 2, speedLimitKmh: 130, zone: 'snelweg' }],
    places: [],
  });
  const v = 130 / 3.6;
  const c: TrafficCar = { id: 1, edgeId: 'hw', dir: 1, lane: 0, s: 0, speed: v };
  const m = TrafficManager.forTest(hw, [c]);
  const player = lanePose({ ...c, s: 300 }, hw); // stopped in the lane, 300 m ahead
  let minGap = Infinity;
  for (let i = 0; i < 1200; i++) {
    m.update(1 / 60, { x: player.x, z: player.z });
    minGap = Math.min(minGap, 300 - c.s - 4.5);
  }
  expect(minGap).toBeGreaterThan(0); // never touches the player
  expect(c.speed).toBeCloseTo(0, 1);
  expect(300 - c.s - 4.5).toBeGreaterThanOrEqual(8 - 0.5); // keeps roughly the min gap
});

it('brakes for a stopped player around a bend of the ring', () => {
  // ring edges are 125 m straight pieces; the player stands just past the corner, on the next edge
  const e0 = g.edge('ring0');
  const next = g.edgesAt(e0.to).find((e) => e.id !== 'ring0')!;
  const player = lanePose({ id: 0, edgeId: next.id, dir: next.from === e0.to ? 1 : -1, lane: 1, s: 40, speed: 0 }, g);
  const c: TrafficCar = { id: 1, edgeId: 'ring0', dir: 1, lane: 1, s: 0, speed: 130 / 3.6 };
  const m = TrafficManager.forTest(g, [c], () => 0);
  for (let i = 0; i < 1200; i++) {
    m.update(1 / 60, { x: player.x, z: player.z });
    const p = lanePose(c, g);
    expect(Math.hypot(p.x - player.x, p.z - player.z)).toBeGreaterThan(4.5);
  }
  expect(c.speed).toBeCloseTo(0, 1);
});

it('spawns cars behind the player no faster than they can stop', () => {
  const m = new TrafficManager(g, mulberry32(11));
  const player = lanePose({ id: 0, edgeId: 'ring3', dir: 1, lane: 0, s: 60, speed: 0 }, g);
  for (let i = 0; i < 1200; i++) {
    m.update(1 / 60, { x: player.x, z: player.z });
    for (const c of m.cars) {
      // overlap = player within the car's own lane corridor and less than a car length away
      const p = lanePose(c, g);
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const dx = player.x - p.x, dz = player.z - p.z;
      const along = dx * fx + dz * fz, lateral = dx * -fz + dz * fx;
      expect(Math.abs(lateral) < 1.75 && Math.abs(along) < 4.5).toBe(false);
    }
  }
});
