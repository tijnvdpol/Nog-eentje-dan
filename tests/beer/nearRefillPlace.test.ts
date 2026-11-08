import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { nearRefillPlace } from '../../src/beer/beerStock';

const places = buildRoadData().places;
it('refills near supermarkt, feestje and tankstation only', () => {
  expect(nearRefillPlace(places, 2460, 12)).toBe(true);
  expect(nearRefillPlace(places, -100, 200)).toBe(true);
  expect(nearRefillPlace(places, -200, -200)).toBe(true);
  expect(nearRefillPlace(places, 2700, 12)).toBe(false); // dorpscafe
  expect(nearRefillPlace(places, 100, 0)).toBe(false);   // snackbar
});
