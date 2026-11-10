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
 * Turns, uniformly scales (minimum of the given target ratios, 1 without target) and places the parts
 * on the ground (min y = 0), centred in x/z. `size` is the model's raw size before the yaw offset.
 * Returns new geometry; the input is not changed.
 */
export function normalizeParts(parts: ModelParts, size: Size, target?: Target, yawOffset = 0): ModelParts {
  const ratios: number[] = [];
  if (target?.w) ratios.push(target.w / size.w);
  if (target?.d) ratios.push(target.d / size.d);
  if (target?.h) ratios.push(target.h / size.h);
  const scale = ratios.length ? Math.min(...ratios) : 1;
  const out = parts.map((p) => {
    const geometry = p.geometry.clone();
    if (yawOffset) geometry.rotateY(yawOffset);
    geometry.scale(scale, scale, scale);
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

/** Merges all meshes of a loaded scene into one geometry per material, in world space. */
function mergeScene(root: THREE.Object3D, entry: ModelIndexEntry): ModelParts {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const geo = mesh.geometry;
    if (mats.length > 1) {
      for (const g of geo.groups) {
        const sub = geo.clone();
        sub.clearGroups();
        const idx = sub.getIndex();
        if (idx) sub.setIndex(Array.from(idx.array.slice(g.start, g.start + g.count)));
        sub.applyMatrix4(mesh.matrixWorld);
        const m = mats[g.materialIndex ?? 0];
        groups.set(m, [...(groups.get(m) ?? []), sub]);
      }
      return;
    }
    const copy = geo.clone();
    copy.applyMatrix4(mesh.matrixWorld);
    groups.set(mats[0], [...(groups.get(mats[0]) ?? []), copy]);
  });
  const parts: ModelPart[] = [];
  for (const [material, geos] of groups) {
    const shared = [...Object.keys(geos[0].attributes)].filter((n) => geos.every((g) => n in g.attributes));
    const allIndexed = geos.every((g) => g.getIndex());
    const prepared = geos.map((g) => {
      for (const n of Object.keys(g.attributes)) if (!shared.includes(n)) g.deleteAttribute(n);
      g.morphAttributes = {};
      return allIndexed || !g.getIndex() ? g : g.toNonIndexed();
    });
    const merged = mergeGeometries(prepared);
    if (!merged) throw new Error('mergeGeometries failed');
    const named = (material as THREE.Material & { name: string }).name;
    parts.push({ geometry: merged, material: toLitMaterial(material), tint: !!entry.bodyMaterial && named === entry.bodyMaterial });
  }
  if (!parts.length) throw new Error('no meshes');
  return normalizeParts(parts, entry.size, entry.target, entry.yawOffset);
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
