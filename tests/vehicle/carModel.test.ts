import { expect, it } from 'vitest';
import { stepCar, type CarState } from '../../src/vehicle/carModel';
import type { DriveInput } from '../../src/input/input';
const idle: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const mods = { steerFactor: 1, steerResponse: 1 };
const start: CarState = { x: 0, z: 0, heading: 0, speed: 0 };
const run = (s: CarState, inp: DriveInput, sec: number, m = mods) => { for (let i = 0; i < sec * 60; i++) s = stepCar(s, inp, 1 / 60, m); return s; };
it('accelerates to but not past maxSpeed', () => {
  const s = run(start, { ...idle, throttle: 1 }, 30); expect(s.speed).toBeCloseTo(50, 0); expect(s.speed).toBeLessThanOrEqual(50);
});
it('moves forward along heading 0 = +z', () => { const s = run(start, { ...idle, throttle: 1 }, 2); expect(s.z).toBeGreaterThan(0); expect(Math.abs(s.x)).toBeLessThan(1e-6); });
it('brakes to 0 then reverses up to maxReverse', () => {
  let s = run({ ...start, speed: 10 }, { ...idle, brake: 1 }, 0.5); expect(s.speed).toBeGreaterThanOrEqual(0);
  s = run(s, { ...idle, brake: 1 }, 10); expect(s.speed).toBeCloseTo(-8, 0);
});
it('steering right (+1) turns toward -x when facing +z', () => { expect(run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.5).x).toBeLessThan(0); });
it('does not turn when standing still', () => { expect(run(start, { ...idle, steer: 1 }, 1).heading).toBe(0); });
it('steerFactor 0.5 (drinking) halves the turn', () => {
  const a = run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.5).heading;
  const b = run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.5, { steerFactor: 0.5, steerResponse: 1 }).heading;
  expect(b).toBeCloseTo(a / 2, 2);
});
it('handbrake slows and sharpens the turn', () => {
  const a = run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.5);
  const b = run({ ...start, speed: 15 }, { ...idle, steer: 1, handbrake: true }, 0.5);
  expect(b.speed).toBeLessThan(a.speed); expect(Math.abs(b.heading)).toBeGreaterThan(Math.abs(a.heading));
});
it('low steerResponse makes steering lag', () => {
  const fast = run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.3).heading;
  const slow = run({ ...start, speed: 15 }, { ...idle, steer: 1 }, 0.3, { steerFactor: 1, steerResponse: 0.3 }).heading;
  expect(Math.abs(slow)).toBeLessThan(Math.abs(fast));
});
