import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FALLBACKS, MODEL_ROLES, type ModelIndex, type ModelIndexEntry, type ModelRole } from './roles';

/** One draw-call's worth of a model: geometry in model space (on the ground, centred) plus its material. */
export interface ModelPart { geometry: THREE.BufferGeometry; material: THREE.Material; tint: boolean }
export type ModelParts = readonly ModelPart[];

export interface ModelLibrary {
  get(role: ModelRole): ModelParts;
  entry(role: ModelRole): ModelIndexEntry | undefined;
  /** Roles that use the fallback shape because their file was missing or broken. */
  readonly missing: readonly ModelRole[];
}

type Size = { w: number; d: number; h: number };
type Target = { w?: number; d?: number; h?: number };

/** KHR_materials_unlit gives MeshBasicMaterial; swap it for a lit one so models react to the night lighting. */
export function toLitMaterial(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshBasicMaterial)) return m;
  const lit = new THREE.MeshStandardMaterial({
    map: m.map, color: m.color, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side,
    roughness: 0.9, metalness: 0,
  });
  lit.name = m.name;
  return lit;
}

/**
 * Turns, scales and places the parts on the ground (min y = 0), centred in x/z. `size` is the raw model
 * size; `target` describes the footprint after the yaw offset. Scale is uniform (minimum of the target
 * ratios, 1 without target), or per axis when `stretch` is set (h follows the mean of the w and d ratios).
 * Returns new geometry; the input is not changed.
 */
export function normalizeParts(
  parts: ModelParts, size: Size, target?: Target, yawOffset = 0, stretch = false,
): ModelParts {
  const cos = Math.abs(Math.cos(yawOffset)), sin = Math.abs(Math.sin(yawOffset));
  const w = size.w * cos + size.d * sin, d = size.w * sin + size.d * cos, h = size.h;
  const rw = target?.w ? target.w / w : undefined, rd = target?.d ? target.d / d : undefined;
  const rh = target?.h ? target.h / h : undefined;
  const given = [rw, rd, rh].filter((r): r is number => r !== undefined);
  let sx = 1, sy = 1, sz = 1;
  if (given.length && !stretch) sx = sy = sz = Math.min(...given);
  else if (given.length) {
    const horiz = [rw, rd].filter((r): r is number => r !== undefined);
    const mean = horiz.length ? horiz.reduce((a, c) => a + c, 0) / horiz.length : rh!;
    sx = rw ?? mean; sz = rd ?? mean; sy = rh ?? mean;
  }
  const out = parts.map((p) => {
    const geometry = p.geometry.clone();
    if (yawOffset) geometry.rotateY(yawOffset);
    geometry.scale(sx, sy, sz);
    return { ...p, geometry };
  });
  const box = new THREE.Box3();
  for (const p of out) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
  const c = box.getCenter(new THREE.Vector3());
  for (const p of out) {
    p.geometry.translate(-c.x, -box.min.y, -c.z);
    p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere();
  }
  return out;
}

/** The old placeholder look: one primitive of the role's size and colour, standing on the ground. */
export function fallbackParts(role: ModelRole): ModelParts {
  const f = FALLBACKS[role];
  const geometry = f.shape === 'box' ? new THREE.BoxGeometry(f.w, f.h, f.d)
    : f.shape === 'cone' ? new THREE.ConeGeometry(f.w / 2, f.h, 8)
    : new THREE.CylinderGeometry(f.w / 2, f.w / 2, f.h, 8);
  geometry.translate(0, f.h / 2, 0);
  return [{ geometry, material: new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.9, metalness: 0 }), tint: false }];
}

/** Copies vertices [start, start+count) of a non-indexed geometry into a new geometry. */
function sliceVertices(geo: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const n = attr.itemSize;
    const arr = new (attr.array.constructor as new (len: number) => ArrayLike<number> & { [i: number]: number })(count * n);
    for (let i = 0; i < count; i++) {
      const v = start + i;
      arr[i * n] = attr.getX(v);
      if (n > 1) arr[i * n + 1] = attr.getY(v);
      if (n > 2) arr[i * n + 2] = attr.getZ(v);
      if (n > 3) arr[i * n + 3] = attr.getW(v);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr as unknown as THREE.TypedArray, n, attr.normalized));
  }
  return out;
}

/** Merges all meshes of a loaded scene into one geometry per material, in world space, then normalizes. */
export function mergeScene(root: THREE.Object3D, entry: ModelIndexEntry): ModelParts {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const created: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const add = (m: THREE.Material, g: THREE.BufferGeometry): void => {
    created.push(g);
    groups.set(m, [...(groups.get(m) ?? []), g]);
  };
  try {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const geo = mesh.geometry;
      if (mats.length > 1) {
        const idx = geo.getIndex();
        for (const g of geo.groups) {
          const sub = idx
            ? (() => {
                const c = geo.clone(); c.clearGroups();
                c.setIndex(Array.from(idx.array.slice(g.start, g.start + g.count)));
                return c;
              })()
            : sliceVertices(geo, g.start, g.count);
          sub.applyMatrix4(mesh.matrixWorld);
          add(mats[g.materialIndex ?? 0], sub);
        }
        return;
      }
      const copy = geo.clone();
      copy.applyMatrix4(mesh.matrixWorld);
      add(mats[0], copy);
    });
    const parts: ModelPart[] = [];
    for (const [material, geos] of groups) {
      const shared = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => n in g.attributes));
      const prepared = geos.map((g) => {
        for (const n of Object.keys(g.attributes)) if (!shared.includes(n)) g.deleteAttribute(n);
        g.morphAttributes = {};
        return g;
      });
      const allIndexed = prepared.every((g) => g.getIndex());
      const input = allIndexed ? prepared : prepared.map((g) => {
        if (!g.getIndex()) return g;
        const ni = g.toNonIndexed(); created.push(ni); return ni;
      });
      const merged = mergeGeometries(input);
      if (!merged) throw new Error('mergeGeometries failed');
      created.push(merged);
      const lit = toLitMaterial(material);
      if (lit !== material) materials.push(lit);
      parts.push({ geometry: merged, material: lit, tint: !!entry.bodyMaterial && material.name === entry.bodyMaterial });
    }
    if (!parts.length) throw new Error('no meshes');
    const out = normalizeParts(parts, entry.size, entry.target, entry.yawOffset, entry.stretch);
    for (const g of created) g.dispose(); // intermediates; normalizeParts made its own copies
    return out;
  } catch (err) {
    for (const g of created) g.dispose();
    for (const m of materials) m.dispose();
    throw err;
  }
}

export async function loadModelLibrary(
  onProgress: (done: number, total: number) => void, base = 'models/',
): Promise<ModelLibrary> {
  const total = MODEL_ROLES.length;
  let done = 0;
  const parts = new Map<ModelRole, ModelParts>();
  const entries = new Map<ModelRole, ModelIndexEntry>();
  const missing: ModelRole[] = [];
  const tick = (): void => { done++; onProgress(done, total); };
  const fail = (role: ModelRole, err?: unknown): void => {
    console.warn('Model ontbreekt, terugval:', role, err ?? '');
    parts.set(role, fallbackParts(role));
    missing.push(role);
  };

  let index: ModelIndex | null = null;
  try {
    const res = await fetch(`${base}index.json`);
    if (!res.ok) throw new Error(`index.json ${res.status}`);
    index = await res.json() as ModelIndex;
  } catch (err) {
    console.warn('Model-index ontbreekt, alle modellen op terugval:', err);
  }

  onProgress(0, total);
  const loader = new GLTFLoader();
  await Promise.all(MODEL_ROLES.map(async (role) => {
    const entry = index?.[role];
    if (!entry) { fail(role); tick(); return; }
    try {
      const res = await fetch(`${base}${entry.file}`);
      if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
      const gltf = await loader.parseAsync(await res.arrayBuffer(), base);
      parts.set(role, mergeScene(gltf.scene, entry));
      entries.set(role, entry);
    } catch (err) { fail(role, err); }
    tick();
  }));

  return {
    get: (role) => parts.get(role) ?? fallbackParts(role),
    entry: (role) => entries.get(role),
    missing,
  };
}
