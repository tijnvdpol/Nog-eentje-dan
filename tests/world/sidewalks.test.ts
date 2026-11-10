import { describe, expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { CONFIG } from '../../src/config';
import { RoadGraph } from '../../src/world/roadGraph';
import { sidewalkCorners, sidewalkSegments, type SidewalkSegment } from '../../src/world/sidewalks';
import type { RoadEdge } from '../../src/world/types';

const g = RoadGraph.fromData(buildRoadData());
const segs = sidewalkSegments(g);
const W = CONFIG.sidewalk.widthM, LANE = CONFIG.traffic.laneWidthM, CW = CONFIG.peds.crossingWidthM;
const stad = g.edgesOfKind('stad');

/** Position of a point relative to an edge: s along it from `from`, signed offset to its left (-fz, fx). */
function local(e: RoadEdge, x: number, z: number): { s: number; off: number; len: number; fx: number; fz: number } {
  const a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(e.id);
  const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
  return { s: (x - a.x) * fx + (z - a.z) * fz, off: (x - a.x) * -fz + (z - a.z) * fx, len, fx, fz };
}
const parallel = (seg: SidewalkSegment, fx: number, fz: number): boolean =>
  Math.abs(Math.sin(seg.yaw) * fz - Math.cos(seg.yaw) * fx) < 1e-6;
/** The stad edge a segment runs along: parallel, centre projected inside it, nearest centre line. */
function ownEdge(seg: SidewalkSegment): { e: RoadEdge; off: number; s: number } | undefined {
  let best: { e: RoadEdge; off: number; s: number } | undefined;
  for (const e of stad) {
    const p = local(e, seg.x, seg.z);
    if (!parallel(seg, p.fx, p.fz) || p.s <= 0 || p.s >= p.len) continue;
    if (!best || Math.abs(p.off) < Math.abs(best.off)) best = { e, off: p.off, s: p.s };
  }
  return best;
}

describe('sidewalkSegments', () => {
  it('only along city streets, both sides', () => {
    expect(segs.length).toBeGreaterThan(stad.length * 2);
    const sides = new Map<string, Set<number>>();
    for (const seg of segs) {
      const own = ownEdge(seg);
      expect(own).toBeDefined();
      expect(Math.sign(own!.off)).toBe(seg.side);
      sides.set(own!.e.id, (sides.get(own!.e.id) ?? new Set()).add(seg.side));
    }
    for (const e of stad) expect([...(sides.get(e.id) ?? [])].sort()).toEqual([-1, 1]);
  });

  it('no kerb across a zebra', () => {
    let lowered = 0;
    for (const c of g.crossings) {
      const e = g.edge(c.edgeId);
      if (e.kind !== 'stad') continue;
      for (const seg of segs) {
        const p = local(e, seg.x, seg.z);
        if (!parallel(seg, p.fx, p.fz) || Math.abs(Math.abs(p.off) - (e.lanesPerDir * LANE + W / 2)) > 0.01) continue;
        const overlaps = p.s - seg.len / 2 < c.s + CW / 2 - 1e-6 && p.s + seg.len / 2 > c.s - CW / 2 + 1e-6;
        if (!overlaps) continue;
        expect(seg.kerb).toBe(false);
        if (Math.abs(seg.len - CW) < 1e-6) lowered++;
      }
    }
    expect(lowered).toBeGreaterThan(0);
  });

  it('clear of intersections', () => {
    for (const seg of segs) for (const n of g.nodes) {
      const lanes = Math.max(...g.edgesAt(n.id).map((e) => e.lanesPerDir));
      expect(Math.hypot(seg.x - n.x, seg.z - n.z)).toBeGreaterThan(lanes * LANE);
    }
  });

  it('segments never lie on the carriageway', () => {
    for (const seg of segs) {
      const own = ownEdge(seg)!;
      expect(Math.abs(own.off)).toBeCloseTo(own.e.lanesPerDir * LANE + W / 2, 2);
      expect(seg.len).toBeGreaterThan(0);
    }
  });
});

describe('sidewalkCorners', () => {
  it('fills each corner of a city crossing once, outside the carriageway', () => {
    const corners = sidewalkCorners(g);
    const at = corners.filter((c) => Math.abs(c.x + 200) < 10 && Math.abs(c.z + 200) < 10);
    expect(at).toHaveLength(4);
    for (const c of at) {
      expect(Math.abs(Math.abs(c.x + 200) - (LANE + W / 2))).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(c.z + 200) - (LANE + W / 2))).toBeLessThan(1e-6);
    }
  });
});
