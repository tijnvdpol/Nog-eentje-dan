import { expect, it } from 'vitest';
import { DamageModel, damageFromImpact } from '../../src/vehicle/damage';
it('damage formula', () => {
  expect(damageFromImpact(4)).toBe(0); expect(damageFromImpact(5)).toBe(0);
  expect(damageFromImpact(30)).toBe(20); expect(damageFromImpact(100)).toBe(60);
});
it('reports crack levels once when crossed and wrecks at 100', () => {
  const d = new DamageModel();
  expect(d.apply(30)).toEqual([]);
  expect(d.apply(30)).toEqual([25]);
  expect(d.apply(100)).toEqual([50, 75]);
  expect(d.value).toBe(100); expect(d.isWrecked).toBe(true);
  expect(d.apply(100)).toEqual([]);
});
