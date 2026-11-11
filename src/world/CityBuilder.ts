import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import { codeModel } from '../models/codeModels';
import type { ModelLibrary, ModelParts } from '../models/modelLibrary';
import { groupByChunk } from './chunking';
import { buildFacades } from './facadeGeometry';
import { facadeLayout, streetSides } from './facadeLayout';
import { addInstancedChunks, addInstancedModel } from './instancedChunks';
import type { RoadGraph } from './roadGraph';
import { sidewalkCorners, sidewalkSegments, type SidewalkSegment } from './sidewalks';
import { lampPositions, streetProps } from './streetProps';
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
}

export function buildCity(scene: THREE.Scene, world: RAPIER.World, g: RoadGraph, buildings: BuildingSpec[], opts: CityOptions): void {
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

  // Buildings: code facades (spec §4.1); the colliders are the old building boxes
  buildFacades(scene, buildings, buildings.map((b, i) => facadeLayout(b, i, CONFIG.world.seed, streetSides(b, g), opts.shops)), opts.lib);
  for (const b of buildings) world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.h / 2, b.z));

  // Sidewalks along every city street, benches and bins on their building side (no colliders, spec §4.2–4.3)
  const sidewalks = sidewalkSegments(g);
  buildSidewalks(scene, g, sidewalks);
  const props = streetProps(g, sidewalks, CONFIG.world.seed);
  for (const kind of ['bench', 'bin'] as const) {
    addInstancedModel(scene, codeModel(kind === 'bench' ? 'prop.bench' : 'prop.bin'), props.filter((p) => p.kind === kind), CHUNK, (p, m) => {
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); m.copy(dummy.matrix);
      return false;
    });
  }

  // Street lamps along city streets: the Kenney lamp with its arm over the street, a glowing light in its
  // head, and the old cylinder collider around the post
  const lamps = lampPositions(g);
  const lampParts = opts.lib.get('prop.lamp'), shape = lampShape(lampParts);
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const turn = (yaw: number): THREE.Quaternion => q.setFromAxisAngle(up, yaw - shape.armYaw);
  addInstancedModel(scene, lampParts, lamps, CHUNK, (l, m) => {
    // the post (not the bounding-box centre) stands on the lamp position
    v.set(-shape.pole.x, 0, -shape.pole.z).applyQuaternion(turn(l.yaw));
    m.compose(v.set(l.x + v.x, 0, l.z + v.z), q, one);
    return false;
  });
  // the old ball lamp, flattened into a light under the head; its local z runs along the arm
  const glowScale = new THREE.Vector3(shape.glow.across / 0.8, 0.3, shape.glow.along / 0.8), glowTurn = new THREE.Quaternion();
  addInstancedChunks(scene, new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lamps, CHUNK, (l, m) => {
    v.set(shape.glow.x - shape.pole.x, 0, shape.glow.z - shape.pole.z).applyQuaternion(turn(l.yaw));
    m.compose(v.set(l.x + v.x, shape.glow.y, l.z + v.z), glowTurn.setFromAxisAngle(up, l.yaw), glowScale);
    return false;
  });
  for (const { x, z } of lamps) world.createCollider(RAPIER.ColliderDesc.cylinder(LAMP_HEIGHT / 2, LAMP_RADIUS).setTranslation(x, LAMP_HEIGHT / 2, z));

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

/**
 * Where the lamp model has its post and its light, in model space: the post is the centre of the lowest
 * vertices, the head is the far end of the top. A model without an arm (the fallback cylinder) gets its
 * light on top, like the old ball lamp.
 */
function lampShape(parts: ModelParts): {
  pole: { x: number; z: number }; armYaw: number; glow: { x: number; y: number; z: number; along: number; across: number };
} {
  const pts: THREE.Vector3[] = [];
  for (const p of parts) {
    const a = p.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(a, i));
  }
  const top = Math.max(...pts.map((p) => p.y));
  const base = new THREE.Box3().setFromPoints(pts.filter((p) => p.y < top * 0.1)).getCenter(new THREE.Vector3());
  const reach = (p: THREE.Vector3): number => Math.hypot(p.x - base.x, p.z - base.z);
  const high = pts.filter((p) => p.y > top * 0.8), maxReach = Math.max(...high.map(reach));
  if (maxReach < 0.3) return { pole: { x: base.x, z: base.z }, armYaw: 0, glow: { x: base.x, y: top + 0.1, z: base.z, along: 0.8, across: 0.8 } };
  const head = new THREE.Box3().setFromPoints(high.filter((p) => reach(p) > maxReach / 2));
  const c = head.getCenter(new THREE.Vector3()), size = head.getSize(new THREE.Vector3());
  const armYaw = Math.atan2(c.x - base.x, c.z - base.z), sin = Math.abs(Math.sin(armYaw)), cos = Math.abs(Math.cos(armYaw));
  return {
    pole: { x: base.x, z: base.z }, armYaw,
    glow: { x: c.x, y: head.min.y, z: c.z, along: (size.x * sin + size.z * cos) * 0.9, across: (size.x * cos + size.z * sin) * 0.9 },
  };
}

/** Boxes merged into one mesh per chunk; `place` gives each box (a unit cube standing on y = 0) its matrix. */
function mergedBoxes<T extends { x: number; z: number }>(scene: THREE.Object3D, items: readonly T[], material: THREE.Material,
  place: (item: T, m: THREE.Matrix4) => void): void {
  const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
  const m = new THREE.Matrix4();
  for (const list of groupByChunk(items, CHUNK).values()) {
    const merged = mergeGeometries(list.map((it) => { place(it, m); return unit.clone().applyMatrix4(m); }));
    if (!merged) continue;
    merged.computeBoundingSphere();
    scene.add(new THREE.Mesh(merged, material));
  }
}

/** Sidewalk slabs with a kerb stone on the street side; lowered (no kerb) at zebras and crossing corners. No colliders. */
function buildSidewalks(scene: THREE.Scene, g: RoadGraph, segs: readonly SidewalkSegment[]): void {
  const { widthM: W, kerbH, colour, kerbColour, loweredH } = CONFIG.sidewalk;
  const slabs = [...segs.map((s) => ({ ...s, raised: s.kerb })), ...sidewalkCorners(g).map((c) => ({ ...c, yaw: 0, len: W }))];
  mergedBoxes(scene, slabs, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95 }), (s, m) => {
    dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(W, s.raised ? kerbH : loweredH, s.len); dummy.updateMatrix(); m.copy(dummy.matrix);
  });
  // kerb stone: 0.2 m wide along the carriageway edge, a little higher than the slab
  const kerbs = segs.filter((s) => s.kerb).map((s) => {
    const off = W / 2 - 0.1, side = -s.side; // towards the road centre line
    return { ...s, x: s.x - Math.cos(s.yaw) * off * side, z: s.z + Math.sin(s.yaw) * off * side };
  });
  mergedBoxes(scene, kerbs, new THREE.MeshStandardMaterial({ color: kerbColour, roughness: 0.8 }), (s, m) => {
    dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(0.2, kerbH + 0.02, s.len); dummy.updateMatrix(); m.copy(dummy.matrix);
  });
}
