import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { RoadGraph } from './roadGraph';
import type { SidewalkSegment } from './sidewalks';

/** A bench or bin on the building side of a sidewalk; `yaw` turns its front (local +z) towards the street. */
export interface StreetProp { kind: 'bench' | 'bin'; x: number; z: number; yaw: number }
/** A street lamp post; `yaw` points from the post towards the street (the arm of the lamp). */
export interface LampPosition { x: number; z: number; yaw: number }

/** Lamp posts stand 5.5 m left of the centre line, 25 m and 75 m along every city street (fase 2). */
const LAMP_AT_M = [25, 75], LAMP_OFFSET_M = 5.5;
/** Clearance between a prop and a lamp post or another prop, along the sidewalk. */
const CLEAR_M = 1.5;
/** A tiny extra margin so a prop never lands exactly on the edge of a kept-clear zone. */
const EDGE_M = 0.01;

export function lampPositions(g: RoadGraph): LampPosition[] {
  const out: LampPosition[] = [];
  for (const e of g.edgesOfKind('stad')) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    const yaw = Math.atan2(fz, -fx); // towards the street: minus the left normal (−fz, fx)
    for (const s of LAMP_AT_M) out.push({ x: a.x + fx * s - fz * LAMP_OFFSET_M, z: a.z + fz * s + fx * LAMP_OFFSET_M, yaw });
  }
  return out;
}

type Span = [number, number];

/** `from` minus the `cut` spans, as sorted disjoint spans. */
function subtract(from: Span, cuts: Span[]): Span[] {
  let free: Span[] = [from];
  for (const [c0, c1] of cuts) {
    free = free.flatMap(([a, b]): Span[] => {
      if (c1 <= a || c0 >= b) return [[a, b]];
      return [...(c0 > a ? [[a, c0] as Span] : []), ...(c1 < b ? [[c1, b] as Span] : [])];
    });
  }
  return free;
}

const inside = (spans: Span[], t: number): boolean => spans.some(([a, b]) => t >= a && t <= b);

/**
 * Moves `t` out of reach (CLEAR_M) of the obstacles, staying in a free span; null when it cannot.
 * Moving instead of dropping keeps the count per stretch as the spacing promises.
 */
function nudge(t: number, obstacles: number[], free: Span[]): number | null {
  const ok = (u: number): boolean => inside(free, u) && obstacles.every((o) => Math.abs(u - o) >= CLEAR_M);
  if (ok(t)) return t;
  for (const o of obstacles) {
    if (Math.abs(t - o) >= CLEAR_M) continue;
    const away = t >= o ? 1 : -1;
    for (const u of [o + away * (CLEAR_M + EDGE_M), o - away * (CLEAR_M + EDGE_M)]) if (ok(u)) return u;
  }
  return null;
}

/**
 * Benches and bins along the raised sidewalks: on the building side (`props.backM` from the back edge), one
 * every `benchEveryM` / `binEveryM` from a seeded start, never near a node, a place, a zebra or a lamp post.
 */
export function streetProps(g: RoadGraph, sidewalks: readonly SidewalkSegment[], seed: number): StreetProp[] {
  const P = CONFIG.props, W = CONFIG.sidewalk.widthM, CW = CONFIG.peds.crossingWidthM;
  const rng = mulberry32(seed + 0x5eed);
  const lamps = lampPositions(g);
  const zebras = g.crossings.map((c) => {
    const e = g.edge(c.edgeId), a = g.node(e.from), b = g.node(e.to), len = g.edgeLength(e.id);
    return { x: a.x + (b.x - a.x) * c.s / len, z: a.z + (b.z - a.z) * c.s / len, fx: (b.x - a.x) / len, fz: (b.z - a.z) / len };
  });
  const out: StreetProp[] = [];

  for (const seg of sidewalks) {
    if (!seg.kerb) continue;
    const fx = Math.sin(seg.yaw), fz = Math.cos(seg.yaw);
    const nx = -fz * seg.side, nz = fx * seg.side; // away from the street
    const k = W / 2 - P.backM;
    const ox = seg.x + nx * k, oz = seg.z + nz * k; // the prop line, t = 0 level with the segment centre
    const yaw = Math.atan2(-nx, -nz);
    const along = (x: number, z: number): { t: number; d: number } => ({ t: (x - ox) * fx + (z - oz) * fz, d: (x - ox) * nx + (z - oz) * nz });

    const cuts: Span[] = [];
    const disc = (x: number, z: number, r: number): void => {
      const { t, d } = along(x, z), rr = r + EDGE_M;
      if (Math.abs(d) < rr) { const h = Math.sqrt(rr * rr - d * d); cuts.push([t - h, t + h]); }
    };
    for (const n of g.nodes) disc(n.x, n.z, P.nodeClearM);
    for (const p of g.places) disc(p.x, p.z, P.placeClearM);
    for (const z of zebras) {
      disc(z.x, z.z, CW);
      // a zebra on this street: keep crossingWidthM clear along the sidewalk
      const { t, d } = along(z.x, z.z);
      if (Math.abs(z.fx * fz - z.fz * fx) < 1e-6 && Math.abs(d) < k + W) cuts.push([t - CW - EDGE_M, t + CW + EDGE_M]);
    }
    const free = subtract([-seg.len / 2, seg.len / 2], cuts);
    const posts = lamps.map((l) => along(l.x, l.z)).filter((l) => Math.abs(l.d) < 1).map((l) => l.t);

    const taken: number[] = [];
    for (const [kind, every] of [['bench', P.benchEveryM], ['bin', P.binEveryM]] as const) {
      for (const [a, b] of free) {
        for (let t = a + rng() * every; t <= b; t += every) {
          const u = nudge(t, [...posts, ...taken], free);
          if (u === null) continue;
          taken.push(u);
          out.push({ kind, x: ox + fx * u, z: oz + fz * u, yaw });
        }
      }
    }
  }
  return out;
}
