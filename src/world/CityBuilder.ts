import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import { addInstancedChunks } from './instancedChunks';
import type { RoadGraph } from './roadGraph';
import type { BuildingSpec } from './types';

const LANE_W = CONFIG.traffic.laneWidthM;
/** Static colliders (spec fase 2 §8.2): hitting a lamp post or tree trunk damages the car like a building. */
const LAMP_RADIUS = 0.15, LAMP_HEIGHT = 6, TRUNK_RADIUS = 0.3;
const dummy = new THREE.Object3D();
const CHUNK = CONFIG.world.chunkSizeM;

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
  m.count = count;
  m.frustumCulled = false;
  return m;
}

export function buildCity(scene: THREE.Scene, world: RAPIER.World, g: RoadGraph, buildings: BuildingSpec[]): void {
  const rng = mulberry32(CONFIG.world.seed);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(7000, 4000),
    new THREE.MeshStandardMaterial({ color: 0x2f4a2f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(1250, -0.05, 0);
  scene.add(ground);

  // Roads + centre lines
  const roads = instanced(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.95 }), g.edges.length);
  const lines = instanced(new THREE.BoxGeometry(1, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0xd8d2a0 }), g.edges.length);
  g.edges.forEach((e, i) => {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const width = e.lanesPerDir * 2 * LANE_W;
    dummy.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(width, 1, len + 0.5);
    dummy.updateMatrix();
    roads.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.04;
    dummy.scale.set(0.2, 1, Math.max(len - 14, 1));
    dummy.updateMatrix();
    lines.setMatrixAt(i, dummy.matrix);
  });
  scene.add(roads, lines);

  // Buildings
  addInstancedChunks(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), buildings, CHUNK, (b, m, c) => {
    dummy.position.set(b.x, b.h / 2, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    m.copy(dummy.matrix); c.setHex(b.color);
    return true;
  });
  for (const b of buildings) world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.h / 2, b.z));

  // Street lamps along city streets
  const lampPositions: { x: number; z: number }[] = [];
  for (const e of g.edges) {
    if (e.kind !== 'stad') continue;
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    for (const s of [25, 75]) lampPositions.push({ x: a.x + fx * s - fz * 5.5, z: a.z + fz * s + fx * 5.5 });
  }
  const lampAt = (y: number) => (l: { x: number; z: number }, m: THREE.Matrix4) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.position.set(l.x, y, l.z); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  };
  addInstancedChunks(scene, new THREE.CylinderGeometry(0.08, 0.1, 6, 6), new THREE.MeshStandardMaterial({ color: 0x555a63 }), lampPositions, CHUNK, lampAt(3));
  addInstancedChunks(scene, new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lampPositions, CHUNK, lampAt(6.1));
  for (const { x, z } of lampPositions) world.createCollider(RAPIER.ColliderDesc.cylinder(LAMP_HEIGHT / 2, LAMP_RADIUS).setTranslation(x, LAMP_HEIGHT / 2, z));

  // Trees around the ring road area
  const ringEdges = g.edgesOfKind('ring');
  const trees: { x: number; z: number; sc: number }[] = [];
  for (const e of ringEdges) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    for (let s = 5; s < len; s += 12) {
      for (const side of [-1, 1]) {
        const off = side * (16 + rng() * 40);
        const x = a.x + fx * s - fz * off, z = a.z + fz * s + fx * off;
        if (g.nearestEdge(x, z).distance < 14) continue;
        trees.push({ x, z, sc: 0.8 + rng() * 0.8 });
      }
    }
  }
  const treeAt = (crown: boolean) => (t: { x: number; z: number; sc: number }, m: THREE.Matrix4) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(t.sc, t.sc, t.sc);
    dummy.position.set(t.x, crown ? 2 * t.sc + 2.2 * t.sc : t.sc, t.z); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  };
  addInstancedChunks(scene, new THREE.CylinderGeometry(0.2, 0.3, 2, 6), new THREE.MeshStandardMaterial({ color: 0x5b3d26 }), trees, CHUNK, treeAt(false));
  addInstancedChunks(scene, new THREE.ConeGeometry(1.6, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x1f5a2c }), trees, CHUNK, treeAt(true));
  for (const t of trees) world.createCollider(RAPIER.ColliderDesc.cylinder(t.sc, TRUNK_RADIUS * t.sc).setTranslation(t.x, t.sc, t.z));

  // Guard rails along the ring (open towards ramps on the inside)
  const rampNodes = new Set(g.edgesOfKind('oprit').flatMap((e) => [e.from, e.to]));
  const rails: { x: number; z: number; yaw: number; len: number }[] = [];
  for (const e of ringEdges) {
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
    const half = e.lanesPerDir * LANE_W + 1.2;
    const yaw = Math.atan2(fx, fz);
    for (const side of [-1, 1]) {
      const nx = -fz * side, nz = fx * side;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const inner = nx * mx + nz * mz < 0;
      if (inner && (rampNodes.has(e.from) || rampNodes.has(e.to))) continue;
      rails.push({ x: mx + nx * half, z: mz + nz * half, yaw, len: len + 0.4 });
    }
  }
  const railMesh = instanced(new THREE.BoxGeometry(0.3, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.5, roughness: 0.5 }), rails.length);
  rails.forEach((r, i) => {
    dummy.position.set(r.x, 0.45, r.z); dummy.rotation.set(0, r.yaw, 0); dummy.scale.set(1, 1, r.len); dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.15, 0.5, r.len / 2)
        .setTranslation(r.x, 0.5, r.z)
        .setRotation({ x: 0, y: Math.sin(r.yaw / 2), z: 0, w: Math.cos(r.yaw / 2) }),
    );
  });
  scene.add(railMesh);
}
