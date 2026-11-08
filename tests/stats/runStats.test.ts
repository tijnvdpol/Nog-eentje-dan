import { expect, it } from 'vitest';
import { RunStats, formatEndLines } from '../../src/stats/runStats';
it('tracks phone time, distance and top speed', () => {
  const s = new RunStats(); s.update(1, { speedKmh: 36, phoneUp: true }); s.update(1, { speedKmh: 72, phoneUp: false });
  expect(s.phoneUpSec).toBe(1); expect(s.distanceM).toBeCloseTo(30); expect(s.topSpeedKmh).toBe(72);
});
it('formats Dutch end lines', () => {
  const s = new RunStats(); s.phoneUpSec = 46.6; s.beers = 6; s.likes = 312;
  const lines = formatEndLines(s);
  expect(lines).toContain('Je keek 47 seconden niet naar de weg.');
  expect(lines).toContain('6 biertjes, 312 likes.');
  s.beers = 1; s.likes = 1; expect(formatEndLines(s)).toContain('1 biertje, 1 like.');
});
