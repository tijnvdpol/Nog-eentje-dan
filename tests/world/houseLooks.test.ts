import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { CONFIG } from '../../src/config';
import { normalizedScale } from '../../src/models/modelLibrary';
import type { ModelIndex } from '../../src/models/roles';
import { HOLLANDS, houseFrontYaw, houseLook } from '../../src/world/houseLooks';
import { RoadGraph } from '../../src/world/roadGraph';
import { generateVillageLayout, houseBox } from '../../src/world/villageLayout';

const g = RoadGraph.fromData(buildRoadData());
const houses = generateVillageLayout(g, 1337).houses;
const looks = houses.map((h, i) => houseLook(h, i, 1337, g));

describe('houseLook', () => {
  it('is deterministic', () => {
    expect(houses.map((h, i) => houseLook(h, i, 1337, g))).toEqual(looks);
    expect(houses.map((h, i) => houseLook(h, i, 42, g))).not.toEqual(looks);
  });

  it('uses all four house models and only Hollands wall colours', () => {
    expect(new Set(looks.map((l) => l.role))).toEqual(new Set(['house.a', 'house.b', 'house.c', 'house.d']));
    for (const l of looks) expect(HOLLANDS).toContain(l.wall);
    expect(new Set(looks.map((l) => l.wall)).size).toBeGreaterThanOrEqual(4);
  });

  it('gives about a third fences, hedges and nothing', () => {
    for (const kind of ['fence', 'hedge', 'none'] as const) {
      const share = looks.filter((l) => l.extra === kind).length / looks.length;
      expect(share, kind).toBeGreaterThan(0.15);
      expect(share, kind).toBeLessThan(0.5);
    }
    for (const l of looks) expect(l.extraAt === null).toBe(l.extra === 'none');
  });

  it('front-yard extras stay off the road and out of the house box', () => {
    houses.forEach((h, i) => {
      const at = looks[i].extraAt;
      if (!at) return;
      const near = g.nearestEdge(at.x, at.z);
      expect(near.distance).toBeGreaterThanOrEqual(near.edge.lanesPerDir * CONFIG.traffic.laneWidthM + 0.5);
      const b = houseBox(h);
      expect(Math.abs(at.x - b.x) >= b.hx || Math.abs(at.z - b.z) >= b.hz, `house ${i}`).toBe(true);
    });
  });

  it('front-yard extras sit between the house and the street, parallel to it', () => {
    houses.forEach((h, i) => {
      const at = looks[i].extraAt;
      if (!at) return;
      const toStreet = g.nearestEdge(h.x, h.z).distance;
      expect(g.nearestEdge(at.x, at.z).distance).toBeLessThan(toStreet);
      // parallel: the extra is turned like the house (0 or π/2 modulo π)
      expect(Math.abs(Math.sin(at.yaw - h.yaw))).toBeLessThan(1e-9);
    });
  });

  it('lights about 60% of the houses', () => {
    const share = looks.filter((l) => l.lit).length / looks.length;
    expect(Math.abs(share - CONFIG.light.houseLitShare)).toBeLessThanOrEqual(0.1);
  });
});

describe('houseFrontYaw', () => {
  it('turns the model front (local -z) towards the street', () => {
    for (const h of houses) {
      const yaw = houseFrontYaw(h, g);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // local (0,0,-1) after rotation about y
      const step = g.nearestEdge(h.x + fx * 2, h.z + fz * 2).distance;
      expect(step).toBeLessThan(g.nearestEdge(h.x, h.z).distance);
      expect(Math.abs(Math.sin(yaw - h.yaw))).toBeLessThan(1e-9);
    }
  });
});

describe('house models fit their collider', () => {
  const index = JSON.parse(readFileSync('public/models/index.json', 'utf8')) as ModelIndex;
  it('every placed house model lies within houseBox (+0.3 m) and fills it reasonably', () => {
    houses.forEach((h, i) => {
      const entry = index[looks[i].role]!;
      const { w, d } = normalizedScale(entry.size, entry.target, entry.yawOffset, entry.stretch);
      const yaw = houseFrontYaw(h, g);
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const ex = (w * c + d * s) / 2, ez = (w * s + d * c) / 2;
      const b = houseBox(h);
      expect(ex, `house ${i} x`).toBeLessThanOrEqual(b.hx + 0.3);
      expect(ez, `house ${i} z`).toBeLessThanOrEqual(b.hz + 0.3);
      expect((ex * ez) / (b.hx * b.hz), `house ${i} fill`).toBeGreaterThan(0.6);
    });
  });
});
