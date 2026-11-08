import { CONFIG } from '../config';

/** Engine tone (spec fase 2 §8.3): rises through each 30 km/h "gear", then drops back a step higher. */
export function enginePitchHz(speedKmh: number): number {
  const A = CONFIG.audio;
  const v = Math.abs(speedKmh);
  const gear = Math.min(A.maxGear, Math.floor(v / A.gearBandKmh));
  return 55 + 4.5 * (v % A.gearBandKmh) + 10 * gear;
}

/** Drunk muffling: one lowpass from 20 kHz sober down to 800 Hz at 3‰ (exponential in between). */
export function lowpassCutoffHz(promille: number): number {
  const A = CONFIG.audio;
  const k = Math.min(Math.max(promille, 0), CONFIG.beer.passOutAbove) / CONFIG.beer.passOutAbove;
  return A.lowpassMaxHz * (A.lowpassMinHz / A.lowpassMaxHz) ** k;
}

/** Pitch wobble amplitude in cents: none below 1.3‰, up to 30 cents at 3‰. */
export function wobbleCents(promille: number): number {
  const A = CONFIG.audio;
  if (promille <= A.wobbleFromPromille) return 0;
  return A.wobbleMaxCents * Math.min(1, (promille - A.wobbleFromPromille) / (CONFIG.beer.passOutAbove - A.wobbleFromPromille));
}

/** Squealing tyres: above 20 km/h with the handbrake on or sliding sideways faster than 3 m/s. */
export function isSlipping(speedKmh: number, handbrake: boolean, lateralSpeedMs: number): boolean {
  return Math.abs(speedKmh) > CONFIG.audio.tiresMinKmh && (handbrake || Math.abs(lateralSpeedMs) > 3);
}
