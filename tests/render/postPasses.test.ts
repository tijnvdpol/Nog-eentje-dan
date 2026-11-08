import { expect, it } from 'vitest';
import { drunkEffects } from '../../src/drunk/effects';
import { activePostPasses } from '../../src/render/postPasses';

it('all post-processing passes are off when every drunk effect is 0', () => {
  const p = activePostPasses(drunkEffects(0));
  expect(p).toEqual({ afterimage: false, rgbShift: false, vignetteBlur: false, any: false });
});
it('only the passes with a non-zero effect are on', () => {
  expect(activePostPasses(drunkEffects(0.5))).toEqual({ afterimage: false, rgbShift: false, vignetteBlur: true, any: true });
  expect(activePostPasses({ ...drunkEffects(0), edgeBlur: 0.2 }).vignetteBlur).toBe(true);
  expect(activePostPasses(drunkEffects(3))).toEqual({ afterimage: true, rgbShift: true, vignetteBlur: true, any: true });
});
