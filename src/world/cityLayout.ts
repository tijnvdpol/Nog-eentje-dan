import { mulberry32 } from '../util/rng';
import type { RoadGraph } from './roadGraph';
import type { BuildingSpec } from './types';

const PALETTE = [0x8a8f98, 0xb4a48a, 0x9c6b5a, 0x6f8a9c, 0xa8b0a0, 0xc9b48a];

export function generateCityLayout(graph: RoadGraph, seed: number): BuildingSpec[] {
  const rng = mulberry32(seed);
  const cityNodes = graph.nodes.filter((n) => graph.edgesAt(n.id).some((e) => e.kind === 'stad'));
  const xs = [...new Set(cityNodes.map((n) => n.x))].sort((a, b) => a - b);
  const zs = [...new Set(cityNodes.map((n) => n.z))].sort((a, b) => a - b);
  const out: BuildingSpec[] = [];
  const pick = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const colour = () => PALETTE[Math.floor(rng() * PALETTE.length)];

  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const bx = xs[i], bz = zs[j];
      // side strips: [axis start, axis end, cross start, cross end, runsAlongX]
      const strips: [number, number, number, number, boolean][] = [
        [10, 90, 10, 35, true], [10, 90, 65, 90, true],
        [10, 35, 35, 65, false], [65, 90, 35, 65, false],
      ];
      for (const [a0, a1, c0, c1, alongX] of strips) {
        // For alongX strips: a is x-range, c is z-range. Otherwise: a is x-range (narrow), c is z-range; segment along z.
        const n = 2 + Math.floor(rng() * 3);
        const len = alongX ? a1 - a0 : c1 - c0;
        const seg = len / n;
        for (let k = 0; k < n; k++) {
          const s0 = (alongX ? a0 : c0) + k * seg + 1;
          const sLen = seg - 2;
          const depth = pick(0.6, 1) * (alongX ? c1 - c0 : a1 - a0);
          const cross0 = alongX ? c0 : a0;
          const crossRange = alongX ? c1 - c0 : a1 - a0;
          const cOff = cross0 + (crossRange - depth) * rng();
          const h = pick(6, 30), color = colour();
          if (alongX) out.push({ x: bx + s0 + sLen / 2, z: bz + cOff + depth / 2, w: sLen, d: depth, h, color });
          else out.push({ x: bx + cOff + depth / 2, z: bz + s0 + sLen / 2, w: depth, d: sLen, h, color });
        }
      }
    }
  return out;
}
