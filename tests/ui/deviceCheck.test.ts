import { expect, it } from 'vitest';
import { isTouchOnly } from '../../src/ui/deviceCheck';

it('touch-only only when coarse and no fine pointer', () => {
  const mm = (coarse: boolean, fine: boolean) => (q: string) => ({ matches: q === '(pointer: coarse)' ? coarse : fine });
  expect(isTouchOnly(mm(true, false))).toBe(true); expect(isTouchOnly(mm(true, true))).toBe(false);
  expect(isTouchOnly(mm(false, true))).toBe(false); expect(isTouchOnly(undefined)).toBe(false);
});
