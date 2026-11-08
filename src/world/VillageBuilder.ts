import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { addInstancedChunks } from './instancedChunks';
import type { NwegDecor } from './nwegDecor';
import type { RoadGraph } from './roadGraph';
import type { HouseSpec, VillageLayout } from './villageLayout';

const dummy = new THREE.Object3D();
const CHUNK = CONFIG.world.chunkSizeM;
const LAMP_RADIUS = 0.15, LAMP_HEIGHT = 6, TRUNK_RADIUS = 0.3;

/** Gable roof: triangle of base 1 and height 1 (across local z), ridge along local x, length 1. */
function roofGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.rotateY(Math.PI / 2);
  return geo;
}

const box = (world: RAPIER.World, x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
};

export function buildVillage(scene: THREE.Scene, world: RAPIER.World, g: RoadGraph, layout: VillageLayout, decor: NwegDecor): void {
  const { houses, church, cafe } = layout;

  // Houses + gable roofs (one collider around the whole house, roof included)
  const houseAt = (part: 'wall' | 'roof') => (h: HouseSpec, m: THREE.Matrix4, c: THREE.Color) => {
    dummy.rotation.set(0, h.yaw, 0);
    if (part === 'wall') { dummy.scale.set(h.w, h.h, h.d); dummy.position.set(h.x, h.h / 2, h.z); }
    else { dummy.scale.set(h.w, h.roofH, h.d); dummy.position.set(h.x, h.h, h.z); }
    dummy.updateMatrix(); m.copy(dummy.matrix);
    if (part === 'wall') c.setHex(h.color);
    return part === 'wall';
  };
  addInstancedChunks(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), houses, CHUNK, houseAt('wall'));
  addInstancedChunks(scene, roofGeometry(), new THREE.MeshStandardMaterial({ color: 0x7a3f33, roughness: 0.9 }), houses, CHUNK, houseAt('roof'));
  for (const h of houses) { const total = h.h + h.roofH; box(world, h.x, total / 2, h.z, h.w / 2, total / 2, h.d / 2, h.yaw); }

  // Church: nave + tower + spire + red beacon (fog:false so it shows through the mist)
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.9 });
  const naveH = 9, tw = 6;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(church.w, naveH, church.d), stone);
  nave.position.set(church.x, naveH / 2, church.z);
  const towerZ = church.z - church.d / 2 + tw / 2;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, church.towerH, tw), stone);
  tower.position.set(church.x, church.towerH / 2, towerZ);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.75, 8, 4), new THREE.MeshStandardMaterial({ color: 0x4a4a52 }));
  spire.position.set(church.x, church.towerH + 4, towerZ); spire.rotation.y = Math.PI / 4;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false }));
  beacon.position.set(church.x, church.towerH + 8.5, towerZ);
  scene.add(nave, tower, spire, beacon);
  box(world, church.x, naveH / 2, church.z, church.w / 2, naveH / 2, church.d / 2);
  box(world, church.x, church.towerH / 2, towerZ, tw / 2, church.towerH / 2, tw / 2);

  // Café with lit sign facing the main street
  const cafeMesh = new THREE.Mesh(new THREE.BoxGeometry(cafe.w, cafe.h, cafe.d), new THREE.MeshStandardMaterial({ color: cafe.color, roughness: 0.85 }));
  cafeMesh.position.set(cafe.x, cafe.h / 2, cafe.z);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  sign.position.set(cafe.x, cafe.h - 0.9, cafe.z - cafe.d / 2 - 0.05); sign.rotation.y = Math.PI;
  scene.add(cafeMesh, sign);
  box(world, cafe.x, cafe.h / 2, cafe.z, cafe.w / 2, cafe.h / 2, cafe.d / 2);

  // Lamps along village streets: every lampEveryM on one side
  const lamps: { x: number; z: number }[] = [];
  for (const e of g.edgesOfKind('dorp')) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    for (let s = CONFIG.village.lampEveryM / 2; s < len; s += CONFIG.village.lampEveryM) lamps.push({ x: a.x + fx * s - fz * 5, z: a.z + fz * s + fx * 5 });
  }
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
