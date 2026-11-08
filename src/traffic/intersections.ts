import type { RoadGraph } from '../world/roadGraph';
import { signalLights } from './signals';

/** The edge a car arrives on and its travel direction along that edge. */
export interface Approach { edgeId: string; dir: 1 | -1 }

const key = (a: Approach) => `${a.edgeId}|${a.dir}`;

/**
 * Right of way per intersection (spec fase 2 §5.2). Signalised: the light decides, and a car never enters
 * while a car of the other axis is still on the intersection. Unsignalised: one active approach at a time;
 * when the intersection is empty, the approach that has waited longest becomes active.
 */
export class IntersectionManager {
  private insideMap = new Map<string, Map<number, Approach>>();
  private waiting = new Map<string, Map<number, { key: string; since: number }>>();
  private active = new Map<string, string>();

  constructor(private g: RoadGraph) {}

  mayEnter(carId: number, nodeId: string, from: Approach, timeSec: number, canStop: boolean): boolean {
    const inside = this.insideMap.get(nodeId);
    const signal = this.g.signalAt(nodeId);
    if (signal) {
      const axis = this.g.axisOf(from.edgeId);
      const light = signalLights(signal, timeSec)[axis];
      if (light === 'red' || (light === 'orange' && canStop)) return false;
      if (inside) for (const a of inside.values()) if (this.g.axisOf(a.edgeId) !== axis) return false;
      return true;
    }
    const k = key(from);
    let w = this.waiting.get(nodeId);
    if (!w) this.waiting.set(nodeId, (w = new Map()));
    if (!w.has(carId)) w.set(carId, { key: k, since: timeSec });
    if (inside && inside.size > 0) return this.active.get(nodeId) === k;
    let first: { key: string; since: number } | null = null;
    for (const req of w.values()) if (!first || req.since < first.since) first = req;
    return first!.key === k;
  }

  enter(carId: number, nodeId: string, from: Approach): void {
    this.waiting.get(nodeId)?.delete(carId);
    let inside = this.insideMap.get(nodeId);
    if (!inside) this.insideMap.set(nodeId, (inside = new Map()));
    if (inside.size === 0) this.active.set(nodeId, key(from));
    inside.set(carId, from);
  }

  leave(carId: number, nodeId: string): void { this.insideMap.get(nodeId)?.delete(carId); }

  inside(nodeId: string): readonly number[] { return [...(this.insideMap.get(nodeId)?.keys() ?? [])]; }

  /** Forget every car not in `aliveIds` (despawned), so a vanished car never holds an intersection. */
  prune(aliveIds: ReadonlySet<number>): void {
    for (const m of [...this.insideMap.values(), ...this.waiting.values()])
      for (const id of m.keys()) if (!aliveIds.has(id)) m.delete(id);
  }

  reset(): void { this.insideMap.clear(); this.waiting.clear(); this.active.clear(); }
}
