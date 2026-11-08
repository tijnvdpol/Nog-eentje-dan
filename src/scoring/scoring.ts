import { CONFIG, type Zone } from '../config';

export function bierMultiplier(promille: number): number {
  return 1 + CONFIG.beer.multiplierPerBeer * (promille / CONFIG.beer.promillePerBeer);
}

export function zoneMultiplier(zone: Zone, speedKmh: number, speedLimitKmh: number): number {
  if (speedKmh < speedLimitKmh * CONFIG.zone.minSpeedFraction) return 1;
  return CONFIG.zone[zone];
}

export function likePoints(combo: number, bier: number, zone: number): number {
  return Math.round(CONFIG.like.basePoints * combo * bier * zone);
}

export class ComboTracker {
  private last: number | null = null;
  private combo = 1;
  registerLike(timeSec: number): number {
    if (this.last !== null && timeSec - this.last <= CONFIG.like.comboWindowSec + 1e-9) {
      this.combo = Math.min(CONFIG.like.comboMax, this.combo + CONFIG.like.comboStep);
    } else {
      this.combo = 1;
    }
    this.last = timeSec;
    return this.combo;
  }
  get current(): number { return this.combo; }
  /** The combo as it stands at `timeSec`: back to 1 once the window since the last like has passed. */
  currentAt(timeSec: number): number {
    if (this.last === null || timeSec - this.last > CONFIG.like.comboWindowSec + 1e-9) return 1;
    return this.combo;
  }
  reset(): void { this.last = null; this.combo = 1; }
}
