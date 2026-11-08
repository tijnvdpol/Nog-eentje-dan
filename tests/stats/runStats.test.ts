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
it('formats the scare line', () => {
  const s = new RunStats(); expect(formatEndLines(s)).toContain('Niemand laten schrikken. Knap.');
  s.scared = { jogger: 2, student: 1, oma: 1 }; expect(formatEndLines(s)).toContain('2 joggers, 1 student en 1 bejaarde laten schrikken.');
  s.scared = { jogger: 0, student: 0, oma: 3 }; expect(formatEndLines(s)).toContain('3 bejaarden laten schrikken.');
  s.scared = { jogger: 1, student: 2, oma: 0 }; expect(formatEndLines(s)).toContain('1 jogger en 2 studenten laten schrikken.');
});
it('formats the task line', () => {
  const s = new RunStats(); expect(formatEndLines(s)).toContain('0 opdrachten voltooid, 0 keer door rood.');
  s.tasksCompleted = 1; s.redLights = 1; expect(formatEndLines(s)).toContain('1 opdracht voltooid, 1 keer door rood.');
  s.tasksCompleted = 4; s.redLights = 3; expect(formatEndLines(s)).toContain('4 opdrachten voltooid, 3 keer door rood.');
});
it('fine end line', () => {
  const s = new RunStats(); expect(formatEndLines(s)).toContain('Geen enkele keer geflitst. Saai.');
  s.addFlash(306); expect(formatEndLines(s)).toContain('1 keer geflitst. €306 aan boetes, waarvan je €0 hebt betaald.');
  s.addFlash(90); s.addSurcharge(50); s.addPaid(0);
  expect(formatEndLines(s)).toContain('2 keer geflitst. €446 aan boetes, waarvan je €0 hebt betaald.');
  s.addPaid(130); expect(formatEndLines(s)).toContain('2 keer geflitst. €446 aan boetes, waarvan je €130 hebt betaald.');
});
