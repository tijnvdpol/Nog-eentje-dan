import { expect, it } from 'vitest';
import { BeerStock } from '../../src/beer/beerStock';

it('takes until empty', () => { const b = new BeerStock(); for (let i = 0; i < 6; i++) expect(b.take()).toBe(true); expect(b.take()).toBe(false); expect(b.count).toBe(0); });
it('refills to 6 after 2 s slow near a place, not stacking', () => {
  const b = new BeerStock(1); expect(b.update(1.9, true, 3)).toBe(false); expect(b.refillProgress).toBeCloseTo(0.95);
  expect(b.update(0.2, true, 3)).toBe(true); expect(b.count).toBe(6);
  expect(b.update(5, true, 3)).toBe(false); expect(b.count).toBe(6); expect(b.refillProgress).toBe(0);
});
it('resets the hold when too fast or away', () => {
  const b = new BeerStock(1); b.update(1.5, true, 3); b.update(0.1, true, 8); expect(b.update(1.5, true, 3)).toBe(false);
  b.update(0.1, false, 3); expect(b.refillProgress).toBe(0);
});
