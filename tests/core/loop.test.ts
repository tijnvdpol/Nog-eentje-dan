import { expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/core/loop';
it('runs 3 fixed steps for a 50ms frame', () => { expect(new FixedStepLoop(1 / 60, 0.25).advance(0.05)).toBe(3); });
it('carries remainder to the next frame', () => {
  const l = new FixedStepLoop(1 / 60, 0.25);
  expect(l.advance(0.01)).toBe(0); expect(l.advance(0.01)).toBe(1);
});
it('clamps a 5s frame (tab switch) to 0.25s = 15 steps', () => { expect(new FixedStepLoop(1 / 60, 0.25).advance(5)).toBe(15); });
