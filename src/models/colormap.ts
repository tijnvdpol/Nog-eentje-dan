/**
 * Pure helpers to recolour regions of a Kenney colormap. The Kenney models share one colormap material, so
 * a per-instance tint would colour roof, windows and door too; instead a clone of the material gets a
 * colormap in which only the wall (and roof) texels are repainted.
 */

/** A rectangle of the colormap in UV units (glTF: v = 0 is the top row of the image). */
export interface UvCell { u0: number; u1: number; v0: number; v1: number }

/**
 * City Kit Suburban colormap (16 × 4 swatches of 32 × 128 px on 512 × 512): the walls sample the white
 * gradient swatch (column 7, row 2), the roofs the green gradient swatch (column 1, row 1). Checked against
 * the house GLBs by tests/models/colormap.test.ts.
 */
export const SUBURBAN_CELLS = {
  wall: { u0: 7 / 16, u1: 8 / 16, v0: 2 / 4, v1: 3 / 4 },
  roof: { u0: 1 / 16, u1: 2 / 16, v0: 1 / 4, v1: 2 / 4 },
  /**
   * Upper three quarters of the grey-blue trim swatch (column 1, row 2): window frames, fascias and soffits.
   * Its dark bottom quarter (the foundation) is left alone.
   */
  trim: { u0: 1 / 16, u1: 2 / 16, v0: 2 / 4, v1: 2 / 4 + 0.75 / 4 },
  /** Green gradient swatch (column 3, row 3) of the planters by the front door. */
  planter: { u0: 3 / 16, u1: 4 / 16, v0: 3 / 4, v1: 1 },
  /** The salmon wood swatch (column 9, row 2) of the straight fence panel. */
  fence: { u0: 9 / 16, u1: 10 / 16, v0: 2 / 4, v1: 3 / 4 },
} as const satisfies Record<string, UvCell>;

export function cellRect(c: UvCell, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const x = Math.round(c.u0 * width), y = Math.round(c.v0 * height);
  return { x, y, w: Math.round(c.u1 * width) - x, h: Math.round(c.v1 * height) - y };
}

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export interface Paint { cell: UvCell; colour: number; /** 0..1: how much of the cell's shading is kept (default 1). */ shade?: number }

/**
 * Returns a copy of an RGBA image in which every given cell is painted in its colour. The cell's shading is
 * kept: its brightest texel becomes the colour itself, darker texels a proportionally darker shade
 * (softened by `shade`).
 */
export function recolourCells(
  rgba: Uint8ClampedArray, width: number, height: number, paints: readonly Paint[],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (const { cell, colour, shade = 1 } of paints) {
    const { x, y, w, h } = cellRect(cell, width, height);
    const cr = (colour >> 16) & 0xff, cg = (colour >> 8) & 0xff, cb = colour & 0xff;
    let top = 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = (j * width + i) * 4;
      top = Math.max(top, luma(rgba[k], rgba[k + 1], rgba[k + 2]));
    }
    if (!top) top = 1;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = (j * width + i) * 4;
      const f = 1 - (1 - luma(rgba[k], rgba[k + 1], rgba[k + 2]) / top) * shade;
      out[k] = Math.round(cr * f); out[k + 1] = Math.round(cg * f); out[k + 2] = Math.round(cb * f);
    }
  }
  return out;
}
