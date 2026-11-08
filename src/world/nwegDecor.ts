import { CONFIG } from '../config';
import type { RoadGraph } from './roadGraph';

export interface NwegDecor { trees: { x: number; z: number; scale: number }[]; reflectors: { x: number; z: number }[] }

export function inForecourt(p: { x: number; z: number }, margin = 2): boolean {
  const f = CONFIG.tankstation.forecourt;
  return Math.abs(p.x - f.cx) < f.w / 2 + margin && Math.abs(p.z - f.cz) < f.d / 2 + margin;
}

export function nwegDecor(g: RoadGraph, rng: () => number): NwegDecor {
  const N = CONFIG.nweg;
  const trees: NwegDecor['trees'] = [], reflectors: NwegDecor['reflectors'] = [];
  const edges = [...g.edgesOfKind('nweg'), ...g.edges.filter((e) => e.id === 'opr3')];
  for (const e of edges) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    const at = (s: number, off: number) => ({ x: a.x + fx * s - fz * off, z: a.z + fz * s + fx * off });
    for (let s = N.treeEveryM / 2; s < len; s += N.treeEveryM)
      for (const side of [-1, 1]) {
        const scale = 0.8 + rng() * 0.8;
        const p = at(s, side * N.treeOffsetM);
        if (g.nearestEdge(p.x, p.z).distance < N.treeOffsetM - 0.5 || inForecourt(p)) continue;
        trees.push({ ...p, scale });
      }
    for (let s = N.reflectorEveryM / 2; s < len; s += N.reflectorEveryM)
      for (const side of [-1, 1]) {
        const p = at(s, side * N.reflectorOffsetM);
        if (g.nearestEdge(p.x, p.z).distance < N.reflectorOffsetM - 0.5 || inForecourt(p)) continue;
        reflectors.push(p);
      }
  }
  return { trees, reflectors };
}
