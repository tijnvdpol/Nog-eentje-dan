// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { Input } from '../../src/input/input';
const key = (type: string, code: string, repeat = false) => window.dispatchEvent(new KeyboardEvent(type, { code, repeat }));
let input: Input | null = null;
afterEach(() => { input?.dispose(); input = null; });
it('maps held keys to drive input', () => {
  input = new Input(window); key('keydown', 'KeyW'); key('keydown', 'KeyA');
  expect(input.drive()).toEqual({ throttle: 1, brake: 0, steer: -1, handbrake: false });
});
it('one-shot fires once per press and ignores auto-repeat', () => {
  input = new Input(window); key('keydown', 'KeyE'); key('keydown', 'KeyE', true); key('keydown', 'KeyE', true);
  expect(input.consumePressed('drink')).toBe(true); expect(input.consumePressed('drink')).toBe(false);
});
it('releases all keys on window blur', () => {
  input = new Input(window); key('keydown', 'KeyW'); window.dispatchEvent(new Event('blur'));
  expect(input.drive().throttle).toBe(0);
});
it('prevents page scroll for Space and arrows', () => {
  input = new Input(window); const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
  window.dispatchEvent(e); expect(e.defaultPrevented).toBe(true);
});
