import { expect, it } from 'vitest';
import { attractPose } from '../../src/render/attractCamera';

it('orbits 250 m at 60 m height in 90 s', () => {
  expect(attractPose(0)).toEqual({ x: 250, y: 60, z: 0 });
  const q = attractPose(22.5); expect(q.x).toBeCloseTo(0); expect(q.z).toBeCloseTo(250);
  const r = attractPose(90); expect(r.x).toBeCloseTo(250); expect(r.z).toBeCloseTo(0);
});
