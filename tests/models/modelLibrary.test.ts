import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MODEL_ROLES } from '../../src/models/roles';
import {
  fallbackParts, loadModelLibrary, normalizeParts, toLitMaterial, type ModelParts,
} from '../../src/models/modelLibrary';
import { addInstancedModel } from '../../src/world/instancedChunks';

const box = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0]): ModelParts => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(...at);
  return [{ geometry: g, material: new THREE.MeshBasicMaterial(), tint: false }];
};
const bounds = (parts: ModelParts): THREE.Box3 => {
  const b = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox!); }
  return b;
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('normalizeParts', () => {
  it('puts a model on the ground, centred, at target size', () => {
    const out = normalizeParts(box(2, 1, 4, [5, 3, -2]), { w: 2, d: 4, h: 1 }, { d: 4.4 });
    const b = bounds(out), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    expect(b.min.y).toBeCloseTo(0); expect(c.x).toBeCloseTo(0); expect(c.z).toBeCloseTo(0);
    expect(s.z).toBeCloseTo(4.4); expect(s.x).toBeCloseTo(2.2);
  });
  it('scale is the minimum of the target ratios', () => {
    const s = bounds(normalizeParts(box(2, 1, 4), { w: 2, d: 4, h: 1 }, { w: 1, d: 8 })).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(1); expect(s.z).toBeCloseTo(2);
  });
  it('yawOffset turns the model', () => {
    const s = bounds(normalizeParts(box(2, 1, 4), { w: 2, d: 4, h: 1 }, undefined, Math.PI / 2)).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(4); expect(s.z).toBeCloseTo(2);
  });
});

describe('toLitMaterial', () => {
  it('turns an unlit basic material into a lit standard one', () => {
    const map = new THREE.Texture();
    const m = toLitMaterial(new THREE.MeshBasicMaterial({ map, color: 0x123456, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    const s = m as THREE.MeshStandardMaterial;
    expect(s.map).toBe(map); expect(s.color.getHex()).toBe(0x123456);
    expect(s.transparent).toBe(true); expect(s.alphaTest).toBe(0.5); expect(s.side).toBe(THREE.DoubleSide);
    expect(s.roughness).toBe(0.9); expect(s.metalness).toBe(0);
  });
  it('leaves other materials alone', () => {
    const m = new THREE.MeshStandardMaterial();
    expect(toLitMaterial(m)).toBe(m);
  });
});

describe('fallbackParts', () => {
  it('gives a non-empty part on the ground for every role', () => {
    for (const r of MODEL_ROLES) {
      const parts = fallbackParts(r);
      expect(parts.length).toBeGreaterThanOrEqual(1);
      expect(parts[0].geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(bounds(parts).min.y).toBeCloseTo(0);
    }
  });
});

describe('loadModelLibrary', () => {
  it('falls back when index.json is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    const calls: [number, number][] = [];
    const lib = await loadModelLibrary((d, t) => calls.push([d, t]), '/models/');
    expect([...lib.missing].sort()).toEqual([...MODEL_ROLES].sort());
    expect(lib.get('tree.a').length).toBeGreaterThanOrEqual(1);
    expect(lib.entry('tree.a')).toBeUndefined();
    expect(calls.at(-1)).toEqual([MODEL_ROLES.length, MODEL_ROLES.length]);
    expect(warn).toHaveBeenCalled();
  });
  it('falls back per role on a broken file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const index = { 'tree.a': { file: 'tree.a.glb', size: { w: 1, d: 1, h: 1 } } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('index.json')
      ? { ok: true, status: 200, json: async () => index }
      : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }));
    const lib = await loadModelLibrary(() => {}, '/models/');
    expect(lib.missing).toContain('tree.a');
    expect(lib.get('tree.a').length).toBeGreaterThanOrEqual(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe('addInstancedModel', () => {
  const mk = (tintFlags: boolean[]): ModelParts => tintFlags.map((tint) => ({
    geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshBasicMaterial(), tint,
  }));
  const items = [{ x: 1, z: 1 }, { x: 500, z: 500 }];
  const write = (_i: unknown, m: THREE.Matrix4, c: THREE.Color): boolean => { m.identity(); c.set(0xff0000); return true; };
  it('makes one mesh per part per chunk', () => {
    const meshes = addInstancedModel(new THREE.Scene(), mk([false, false]), items, 100, write);
    expect(meshes).toHaveLength(4);
  });
  it('tints only tint parts, or all when none is marked', () => {
    const a = addInstancedModel(new THREE.Scene(), mk([true, false]), [items[0]], 100, write);
    expect(a[0].instanceColor).not.toBeNull(); expect(a[1].instanceColor).toBeNull();
    const b = addInstancedModel(new THREE.Scene(), mk([false, false]), [items[0]], 100, write);
    expect(b.every((m) => m.instanceColor !== null)).toBe(true);
  });
  it('applies no colour when write returns false', () => {
    const m = addInstancedModel(new THREE.Scene(), mk([false]), [items[0]], 100, () => false);
    expect(m[0].instanceColor).toBeNull();
  });
});
