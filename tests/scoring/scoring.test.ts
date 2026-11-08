import { expect, it } from 'vitest';
import { bierMultiplier, zoneMultiplier, likePoints, ComboTracker } from '../../src/scoring/scoring';
it('bierMultiplier follows current promille', () => {
  expect(bierMultiplier(0)).toBe(1);
  expect(bierMultiplier(0.3)).toBeCloseTo(1.5);
  expect(bierMultiplier(0.9)).toBeCloseTo(2.5);
});
it('zone bonus only at >= half the speed limit', () => {
  expect(zoneMultiplier('snelweg', 70, 130)).toBe(1.5);
  expect(zoneMultiplier('snelweg', 60, 130)).toBe(1);
  expect(zoneMultiplier('nweg', 45, 80)).toBe(1.25);
  expect(zoneMultiplier('nweg', 39, 80)).toBe(1);
  expect(zoneMultiplier('city', 100, 50)).toBe(1);
});
it('combo +0.25 within 2s, resets after, caps at 3', () => {
  const c = new ComboTracker();
  expect(c.registerLike(0)).toBe(1);
  expect(c.registerLike(1)).toBe(1.25);
  expect(c.registerLike(2.5)).toBe(1.5);
  expect(c.registerLike(5)).toBe(1);
  for (let i = 1; i <= 8; i++) c.registerLike(5 + i * 0.5);
  expect(c.registerLike(10)).toBe(3);
});
it('likePoints rounds the product', () => {
  expect(likePoints(1, 1, 1.5)).toBe(15);
  expect(likePoints(1.25, 1.5, 1.5)).toBe(28);
});
