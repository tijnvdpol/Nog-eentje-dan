import { expect, it } from 'vitest';
import { PromilleModel } from '../../src/drunk/promille';
it('adds 0.3 when a 1.5s drink completes', () => {
  const p = new PromilleModel(); expect(p.startDrink()).toBe(true);
  p.update(1.0); expect(p.value).toBe(0); expect(p.steerFactor).toBe(0.5);
  p.update(0.5); expect(p.value).toBeCloseTo(0.3); expect(p.beers).toBe(1); expect(p.isDrinking).toBe(false);
  expect(p.steerFactor).toBe(1);
});
it('ignores startDrink while already drinking', () => {
  const p = new PromilleModel(); p.startDrink(); expect(p.startDrink()).toBe(false);
  p.update(1.5); expect(p.beers).toBe(1);
});
it('decays 0.1 per 20s and never below 0', () => {
  const p = new PromilleModel(0.3); p.update(20); expect(p.value).toBeCloseTo(0.2);
  p.update(1000); expect(p.value).toBe(0);
});
it('passes out only above 3.0', () => {
  expect(new PromilleModel(3.0).isPassedOut).toBe(false);
  const p = new PromilleModel(2.9); p.startDrink(); p.update(1.5); expect(p.isPassedOut).toBe(true);
});
