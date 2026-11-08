import { expect, it } from 'vitest';
import { enginePitchHz, isSlipping, lowpassCutoffHz, wobbleCents } from '../../src/audio/soundParams';

it('engine pitch with gear steps', () => {
  expect(enginePitchHz(0)).toBe(55); expect(enginePitchHz(29)).toBeCloseTo(185.5);
  expect(enginePitchHz(30)).toBe(65); expect(enginePitchHz(150)).toBe(95);
  expect(enginePitchHz(-20)).toBe(enginePitchHz(20)); // reversing sounds the same
});
it('lowpass cutoff 20 kHz sober, 4 kHz at 1.5‰, 800 Hz from 3‰', () => {
  expect(lowpassCutoffHz(0)).toBeCloseTo(20000); expect(lowpassCutoffHz(1.5)).toBeCloseTo(4000, 0);
  expect(lowpassCutoffHz(3)).toBeCloseTo(800); expect(lowpassCutoffHz(5)).toBeCloseTo(800);
});
it('wobble', () => { expect(wobbleCents(1.2)).toBe(0); expect(wobbleCents(1.3)).toBe(0); expect(wobbleCents(3)).toBeCloseTo(30); expect(wobbleCents(4)).toBeCloseTo(30); });
it('slipping above 20 km/h with handbrake or sideways speed', () => {
  expect(isSlipping(30, true, 0)).toBe(true); expect(isSlipping(30, false, 4)).toBe(true);
  expect(isSlipping(30, false, 1)).toBe(false); expect(isSlipping(15, true, 5)).toBe(false);
});
