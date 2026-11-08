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
    edges: [{ id: 'hw', from: 'a', to: 'b', lanesPerDir: 2, speedLimitKmh: 130, zone: 'snelweg', kind: 'ring' }],
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
  const m = TrafficManager.forTest(g, [c], () => 0.99); // no lane change, no exit
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

// ---- fase 2: stoplichten, reservering, invoegen, wisselen, toeter ----
const OFF_ROAD = { x: 50, z: -50 }; // middle of a block, never in a lane
const len = (id: string) => g.edgeLength(id);
const run = (m: TrafficManager, secs: number, player = OFF_ROAD, time: (t: number) => number = (t) => t, dt = 1 / 30, obstacles: { edgeId: string; s: number }[] = [], t0 = 0) => {
  let t = t0;
  for (let i = 0; i < Math.round(secs / dt); i++) { m.update(dt, player, time(t), obstacles); t += dt; }
  return t;
};

it('stops at the 12.5 m stop line on red', () => {
  // g3_3 has offset 4: nz is red from t = 14 to 26
  const c = car({ edgeId: 'cv3_2', s: 0 }); const m = TrafficManager.forTest(g, [c]);
  run(m, 20, OFF_ROAD, () => 15);
  expect(c.edgeId).toBe('cv3_2');
  expect(Math.abs(c.s - (len('cv3_2') - 12.5))).toBeLessThanOrEqual(1);
  expect(c.speed).toBeCloseTo(0, 1);
});
it('drives through on green', () => {
  const c = car({ edgeId: 'cv3_2', s: 10 }); const m = TrafficManager.forTest(g, [c]);
  run(m, 10, OFF_ROAD, () => 5);
  expect(c.edgeId).not.toBe('cv3_2');
});
it('stops 6 m before an unsignalized intersection that is occupied from another approach', () => {
  // g3_4 (0, 100): car 2 stands on it, arriving from the west (ch2_4); car 1 comes from the south (cv3_3)
  const c1 = car({ id: 1, edgeId: 'cv3_3', s: 10 }); const c2 = car({ id: 2, edgeId: 'ch2_4', s: len('ch2_4') - 3, next: { edgeId: 'cv3_4', dir: 1, lane: 0 } }); // turns away from car 1's route
  const m = TrafficManager.forTest(g, [c1, c2]);
  for (let i = 0; i < 600; i++) { c2.s = len('ch2_4') - 3; c2.speed = 0; m.update(1 / 30, OFF_ROAD, i / 30); }
  expect(m.intersections.inside('g3_4')).toEqual([2]);
  expect(c1.edgeId).toBe('cv3_3');
  expect(Math.abs(c1.s - (len('cv3_3') - 6))).toBeLessThanOrEqual(1);
  expect(c1.speed).toBeCloseTo(0, 1);
});
it('looks ahead to the leader on its next edge', () => {
  const a = car({ id: 1, edgeId: 'cv3_4', s: 5 });
  const b = car({ id: 2, edgeId: 'cv3_3', s: len('cv3_3') - 30, speed: 10, next: { edgeId: 'cv3_4', dir: 1, lane: 0 } });
  const m = TrafficManager.forTest(g, [a, b]);
  for (let i = 0; i < 600; i++) {
    a.edgeId = 'cv3_4'; a.s = 5; a.speed = 0; m.update(1 / 30, OFF_ROAD, i / 30);
    const pa = lanePose(a, g), pb = lanePose(b, g);
    expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThanOrEqual(8);
  }
  expect(b.speed).toBeCloseTo(0, 1);
});
it('waits at the end of a ramp until the ring lane is free', () => {
  // opr2 runs from g3_6 to ring node r8; ring7 ends at r8, ring8 starts there
  const ramp = car({ id: 1, edgeId: 'opr2', s: len('opr2') - 5, next: { edgeId: 'ring8', dir: 1, lane: 0 } });
  const ring = car({ id: 2, edgeId: 'ring7', s: len('ring7') - 40, speed: 36, next: { edgeId: 'ring8', dir: 1, lane: 0 } });
  const m = TrafficManager.forTest(g, [ramp, ring]);
  const player = { x: 50, z: 560 };
  let t = 0;
  while (ring.edgeId === 'ring7') { m.update(1 / 60, player, t); t += 1 / 60; expect(ramp.edgeId).toBe('opr2'); }
  for (let i = 0; i < 300; i++) { m.update(1 / 60, player, t); t += 1 / 60; }
  expect(ramp.edgeId).toBe('ring8');
});
it('takes the exit only from lane 0', () => {
  const l1 = car({ id: 1, edgeId: 'ring7', lane: 1, s: len('ring7') - 0.5, speed: 30 });
  const l0 = car({ id: 2, edgeId: 'ring7', lane: 0, s: len('ring7') - 0.5, speed: 30 });
  const m = TrafficManager.forTest(g, [l1, l0], () => 0); // rng 0 → always take the exit when allowed
  m.update(1 / 30, { x: 50, z: 560 }, 0);
  expect(l1.edgeId).toBe('ring8'); expect(l0.edgeId).toBe('opr2');
});
it('changes lane smoothly in 1.5 s and only when free', () => {
  const c = car({ id: 1, edgeId: 'ring0', lane: 0, s: len('ring0') - 0.2, speed: 30 });
  const m = TrafficManager.forTest(g, [c], () => 0); // rng 0 → always try to change lane
  const player = { x: 560, z: 100 };
  m.update(1 / 60, player, 0);
  expect(c.edgeId).toBe('ring1'); expect(c.lane).toBe(1); expect(c.laneFrom).toBe(0);
  const startX = lanePose(c, g);
  for (let i = 0; i < 45; i++) m.update(1 / 60, player, 0);
  expect(c.laneT!).toBeGreaterThan(0.45); expect(c.laneT!).toBeLessThan(0.6);
  for (let i = 0; i < 50; i++) m.update(1 / 60, player, 0);
  expect(c.laneT ?? 1).toBe(1); expect(c.lane).toBe(1);
  expect(startX).toBeDefined();

  const d = car({ id: 1, edgeId: 'ring0', lane: 0, s: len('ring0') - 0.2, speed: 30 });
  const blocker = car({ id: 2, edgeId: 'ring1', lane: 1, s: 10, speed: 30 });
  const m2 = TrafficManager.forTest(g, [d, blocker], () => 0);
  m2.update(1 / 60, player, 0);
  expect(d.edgeId).toBe('ring1'); expect(d.lane).toBe(0); expect(d.laneT ?? 1).toBe(1);
});
it('lanePose slides sideways during a lane change', () => {
  const base = car({ edgeId: 'ring0', s: 50 });
  const p0 = lanePose({ ...base, lane: 0 }, g), p1 = lanePose({ ...base, lane: 1 }, g);
  const mid = lanePose({ ...base, lane: 1, laneFrom: 0, laneT: 0.5 }, g);
  expect(mid.x).toBeCloseTo((p0.x + p1.x) / 2, 5); expect(mid.z).toBeCloseTo((p0.z + p1.z) / 2, 5);
});
it('stops for a pedestrian obstacle', () => {
  const c = car({ edgeId: 'cv3_2', s: 0 }); const m = TrafficManager.forTest(g, [c]);
  run(m, 20, OFF_ROAD, () => 5, 1 / 30, [{ edgeId: 'cv3_2', s: 50 }]);
  expect(c.s).toBeLessThan(46.5); expect(c.s).toBeGreaterThan(40); expect(c.speed).toBeCloseTo(0, 1);
  // driving the other way the crossing sits at len − 50 along the car
  const d = car({ edgeId: 'cv3_2', dir: -1, s: 0 }); const m2 = TrafficManager.forTest(g, [d]);
  run(m2, 20, OFF_ROAD, () => 5, 1 / 30, [{ edgeId: 'cv3_2', s: 60 }]);
  expect(d.s).toBeLessThan(len('cv3_2') - 60 - 3.5);
});
it('honks once after 2 s blocked by the player, then waits 10 s', () => {
  const c = car({ s: 5 }); const m = TrafficManager.forTest(g, [c]);
  // player stands still right at the car's stopping distance (gap 8 m), so the car waits from the start
  const p = lanePose(car({ s: 5 + 4.5 + 8 }), g); const player = { x: p.x, z: p.z };
  let t = run(m, 2.5, player);
  expect(m.takeHorns()).toBe(1);
  t = run(m, 5, player, (x) => x, 1 / 30, [], t); expect(m.takeHorns()).toBe(0);
  run(m, 6, player, (x) => x, 1 / 30, [], t); expect(m.takeHorns()).toBe(1);
});
it('does not stay jammed after the player leaves an intersection', () => {
  const arms: [string, 1 | -1][] = [['cv3_2', 1], ['cv3_3', -1], ['ch2_3', 1], ['ch3_3', -1]];
  const cars: TrafficCar[] = [];
  for (let i = 0; i < 10; i++) { const [edgeId, dir] = arms[i % 4]; cars.push(car({ id: i + 1, edgeId, dir, s: 20 + Math.floor(i / 4) * 25, speed: 8 })); }
  const m = TrafficManager.forTest(g, cars, mulberry32(9));
  let t = run(m, 30, { x: 0, z: 0 });
  const stopped = new Map<number, number>(); let worst = 0;
  for (let i = 0; i < 60 * 30; i++) {
    m.update(1 / 30, { x: 50, z: 50 }, t); t += 1 / 30;
    for (const c of m.cars) {
      const p = lanePose(c, g);
      const v = c.speed < 0.1 && Math.hypot(p.x, p.z) < 20 ? (stopped.get(c.id) ?? 0) + 1 / 30 : 0;
      stopped.set(c.id, v); worst = Math.max(worst, v);
    }
  }
  expect(worst).toBeLessThanOrEqual(30);
});
it('waits at its stop line instead of entering when the crossing just past the intersection is occupied', () => {
  // green for nz at g3_3, but someone is on the zebra crossing 10 m into cv3_3 (straight on)
  const c = car({ edgeId: 'cv3_2', s: 30, speed: 10, next: { edgeId: 'cv3_3', dir: 1, lane: 0 } });
  const m = TrafficManager.forTest(g, [c]);
  run(m, 15, OFF_ROAD, () => 5, 1 / 30, [{ edgeId: 'cv3_3', s: 10 }]);
  expect(c.edgeId).toBe('cv3_2'); expect(c.insideNode).toBeUndefined();
  expect(c.s).toBeLessThanOrEqual(len('cv3_2') - 12.5); expect(c.speed).toBeCloseTo(0, 1);
  expect(m.intersections.inside('g3_3')).toEqual([]);
});
