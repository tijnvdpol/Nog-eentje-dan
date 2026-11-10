import { describe, it, expect } from 'vitest';
import { MODEL_ROLES, FALLBACKS } from '../../src/models/roles';
import { MANIFEST, findPackDir } from '../../scripts/models.manifest';

describe('model manifest', () => {
  it('every role has a manifest entry and a fallback, no extras', () => {
    expect(Object.keys(MANIFEST).sort()).toEqual([...MODEL_ROLES].sort());
    expect(Object.keys(FALLBACKS).sort()).toEqual([...MODEL_ROLES].sort());
    expect(new Set(MODEL_ROLES).size).toBe(MODEL_ROLES.length);
  });
  it('cars are scaled to the traffic collider footprint', () => {
    for (const r of ['car.hatchback', 'car.sedan', 'car.suv', 'car.van', 'car.delivery', 'car.taxi'] as const)
      expect(MANIFEST[r].target).toMatchObject({ w: 1.8, d: 4.4 });
  });
  it('finds a pack folder by slug', () => {
    expect(findPackDir(['kenney_car-kit', 'kenney_nature-kit'], 'car-kit')).toBe('kenney_car-kit');
    expect(findPackDir(['kenney_city-kit-roads_2.0'], 'city-kit-roads')).toBe('kenney_city-kit-roads_2.0');
    expect(findPackDir(['kenney_city-kit-suburban_20', 'kenney_city-kit-commercial_2.1'], 'city-kit-commercial')).toBe('kenney_city-kit-commercial_2.1');
    expect(findPackDir(['iets-anders'], 'car-kit')).toBeNull();
  });
});
