import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { PedestrianManager, type Ped } from '../../src/pedestrians/pedestrianLogic';
import type { TrafficCar } from '../../src/traffic/trafficLogic';
import { mulberry32 } from '../../src/util/rng';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());
const XID = 'x_cv3_2_90'; // on cv3_2 (x = 0, z −100 → 0), centred at (0, −10)
const ped = (over: Partial<Ped>): Ped => ({ id: 1, crossingId: XID, kind: 'student', state: 'waiting', t: 0, x: 0, z: 0, heading: 0, scared: false, ...over });
const still = (x: number, z: number) => ({ x, z, heading: 0, speedMs: 0 });
const carAt = (s: number): TrafficCar => ({ id: 1, edgeId: 'cv3_2', dir: 1, lane: 0, s, speed: 5 });

it('spawns only within 150 m and never more than 12', () => {
  const m = new PedestrianManager(g, mulberry32(1));
  let seen = 0;
  for (let i = 0; i < 120 * 30; i++) {
    m.update(1 / 30, still(0, 0), []);
    expect(m.peds.length).toBeLessThanOrEqual(12);
    seen = Math.max(seen, m.peds.length);
    for (const p of m.peds) {
      const c = g.crossings.find((x) => x.id === p.crossingId)!;
      const e = g.edge(c.edgeId), a = g.node(e.from), b = g.node(e.to), t = c.s / g.edgeLength(e.id);
      expect(Math.hypot(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)).toBeLessThanOrEqual(150);
    }
  }
  expect(seen).toBeGreaterThan(3);
});
it('picks kinds roughly 40/40/20', () => {
  const m = new PedestrianManager(g, mulberry32(3));
  const count = { jogger: 0, student: 0, oma: 0 }; const ids = new Set<number>();
  for (let i = 0; i < 600 * 30; i++) { m.update(1 / 30, still(0, 0), []); for (const p of m.peds) if (!ids.has(p.id)) { ids.add(p.id); count[p.kind]++; } }
  const n = ids.size;
  expect(n).toBeGreaterThan(100);
  expect(count.oma / n).toBeGreaterThan(0.1); expect(count.oma / n).toBeLessThan(0.3);
  expect(count.jogger / n).toBeGreaterThan(0.3); expect(count.student / n).toBeGreaterThan(0.3);
});
it('waits while a car approaches within 25 m, then crosses at its kind speed', () => {
  const m = PedestrianManager.forTest(g, [ped({ kind: 'oma' })]);
  for (let i = 0; i < 90; i++) m.update(1 / 30, still(40, -40), [carAt(70)]); // 20 m before the crossing
  expect(m.peds[0].state).toBe('waiting');
  for (let i = 0; i < 30 * 14.5; i++) m.update(1 / 30, still(40, -40), [carAt(95)]); // past the crossing
  expect(m.peds[0].state).toBe('crossing');
  for (let i = 0; i < 30; i++) m.update(1 / 30, still(40, -40), []);
  expect(m.peds[0].state).toBe('done');
  for (let i = 0; i < 40; i++) m.update(1 / 30, still(40, -40), []);
  expect(m.peds.length).toBe(0);
});
it('dodges 3 m sideways in 0.4 s when the player would hit within 1 s', () => {
  const m = PedestrianManager.forTest(g, [ped({ state: 'crossing', t: 0.5 })]);
  const p0 = { x: m.peds[0].x, z: m.peds[0].z };
  expect(p0.x).toBeCloseTo(0); expect(p0.z).toBeCloseTo(-10);
  const player = { x: 0, z: -20, heading: 0, speedMs: 15 };
  m.update(1 / 60, player, []);
  expect(m.peds[0].state).toBe('dodging');
  for (let i = 0; i < 24; i++) m.update(1 / 60, { ...player, speedMs: 0 }, []); // 0.4 s (+ float slack)
  expect(Math.hypot(m.peds[0].x - p0.x, m.peds[0].z - p0.z)).toBeCloseTo(3, 1);
  expect(m.peds[0].state).toBe('done');
});
it('does not dodge for a player driving away or too far', () => {
  const m = PedestrianManager.forTest(g, [ped({ state: 'crossing', t: 0.5 })]);
  m.update(1 / 60, { x: 0, z: -20, heading: Math.PI, speedMs: 15 }, []);
  m.update(1 / 60, { x: 0, z: -40, heading: 0, speedMs: 15 }, []);
  expect(m.peds[0].state).toBe('crossing');
});
const passBy = (lateral: number) => {
  const m = PedestrianManager.forTest(g, [ped({ kind: 'student' })]);
  m.update(1 / 60, still(40, -40), [carAt(75)]);
  const p = { x: m.peds[0].x, z: m.peds[0].z };
  const hits: string[][] = [];
  for (let k = -80; k <= 80; k++) {
    const r = m.update(1 / 60, { x: p.x + lateral, z: p.z + k * 0.25, heading: 0, speedMs: 15 }, [carAt(75)]);
    if (r.nearMisses.length) hits.push(r.nearMisses);
  }
  expect(m.peds[0].state).toBe('waiting');
  return hits;
};
it('counts a near miss once when the player passes within 2 m', () => { expect(passBy(1.8)).toEqual([['student']]); });
it('no near miss at 2.5 m', () => { expect(passBy(2.5)).toEqual([]); });
it('exposes an obstacle while crossing', () => {
  const m = PedestrianManager.forTest(g, [ped({ state: 'crossing', t: 0.2 })]);
  expect(m.obstacles()).toEqual([{ edgeId: 'cv3_2', s: 90 }]);
  const w = PedestrianManager.forTest(g, [ped({})]);
  expect(w.obstacles()).toEqual([]);
});
it('reset removes everyone', () => {
  const m = PedestrianManager.forTest(g, [ped({})]); m.reset(); expect(m.peds.length).toBe(0);
});
