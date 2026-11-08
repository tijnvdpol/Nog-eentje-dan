import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Crossing, RoadData, RoadEdge, RoadNode, SignalSpec } from '../src/world/types';

const GRID = 7, SPACING = 100, RING_N = 32, RING_R = 640;
/** Signalised intersections (spec fase 2 §5.1), in offset order. */
const SIGNAL_NODES = ['g3_1', 'g3_3', 'g3_5', 'g1_3', 'g5_3', 'g3_6'];
const SIGNAL_OFFSET_STEP = 4, CROSSING_FROM_NODE = 10;
/** Stand-alone crossings near the snackbar and the supermarket (spec fase 2 §7.1). */
const EXTRA_CROSSINGS: [string, number][] = [['cv4_2', 70], ['cv4_3', 30], ['ch1_5', 70], ['cv2_5', 30]];

export function buildRoadData(): RoadData {
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const gid = (i: number, j: number) => `g${i}_${j}`;
  const off = ((GRID - 1) / 2) * SPACING;

  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) nodes.push({ id: gid(i, j), x: i * SPACING - off, z: j * SPACING - off });
  const city = (id: string, from: string, to: string) =>
    edges.push({ id, from, to, lanesPerDir: 1, speedLimitKmh: 50, zone: 'city', kind: 'stad' });
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
    edges.push({ id: `ring${k}`, from: rid(k), to: rid((k + 1) % RING_N), lanesPerDir: 2, speedLimitKmh: 130, zone: 'snelweg', kind: 'ring' });

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
    edges.push({ id, from: gid(i, j), to: rid(best), lanesPerDir: 1, speedLimitKmh: 80, zone: 'snelweg', kind: 'oprit' });
  }

  const signals: SignalSpec[] = SIGNAL_NODES.map((nodeId, i) => ({ nodeId, offsetSec: i * SIGNAL_OFFSET_STEP }));
  const crossings: Crossing[] = [];
  const crossing = (edgeId: string, s: number) => crossings.push({ id: `x_${edgeId}_${s}`, edgeId, s });
  for (const nodeId of SIGNAL_NODES)
    for (const e of edges.filter((x) => x.kind === 'stad' && (x.from === nodeId || x.to === nodeId))) {
      const a = nodes.find((n) => n.id === e.from)!, b = nodes.find((n) => n.id === e.to)!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      crossing(e.id, e.from === nodeId ? CROSSING_FROM_NODE : len - CROSSING_FROM_NODE);
    }
  for (const [edgeId, s] of EXTRA_CROSSINGS) crossing(edgeId, s);

  return {
    nodes, edges, signals, crossings,
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
