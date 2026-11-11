import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';
import { cellRect, recolourCells, SUBURBAN_CELLS, type UvCell } from '../../src/models/colormap';

const W = 64, H = 32; // a small 4×2 "colormap" of 16×16 cells
function image(fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = fill(x, y); const i = (y * W + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
}
const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const cell: UvCell = { u0: 1 / 4, u1: 2 / 4, v0: 1 / 2, v1: 1 };

describe('recolourCells', () => {
  it('maps a cell to pixel bounds', () => {
    expect(cellRect(cell, W, H)).toEqual({ x: 16, y: 16, w: 16, h: 16 });
  });

  it('paints only the given cell, keeping the gradient and alpha', () => {
    const src = image((x, y) => (x >= 16 && x < 32 && y >= 16 ? [255 - (y - 16) * 4, 255 - (y - 16) * 4, 255 - (y - 16) * 4] : [10, 200, 30]));
    const out = recolourCells(src, W, H, [{ cell, colour: 0x9c4a3a }]);
    expect(out).not.toBe(src);
    expect(px(out, 0, 0)).toEqual([10, 200, 30, 255]); // outside: untouched
    expect(px(out, 40, 20)).toEqual([10, 200, 30, 255]);
    expect(px(out, 20, 16)).toEqual([0x9c, 0x4a, 0x3a, 255]); // brightest texel → the colour itself
    const low = px(out, 20, 31); // darker texel → darker shade of the colour
    expect(low[0]).toBeLessThan(0x9c); expect(low[0]).toBeGreaterThan(0x9c * 0.6);
    expect(low[0] / low[1]).toBeCloseTo(0x9c / 0x4a, 1);
    expect(px(src, 20, 16)).toEqual([255, 255, 255, 255]); // input unchanged
  });

  it('softens the shading with shade < 1 and leaves it out with shade 0', () => {
    const src = image((x, y) => (y >= 16 ? [128, 128, 128] : [255, 255, 255]));
    const half = recolourCells(src, W, H, [{ cell, colour: 0xffffff, shade: 0.5 }]);
    expect(px(half, 20, 20)[0]).toBe(Math.round(255 * (1 - (1 - 128 / 128) * 0.5))); // brightest of the cell
    const flat = recolourCells(image((x, y) => [y * 8, y * 8, y * 8]), W, H, [{ cell, colour: 0x804020, shade: 0 }]);
    expect(px(flat, 20, 16)).toEqual([0x80, 0x40, 0x20, 255]);
    expect(px(flat, 20, 31)).toEqual([0x80, 0x40, 0x20, 255]);
  });
});

/** Area per colormap cell and face direction, read from the generated house GLBs. */
async function cellAreas(file: string): Promise<{ wall: { vertical: number; other: number }; roof: { sloped: number; vertical: number } }> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const res = { wall: { vertical: 0, other: 0 }, roof: { sloped: 0, vertical: 0 } };
  const inCell = (c: UvCell, u: number, v: number) => u >= c.u0 && u < c.u1 && v >= c.v0 && v < c.v1;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!, uv = prim.getAttribute('TEXCOORD_0')!, idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    for (let t = 0; t < n; t += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getScalar(t + k) : t + k));
      const [a, b, c] = ids.map((i) => pos.getElement(i, []));
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.hypot(nx, ny, nz); if (!len) continue;
      const area = len / 2, vertical = Math.abs(ny / len) < 0.2;
      const uvs = ids.map((i) => uv.getElement(i, []));
      const u = (uvs[0][0] + uvs[1][0] + uvs[2][0]) / 3, v = (uvs[0][1] + uvs[1][1] + uvs[2][1]) / 3;
      if (inCell(SUBURBAN_CELLS.wall, u, v)) res.wall[vertical ? 'vertical' : 'other'] += area;
      if (inCell(SUBURBAN_CELLS.roof, u, v)) res.roof[vertical ? 'vertical' : 'sloped'] += area;
    }
  }
  return res;
}

describe('suburban colormap cells', () => {
  it.each(['a', 'b', 'c', 'd'])('house.%s: the wall cell is only on walls, the roof cell mostly on the roof', async (k) => {
    const r = await cellAreas(`public/models/house.${k}.glb`);
    expect(r.wall.vertical).toBeGreaterThan(0.5); // raw model units, the house is ~1.3 × 1.0
    expect(r.wall.other).toBe(0);
    expect(r.roof.sloped).toBeGreaterThan(1);
    expect(r.roof.vertical / (r.roof.sloped + r.roof.vertical)).toBeLessThan(0.1);
  });
});

describe('fence colormap cell', () => {
  it('the straight fence panel is painted from the fence swatch only', async () => {
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/prop.fence.glb');
    const c = SUBURBAN_CELLS.fence;
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0')!;
      for (let i = 0; i < uv.getCount(); i++) {
        const [u, v] = uv.getElement(i, [0, 0]);
        expect(u >= c.u0 && u < c.u1 && v >= c.v0 && v < c.v1).toBe(true);
      }
    }
  });
});
