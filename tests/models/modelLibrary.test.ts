import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MODEL_ROLES } from '../../src/models/roles';
import {
  fallbackParts, loadModelLibrary, mergeScene, normalizeParts, toLitMaterial, type ModelParts,
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
  it('compares target axes after the yaw offset', () => {
    // raw 2 wide x 4 long, turned a quarter: 4 wide x 2 long; target w 2 -> scale 0.5
    const s = bounds(normalizeParts(box(2, 1, 4), { w: 2, d: 4, h: 1 }, { w: 2 }, Math.PI / 2)).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(2); expect(s.z).toBeCloseTo(1); expect(s.y).toBeCloseTo(0.5);
  });
  it('stretch scales each axis and h by the mean of the w and d ratios', () => {
    const s = bounds(normalizeParts(box(1.5, 1, 2.55), { w: 1.5, d: 2.55, h: 1 }, { w: 1.8, d: 4.4 }, 0, true)).getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(1.8); expect(s.z).toBeCloseTo(4.4); expect(s.y).toBeCloseTo((1.2 + 4.4 / 2.55) / 2);
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

describe('mergeScene', () => {
  const entry = { file: 'x.glb', size: { w: 1, d: 1, h: 1 } };
  const A = new THREE.MeshBasicMaterial({ name: 'A' }), B = new THREE.MeshStandardMaterial({ name: 'B' });
  const triCount = (g: THREE.BufferGeometry): number => (g.getIndex() ? g.getIndex()!.count : g.getAttribute('position').count) / 3;
  const unindexed = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.toNonIndexed();

  it('merges per material, handles groups, mixed attributes and unlit conversion', () => {
    const root = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), A);
    m1.geometry.setAttribute('uv1', m1.geometry.getAttribute('uv').clone()); // only this one has uv1
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), A); m2.position.set(3, 0, 0);
    const multi = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [A, B]); // groups per face pair
    multi.geometry.clearGroups(); multi.geometry.addGroup(0, 6, 0); multi.geometry.addGroup(6, 30, 1);
    multi.position.set(6, 0, 0);
    root.add(m1, m2, multi);
    const parts = mergeScene(root, entry);
    expect(parts).toHaveLength(2);
    const [pa, pb] = parts;
    expect(pa.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pb.material).toBe(B);
    expect(triCount(pa.geometry)).toBe(12 + 12 + 2);
    expect(triCount(pb.geometry)).toBe(10);
    expect(pa.geometry.getAttribute('uv1')).toBeUndefined();
  });
  it('splits non-indexed multi-material meshes by vertex range and mixes indexed with non-indexed', () => {
    const root = new THREE.Group();
    const g = unindexed(new THREE.BoxGeometry(1, 1, 1)); // 36 vertices
    g.clearGroups(); g.addGroup(0, 12, 0); g.addGroup(12, 24, 1);
    root.add(new THREE.Mesh(g, [A, B]), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), A));
    const parts = mergeScene(root, entry);
    const byMat = new Map(parts.map((p) => [p.material === B ? 'B' : 'A', p]));
    expect(triCount(byMat.get('A')!.geometry)).toBe(4 + 12);
    expect(triCount(byMat.get('B')!.geometry)).toBe(8);
  });
  it('throws without meshes', () => {
    expect(() => mergeScene(new THREE.Group(), entry)).toThrow();
  });
});
