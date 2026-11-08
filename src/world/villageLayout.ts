import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { RoadGraph } from './roadGraph';
import type { BuildingSpec } from './types';

export interface HouseSpec { x: number; z: number; w: number; d: number; h: number; roofH: number; yaw: number; color: number }
export interface ChurchSpec { x: number; z: number; w: number; d: number; towerH: number }
export interface VillageLayout { houses: HouseSpec[]; church: ChurchSpec; cafe: BuildingSpec }

const PALETTE = [0xc9b48a, 0xb8896a, 0xd8d0c0, 0x9fb0a0, 0xc98a7a, 0xa8a090];
interface Box { x: number; z: number; hx: number; hz: number }
const overlaps = (a: Box, b: Box, margin = 0) => Math.abs(a.x - b.x) < a.hx + b.hx + margin && Math.abs(a.z - b.z) < a.hz + b.hz + margin;
/** Houses are axis aligned: yaw 0 (street along x) or π/2 (street along z), so the footprint swaps w and d. */
export const houseBox = (h: Pick<HouseSpec, 'x' | 'z' | 'w' | 'd' | 'yaw'>): Box => {
  const turned = Math.abs(Math.sin(h.yaw)) > 0.5;
  return { x: h.x, z: h.z, hx: (turned ? h.d : h.w) / 2, hz: (turned ? h.w : h.d) / 2 };
};

export function generateVillageLayout(g: RoadGraph, seed: number): VillageLayout {
  const V = CONFIG.village;
  const rng = mulberry32(seed);
  const church: ChurchSpec = { x: 2850, z: 0, w: 14, d: 24, towerH: 30 };
  const cafe: BuildingSpec = { x: 2700, z: 18, w: 12, d: 10, h: 5, color: 0x8a4a3a };
  const fixed: Box[] = [
    { x: church.x, z: church.z, hx: church.w / 2, hz: church.d / 2 },
    { x: cafe.x, z: cafe.z, hx: cafe.w / 2, hz: cafe.d / 2 },
  ];
  const nodes = g.nodes.filter((n) => g.edgesAt(n.id).some((e) => e.kind === 'dorp'));
  const houses: HouseSpec[] = [];
  const centre = V.frontFromCenterM + V.houseD / 2;
  for (const e of g.edgesOfKind('dorp')) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    const alongX = Math.abs(fx) > 0.5;
    for (let s = V.houseSpacingM / 2; s < len; s += V.houseSpacingM) {
      for (const side of [-1, 1]) {
        const skip = rng() < V.gapChance;
        const h = V.wallHMin + rng() * (V.wallHMax - V.wallHMin);
        const color = PALETTE[Math.floor(rng() * PALETTE.length)];
        const x = a.x + fx * s - fz * side * centre, z = a.z + fz * s + fx * side * centre;
        const spec: HouseSpec = { x, z, w: V.houseW, d: V.houseD, h, roofH: V.roofH, yaw: alongX ? 0 : Math.PI / 2, color };
        if (skip) continue;
        if (nodes.some((n) => Math.hypot(x - n.x, z - n.z) < V.nodeClearM)) continue;
        if (g.nearestEdge(x, z).distance < centre - 0.01) continue;
        const box = houseBox(spec);
        if (fixed.some((f) => overlaps(box, f, 1)) || houses.some((o) => overlaps(box, houseBox(o), 0.5))) continue;
        houses.push(spec);
      }
    }
  }
  return { houses, church, cafe };
}
