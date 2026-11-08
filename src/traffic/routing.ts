import { CONFIG } from '../config';
import type { RoadGraph } from '../world/roadGraph';
import type { RoadEdge } from '../world/types';
import type { LaneIndex } from './lanes';
import type { TrafficCar } from './trafficLogic';

export type NextHop = NonNullable<TrafficCar['next']>;

export const isRingEdge = (id: string) => id.startsWith('ring');
export const isRingNode = (id: string) => id.startsWith('r');

/** The node a car drives towards. */
export function endNode(g: RoadGraph, c: Pick<TrafficCar, 'edgeId' | 'dir'>): string {
  const e = g.edge(c.edgeId);
  return c.dir === 1 ? e.to : e.from;
}

const hop = (e: RoadEdge, nodeId: string, lane: number): NextHop =>
  ({ edgeId: e.id, dir: e.from === nodeId ? 1 : -1, lane: Math.min(lane, e.lanesPerDir - 1) });

/**
 * Where a car goes after its current edge (spec fase 2 §5.3). On the ring a car keeps its lane and direction,
 * and only from lane 0 takes an exit (chance `CONFIG.ring.exitProb`); from a ramp it joins the ring on lane 0
 * in a random direction; in the city it turns randomly, never straight back unless it is a dead end.
 */
export function chooseNext(g: RoadGraph, c: TrafficCar, rng: () => number): NextHop {
  const e = g.edge(c.edgeId);
  const nodeId = endNode(g, c);
  const options = g.edgesAt(nodeId).filter((x) => x.id !== e.id);
  if (!options.length) return { edgeId: e.id, dir: c.dir === 1 ? -1 : 1, lane: c.lane };
  if (isRingNode(nodeId)) {
    const ring = options.filter((x) => isRingEdge(x.id));
    if (!isRingEdge(e.id)) return hop(ring[Math.floor(rng() * ring.length) % ring.length], nodeId, 0);
    const exits = options.filter((x) => !isRingEdge(x.id));
    if (exits.length && c.lane === 0 && rng() < CONFIG.ring.exitProb) return hop(exits[0], nodeId, 0);
    return hop(ring[0], nodeId, c.lane);
  }
  return hop(options[Math.floor(rng() * options.length) % options.length], nodeId, c.lane);
}

/**
 * Called right after a car moved from one ring edge onto the next: with chance `CONFIG.ring.laneChangeProb`
 * it starts a 1.5 s change to the other lane, but only when that lane is free 25 m ahead and behind (on the
 * new edge and the tail of the edge it just left).
 */
export function maybeChangeLane(g: RoadGraph, c: TrafficCar, prev: { edgeId: string; dir: 1 | -1 }, idx: LaneIndex, rng: () => number): void {
  if (!isRingEdge(prev.edgeId) || !isRingEdge(c.edgeId) || g.edge(c.edgeId).lanesPerDir < 2) return;
  if ((c.laneT ?? 1) < 1 || rng() >= CONFIG.ring.laneChangeProb) return;
  const other = c.lane === 0 ? 1 : 0;
  const free = CONFIG.ring.laneChangeFreeM;
  const prevLen = g.edgeLength(prev.edgeId);
  if (!idx.isFree(c.edgeId, c.dir, other, c.s, free, free, c.id)) return;
  if (!idx.isFree(prev.edgeId, prev.dir, other, prevLen, Math.max(0, free - c.s), 0, c.id)) return;
  c.laneFrom = c.lane; c.lane = other; c.laneT = 0;
}
