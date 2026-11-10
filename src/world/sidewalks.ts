import { CONFIG } from '../config';
import type { RoadGraph } from './roadGraph';
import type { RoadEdge } from './types';

/**
 * A straight piece of sidewalk: centre (x, z), yaw like the road boxes (local z along the street), length
 * along the street, `side` −1/1 relative to the edge direction (+1 is the left, (−fz, fx)). `kerb: false`
 * is the lowered part at a zebra crossing.
 */
export interface SidewalkSegment { x: number; z: number; yaw: number; len: number; side: -1 | 1; kerb: boolean }
/** A lowered square that fills the corner between two sidewalks at a city crossing. */
export interface SidewalkCorner { x: number; z: number }

const MIN_PIECE_M = 0.05;

/** Half the carriageway at a node: the widest road meeting there. */
function nodeHalfWidth(g: RoadGraph, nodeId: string): number {
  return Math.max(...g.edgesAt(nodeId).map((e) => e.lanesPerDir)) * CONFIG.traffic.laneWidthM;
}

function direction(g: RoadGraph, e: RoadEdge): { fx: number; fz: number; len: number } {
  const a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(e.id);
  return { fx: (b.x - a.x) / len, fz: (b.z - a.z) / len, len };
}

/** Sidewalks on both sides of every city street, clear of the crossings and split at zebra crossings. */
export function sidewalkSegments(g: RoadGraph): SidewalkSegment[] {
  const W = CONFIG.sidewalk.widthM, CW = CONFIG.peds.crossingWidthM;
  const out: SidewalkSegment[] = [];
  for (const e of g.edgesOfKind('stad')) {
    const a = g.node(e.from);
    const { fx, fz, len } = direction(g, e);
    const start = nodeHalfWidth(g, e.from) + W, end = len - (nodeHalfWidth(g, e.to) + W);
    if (end - start < MIN_PIECE_M) continue;
    // cut points: [s0, s1, kerb]
    const zebras = g.crossings.filter((c) => c.edgeId === e.id).map((c) => [c.s - CW / 2, c.s + CW / 2]).sort((p, q) => p[0] - q[0]);
    const pieces: [number, number, boolean][] = [];
    let s = start;
    for (const [z0, z1] of zebras) {
      if (z1 <= s || z0 >= end) continue;
      if (z0 > s) pieces.push([s, z0, true]);
      pieces.push([Math.max(z0, s), Math.min(z1, end), false]);
      s = Math.min(z1, end);
    }
    if (end > s) pieces.push([s, end, true]);
    const off = e.lanesPerDir * CONFIG.traffic.laneWidthM + W / 2;
    const yaw = Math.atan2(fx, fz);
    for (const [s0, s1, kerb] of pieces) {
      if (s1 - s0 < MIN_PIECE_M) continue;
      const mid = (s0 + s1) / 2;
      for (const side of [-1, 1] as const) {
        out.push({ x: a.x + fx * mid - fz * off * side, z: a.z + fz * mid + fx * off * side, yaw, len: s1 - s0, side, kerb });
      }
    }
  }
  return out;
}

/** One lowered corner square per quadrant between two perpendicular city streets at a node. */
export function sidewalkCorners(g: RoadGraph): SidewalkCorner[] {
  const out: SidewalkCorner[] = [];
  for (const n of g.nodes) {
    const dirs = g.edgesAt(n.id).filter((e) => e.kind === 'stad').map((e) => {
      const { fx, fz } = direction(g, e);
      return e.from === n.id ? { x: fx, z: fz, lanes: e.lanesPerDir } : { x: -fx, z: -fz, lanes: e.lanesPerDir };
    });
    for (const d of dirs) {
      const left = dirs.find((o) => Math.abs(o.x + d.z) < 1e-6 && Math.abs(o.z - d.x) < 1e-6);
      if (!left) continue;
      const along = left.lanes * CONFIG.traffic.laneWidthM + CONFIG.sidewalk.widthM / 2;
      const across = d.lanes * CONFIG.traffic.laneWidthM + CONFIG.sidewalk.widthM / 2;
      out.push({ x: n.x + d.x * along + left.x * across, z: n.z + d.z * along + left.z * across });
    }
  }
  return out;
}
