// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Flash } from '../../src/ui/Flash';

it('creates #flash and restarts its animation on every trigger', () => {
  const root = document.createElement('div');
  const f = new Flash(root);
  const el = root.querySelector('#flash')!;
  expect(el.classList.contains('on')).toBe(false);
  f.trigger(); expect(el.classList.contains('on')).toBe(true);
  f.trigger(); expect(el.classList.contains('on')).toBe(true);
});
