import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { RoadGraph } from './roadGraph';
import type { BuildingSpec } from './types';

/** Building side: 0 = +x, 1 = −x, 2 = +z, 3 = −z. Sides 0/1 are d long, sides 2/3 are w long. */
export type Side = 0 | 1 | 2 | 3;
export type FacadeType = 'kantoor' | 'baksteen' | 'flat';
export type RoofRole = 'roof.ac' | 'roof.tank' | 'roof.lift';
/** One window; floor 0 is the first floor above the plinth. `warm` only matters when `lit`. */
export interface WindowCell { side: Side; floor: number; col: number; lit: boolean; warm: boolean }
export interface PlinthPart { side: Side; awning: boolean; shop: string | null }
export interface RoofPart { role: RoofRole; dx: number; dz: number }
export interface FacadeLayout {
  type: FacadeType;
  wall: number;
  floors: number;
  columns: Record<Side, number>;
  windows: WindowCell[];
  streetSides: Side[];
  plinth: PlinthPart[];
  roof: RoofPart[];
}

export const SIDES: readonly Side[] = [0, 1, 2, 3];
/** Footprint (x, z) in metres of each roof part; codeModels builds them at this size. */
export const ROOF_PART_SIZE: Record<RoofRole, { w: number; d: number }> = {
  'roof.ac': { w: 1.6, d: 1.1 },
  'roof.tank': { w: 1.8, d: 1.8 },
  'roof.lift': { w: 2.6, d: 3.2 },
};
const ROOF_ROLES: readonly RoofRole[] = ['roof.ac', 'roof.ac', 'roof.tank', 'roof.lift'];
/** A plinth side needs this much wall for an awning. */
const AWNING_MIN_WALL_M = 4;
const STREET_PROBE_M = 3, STREET_REACH_M = 12;

export const sideLength = (b: Pick<BuildingSpec, 'w' | 'd'>, s: Side): number => (s < 2 ? b.d : b.w);
/** Outward unit normal of a side. */
export const sideNormal = (s: Side): { x: number; z: number } =>
  [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }][s];

/** Number of window columns that fit a wall of `len` metres with a gap on both ends. */
export function columnsFor(len: number): number {
  const { windowW, windowGap } = CONFIG.facade;
  return Math.max(0, Math.floor((len - windowGap) / (windowW + windowGap) + 1e-9));
}

/** Floors above the plinth that fit in `h`. */
export function floorsFor(h: number): number {
  const { floorH, plinthH } = CONFIG.facade;
  return Math.max(0, Math.floor((h - plinthH) / floorH + 1e-9));
}

function distanceToStad(g: RoadGraph, x: number, z: number): number {
  let best = Infinity;
  for (const e of g.edgesOfKind('stad')) {
    const a = g.node(e.from), b = g.node(e.to);
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/** Sides whose midpoint, 3 m outward, lies within 12 m of a city street. */
export function streetSides(b: BuildingSpec, g: RoadGraph): Side[] {
  return SIDES.filter((s) => {
    const n = sideNormal(s), half = s < 2 ? b.w / 2 : b.d / 2;
    return distanceToStad(g, b.x + n.x * (half + STREET_PROBE_M), b.z + n.z * (half + STREET_PROBE_M)) <= STREET_REACH_M;
  });
}

function pickType(r: number): FacadeType {
  const mix = CONFIG.facade.typeMix;
  if (r < mix.kantoor) return 'kantoor';
  if (r < mix.kantoor + mix.baksteen) return 'baksteen';
  return 'flat';
}

/** Pure facade plan for one building; same inputs give the same plan. */
export function facadeLayout(
  b: BuildingSpec, index: number, seed: number, street: readonly Side[], shops: readonly string[],
): FacadeLayout {
  const F = CONFIG.facade, L = CONFIG.light;
  const rng = mulberry32(seed + index * 7919);
  const type = pickType(rng());
  const palette = F.palette[type];
  const wall = palette[Math.floor(rng() * palette.length)];
  const floors = floorsFor(b.h);
  const columns = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Side, number>;
  for (const s of SIDES) columns[s] = floors > 0 ? columnsFor(sideLength(b, s)) : 0;

  const windows: WindowCell[] = [];
  for (const side of SIDES)
    for (let floor = 0; floor < floors; floor++)
      for (let col = 0; col < columns[side]; col++) {
        const lit = rng() < L.windowLitShare;
        const warm = lit && rng() < L.windowWarmShare;
        windows.push({ side, floor, col, lit, warm });
      }

  const plinth: PlinthPart[] = street.map((side) => {
    const awning = rng() < F.awningShare && sideLength(b, side) >= AWNING_MIN_WALL_M;
    const shop = awning && shops.length ? shops[Math.floor(rng() * shops.length)] : null;
    return { side, awning, shop };
  });

  const roof: RoofPart[] = [];
  const wanted = Math.floor(rng() * (F.roofPartsMax + 1));
  for (let k = 0; k < wanted; k++) {
    const role = ROOF_ROLES[Math.floor(rng() * ROOF_ROLES.length)];
    const size = ROOF_PART_SIZE[role];
    const rx = b.w / 2 - 1 - size.w / 2, rz = b.d / 2 - 1 - size.d / 2;
    const dx = (rng() * 2 - 1) * rx, dz = (rng() * 2 - 1) * rz;
    if (rx < 0 || rz < 0) continue;
    const clash = roof.some((o) => {
      const os = ROOF_PART_SIZE[o.role];
      return Math.abs(o.dx - dx) < (os.w + size.w) / 2 + 0.3 && Math.abs(o.dz - dz) < (os.d + size.d) / 2 + 0.3;
    });
    if (!clash) roof.push({ role, dx, dz });
  }

  return { type, wall, floors, columns, windows, streetSides: [...street], plinth, roof };
}
