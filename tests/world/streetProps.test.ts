import { describe, expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { CONFIG } from '../../src/config';
import { RoadGraph } from '../../src/world/roadGraph';
import { sidewalkSegments } from '../../src/world/sidewalks';
import { lampPositions, streetProps, type StreetProp } from '../../src/world/streetProps';
import type { RoadEdge } from '../../src/world/types';

const g = RoadGraph.fromData(buildRoadData());
const segs = sidewalkSegments(g);
const SEED = 1337;
const props = streetProps(g, segs, SEED);
const LANE = CONFIG.traffic.laneWidthM, W = CONFIG.sidewalk.widthM, CW = CONFIG.peds.crossingWidthM;
const { benchEveryM } = CONFIG.props;
const CLEAR_M = 15, BACK_M = 0.4;

/** s along the edge from `from`, signed offset to its left (-fz, fx). */
function local(e: RoadEdge, x: number, z: number): { s: number; off: number } {
  const a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(e.id);
  const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
  return { s: (x - a.x) * fx + (z - a.z) * fz, off: (x - a.x) * -fz + (z - a.z) * fx };
}

describe('streetProps', () => {
  it('places benches and bins in the city', () => {
    expect(props.filter((p) => p.kind === 'bench').length).toBeGreaterThan(50);
    expect(props.filter((p) => p.kind === 'bin').length).toBeGreaterThan(50);
  });

  it('props stay off the road', () => {
    for (const p of props) {
      const { edge, distance } = g.nearestEdge(p.x, p.z);
      expect(edge.kind).toBe('stad');
      expect(distance).toBeGreaterThanOrEqual(edge.lanesPerDir * LANE + 0.5);
    }
  });

  it('on the building side of the sidewalk, 0.4 m from its back edge', () => {
    for (const p of props) {
      const { edge, distance } = g.nearestEdge(p.x, p.z);
      expect(distance).toBeCloseTo(edge.lanesPerDir * LANE + W - BACK_M, 6);
    }
  });

  it('props clear of crossings, nodes and places', () => {
    for (const p of props) {
      const { edge } = g.nearestEdge(p.x, p.z);
      for (const c of g.crossings) {
        const ce = g.edge(c.edgeId), a = g.node(ce.from), b = g.node(ce.to), t = c.s / g.edgeLength(ce.id);
        expect(Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - (a.z + (b.z - a.z) * t))).toBeGreaterThanOrEqual(CW);
        if (c.edgeId === edge.id) expect(Math.abs(local(edge, p.x, p.z).s - c.s)).toBeGreaterThanOrEqual(CW);
      }
      for (const n of g.nodes) expect(Math.hypot(p.x - n.x, p.z - n.z)).toBeGreaterThanOrEqual(CLEAR_M);
      for (const pl of g.places) expect(Math.hypot(p.x - pl.x, p.z - pl.z)).toBeGreaterThanOrEqual(CLEAR_M);
    }
  });

  it('props keep clear of lamp posts and of each other', () => {
    const lamps = lampPositions(g);
    for (const p of props) for (const l of lamps) expect(Math.hypot(p.x - l.x, p.z - l.z)).toBeGreaterThanOrEqual(1.5);
    for (let i = 0; i < props.length; i++)
      for (let j = i + 1; j < props.length; j++)
        expect(Math.hypot(props[i].x - props[j].x, props[i].z - props[j].z)).toBeGreaterThanOrEqual(1.5);
  });

  it('faces the street', () => {
    for (const p of props) {
      const { edge, t } = g.nearestEdge(p.x, p.z);
      const a = g.node(edge.from), b = g.node(edge.to);
      const qx = a.x + (b.x - a.x) * t - p.x, qz = a.z + (b.z - a.z) * t - p.z, d = Math.hypot(qx, qz);
      expect((Math.sin(p.yaw) * qx + Math.cos(p.yaw) * qz) / d).toBeGreaterThan(0.999);
    }
  });

  it('spacing', () => {
    // straight 100 m city streets without a zebra: one free stretch per side between the node clearances
    const plain = g.edgesOfKind('stad').filter((e) => !g.crossings.some((c) => c.edgeId === e.id));
    expect(plain.length).toBeGreaterThan(20);
    const off = LANE + W - BACK_M;
    const usable = 100 - 2 * Math.sqrt(CLEAR_M ** 2 - off ** 2);
    const lo = Math.floor(usable / benchEveryM);
    const benches = props.filter((p) => p.kind === 'bench');
    for (const e of plain) {
      expect(g.edgeLength(e.id)).toBeCloseTo(100, 6);
      for (const side of [-1, 1]) {
        const mine = benches.filter((p: StreetProp) => g.nearestEdge(p.x, p.z).edge.id === e.id && Math.sign(local(e, p.x, p.z).off) === side);
        expect(mine.length).toBeGreaterThanOrEqual(lo);
        expect(mine.length).toBeLessThanOrEqual(lo + 1);
      }
    }
  });

  it('deterministic', () => {
    expect(streetProps(g, segs, SEED)).toEqual(props);
    expect(streetProps(g, segs, SEED + 1)).not.toEqual(props);
  });
});

describe('lampPositions', () => {
  it('two lamps on the left of every city street, 5.5 m from its centre line', () => {
    const lamps = lampPositions(g);
    const stad = g.edgesOfKind('stad');
    expect(lamps).toHaveLength(stad.length * 2);
    stad.forEach((e, i) => {
      for (const [k, s] of [25, 75].entries()) {
        const p = local(e, lamps[i * 2 + k].x, lamps[i * 2 + k].z);
        expect(p.s).toBeCloseTo(s, 6);
        expect(p.off).toBeCloseTo(5.5, 6);
      }
    });
  });
  it('yaw points from the post towards the street', () => {
    for (const l of lampPositions(g)) {
      const { edge, t, distance } = g.nearestEdge(l.x, l.z);
      const a = g.node(edge.from), b = g.node(edge.to);
      const qx = a.x + (b.x - a.x) * t - l.x, qz = a.z + (b.z - a.z) * t - l.z;
      expect((Math.sin(l.yaw) * qx + Math.cos(l.yaw) * qz) / distance).toBeGreaterThan(0.999);
    }
  });
});
