import { expect, it, vi } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { RoadGraph } from '../../src/world/roadGraph';
const g = RoadGraph.fromData(buildRoadData());
it('rejects edges to unknown nodes', () => {
  expect(() => RoadGraph.fromData({ nodes: [{ id: 'a', x: 0, z: 0 }], edges: [{ id: 'e', from: 'a', to: 'x', lanesPerDir: 1, speedLimitKmh: 50, zone: 'city', kind: 'stad' }], places: [] })).toThrow();
});
it('rejects duplicate ids', () => {
  expect(() => RoadGraph.fromData({ nodes: [{ id: 'a', x: 0, z: 0 }, { id: 'a', x: 1, z: 0 }], edges: [], places: [] })).toThrow();
});
it('nearestEdge and zoneAt', () => {
  expect(g.zoneAt(0, 2)).toEqual({ zone: 'city', speedLimitKmh: 50 });
  expect(g.zoneAt(640, 0)).toEqual({ zone: 'snelweg', speedLimitKmh: 130 });
  expect(g.nearestEdge(50, 3).distance).toBeCloseTo(3);
});
const tiny = (extra: object) => ({
  nodes: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 0, z: 100 }],
  edges: [{ id: 'e', from: 'a', to: 'b', lanesPerDir: 1, speedLimitKmh: 50, zone: 'city' as const, kind: 'stad' as const }],
  places: [], signals: [], crossings: [], ...extra,
});
it('axisOf and isIntersection', () => {
  expect(g.axisOf('ch2_3')).toBe('ow'); expect(g.axisOf('cv3_2')).toBe('nz'); expect(g.axisOf('opr2')).toBe('nz');
  expect(g.isIntersection('g3_3')).toBe(true); expect(g.isIntersection('g0_3')).toBe(true);
  expect(g.isIntersection('g0_6')).toBe(false); expect(g.isIntersection('r8')).toBe(false);
});
it('signalAt finds a signal by node', () => {
  expect(g.signalAt('g3_3')?.offsetSec).toBe(4); expect(g.signalAt('g2_2')).toBeUndefined();
});
it('rejects a crossing on an unknown edge', () => {
  expect(() => RoadGraph.fromData(tiny({ crossings: [{ id: 'x', edgeId: 'nope', s: 1 }] }))).toThrow();
});
it('rejects a crossing outside the edge', () => {
  expect(() => RoadGraph.fromData(tiny({ crossings: [{ id: 'x', edgeId: 'e', s: 101 }] }))).toThrow();
});
it('rejects a signal on an unknown node', () => {
  expect(() => RoadGraph.fromData(tiny({ signals: [{ nodeId: 'zz', offsetSec: 0 }] }))).toThrow();
});

it('ring nodes are found by kind, not by id', () => {
  expect(g.isRingNode('r0')).toBe(true); expect(g.isRingNode('g3_3')).toBe(false);
  expect(g.isIntersection('r28')).toBe(false); expect(g.isIntersection('g3_3')).toBe(true);
});

it('skips invalid speed cameras with a warning', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const d = buildRoadData();
  const gg = RoadGraph.fromData({ ...d, speedCameras: [...d.speedCameras, { id: 'x1', edgeId: 'bestaatniet', s: 5, dir: 1 }, { id: 'x2', edgeId: 'nw2', s: 9999, dir: 1 }] });
  expect(gg.speedCameras.map((c) => c.id).sort()).toEqual(['fl_dorp', 'fl_nweg_heen', 'fl_nweg_terug', 'fl_ring']);
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});
