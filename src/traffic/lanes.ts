import type { TrafficCar } from './trafficLogic';

export const CAR_LEN = 4.5;

const laneKey = (edgeId: string, dir: 1 | -1, lane: number) => `${edgeId}|${dir}|${lane}`;

/** The lanes a car occupies: both its old and new lane while a lane change is in progress. */
export function occupiedLanes(c: TrafficCar): number[] {
  return c.laneFrom !== undefined && c.laneFrom !== c.lane && (c.laneT ?? 1) < 1 ? [c.lane, c.laneFrom] : [c.lane];
}

/** Cars per edge/direction/lane, sorted by position along the lane. */
export class LaneIndex {
  private map = new Map<string, TrafficCar[]>();

  constructor(cars: readonly TrafficCar[]) {
    for (const c of cars)
      for (const lane of occupiedLanes(c)) {
        const k = laneKey(c.edgeId, c.dir, lane);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(c);
      }
    for (const arr of this.map.values()) arr.sort((a, b) => a.s - b.s);
  }

  carsOn(edgeId: string, dir: 1 | -1, lane: number): readonly TrafficCar[] { return this.map.get(laneKey(edgeId, dir, lane)) ?? []; }

  /** Nearest car at or after `afterS` on this lane, ignoring `excludeId`. */
  leaderOnLane(edgeId: string, dir: 1 | -1, lane: number, afterS: number, excludeId?: number): TrafficCar | null {
    for (const c of this.carsOn(edgeId, dir, lane)) if (c.s >= afterS && c.id !== excludeId) return c;
    return null;
  }

  /** True when no car (other than `excludeId`) is within [s − behindM, s + aheadM] on this lane. */
  isFree(edgeId: string, dir: 1 | -1, lane: number, s: number, behindM: number, aheadM: number, excludeId?: number): boolean {
    for (const c of this.carsOn(edgeId, dir, lane)) if (c.id !== excludeId && c.s >= s - behindM && c.s <= s + aheadM) return false;
    return true;
  }

  /** Closest car at or behind `s` on this lane. */
  nearestBehind(edgeId: string, dir: 1 | -1, lane: number, s: number): TrafficCar | null {
    let best: TrafficCar | null = null;
    for (const c of this.carsOn(edgeId, dir, lane)) { if (c.s > s) break; best = c; }
    return best;
  }
}
