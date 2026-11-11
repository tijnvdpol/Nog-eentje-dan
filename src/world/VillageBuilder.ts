import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { codeModel } from '../models/codeModels';
import { recolourCells, SUBURBAN_CELLS, type Paint } from '../models/colormap';
import type { ModelLibrary, ModelParts } from '../models/modelLibrary';
import { HOLLANDS, HOUSE_ROLES, houseFrontYaw, houseLook } from './houseLooks';
import { addInstancedChunks, addInstancedModel } from './instancedChunks';
import type { NwegDecor } from './nwegDecor';
import type { RoadGraph } from './roadGraph';
import type { VillageLayout } from './villageLayout';
import { buildCafe, buildChurch } from './villageLandmarks';

const CAFE_NAME = 'Café De Gouden Karper';

const dummy = new THREE.Object3D();
const CHUNK = CONFIG.world.chunkSizeM;
const LAMP_RADIUS = 0.15, LAMP_HEIGHT = 6, TRUNK_RADIUS = 0.3;
/** Roof tiles per wall colour: anthracite or red-orange pantiles instead of Kenney's green. */
const ROOF_FOR_WALL: Record<number, number> = { 0x9c4a3a: 0x3a3c44, 0x7a3b2e: 0x4a4d57, 0xb06a4f: 0x8a3a26, 0xe8e2d6: 0x34363e, 0x8a5a44: 0xa8552f };
/** White window frames, fascias and fence panels; darker green for the planters by the door. */
const TRIM_WHITE = 0xece8de, PLANTER_GREEN = 0x3b6a42, FENCE_COLOUR = 0xe6e1d4;
/** Centres of fence panels (1.6 m) and hedge pieces (3.2 m) along the street, leaving a gap for the path. */
const FENCE_AT = [-3.2, -1.6, 1.6, 3.2], HEDGE_AT = [-2.3, 2.3];
const PIECE_HALF = { fence: 0.8, hedge: 1.6 } as const;

const box = (world: RAPIER.World, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
};

/**
 * A clone of a Kenney colormap material whose map has the given cells repainted (see models/colormap.ts).
 * Materials without a map (the fallback shapes) take the first colour as their plain colour.
 */
function recolouredMaterial(base: THREE.Material, paints: Paint[]): THREE.Material {
  const m = (base as THREE.MeshStandardMaterial).clone();
  const map = m.map, img = map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!map || !img?.width) { m.color?.setHex(paints[0].colour); return m; }
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  data.data.set(recolourCells(data.data, c.width, c.height, paints));
  ctx.putImageData(data, 0, 0);
  const tex = map.clone();
  tex.source = new THREE.TextureSource(c); // clone() shares the source; give the copy its own image
  tex.needsUpdate = true;
  m.map = tex;
  return m;
}

type Placed = { x: number; z: number; yaw: number; s: number };
function placeAll(scene: THREE.Object3D, parts: ModelParts, items: Placed[]): void {
  if (!items.length) return;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  addInstancedModel(scene, parts, items, CHUNK, (it, m) => {
    m.compose(pos.set(it.x, 0, it.z), q.setFromAxisAngle(up, it.yaw), sc.setScalar(it.s));
    return false;
  });
}

export function buildVillage(
  scene: THREE.Scene, world: RAPIER.World, g: RoadGraph, layout: VillageLayout, decor: NwegDecor, lib: ModelLibrary,
): void {
  const { houses, church, cafe } = layout;

  // Lamp positions first: front-yard extras keep clear of them
  const lamps: { x: number; z: number }[] = [];
  for (const e of g.edgesOfKind('dorp')) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    for (let s = CONFIG.village.lampEveryM / 2; s < len; s += CONFIG.village.lampEveryM) lamps.push({ x: a.x + fx * s - fz * 5, z: a.z + fz * s + fx * 5 });
  }
  /** A piece of half-length `half` along (ux, uz) keeps 0.4 m clear of every lamp post. */
  const clearOfLamps = (p: { x: number; z: number }, ux: number, uz: number, half: number) => lamps.every((l) => {
    const along = Math.max(-half, Math.min(half, (l.x - p.x) * ux + (l.z - p.z) * uz));
    return Math.hypot(l.x - (p.x + ux * along), l.z - (p.z + uz * along)) > 0.4 + LAMP_RADIUS;
  });

  // Kenney houses turned towards their street, walls and roof repainted per Hollands wall colour; one
  // collider around the whole house (roof included), as before
  const looks = houses.map((h, i) => houseLook(h, i, CONFIG.world.seed, g));
  const wallMats = new Map<string, THREE.Material>();
  const wallMat = (base: THREE.Material, wall: number) => {
    // all suburban houses share one colormap, so one material per colour (fallback shapes get their own)
    const key = `${wall}:${!!(base as THREE.MeshStandardMaterial).map}`;
    let m = wallMats.get(key);
    if (!m) {
      m = recolouredMaterial(base, [
        { cell: SUBURBAN_CELLS.wall, colour: wall }, { cell: SUBURBAN_CELLS.roof, colour: ROOF_FOR_WALL[wall] },
        { cell: SUBURBAN_CELLS.trim, colour: TRIM_WHITE, shade: 0.35 }, { cell: SUBURBAN_CELLS.planter, colour: PLANTER_GREEN },
      ]);
      wallMats.set(key, m);
    }
    return m;
  };
  for (const role of HOUSE_ROLES) for (const wall of HOLLANDS) {
    const items = houses.flatMap((h, i) => (looks[i].role === role && looks[i].wall === wall ? [{ x: h.x, z: h.z, yaw: houseFrontYaw(h, g), s: 1 }] : []));
    if (!items.length) continue;
    placeAll(scene, lib.get(role).map((p) => ({ ...p, material: wallMat(p.material, wall) })), items);
  }
  for (const h of houses) { const total = h.h + h.roofH; box(world, h.x, total / 2, h.z, h.w / 2, total / 2, h.d / 2, h.yaw); }

  // Front-yard fences (white panels) and trimmed hedges, parallel to the street, no collider
  const fences: Placed[] = [], hedges: Placed[] = [];
  for (const l of looks) {
    if (!l.extraAt) continue;
    const { x, z, yaw } = l.extraAt, ux = Math.cos(yaw), uz = -Math.sin(yaw); // local x after the turn
    const offsets = l.extra === 'fence' ? FENCE_AT : HEDGE_AT;
    offsets.forEach((o) => {
      const p = { x: x + ux * o, z: z + uz * o };
      if (l.extra === 'none' || !clearOfLamps(p, ux, uz, PIECE_HALF[l.extra])) return;
      (l.extra === 'fence' ? fences : hedges).push({ ...p, yaw, s: 1 });
    });
  }
  const fenceParts = lib.get('prop.fence');
  placeAll(scene, fenceParts.map((p) => ({ ...p, material: recolouredMaterial(p.material, [{ cell: SUBURBAN_CELLS.fence, colour: FENCE_COLOUR }]) })), fences);
  placeAll(scene, codeModel('garden.hedge'), hedges);

  // Church and café, built in code; their colliders stay the same boxes
  const tw = 6, naveH = 9;
  buildChurch(scene, church, tw);
  const towerZ = church.z - church.d / 2 + tw / 2;
  box(world, church.x, naveH / 2, church.z, church.w / 2, naveH / 2, church.d / 2);
  box(world, church.x, church.towerH / 2, towerZ, tw / 2, church.towerH / 2, tw / 2);
  buildCafe(scene, cafe, CAFE_NAME, lib, CHUNK);
  box(world, cafe.x, cafe.h / 2, cafe.z, cafe.w / 2, cafe.h / 2, cafe.d / 2);

  // Lamp posts along village streets (positions computed at the top)
  const at = (y: number) => (p: { x: number; z: number }, m: THREE.Matrix4) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.position.set(p.x, y, p.z); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  };
  addInstancedChunks(scene, new THREE.CylinderGeometry(LAMP_RADIUS, LAMP_RADIUS, LAMP_HEIGHT, 6), new THREE.MeshStandardMaterial({ color: 0x555a60 }), lamps, CHUNK, at(LAMP_HEIGHT / 2));
  addInstancedChunks(scene, new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), lamps, CHUNK, at(LAMP_HEIGHT + 0.1));
  for (const { x, z } of lamps) world.createCollider(RAPIER.ColliderDesc.cylinder(LAMP_HEIGHT / 2, LAMP_RADIUS).setTranslation(x, LAMP_HEIGHT / 2, z));

  // N-road trees (trunk colliders like the city) and reflector posts (no collider)
  const treeAt = (crown: boolean) => (t: { x: number; z: number; scale: number }, m: THREE.Matrix4) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(t.scale, t.scale, t.scale);
    dummy.position.set(t.x, crown ? 2 * t.scale + 2.2 * t.scale : t.scale, t.z); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  };
  addInstancedChunks(scene, new THREE.CylinderGeometry(0.2, 0.3, 2, 6), new THREE.MeshStandardMaterial({ color: 0x5b3d26 }), decor.trees, CHUNK, treeAt(false));
  addInstancedChunks(scene, new THREE.ConeGeometry(1.6, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x1f5a2c }), decor.trees, CHUNK, treeAt(true));
  for (const t of decor.trees) world.createCollider(RAPIER.ColliderDesc.cylinder(t.scale, TRUNK_RADIUS * t.scale).setTranslation(t.x, t.scale, t.z));
  addInstancedChunks(scene, new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshStandardMaterial({ color: 0x777777 }), decor.reflectors, CHUNK, at(0.5));
  addInstancedChunks(scene, new THREE.BoxGeometry(0.12, 0.15, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }), decor.reflectors, CHUNK, at(0.95));
}
