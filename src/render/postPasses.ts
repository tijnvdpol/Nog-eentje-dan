import type { DrunkEffects } from '../drunk/effects';

export interface PostPasses { afterimage: boolean; rgbShift: boolean; vignetteBlur: boolean; any: boolean }

/** Which post-processing passes have something to do for these effects (sober → none). */
export function activePostPasses(fx: DrunkEffects): PostPasses {
  const afterimage = fx.afterimage > 0;
  const rgbShift = fx.rgbShift > 0;
  const vignetteBlur = fx.vignette > 0 || fx.edgeBlur > 0;
  return { afterimage, rgbShift, vignetteBlur, any: afterimage || rgbShift || vignetteBlur };
}
