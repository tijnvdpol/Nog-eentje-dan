import { expect, it } from 'vitest';
import { drunkEffects } from '../../src/drunk/effects';
import { DrunkInputFilter } from '../../src/input/drunkInputFilter';
import { mulberry32 } from '../../src/util/rng';
const sober = drunkEffects(0);
it('passes input through unchanged when sober', () => {
  const f = new DrunkInputFilter(() => 0.5); const inp = { throttle: 1, brake: 0, steer: 0.3, handbrake: false };
  expect(f.apply(inp, sober, 1)).toEqual(inp);
});
it('delays input by inputDelaySec', () => {
  const fx = { ...sober, inputDelaySec: 0.1 }; const f = new DrunkInputFilter(() => 0.5);
  const still = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  for (let t = 0; t <= 1.0; t += 1 / 60) f.apply(still, fx, t);
  const turn = { ...still, steer: 1 };
  expect(f.apply(turn, fx, 1.0).steer).toBe(0);
  expect(f.apply(turn, fx, 1.05).steer).toBe(0);
  expect(f.apply(turn, fx, 1.11).steer).toBe(1);
});
it('keeps steer within [-1, 1] with noise and drift', () => {
  const fx = drunkEffects(2.9); const f = new DrunkInputFilter(mulberry32(1));
  for (let t = 0; t < 10; t += 1 / 60) {
    const s = f.apply({ throttle: 1, brake: 0, steer: 1, handbrake: false }, fx, t).steer;
    expect(Math.abs(s)).toBeLessThanOrEqual(1);
  }
});
