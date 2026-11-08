import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { PedestrianManager } from '../../src/pedestrians/pedestrianLogic';
import { occupiedLanes } from '../../src/traffic/lanes';
import { TrafficManager, lanePose } from '../../src/traffic/trafficLogic';
import { mulberry32 } from '../../src/util/rng';
import { RoadGraph } from '../../src/world/roadGraph';

const g = RoadGraph.fromData(buildRoadData());

it('5 minutes of traffic and pedestrians: no axis conflict, no deadlock, no overlap', () => {
  // city centre (all six signals within reach) and next to the ring at ramp opr2 (merging, exits, lane changes)
  for (const [seed, player] of [[42, { x: 50, z: 50 }], [7, { x: 60, z: 580 }]] as const) {
    const m = new TrafficManager(g, mulberry32(seed));
    const peds = new PedestrianManager(g, mulberry32(seed + 1));
    const crossed = new Set<number>(); let maxPeds = 0;
    const signalCars = new Set<number>(), laneChangers = new Set<number>(), mergers = new Set<number>();
    const lastEdge = new Map<number, string>();
    const dt = 1 / 30;
    const still = new Map<number, number>();
    let t = 0, maxCars = 0;
    for (let step = 0; step < 9000; step++) {
      peds.update(dt, { ...player, heading: 0, speedMs: 0 }, m.cars);
      for (const q of peds.peds) if (q.state === 'done') crossed.add(q.id);
      maxPeds = Math.max(maxPeds, peds.peds.length);
      m.update(dt, player, t, peds.obstacles()); t += dt;
      maxCars = Math.max(maxCars, m.cars.length);
      for (const sig of g.signals) {
        for (const [id] of m.intersections.insideEntries(sig.nodeId)) signalCars.add(id);
        const axes = new Set(m.intersections.insideEntries(sig.nodeId).map(([, a]) => g.axisOf(a.edgeId)));
        expect(axes.size, `axis conflict at ${sig.nodeId}, t=${t.toFixed(2)}`).toBeLessThanOrEqual(1);
      }
      const byLane = new Map<string, { id: number; x: number; z: number }[]>();
      for (const c of m.cars) {
        const p = lanePose(c, g);
        if (c.laneT !== undefined) laneChangers.add(c.id);
        if (lastEdge.get(c.id)?.startsWith('opr') && c.edgeId.startsWith('ring')) mergers.add(c.id);
        lastEdge.set(c.id, c.edgeId);
        for (const lane of occupiedLanes(c)) {
          const k = `${c.edgeId}|${c.dir}|${lane}`;
          for (const o of byLane.get(k) ?? [])
            expect(Math.hypot(o.x - p.x, o.z - p.z), `overlap ${o.id}/${c.id} on ${k}, t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(2);
          byLane.set(k, [...(byLane.get(k) ?? []), { id: c.id, x: p.x, z: p.z }]);
        }
        const s = c.speed < 0.1 ? (still.get(c.id) ?? 0) + dt : 0;
        still.set(c.id, s);
        expect(s, `car ${c.id} stuck on ${c.edgeId} s=${c.s.toFixed(1)}, t=${t.toFixed(2)}`).toBeLessThanOrEqual(60);
      }
    }
    expect(maxCars).toBe(30);
    expect(maxPeds).toBeLessThanOrEqual(12);
    // one pedestrian per crossing: at most 8 crossings lie within 150 m of (50, 50), so 12 is a cap, not reachable here
    if (player.x === 50) { expect(maxPeds).toBe(8); expect(crossed.size).toBeGreaterThan(20); }
    if (player.x === 50) expect(signalCars.size).toBeGreaterThan(50);
    else { expect(laneChangers.size).toBeGreaterThan(3); expect(mergers.size).toBeGreaterThan(3); }
  }
}, 60_000);
