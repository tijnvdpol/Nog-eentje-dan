import { CONFIG } from '../config';
import type { RoadGraph } from './roadGraph';
import type { RoadEdge } from './types';

/**
 * A straight piece of sidewalk: centre (x, z), yaw like the road boxes (local z along the street), length
 * along the street, `side` −1/1 relative to the edge direction (+1 is the left, (−fz, fx)). `kerb: false`
 * is the lowered part at a zebra crossing.
 */
export interface SidewalkSegment { x: number; z: number; yaw: number; len: number; side: -1 | 1; kerb: boolean }
/**
 * A W × W square at a node. Lowered (`raised: false`) between two perpendicular city streets at a crossing;
 * raised on the outer side of a plain corner, where it joins the two outer sidewalks.
 */
export interface SidewalkCorner { x: number; z: number; raised: boolean }

const MIN_PIECE_M = 0.05, EPS = 1e-6;
type Vec = { x: number; z: number };
/** An edge seen from one of its nodes: unit direction away from the node. */
type Out = Vec & { e: RoadEdge };

const halfWidth = (e: RoadEdge): number => e.lanesPerDir * CONFIG.traffic.laneWidthM;
const same = (a: Vec, b: Vec): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.z - b.z) < EPS;
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.z * b.z;
const neg = (a: Vec): Vec => ({ x: -a.x, z: -a.z });
const left = (a: Vec): Vec => ({ x: -a.z, z: a.x });

/** Half the carriageway at a node: the widest road meeting there (the safe trim when the shape is unusual). */
function nodeHalfWidth(g: RoadGraph, nodeId: string): number {
  return Math.max(...g.edgesAt(nodeId).map(halfWidth));
}

function direction(g: RoadGraph, e: RoadEdge): { fx: number; fz: number; len: number } {
  const a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(e.id);
  return { fx: (b.x - a.x) / len, fz: (b.z - a.z) / len, len };
}

function outgoing(g: RoadGraph, nodeId: string): Out[] {
  return g.edgesAt(nodeId).map((e) => {
    const { fx, fz } = direction(g, e);
    return e.from === nodeId ? { e, x: fx, z: fz } : { e, x: -fx, z: -fz };
  });
}

type SideEnd =
  | { kind: 'cross'; start: number; other: Out } // a street on this side: lowered corner square in between
  | { kind: 'straight'; start: 0 } // the street continues straight on: the sidewalk runs on without a gap
  | { kind: 'outer'; start: number; other: Out } // plain corner, this is its outer side: raised square
  | { kind: 'trim'; start: number }; // anything else: stop clear of every carriageway at the node

/**
 * How the sidewalk on side `p` (unit vector) of the street leaving the node in direction `d` ends at the
 * node; `start` is where it begins, measured from the node along `d`. Corner squares and segment ends use
 * the same widths, so they always meet.
 */
function sideEnd(g: RoadGraph, nodeId: string, d: Out, p: Vec): SideEnd {
  const W = CONFIG.sidewalk.widthM;
  const others = outgoing(g, nodeId).filter((o) => o.e !== d.e);
  const cross = others.find((o) => same(o, p));
  const trim: SideEnd = { kind: 'trim', start: nodeHalfWidth(g, nodeId) + W };
  if (others.some((o) => o !== cross && dot(o, p) > EPS)) return trim; // an oblique road on this side
  if (cross) return { kind: 'cross', start: halfWidth(cross.e) + W, other: cross };
  const straight = others.find((o) => same(o, neg(d)));
  if (straight) return straight.e.kind === 'stad' ? { kind: 'straight', start: 0 } : trim;
  const back = others.find((o) => same(o, neg(p)));
  if (back && others.length === 1 && back.e.kind === 'stad') return { kind: 'outer', start: -halfWidth(back.e), other: back };
  return others.length ? trim : { kind: 'straight', start: 0 }; // a dead end runs to the node
}

/** Sidewalks on both sides of every city street, clear of the crossings and split at zebra crossings. */
export function sidewalkSegments(g: RoadGraph): SidewalkSegment[] {
  const W = CONFIG.sidewalk.widthM, CW = CONFIG.peds.crossingWidthM;
  const out: SidewalkSegment[] = [];
  for (const e of g.edgesOfKind('stad')) {
    const a = g.node(e.from);
    const { fx, fz, len } = direction(g, e);
    const f: Out = { e, x: fx, z: fz };
    const zebras = g.crossings.filter((c) => c.edgeId === e.id).map((c) => [c.s - CW / 2, c.s + CW / 2]).sort((p, q) => p[0] - q[0]);
    const off = halfWidth(e) + W / 2;
    const yaw = Math.atan2(fx, fz);
    for (const side of [-1, 1] as const) {
      const p = side === 1 ? left(f) : neg(left(f));
      const start = sideEnd(g, e.from, f, p).start, end = len - sideEnd(g, e.to, { e, ...neg(f) }, p).start;
      if (end - start < MIN_PIECE_M) continue;
      // pieces: [s0, s1, kerb]
      const pieces: [number, number, boolean][] = [];
      let s = start;
      for (const [z0, z1] of zebras) {
        if (z1 <= s || z0 >= end) continue;
        if (z0 > s) pieces.push([s, z0, true]);
        pieces.push([Math.max(z0, s), Math.min(z1, end), false]);
        s = Math.min(z1, end);
      }
      if (end > s) pieces.push([s, end, true]);
      for (const [s0, s1, kerb] of pieces) {
        if (s1 - s0 < MIN_PIECE_M) continue;
        const mid = (s0 + s1) / 2;
        out.push({ x: a.x + fx * mid + p.x * off, z: a.z + fz * mid + p.z * off, yaw, len: s1 - s0, side, kerb });
      }
    }
  }
  return out;
}

/**
 * Corner squares: a lowered one per quadrant between two perpendicular city streets at a node, and a raised
 * one on the outer side of a plain corner (two city streets at right angles and nothing else).
 */
export function sidewalkCorners(g: RoadGraph): SidewalkCorner[] {
  const W = CONFIG.sidewalk.widthM;
  const out: SidewalkCorner[] = [];
  for (const n of g.nodes) {
    for (const d of outgoing(g, n.id)) {
      if (d.e.kind !== 'stad') continue;
      // only the left side of each street, so every corner is made once
      const p = left(d), end = sideEnd(g, n.id, d, p);
      const across = halfWidth(d.e) + W / 2;
      if (end.kind === 'cross' && end.other.e.kind === 'stad') {
        const along = halfWidth(end.other.e) + W / 2;
        out.push({ x: n.x + d.x * along + p.x * across, z: n.z + d.z * along + p.z * across, raised: false });
      } else if (end.kind === 'outer') {
        const along = -(halfWidth(end.other.e) + W / 2);
        out.push({ x: n.x + d.x * along + p.x * across, z: n.z + d.z * along + p.z * across, raised: true });
      }
    }
  }
  return out;
}
