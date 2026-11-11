import { expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { CAR_COLORS, carLook } from '../../src/traffic/carLooks';
import type { CarRole } from '../../src/models/roles';

it('stable per id', () => {
  expect(carLook(7)).toEqual(carLook(7));
});

it('mix within 3 points over 10 000 ids', () => {
  const counts = new Map<CarRole, number>();
  for (let id = 0; id < 10_000; id++) { const r = carLook(id).role; counts.set(r, (counts.get(r) ?? 0) + 1); }
  for (const [name, share] of Object.entries(CONFIG.carLooks.mix)) {
    expect(Math.abs((counts.get(`car.${name}` as CarRole) ?? 0) / 10_000 - share)).toBeLessThan(0.03);
  }
});

it('taxi keeps its own colour', () => {
  let taxis = 0;
  for (let id = 0; id < 2000; id++) {
    const l = carLook(id);
    if (l.role === 'car.taxi') { taxis++; expect(l.color).toBeNull(); }
    else expect(CAR_COLORS).toContain(l.color);
  }
  expect(taxis).toBeGreaterThan(0);
});
