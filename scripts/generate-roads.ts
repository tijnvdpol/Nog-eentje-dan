import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RoadData, RoadEdge, RoadNode } from '../src/world/types';

const GRID = 7, SPACING = 100, RING_N = 32, RING_R = 640;

export function buildRoadData(): RoadData {
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const gid = (i: number, j: number) => `g${i}_${j}`;
  const off = ((GRID - 1) / 2) * SPACING;

  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) nodes.push({ id: gid(i, j), x: i * SPACING - off, z: j * SPACING - off });
  const city = (id: string, from: string, to: string) =>
    edges.push({ id, from, to, lanesPerDir: 1, speedLimitKmh: 50, zone: 'city' });
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      if (i < GRID - 1) city(`ch${i}_${j}`, gid(i, j), gid(i + 1, j));
      if (j < GRID - 1) city(`cv${i}_${j}`, gid(i, j), gid(i, j + 1));
    }

  const rid = (k: number) => `r${k}`;
  for (let k = 0; k < RING_N; k++) {
    const a = (k * 2 * Math.PI) / RING_N;
    nodes.push({ id: rid(k), x: round(RING_R * Math.cos(a)) || 0, z: round(RING_R * Math.sin(a)) || 0 });
  }
  for (let k = 0; k < RING_N; k++)
    edges.push({ id: `ring${k}`, from: rid(k), to: rid((k + 1) % RING_N), lanesPerDir: 2, speedLimitKmh: 130, zone: 'snelweg' });

  const ramps: [number, number, string][] = [[6, 0, 'opr0'], [0, 0, 'opr1'], [3, 6, 'opr2']];
  // corners (300,-300), (-300,-300), (0,300) -> grid indices (6,0), (0,0), (3,6)
  for (const [i, j, id] of ramps) {
    const n = nodes.find((q) => q.id === gid(i, j))!;
    let best = 0, bd = Infinity;
    for (let k = 0; k < RING_N; k++) {
      const r = nodes.find((q) => q.id === rid(k))!;
      const d = Math.hypot(r.x - n.x, r.z - n.z);
      if (d < bd) { bd = d; best = k; }
    }
    edges.push({ id, from: gid(i, j), to: rid(best), lanesPerDir: 1, speedLimitKmh: 80, zone: 'snelweg' });
  }

  return {
    nodes, edges,
    places: [
      { id: 'feestje', name: 'Feestje', x: -200, z: -200 },
      { id: 'snackbar', name: 'Snackbar', x: 100, z: 0 },
      { id: 'supermarkt', name: 'Supermarkt', x: -100, z: 200 },
      { id: 'huis', name: 'Huis', x: 200, z: 200 },
    ],
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000 + 0; // +0 normalises -0

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync('public/content/roads.json', JSON.stringify(buildRoadData(), null, 2) + '\n');
  console.log('roads.json geschreven');
}
