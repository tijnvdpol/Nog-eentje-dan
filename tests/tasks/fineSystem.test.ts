import { expect, it } from 'vitest';
import { FINE_ANSWERS, FineSystem } from '../../src/tasks/fineSystem';
import { mulberry32 } from '../../src/util/rng';

const fl = (kmhOver: number) => ({ cameraId: 'fl_ring', speedKmh: 130 + kmhOver, limitKmh: 130, kmhOver });
it('opens with amount 50 + 8×over and penalty 50 + 5×over, 12 s', () => {
  const f = new FineSystem(mulberry32(1)); const e = f.flash(fl(32));
  expect(e.type).toBe('opened'); expect(f.open).toMatchObject({ amountEur: 306, penalty: 210, remainingSec: 12 });
  expect([...f.open!.answers].sort()).toEqual([...FINE_ANSWERS].sort()); expect(f.open!.answers[f.open!.payIndex]).toBe('Betalen');
});
it('a second flash adds up and restarts the clock, answers unchanged', () => {
  const f = new FineSystem(mulberry32(1)); f.flash(fl(10)); const before = [...f.open!.answers]; f.update(8); const e = f.flash(fl(5));
  expect(e).toMatchObject({ type: 'raised', addedEur: 90 }); expect(f.open).toMatchObject({ amountEur: 220, penalty: 175, remainingSec: 12 });
  expect(f.open!.answers).toEqual(before);
});
it('paying resolves without penalty', () => {
  const f = new FineSystem(mulberry32(1)); f.flash(fl(10));
  expect(f.answer(f.open!.payIndex)).toEqual([{ type: 'paid', amountEur: 130 }]); expect(f.open).toBeNull();
});
it('objecting, "Ik was het niet" and timeout refuse with surcharge', () => {
  for (const label of ['Bezwaar maken', 'Ik was het niet']) {
    const f = new FineSystem(mulberry32(1)); f.flash(fl(10));
    expect(f.answer(f.open!.answers.indexOf(label))).toEqual([{ type: 'refused', amountEur: 180, penalty: 100, reason: 'answer' }]);
    expect(f.open).toBeNull();
  }
  const f = new FineSystem(mulberry32(1)); f.flash(fl(10));
  expect(f.update(11.9)).toEqual([]);
  expect(f.update(0.11)).toEqual([{ type: 'refused', amountEur: 180, penalty: 100, reason: 'timeout' }]);
});
it('only the first answer counts; nothing without an open fine', () => {
  const f = new FineSystem(mulberry32(1)); expect(f.answer(0)).toEqual([]); expect(f.update(5)).toEqual([]);
  f.flash(fl(10)); expect(f.answer(f.open!.payIndex).length).toBe(1); expect(f.answer(0)).toEqual([]);
});
it('expires only through update dt (pause-safe); reset clears', () => {
  const f = new FineSystem(mulberry32(1)); f.flash(fl(10));
  expect(f.open!.remainingSec).toBe(12);
  expect(f.open!.fraction).toBe(1);
  f.update(6); expect(f.open!.fraction).toBeCloseTo(0.5);
  f.reset(); expect(f.open).toBeNull();
});
it('shuffles answers with the rng (not always the same order)', () => {
  const orders = new Set<string>();
  for (let seed = 1; seed < 30; seed++) { const f = new FineSystem(mulberry32(seed)); f.flash(fl(1)); orders.add(f.open!.answers.join('|')); }
  expect(orders.size).toBeGreaterThan(2);
});
