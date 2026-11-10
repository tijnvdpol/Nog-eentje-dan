import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROOF_PART_SIZE } from '../world/facadeLayout';
import type { ModelPart, ModelParts } from './modelLibrary';

/** Low-poly models built in code, for parts the Kenney packs do not have. Same shape as ModelLibrary parts. */
export type CodeRole = 'prop.bench' | 'prop.bin' | 'roof.ac' | 'roof.tank' | 'roof.lift';

type Piece = THREE.BufferGeometry;
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): Piece => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g;
};
const cyl = (r: number, h: number, seg: number, x = 0, y = 0, z = 0, rTop = r): Piece => {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg); g.translate(x, y + h / 2, z); return g.toNonIndexed();
};
const flat = (color: number, roughness = 0.8): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });

/** Merges pieces into one part; boxes are converted to non-indexed so they merge with cylinders. */
function part(pieces: Piece[], material: THREE.Material, tint = false): ModelPart {
  const geometry = mergeGeometries(pieces.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!geometry) throw new Error('codeModel merge failed');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, material, tint };
}

const cache = new Map<CodeRole, ModelParts>();

/** Cached per role: every call for a role returns the same geometry and materials. */
export function codeModel(role: CodeRole): ModelParts {
  let parts = cache.get(role);
  if (!parts) { parts = build(role); cache.set(role, parts); }
  return parts;
}

function build(role: CodeRole): ModelParts {
  switch (role) {
    case 'roof.ac': {
      // AC unit on a dark base, round fan grille with a cross on top
      const { w, d } = ROOF_PART_SIZE['roof.ac'];
      const bw = w - 0.1, bd = d - 0.1, bh = 0.9;
      const r = Math.min(bw, bd) * 0.36;
      return [
        part([box(bw, bh, bd, 0, 0.12), box(0.06, 0.02, r * 2, -bw / 4, 0.12 + bh + 0.02), box(r * 2, 0.02, 0.06, -bw / 4, 0.12 + bh + 0.02),
          ...[-0.24, -0.08, 0.08, 0.24].map((y) => box(0.02, 0.05, bd * 0.7, bw / 2, 0.12 + bh / 2 + y, 0))], flat(0xc2c7da)),
        part([box(w, 0.12, d), cyl(r, 0.03, 10, -bw / 4, 0.12 + bh)], flat(0x3a3c3f)),
      ];
    }
    case 'roof.tank': {
      // round water tank on four legs with a flat cone top
      const { w } = ROOF_PART_SIZE['roof.tank'];
      const r = w / 2 - 0.05, legH = 0.7, tankH = 1.7;
      const legs = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => box(0.12, legH, 0.12, sx * r * 0.6, 0, sz * r * 0.6));
      return [
        part([cyl(r, tankH, 10, 0, legH), cyl(r * 1.02, 0.35, 10, 0, legH + tankH, 0, r * 0.25)], flat(0x9da4c4)),
        part([...legs, box(r * 1.5, 0.08, r * 1.5, 0, legH - 0.08), cyl(r * 1.04, 0.1, 10, 0, legH + tankH * 0.5)], flat(0x4f5260)),
      ];
    }
    case 'roof.lift': {
      // stair/lift housing in the wall colour (tinted), with a dark door and a light roof edge
      const { w, d } = ROOF_PART_SIZE['roof.lift'];
      const h = 2.6;
      return [
        part([box(w - 0.2, h, d - 0.2)], flat(0xffffff, 0.9), true),
        part([box(w, 0.25, d, 0, h)], flat(0xdcdce9)),
        part([box(0.9, 2.0, 0.06, 0, 0, d / 2 - 0.1 + 0.03), box(0.5, 0.4, 0.06, 0.6, 1.6, -(d / 2 - 0.1 + 0.03))], flat(0x3a3c3f)),
      ];
    }
    case 'prop.bench': {
      const legs = [-0.7, 0.7].map((x) => box(0.08, 0.45, 0.45, x, 0, 0));
      return [
        part([box(1.7, 0.06, 0.45, 0, 0.42), box(1.7, 0.35, 0.06, 0, 0.55, -0.2)], flat(0x9a6a45)),
        part(legs, flat(0x3a3c3f)),
      ];
    }
    case 'prop.bin':
      return [
        part([cyl(0.25, 0.8, 8)], flat(0x515566)),
        part([cyl(0.27, 0.06, 8, 0, 0.8)], flat(0x3a3c3f)),
      ];
  }
}
