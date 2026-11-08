import { CONFIG } from '../config';
import type { Place } from '../world/types';

/** True within refillRadiusM of a place where the sixpack can be refilled. */
export function nearRefillPlace(places: readonly Place[], x: number, z: number): boolean {
  return places.some((p) => CONFIG.beer.refillPlaces.includes(p.id) && Math.hypot(p.x - x, p.z - z) <= CONFIG.beer.refillRadiusM);
}

/** The sixpack (spec fase 2 §4): a limited stock, refilled by standing still at the supermarket, the party or the filling station. */
export class BeerStock {
  private n: number;
  private hold = 0;

  constructor(initial: number = CONFIG.beer.stockMax) { this.n = initial; }

  get count(): number { return this.n; }
  /** Progress of the 2 s refill hold, 0..1. */
  get refillProgress(): number { return Math.min(1, this.hold / CONFIG.beer.refillHoldSec); }

  take(): boolean {
    if (this.n <= 0) return false;
    this.n--;
    return true;
  }

  /** Returns true on the step the stock is refilled. */
  update(dt: number, nearRefillPlace: boolean, speedKmh: number): boolean {
    const B = CONFIG.beer;
    if (!nearRefillPlace || Math.abs(speedKmh) >= B.refillMaxKmh || this.n >= B.stockMax) { this.hold = 0; return false; }
    this.hold += dt;
    if (this.hold + 1e-9 < B.refillHoldSec) return false;
    this.hold = 0;
    this.n = B.stockMax;
    return true;
  }
}
