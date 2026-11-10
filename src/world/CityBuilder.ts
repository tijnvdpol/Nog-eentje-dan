import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { ModelLibrary } from '../models/modelLibrary';
import type { ModelRole } from '../models/roles';
import { buildFacades } from './facadeGeometry';
import { facadeLayout, sideNormal, streetSides } from './facadeLayout';
import { addInstancedChunks, addInstancedModel } from './instancedChunks';
import type { RoadGraph } from './roadGraph';
import { sidewalkCorners, sidewalkSegments } from './sidewalks';
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

export interface CityOptions {
  lib: ModelLibrary;
  /** Made-up shop names for the signs (content/shops.json); empty gives awnings without a sign. */
  shops: readonly string[];
  /** `?proefblok`: Kenney buildings in the comparison block instead of plain boxes. */
  proefblok: boolean;
}

type Block = { x0: number; z0: number };
const inBlock = (blk: Block, x: number, z: number, margin = 0): boolean => {
  const size = CONFIG.proefblok.size;
  return x > blk.x0 - margin && x < blk.x0 + size + margin && z > blk.z0 - margin && z < blk.z0 + size + margin;
};

export function buildCity(scene: THREE.Scene, world: RAPIER.World, g: RoadGraph, buildings: BuildingSpec[], opts: CityOptions): void {
  const rng = mulberry32(CONFIG.world.seed);
  const P = CONFIG.proefblok;

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

  // Buildings: code facades in the proefblok, Kenney models in the comparison block (?proefblok), boxes elsewhere
  const isCode = (b: BuildingSpec): boolean => inBlock(P.codeBlock, b.x, b.z);
  const isKenney = (b: BuildingSpec): boolean => opts.proefblok && inBlock(P.kenneyBlock, b.x, b.z);
  const code = buildings.map((b, i) => ({ b, i })).filter(({ b }) => isCode(b));
  buildFacades(scene, code.map((e) => e.b),
    code.map(({ b, i }) => facadeLayout(b, i, CONFIG.world.seed, streetSides(b, g), opts.shops)), opts.lib);
  buildKenneyBlock(scene, buildings.filter(isKenney), g, opts.lib);
  const boxes = buildings.filter((b) => !isCode(b) && !isKenney(b));
  addInstancedChunks(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), boxes, CHUNK, (b, m, c) => {
    dummy.position.set(b.x, b.h / 2, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    m.copy(dummy.matrix); c.setHex(b.color);
    return true;
  });
  for (const b of buildings) world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.h / 2, b.z));

  // Sidewalks for now only around the proefblok (and the comparison block, so both are judged alike)
  const nearBlocks = (x: number, z: number): boolean => {
    const m = CONFIG.traffic.laneWidthM + CONFIG.sidewalk.widthM + 0.01;
    return inBlock(P.codeBlock, x, z, m) || (opts.proefblok && inBlock(P.kenneyBlock, x, z, m));
  };
  buildSidewalks(scene, g, nearBlocks);

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

const SIDEWALK_COLOUR = 0x666a78, KERB_COLOUR = 0x9da4b8, LOWERED_H = 0.04;

/** Sidewalk slabs with a kerb stone on the street side; lowered (no kerb) at zebras and corners. No colliders. */
function buildSidewalks(scene: THREE.Scene, g: RoadGraph, keep: (x: number, z: number) => boolean): void {
  const { widthM: W, kerbH } = CONFIG.sidewalk;
  const segs = sidewalkSegments(g).filter((s) => keep(s.x, s.z));
  // a corner only where a kept sidewalk ends next to it (no loose squares at the edge of the kept area)
  const ends = segs.flatMap((s) => [-1, 1].map((d) => ({ x: s.x + Math.sin(s.yaw) * d * s.len / 2, z: s.z + Math.cos(s.yaw) * d * s.len / 2 })));
  const corners = sidewalkCorners(g).filter((c) => ends.some((e) => Math.hypot(e.x - c.x, e.z - c.z) < W));
  const slab = new THREE.MeshStandardMaterial({ color: SIDEWALK_COLOUR, roughness: 0.95 });
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  addInstancedChunks(scene, unit, slab, [...segs, ...corners.map((c) => ({ ...c, yaw: 0, len: W, side: 1 as const, kerb: false }))], CHUNK, (s, m) => {
    dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(W, s.kerb ? kerbH : LOWERED_H, s.len); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  });
  // kerb stone: 0.2 m wide along the carriageway edge, a little higher than the slab
  const kerbs = segs.filter((s) => s.kerb).map((s) => {
    const off = W / 2 - 0.1, side = -s.side; // towards the road centre line
    return { ...s, x: s.x - Math.cos(s.yaw) * off * side, z: s.z + Math.sin(s.yaw) * off * side };
  });
  addInstancedChunks(scene, unit, new THREE.MeshStandardMaterial({ color: KERB_COLOUR, roughness: 0.8 }), kerbs, CHUNK, (s, m) => {
    dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(0.2, kerbH + 0.02, s.len); dummy.updateMatrix(); m.copy(dummy.matrix);
    return false;
  });
}

const PROEF_ROLES: readonly ModelRole[] = ['proef.a', 'proef.b', 'proef.c'];

/** Kenney comparison buildings: round-robin over proef.a/b/c, front (+z) to the street, uniformly fit in w x d. */
function buildKenneyBlock(scene: THREE.Scene, list: BuildingSpec[], g: RoadGraph, lib: ModelLibrary): void {
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  PROEF_ROLES.forEach((role, r) => {
    const parts = lib.get(role);
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
    const size = box.getSize(new THREE.Vector3());
    const mine = list.filter((_, i) => i % PROEF_ROLES.length === r);
    addInstancedModel(scene, parts, mine, CHUNK, (b, m) => {
      const n = sideNormal(streetSides(b, g)[0] ?? 2);
      const yaw = Math.atan2(n.x, n.z), turned = Math.abs(n.x) > 0.5;
      const s = Math.min(b.w / (turned ? size.z : size.x), b.d / (turned ? size.x : size.z));
      m.compose(pos.set(b.x, 0, b.z), q.setFromAxisAngle(up, yaw), sc.setScalar(s));
      return false;
    });
  });
}
