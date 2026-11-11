import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelLibrary } from '../models/modelLibrary';
import { codeModel } from '../models/codeModels';
import { GLASS_GLOW, nightSky, paneGlow } from './facadeTextures';
import { addInstancedModel } from './instancedChunks';
import type { BuildingSpec } from './types';
import type { ChurchSpec } from './villageLayout';

/**
 * Church and café of the village, built in code (spec fase 4 §5.3). Purely visual: the colliders stay in
 * VillageBuilder. Everything stays inside the collider footprint, apart from ledges of at most 0.3 m.
 */

type Geo = THREE.BufferGeometry;

/** Collects geometry per material and merges it into one mesh per material. */
class Bag {
  private readonly lists = new Map<THREE.Material, Geo[]>();
  add(material: THREE.Material, geo: Geo, x = 0, y = 0, z = 0, ry = 0, rz = 0): void {
    if (rz) geo.rotateZ(rz);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(name)) flat.deleteAttribute(name);
    flat.clearGroups();
    this.lists.set(material, [...(this.lists.get(material) ?? []), flat]);
  }
  /** Box with its bottom at y. */
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    this.add(material, g, x, y, z, ry);
  }
  addTo(parent: THREE.Object3D): void {
    for (const [material, geos] of this.lists) {
      const merged = mergeGeometries(geos);
      if (!merged) throw new Error('village landmark merge failed');
      merged.computeBoundingSphere();
      parent.add(new THREE.Mesh(merged, material));
    }
  }
}

/** Outline of a pointed (equilateral) arch: width w, straight jambs up to hs, apex at hs + 0.87 w. */
function lancetPoints(w: number, hs: number, y0 = 0, seg = 8): THREE.Vector2[] {
  const pts = [new THREE.Vector2(-w / 2, y0), new THREE.Vector2(w / 2, y0)];
  for (let i = 0; i <= seg; i++) { const a = (Math.PI / 3) * (i / seg); pts.push(new THREE.Vector2(-w / 2 + w * Math.cos(a), y0 + hs + w * Math.sin(a))); }
  for (let i = 1; i <= seg; i++) { const a = (2 * Math.PI) / 3 + (Math.PI / 3) * (i / seg); pts.push(new THREE.Vector2(w / 2 + w * Math.cos(a), y0 + hs + w * Math.sin(a))); }
  return pts;
}

/** Flat lancet pane facing +z with UVs spanning 0..1 over its bounds. */
function lancetPane(w: number, hs: number): Geo {
  const g = new THREE.ShapeGeometry(new THREE.Shape(lancetPoints(w, hs)));
  const pos = g.attributes.position, uv = g.attributes.uv, top = hs + w * 0.866;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / top);
  return g;
}

/** Stone surround of a lancet: a ring of width t around it, `depth` deep, facing +z (front at z = depth). */
function lancetFrame(w: number, hs: number, t: number, depth: number): Geo {
  const shape = new THREE.Shape(lancetPoints(w + 2 * t, hs, -t));
  shape.holes.push(new THREE.Path(lancetPoints(w, hs)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** Leaded stained glass in warm colours: small panes between lead lines, a rosette in the arch. */
function stainedGlass(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  const warm = ['#ffcf6a', '#f2a03d', '#e0703a', '#c8402e', '#ffe39a', '#b8463c', '#f7b955', '#7d5ab0', '#3f7fb5'];
  let k = 7;
  const pick = () => { k = (k * 1103515245 + 12345) & 0x7fffffff; return warm[k % (k % 5 === 0 ? warm.length : 7)]; };
  ctx.fillStyle = '#20140c'; ctx.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 10) for (let x = 0; x < 64; x += 8) { ctx.fillStyle = pick(); ctx.fillRect(x + 1, y + 1, 6, 8); }
  // rosette at the top, mullion and transoms in lead
  ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(32, 26, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#20140c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 26, 11, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(32, 26); ctx.lineTo(32 + Math.cos(a) * 11, 26 + Math.sin(a) * 11); ctx.stroke(); }
  ctx.fillRect(30, 40, 4, 88); ctx.fillRect(0, 74, 64, 3); ctx.fillRect(0, 104, 64, 3);
  return texture(c);
}

/** Dial of the tower clock: cream face with Roman numerals; the hands stand at five to midnight. */
function clockFace(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256), cx = 128, cy = 128;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#1c2230'; ctx.beginPath(); ctx.arc(cx, cy, 127, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efe4c4'; ctx.beginPath(); ctx.arc(cx, cy, 116, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.stroke();
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#1e1e1e'; ctx.font = 'bold 24px Georgia, "DejaVu Serif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  numerals.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    ctx.save(); ctx.translate(cx + Math.sin(a) * 100, cy - Math.cos(a) * 100); ctx.rotate(a); ctx.fillText(n, 0, 0); ctx.restore();
  });
  const hand = (turns: number, len: number, width: number) => {
    const a = turns * Math.PI * 2;
    ctx.strokeStyle = '#141414'; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.sin(a) * 12, cy + Math.cos(a) * 12); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke();
  };
  hand((11 + 55 / 60) / 12, 58, 9); // 23:55
  hand(55 / 60, 84, 6);
  ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  return texture(c);
}

/** The café's lit name board: gold serif letters on dark green. */
function cafeSign(name: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 128);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#17392b'; ctx.fillRect(6, 6, 1012, 116);
  ctx.fillStyle = '#ffd772'; ctx.font = 'bold 70px Georgia, "DejaVu Serif", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 512, 68, 960);
  return texture(c);
}

const std = (color: number, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

/**
 * Brick church: nave with lancet windows of lit stained glass between buttresses, a slate roof, and a tower
 * with stone bands, a clock on every side, louvred belfry openings, the old spire and the red beacon.
 */
export function buildChurch(scene: THREE.Object3D, church: ChurchSpec, tw: number): void {
  const bag = new Bag();
  const brick = std(0x8d4b38, 0.92), stone = std(0xcfc3a5, 0.85), plinth = std(0x5e4a40), slate = std(0x464b5c, 0.8);
  const louvre = std(0x15161b), wood = std(0x3a2416, 0.8);
  const glass = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: stainedGlass(), emissiveIntensity: 0.85 });
  const dial = std(0xffffff, 0.6, { map: clockFace(), emissive: 0xffffff, emissiveIntensity: 0.55 });
  dial.emissiveMap = dial.map;
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffd99a });

  const { x: X, z: Z } = church;
  const hw = church.w / 2 - 0.3, hd = church.d / 2 - 0.3, eave = 8, pitch = THREE.MathUtils.degToRad(50);
  const rise = hw * Math.tan(pitch), towerZ = Z - church.d / 2 + tw / 2;

  // nave: plinth, walls, brick gables, slate roof
  bag.box(plinth, hw * 2 + 0.2, 0.9, hd * 2 + 0.2, X, 0, Z);
  bag.box(brick, hw * 2, eave, hd * 2, X, 0, Z);
  const gable = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, rise)]), { depth: hd * 2, bevelEnabled: false });
  bag.add(brick, gable, X, eave, Z - hd);
  const over = 0.3, slab = (hw + over) / Math.cos(pitch) + 0.15, t = 0.25;
  for (const s of [-1, 1]) {
    const cx = s * (hw + over) / 2, cy = eave + (hw - Math.abs(cx)) * Math.tan(pitch) + t / 2 / Math.cos(pitch);
    bag.add(slate, new THREE.BoxGeometry(slab, t, hd * 2 + 0.6), X + cx, cy, Z, 0, -s * pitch);
  }
  bag.box(stone, hw * 2 + 0.3, 0.3, hd * 2 + 0.3, X, eave - 0.3, Z); // eaves cornice

  // long sides: lancet windows between buttresses; a portal with a lantern on the village side (−x)
  const winW = 1.5, winHs = 3.7, winY = 2.3;
  const bays = [-8.8, -3.6, 0.6, 4.8, 9.0].map((dz) => Z + dz).filter((z) => z + winW < Z + hd);
  for (const s of [-1, 1]) {
    const face = X + s * hw, ry = s * Math.PI / 2;
    for (const [i, z] of bays.entries()) {
      const portal = s < 0 && i === 2;
      if (portal) {
        bag.add(wood, lancetPane(1.7, 2.3), face + s * 0.03, 0, z, ry);
        bag.add(stone, lancetFrame(1.7, 2.3, 0.3, 0.25), face, 0, z, ry);
        bag.box(lamp, 0.3, 0.45, 0.3, face + s * 0.35, 4.45, z);
        bag.box(stone, 0.4, 0.08, 0.4, face + s * 0.35, 4.9, z);
        continue;
      }
      bag.add(glass, lancetPane(winW, winHs), face + s * 0.03, winY, z, ry);
      bag.add(stone, lancetFrame(winW, winHs, 0.2, 0.15), face, winY, z, ry);
      bag.box(stone, winW + 0.5, 0.15, 0.3, face + s * 0.1, winY - 0.15, z); // sill
    }
    for (const dz of [-5.6, -1.5, 2.7, 6.9, hd - 0.35]) {
      const z = Z + dz;
      bag.box(brick, 0.3, 5.6, 0.7, face + s * 0.15, 0, z);
      bag.box(brick, 0.18, 1.0, 0.7, face + s * 0.09, 5.6, z);
    }
  }
  // east gable: one tall window
  bag.add(glass, lancetPane(2.2, 5.2), X, 2.4, Z + hd + 0.03);
  bag.add(stone, lancetFrame(2.2, 5.2, 0.25, 0.15), X, 2.4, Z + hd);

  // tower: brick shaft with stone bands, west door, clocks, belfry openings with louvres
  const H = church.towerH, th = tw / 2;
  bag.box(brick, tw, H, tw, X, 0, towerZ);
  bag.box(plinth, tw + 0.2, 0.9, tw + 0.2, X, 0, towerZ);
  for (const y of [eave - 0.3, 17.2, 23.0]) bag.box(stone, tw + 0.3, 0.35, tw + 0.3, X, y, towerZ);
  bag.box(stone, tw + 0.5, 0.6, tw + 0.5, X, H - 0.6, towerZ);
  const west = towerZ - th;
  bag.add(wood, lancetPane(1.8, 2.6), X, 0, west - 0.03, Math.PI);
  bag.add(stone, lancetFrame(1.8, 2.6, 0.35, 0.25), X, 0, west, Math.PI);
  bag.box(lamp, 0.3, 0.45, 0.3, X, 4.9, west - 0.35);
  bag.add(glass, lancetPane(1.0, 2.2), X, 10.5, west - 0.03, Math.PI);
  bag.add(stone, lancetFrame(1.0, 2.2, 0.18, 0.12), X, 10.5, west, Math.PI);
  const clockY = 20.1, r = 1.45;
  for (let side = 0; side < 4; side++) {
    const ry = side * Math.PI / 2, nx = Math.sin(ry), nz = Math.cos(ry);
    const at = (d: number, u: number): [number, number] => [X + nx * (th + d) + nz * u, towerZ + nz * (th + d) - nx * u];
    const ring = new THREE.CylinderGeometry(r + 0.22, r + 0.22, 0.16, 32); ring.rotateX(Math.PI / 2);
    const [rx, rz] = at(0.08, 0); bag.add(stone, ring, rx, clockY, rz, ry);
    const [fx, fz] = at(0.17, 0); bag.add(dial, new THREE.CircleGeometry(r, 32), fx, clockY, fz, ry);
    for (const u of [-1.05, 1.05]) {
      const [ox, oz] = at(0.02, u); bag.add(louvre, lancetPane(0.85, 2.2), ox, 23.8, oz, ry);
      const [px, pz] = at(0, u); bag.add(stone, lancetFrame(0.85, 2.2, 0.16, 0.14), px, 23.8, pz, ry);
      for (let y = 24.1; y < 26.2; y += 0.32) { const [sx, sz] = at(0.08, u); bag.add(stone, new THREE.BoxGeometry(0.85, 0.07, 0.06), sx, y, sz, ry); }
    }
  }
  bag.addTo(scene);

  // the old spire and the red beacon (fog:false so it shows through the mist)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.75, 8, 4), new THREE.MeshStandardMaterial({ color: 0x4a4a52 }));
  spire.position.set(X, H + 4, towerZ); spire.rotation.y = Math.PI / 4;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false }));
  beacon.position.set(X, H + 8.5, towerZ);
  scene.add(spire, beacon);
}

/**
 * Café De Gouden Karper: brick with a stepped gable towards the street, lit windows with white frames,
 * the lit name board, two Kenney awnings and a terrace of three tables with four chairs each.
 */
export function buildCafe(scene: THREE.Object3D, cafe: BuildingSpec, name: string, lib: ModelLibrary, chunk: number): void {
  const bag = new Bag();
  const brick = std(cafe.color, 0.92), white = std(0xe9e4d8, 0.7), roof = std(0x3c3f48, 0.8), wood = std(0x2c3b2f, 0.8);
  const warm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: GLASS_GLOW.warm, emissiveMap: paneGlow() });
  const dark = std(0x2a3a58, 0.15, { metalness: 0.5, emissive: 0x0c1424, envMap: nightSky(), envMapIntensity: 1.5 });
  const sign = new THREE.MeshBasicMaterial({ map: cafeSign(name) });

  const { x: X, z: Z, w, d, h } = cafe;
  const hw = w / 2, front = Z - d / 2, back = Z + d / 2, step = 1.1;
  bag.box(brick, w - 0.1, h, d - 0.1, X, 0, Z);
  bag.box(std(0x4a3a34), w, 0.5, d, X, 0, Z);

  // stepped gable at the front, plain gable at the back, roof ridge running away from the street
  for (let k = 0; k * step < hw - 0.6; k++) {
    const half = hw - (k + 0.5) * step;
    if (half < 0.5) break;
    bag.box(brick, half * 2, step, 0.45, X, h + k * step, front + 0.25);
    bag.box(white, half * 2 + 0.12, 0.12, 0.55, X, h + (k + 1) * step - 0.06, front + 0.25);
  }
  const top = h + Math.ceil((hw - 0.6) / step) * step;
  bag.box(brick, 0.9, 0.7, 0.45, X, top, front + 0.25);
  bag.box(white, 1.02, 0.12, 0.55, X, top + 0.64, front + 0.25);
  const ridge = hw - 0.3;
  const gable = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-hw + 0.05, 0), new THREE.Vector2(hw - 0.05, 0), new THREE.Vector2(0, ridge)]), { depth: d - 0.6, bevelEnabled: false });
  bag.add(brick, gable, X, h, front + 0.45);
  const pitch = Math.atan(ridge / hw), t = 0.22, slab = hw / Math.cos(pitch) + 0.1;
  for (const s of [-1, 1]) {
    const cx = (s * hw) / 2, cy = h + (hw / 2) * (ridge / hw) + t / 2 / Math.cos(pitch);
    bag.add(roof, new THREE.BoxGeometry(slab, t, d - 0.5), X + cx, cy, Z + 0.2, 0, -s * pitch);
  }

  // front: two big windows and a door, white frames with glazing bars; name board above
  const fz = front - 0.02;
  const pane = (mat: THREE.Material, x: number, y0: number, pw: number, ph: number) =>
    bag.add(mat, new THREE.PlaneGeometry(pw, ph), x, y0 + ph / 2, fz, Math.PI);
  const frame = (x: number, y0: number, fw: number, fh: number, cols: number, transom: number | null) => {
    const b = 0.12, fzz = front - 0.06;
    bag.box(white, fw + 2 * b, b, 0.12, x, y0 - b, fzz); bag.box(white, fw + 2 * b, b, 0.12, x, y0 + fh, fzz);
    bag.box(white, b, fh, 0.12, x - fw / 2 - b / 2, y0, fzz); bag.box(white, b, fh, 0.12, x + fw / 2 + b / 2, y0, fzz);
    for (let i = 1; i < cols; i++) bag.box(white, 0.07, fh, 0.08, x - fw / 2 + (fw * i) / cols, y0, fzz);
    if (transom !== null) bag.box(white, fw, 0.08, 0.08, x, y0 + transom, fzz);
  };
  const windows = [-3.4, 0.6];
  for (const dx of windows) { pane(warm, X + dx, 0.8, 3.0, 2.1); frame(X + dx, 0.8, 3.0, 2.1, 3, 1.55); bag.box(white, 3.4, 0.1, 0.3, X + dx, 0.68, front - 0.12); }
  const doorX = X + 4.3;
  pane(wood, doorX, 0, 1.2, 2.3); pane(warm, doorX, 2.4, 1.2, 0.5); frame(doorX, 0, 1.2, 2.9, 1, 2.35);
  pane(sign, X - 0.5, 3.55, 7.8, 0.95);
  // upper floor in the gable: two small windows, one lit
  for (const [dx, mat] of [[-1.6, warm], [1.6, dark]] as const) { pane(mat, X + dx, 5.7, 1.0, 1.3); frame(X + dx, 5.7, 1.0, 1.3, 2, 0.8); }
  // sides: two dark windows each
  for (const s of [-1, 1]) for (const dz of [-1.8, 1.8]) {
    const sx = X + s * (hw + 0.02);
    bag.add(dark, new THREE.PlaneGeometry(1.4, 1.6), sx, 1.8, Z + dz, s * Math.PI / 2);
    bag.box(white, 0.12, 0.12, 1.64, X + s * (hw + 0.04), 0.88, Z + dz);
    bag.box(white, 0.12, 0.12, 1.64, X + s * (hw + 0.04), 2.6, Z + dz);
  }
  bag.addTo(scene);

  // awnings over the windows (poles stand on the terrace), then the terrace in front of them
  const awning = lib.get('prop.awning'), box = new THREE.Box3();
  for (const p of awning) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
  const aw = box.max.x - box.min.x, ad = box.max.z - box.min.z;
  const awnings = windows.map((dx) => { const s = 3.4 / aw; return { x: X + dx, z: front - (ad * s) / 2, s }; });
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  addInstancedModel(scene, awning, awnings, chunk, (a, m) => { m.compose(pos.set(a.x, 0, a.z), q.setFromAxisAngle(up, Math.PI), sc.setScalar(a.s)); return false; });

  const tables = [-4.6, -1.4, 1.8].map((dx) => ({ x: X + dx, z: front - 2.6, yaw: 0 }));
  const chairs = tables.flatMap((tb, i) => [0, 1, 2, 3].map((k) => {
    const a = (k * Math.PI) / 2 + 0.25 + i * 0.2; // chairs face the table, slightly turned
    return { x: tb.x + Math.sin(a) * 0.68, z: tb.z + Math.cos(a) * 0.68, yaw: a + Math.PI };
  }));
  const place = (it: { x: number; z: number; yaw: number }, m: THREE.Matrix4) => {
    m.compose(pos.set(it.x, 0, it.z), q.setFromAxisAngle(up, it.yaw), sc.setScalar(1)); return false;
  };
  addInstancedModel(scene, codeModel('terrace.table'), tables, chunk, place);
  addInstancedModel(scene, codeModel('terrace.chair'), chairs, chunk, place);
}
