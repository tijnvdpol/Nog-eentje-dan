import { expect, it } from 'vitest';
import { BlackoutTimer, drunkEffects, type DrunkEffects } from '../../src/drunk/effects';
it('sober = no effects', () => {
  expect(drunkEffects(0)).toMatchObject({ vignette: 0, sway: 0, rgbShift: 0, inputDelaySec: 0, blackoutPerSec: 0, phoneBlurPx: 0, steerResponse: 1 });
});
it('input delay ~0.10s mid "lekker bezig", ~0.25s mid "ladderzat"', () => {
  expect(drunkEffects(0.9).inputDelaySec).toBeCloseTo(0.10, 2);
  expect(drunkEffects(1.9).inputDelaySec).toBeCloseTo(0.25, 2);
});
it('blackouts only from 2.5‰', () => {
  expect(drunkEffects(2.49).blackoutPerSec).toBe(0);
  expect(drunkEffects(2.75).blackoutPerSec).toBeGreaterThan(0);
});
it('every effect is non-decreasing from 0 to 3‰ (steerResponse non-increasing)', () => {
  let prev = drunkEffects(0);
  for (let p = 0.05; p <= 3.0001; p += 0.05) {
    const cur = drunkEffects(p);
    for (const k of Object.keys(cur) as (keyof DrunkEffects)[]) {
      if (k === 'steerResponse') expect(cur[k]).toBeLessThanOrEqual(prev[k] + 1e-9);
      else expect(cur[k]).toBeGreaterThanOrEqual(prev[k] - 1e-9);
    }
    prev = cur;
  }
});
it('rgbShift (double vision) is 0 below 1.3‰ and > 0 above', () => {
  expect(drunkEffects(1.2).rgbShift).toBe(0); expect(drunkEffects(1.6).rgbShift).toBeGreaterThan(0);
});
it('never black at perSec 0; black lasts 0.5s once triggered', () => {
  const t = new BlackoutTimer();
  for (let i = 0; i < 100; i++) expect(t.update(0.1, 0, () => 0)).toBe(false);
  expect(t.update(0.1, 10, () => 0)).toBe(true);
  expect(t.update(0.3, 10, () => 0.99)).toBe(true);
  expect(t.update(0.3, 10, () => 0.99)).toBe(false);
});
