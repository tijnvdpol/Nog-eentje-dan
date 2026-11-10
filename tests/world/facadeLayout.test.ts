import { describe, expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { CONFIG } from '../../src/config';
import { generateCityLayout } from '../../src/world/cityLayout';
import { facadeLayout, streetSides, type FacadeLayout, type Side } from '../../src/world/facadeLayout';
import { RoadGraph } from '../../src/world/roadGraph';
import type { BuildingSpec } from '../../src/world/types';

const F = CONFIG.facade;
const g = RoadGraph.fromData(buildRoadData());
const SHOPS = ['Snackbar De Vette Hap', 'Kapsalon Knip & Klaar', 'Avondwinkel Nog Open'];
const SEED = 1337;
const buildings = generateCityLayout(g, SEED);
const layouts: FacadeLayout[] = buildings.map((b, i) => facadeLayout(b, i, SEED, streetSides(b, g), SHOPS));
const wallLength = (b: BuildingSpec, s: Side): number => (s < 2 ? b.d : b.w);
const spec = (w: number, d: number, h: number): BuildingSpec => ({ x: 0, z: 0, w, d, h, color: 0 });
const ALL: Side[] = [0, 1, 2, 3];

describe('facadeLayout', () => {
  it('same seed, same layout', () => {
    const b = buildings[5];
    expect(facadeLayout(b, 5, SEED, streetSides(b, g), SHOPS)).toEqual(facadeLayout(b, 5, SEED, streetSides(b, g), SHOPS));
  });

  it('window grid fits the wall', () => {
    buildings.forEach((b, i) => {
      const l = layouts[i];
      for (const s of ALL) {
        const c = l.columns[s];
        expect(c * F.windowW + (c + 1) * F.windowGap).toBeLessThanOrEqual(wallLength(b, s) + 1e-6);
      }
      expect(l.floors * F.floorH + F.plinthH).toBeLessThanOrEqual(b.h + 1e-6);
      for (const w of l.windows) {
        expect(w.col).toBeLessThan(l.columns[w.side]);
        expect(w.floor).toBeLessThan(l.floors);
      }
    });
  });

  it('tiny and low buildings have no windows', () => {
    const tiny = facadeLayout(spec(2, 2, 3), 0, SEED, ALL, SHOPS);
    expect(tiny.floors).toBe(0);
    expect(tiny.windows.length).toBe(0);
    for (const s of ALL) expect(tiny.columns[s]).toBeGreaterThanOrEqual(0);
    const thin = facadeLayout(spec(1, 30, 30), 0, SEED, ALL, SHOPS);
    expect(thin.windows.filter((w) => w.side === 2 || w.side === 3)).toHaveLength(0);
  });

  it('lit share is about 35%, warm share about 80%', () => {
    const all = layouts.flatMap((l) => l.windows);
    const lit = all.filter((w) => w.lit);
    expect(all.length).toBeGreaterThan(1000);
    expect(Math.abs(lit.length / all.length - CONFIG.light.windowLitShare)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(lit.filter((w) => w.warm).length / lit.length - CONFIG.light.windowWarmShare)).toBeLessThanOrEqual(0.03);
  });

  it('type mix and awning share', () => {
    for (const [type, share] of Object.entries(F.typeMix)) {
      const n = layouts.filter((l) => l.type === type).length;
      expect(Math.abs(n / layouts.length - share)).toBeLessThanOrEqual(0.05);
    }
    const plinth = layouts.flatMap((l) => l.plinth);
    expect(plinth.length).toBeGreaterThan(50);
    expect(Math.abs(plinth.filter((p) => p.awning).length / plinth.length - F.awningShare)).toBeLessThanOrEqual(0.05);
    for (const p of plinth) {
      if (p.shop !== null) { expect(p.awning).toBe(true); expect(SHOPS).toContain(p.shop); }
    }
    expect(plinth.some((p) => p.shop !== null)).toBe(true);
  });

  it('wall colour comes from the palette of its type', () => {
    for (const l of layouts) expect(F.palette[l.type]).toContain(l.wall);
  });

  it('plinth only on street sides', () => {
    buildings.forEach((b, i) => {
      const sides = streetSides(b, g);
      for (const p of layouts[i].plinth) expect(sides).toContain(p.side);
    });
  });

  it('roof parts stay inside the roof', () => {
    buildings.forEach((b, i) => {
      const roof = layouts[i].roof;
      expect(roof.length).toBeLessThanOrEqual(F.roofPartsMax);
      for (const r of roof) {
        expect(Math.abs(r.dx)).toBeLessThanOrEqual(b.w / 2 - 1);
        expect(Math.abs(r.dz)).toBeLessThanOrEqual(b.d / 2 - 1);
      }
    });
    expect(layouts.some((l) => l.roof.length > 0)).toBe(true);
  });
});

describe('streetSides', () => {
  it('a building at the corner of the feestje block faces both streets', () => {
    // block corner (-200,-200): north street z = -200 (side 3, -z) and west street x = -200 (side 1, -x)
    expect(streetSides({ x: -185, z: -185, w: 10, d: 10, h: 10, color: 0 }, g).sort()).toEqual([1, 3]);
  });
  it('a building deep inside a block faces no street', () => {
    expect(streetSides({ x: -150, z: -150, w: 10, d: 10, h: 10, color: 0 }, g)).toEqual([]);
  });
});
