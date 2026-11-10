import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { codeModel, type CodeRole } from '../../src/models/codeModels';
import { ROOF_PART_SIZE, type RoofRole } from '../../src/world/facadeLayout';

const bounds = (role: CodeRole): THREE.Box3 => {
  const b = new THREE.Box3();
  for (const p of codeModel(role)) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox!); }
  return b;
};

describe('codeModel', () => {
  it('roof parts stand on the ground, centred, within their footprint', () => {
    for (const role of Object.keys(ROOF_PART_SIZE) as RoofRole[]) {
      const b = bounds(role), size = ROOF_PART_SIZE[role];
      expect(b.min.y).toBeCloseTo(0);
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(size.w + 1e-6);
      expect(b.max.z - b.min.z).toBeLessThanOrEqual(size.d + 1e-6);
      expect(Math.abs(b.max.x + b.min.x)).toBeLessThan(0.3);
    }
  });
  it('only the lift housing takes the building colour', () => {
    expect(codeModel('roof.lift').some((p) => p.tint)).toBe(true);
    expect(codeModel('roof.ac').some((p) => p.tint)).toBe(false);
    expect(codeModel('roof.tank').some((p) => p.tint)).toBe(false);
  });
  it('is cached per role and builds the street props too', () => {
    expect(codeModel('roof.ac')).toBe(codeModel('roof.ac'));
    expect(codeModel('prop.bench').length).toBeGreaterThan(0);
    expect(codeModel('prop.bin').length).toBeGreaterThan(0);
  });
});
