import { CONFIG } from '../config';

export interface DrunkEffects {
  vignette: number; edgeBlur: number; sway: number; rgbShift: number; afterimage: number;
  inputDelaySec: number; steerResponse: number; steerNoise: number; driftBias: number;
  blackoutPerSec: number; phoneBlurPx: number; phoneDouble: number; phoneSway: number;
}

const X = [0, 0.5, 0.9, 1.3, 1.9, 2.5, 2.75, 3.0];
const A: Record<keyof DrunkEffects, number[]> = {
  vignette:       [0, 0.1, 0.25, 0.4, 0.6, 0.8, 0.9, 1],
  edgeBlur:       [0, 0, 0.2, 0.35, 0.6, 0.8, 0.9, 1],
  sway:           [0, 0, 0.2, 0.4, 0.7, 0.85, 0.95, 1],
  rgbShift:       [0, 0, 0, 0, 0.5, 0.8, 0.9, 1],
  afterimage:     [0, 0, 0, 0, 0.4, 0.7, 0.85, 1],
  inputDelaySec:  [0, 0, 0.10, 0.12, 0.25, 0.28, 0.35, 0.4],
  steerResponse:  [1, 1, 0.85, 0.7, 0.5, 0.4, 0.3, 0.25],
  steerNoise:     [0, 0, 0.05, 0.15, 0.35, 0.5, 0.65, 0.8],
  driftBias:      [0, 0, 0.03, 0.08, 0.18, 0.25, 0.3, 0.35],
  blackoutPerSec: [0, 0, 0, 0, 0, 0, 0.2, 0.4],
  phoneBlurPx:    [0, 0, 0.5, 1, 2, 3, 3.5, 4],
  phoneDouble:    [0, 0, 0, 0, 0.5, 0.8, 0.9, 1],
  phoneSway:      [0, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1],
};

function lerpAnchors(ys: number[], p: number): number {
  if (p <= X[0]) return ys[0];
  if (p >= X[X.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < X.length; i++) {
    if (p <= X[i]) {
      const t = (p - X[i - 1]) / (X[i] - X[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[ys.length - 1];
}

export function drunkEffects(promille: number): DrunkEffects {
  const out = {} as DrunkEffects;
  for (const k of Object.keys(A) as (keyof DrunkEffects)[]) out[k] = lerpAnchors(A[k], promille);
  return out;
}

export class BlackoutTimer {
  private remaining = 0;
  update(dt: number, perSec: number, rng: () => number): boolean {
    if (this.remaining > 0) {
      this.remaining -= dt;
      return this.remaining > 1e-9;
    }
    if (perSec > 0 && rng() < perSec * dt) {
      this.remaining = CONFIG.blackout.durationSec;
      return true;
    }
    return false;
  }
}
