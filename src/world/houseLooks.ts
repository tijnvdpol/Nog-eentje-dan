import { CONFIG } from '../config';
import type { HouseRole } from '../models/roles';
import { mulberry32 } from '../util/rng';
import type { RoadGraph } from './roadGraph';
import type { HouseSpec } from './villageLayout';

/** Pure: which Kenney house, wall colour and front-yard extra each village plot gets (spec fase 4 §5.2). */

/** Hollands wall colours: red and brown brick, white plaster. */
export const HOLLANDS = [0x9c4a3a, 0x7a3b2e, 0xb06a4f, 0xe8e2d6, 0x8a5a44] as const;
export const HOUSE_ROLES: readonly HouseRole[] = ['house.a', 'house.b', 'house.c', 'house.d'];
const EXTRAS = ['fence', 'hedge', 'none'] as const;

export interface HouseLook {
  role: HouseRole;
  wall: number;
  extra: 'fence' | 'hedge' | 'none';
  /** Middle of the extra; local x runs along the street when turned by `yaw`. */
  extraAt: { x: number; z: number; yaw: number } | null;
  lit: boolean;
}

/** The street the house faces: the nearest edge that runs along the house's street axis. */
function street(h: HouseSpec, g: RoadGraph): { px: number; pz: number; lanesPerDir: number } {
  const ax = Math.cos(h.yaw), az = Math.sin(h.yaw); // yaw 0: street along x; π/2: street along z
  let best: { px: number; pz: number; lanesPerDir: number; dist: number } | null = null;
  for (const e of g.edges) {
    const a = g.node(e.from), b = g.node(e.to);
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    if (!len2 || Math.abs(dx * ax + dz * az) / Math.sqrt(len2) < 0.9) continue;
    const t = Math.min(1, Math.max(0, ((h.x - a.x) * dx + (h.z - a.z) * dz) / len2));
    const px = a.x + dx * t, pz = a.z + dz * t, dist = Math.hypot(h.x - px, h.z - pz);
    if (!best || dist < best.dist) best = { px, pz, lanesPerDir: e.lanesPerDir, dist };
  }
  if (!best) throw new Error('No street along the house');
  return best;
}

/** Unit vector from the house towards its street, along the house's depth axis. */
function toStreet(h: HouseSpec, g: RoadGraph): { nx: number; nz: number; dist: number; lanesPerDir: number } {
  const s = street(h, g);
  const alongX = Math.abs(Math.cos(h.yaw)) > 0.5;
  const nx = alongX ? 0 : Math.sign(s.px - h.x), nz = alongX ? Math.sign(s.pz - h.z) : 0;
  return { nx, nz, dist: Math.abs(alongX ? s.pz - h.z : s.px - h.x), lanesPerDir: s.lanesPerDir };
}

/** Rotation about y that turns a model's front (local -z) towards the street; equals `h.yaw` modulo π. */
export function houseFrontYaw(h: HouseSpec, g: RoadGraph): number {
  const { nx, nz } = toStreet(h, g);
  return Math.atan2(-nx, -nz);
}

export function houseLook(h: HouseSpec, index: number, seed: number, g: RoadGraph): HouseLook {
  const rng = mulberry32((Math.imul(seed, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const role = HOUSE_ROLES[Math.floor(rng() * HOUSE_ROLES.length)];
  const wall = HOLLANDS[Math.floor(rng() * HOLLANDS.length)];
  const extra = EXTRAS[Math.floor(rng() * EXTRAS.length)];
  const lit = rng() < CONFIG.light.houseLitShare;
  let extraAt: HouseLook['extraAt'] = null;
  if (extra !== 'none') {
    const { nx, nz, dist, lanesPerDir } = toStreet(h, g);
    const facade = dist - h.d / 2, kerb = lanesPerDir * CONFIG.traffic.laneWidthM;
    const fromHouse = dist - (facade + kerb) / 2; // midway between the front of the plot and the kerb
    extraAt = { x: h.x + nx * fromHouse, z: h.z + nz * fromHouse, yaw: houseFrontYaw(h, g) };
  }
  return { role, wall, extra, extraAt, lit };
}
