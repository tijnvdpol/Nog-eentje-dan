import { expect, it } from 'vitest';
import { GameSession, type CarInfo } from '../../src/state/GameSession';
const snelweg: CarInfo = { speedKmh: 70, zone: 'snelweg', speedLimitKmh: 130, phoneUp: true };
it('awards like points with zone bonus, once per post', () => {
  const g = new GameSession(); g.tick(0.1, snelweg);
  expect(g.like('p1', 1)).toBe(15); expect(g.like('p1', 1.5)).toBe(0);
  expect(g.score).toBe(15); expect(g.stats.likes).toBe(1);
});
it('beer raises multiplier after drink completes', () => {
  const g = new GameSession(); g.startDrink(); g.tick(1.5, snelweg);
  expect(g.multiplier).toBeCloseTo(1.5 * 1.5, 2); expect(g.stats.beers).toBe(1);
});
it('passing out ends the run and blocks scoring', () => {
  const g = new GameSession(2.9); g.startDrink(); g.tick(1.5, snelweg);
  expect(g.over).toBe('passedOut'); expect(g.like('p2', 2)).toBe(0); expect(g.startDrink()).toBe(false);
});
it('100% damage ends the run', () => {
  const g = new GameSession(); g.impact(100); g.impact(100);
  expect(g.over).toBe('wrecked');
});
it('tick after game over changes nothing', () => {
  const g = new GameSession(); g.impact(100); g.impact(100); const d = g.stats.distanceM;
  g.tick(1, snelweg); expect(g.stats.distanceM).toBe(d);
});
