import * as THREE from 'three';
import { CONFIG } from '../config';
import { codeModel } from '../models/codeModels';
import type { ModelLibrary, ModelParts } from '../models/modelLibrary';
import { groupByChunk } from './chunking';
import { SIDES, sideLength, sideNormal, type FacadeLayout, type FacadeType, type RoofRole, type Side } from './facadeLayout';
import { farAtlas, GLASS_GLOW, nightSky, paneGlow, signTexture, type FarWall, type Glass } from './facadeTextures';
import { addInstancedModel } from './instancedChunks';
import type { BuildingSpec } from './types';

const F = CONFIG.facade;
type V3 = [number, number, number];
/** One big instanced group per LOD: everything already sits in one chunk. */
const ONE_CHUNK = Infinity; // x / Infinity is ±0 for every item, so all land in key "0,0"

/** Per type: window band within a floor (sill, top), trim and plinth colours. */
const STYLE: Record<FacadeType, { sill: number; top: number; trim: number; plinth: (wall: number) => number }> = {
  kantoor: { sill: 0.7, top: 2.7, trim: 0xdcdce9, plinth: (w) => mix(w, 0x2c2a33, 0.4) },
  baksteen: { sill: 0.8, top: 2.6, trim: 0xfde4c7, plinth: (w) => mix(w, 0x2c2a33, 0.35) },
  flat: { sill: 0.5, top: 2.6, trim: 0xf7f7fa, plinth: () => 0x666b80 },
};
const ROOF_COLOUR = 0x4f5260, SHOP_H = { v0: 0.4, v1: 3.0, door: 2.6 };

/** Deterministic 0..1 from a position and a counter (no rng state needed in the geometry). */
function hash01(x: number, z: number, k: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/** Collects flat-shaded triangles (position, normal, optional colour and uv) for one merged mesh. */
class Mesher {
  readonly pos: number[] = []; readonly nrm: number[] = []; readonly col: number[] = []; readonly uv: number[] = [];
  private c = new THREE.Color();
  color(hex: number): this { this.c.setHex(hex); return this; }
  /** Quad p0..p3 in order around its edge; the winding is fixed so it faces `n`. */
  quad(p: V3[], n: V3, uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]): void {
    const [a, b, c] = p;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
    for (const i of dot >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      this.pos.push(...p[i]); this.nrm.push(...n); this.col.push(this.c.r, this.c.g, this.c.b); this.uv.push(...uv[i]);
    }
  }
  /** Axis-aligned box; `skip` leaves out the face with that normal (the side against a wall). */
  box(min: V3, max: V3, skip?: V3): void {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const faces: [V3, V3[]][] = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]],
    ];
    for (const [n, p] of faces) if (!skip || n[0] !== skip[0] || n[1] !== skip[1] || n[2] !== skip[2]) this.quad(p, n);
  }
  mesh(material: THREE.Material, attrs: { color?: boolean; uv?: boolean }): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (attrs.color) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (attrs.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

/** One building side in facade coordinates: u along the wall (right as seen from outside), v up, k outward. */
class Face {
  readonly n: V3; readonly t: V3; readonly half: number; readonly L: number; readonly skip: V3;
  constructor(private cx: number, private cz: number, b: BuildingSpec, readonly side: Side) {
    const n = sideNormal(side);
    this.n = [n.x, 0, n.z]; this.t = [n.z, 0, -n.x]; this.skip = [-n.x, 0, -n.z];
    this.half = side < 2 ? b.w / 2 : b.d / 2; this.L = sideLength(b, side);
  }
  /** Sides 0/1 wrap around the corners, sides 2/3 stop at them, so ledges never overlap. */
  get wraps(): boolean { return this.side < 2; }
  at(u: number, v: number, k: number): V3 {
    return [this.cx + this.n[0] * (this.half + k) + this.t[0] * u, v, this.cz + this.n[2] * (this.half + k) + this.t[2] * u];
  }
  quad(m: Mesher, u0: number, u1: number, v0: number, v1: number, k: number, uv?: [number, number][]): void {
    m.quad([this.at(u0, v0, k), this.at(u1, v0, k), this.at(u1, v1, k), this.at(u0, v1, k)], this.n, uv);
  }
  box(m: Mesher, u0: number, u1: number, v0: number, v1: number, k0: number, k1: number): void {
    const a = this.at(u0, v0, k0), b = this.at(u1, v1, k1);
    m.box([Math.min(a[0], b[0]), v0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), v1, Math.max(a[2], b[2])], this.skip);
  }
  /** A ledge along the whole side, `out` metres deep, wrapping the corners on sides 0/1. */
  ledge(m: Mesher, v0: number, v1: number, out: number, k0 = 0): void {
    const e = this.wraps ? out : 0;
    this.box(m, -this.L / 2 - e, this.L / 2 + e, v0, v1, k0, out);
  }
}

interface Hole { u0: number; u1: number; v0: number; v1: number; panes: { u0: number; u1: number; glass: Glass }[]; mullions: number[]; sill: boolean }
interface Meshers { wall: Mesher; trim: Mesher; dark: Mesher; warm: Mesher; blue: Mesher; sign: Mesher }

/** Left edge of each window column on a wall of length L; leftover space goes to both ends. */
function columnStarts(L: number, cols: number): number[] {
  const m = (L - (cols * F.windowW + (cols - 1) * F.windowGap)) / 2;
  return Array.from({ length: cols }, (_, i) => -L / 2 + m + i * (F.windowW + F.windowGap));
}

/** Shop-window segments of a plinth side: [u0, u1] each, about 3 m wide with 0.4 m piers. */
function shopSegments(L: number): [number, number][] {
  const inner = L - 1.2, pier = 0.4;
  const n = Math.max(1, Math.round((inner + pier) / 3.4));
  const w = (inner - (n - 1) * pier) / n;
  return Array.from({ length: n }, (_, i) => [-inner / 2 + i * (w + pier), -inner / 2 + i * (w + pier) + w]);
}

function holesFor(f: Face, b: BuildingSpec, l: FacadeLayout, P: number): Hole[] {
  // shops with an awning are open (lit); others keep some lights on
  const holes: Hole[] = [];
  const st = STYLE[l.type];
  const plinth = l.plinth.find((p) => p.side === f.side);
  if (plinth && P >= SHOP_H.v1 + 0.5) {
    const segs = shopSegments(f.L), door = Math.floor(segs.length / 2);
    segs.forEach(([u0, u1], i) => {
      const v0 = i === door && segs.length > 1 ? 0 : SHOP_H.v0, v1 = i === door && segs.length > 1 ? SHOP_H.door : SHOP_H.v1;
      const lit = plinth.awning || hash01(b.x, b.z, f.side * 31 + i) < F.plinthLitShare;
      holes.push({ u0, u1, v0, v1, panes: [{ u0, u1, glass: lit ? 'warm' : 'dark' }], mullions: [], sill: false });
    });
  }
  const cols = l.columns[f.side];
  if (!cols) return holes;
  const starts = columnStarts(f.L, cols);
  const glassOf = new Map(l.windows.filter((w) => w.side === f.side).map((w) => [`${w.floor}:${w.col}`, (w.lit ? (w.warm ? 'warm' : 'blue') : 'dark') as Glass]));
  for (let j = 0; j < l.floors; j++) {
    const v0 = P + j * F.floorH + st.sill, v1 = P + j * F.floorH + st.top;
    const glass = (c: number): Glass => glassOf.get(`${j}:${c}`) ?? 'dark';
    if (l.type === 'kantoor') {
      // one continuous strip per floor; one pane per column, mullions halfway between columns
      const u0 = starts[0], u1 = starts[cols - 1] + F.windowW;
      const bounds = starts.slice(1).map((s) => s - F.windowGap / 2);
      const edges = [u0, ...bounds, u1];
      holes.push({ u0, u1, v0, v1, mullions: bounds, sill: false,
        panes: starts.map((_, c) => ({ u0: edges[c], u1: edges[c + 1], glass: glass(c) })) });
    } else {
      for (let c = 0; c < cols; c++) {
        const u0 = starts[c], u1 = u0 + F.windowW;
        holes.push({ u0, u1, v0, v1, panes: [{ u0, u1, glass: glass(c) }], mullions: l.type === 'baksteen' ? [(u0 + u1) / 2] : [], sill: l.type === 'baksteen' });
      }
    }
  }
  return holes;
}

/** Wall face of one side with rectangular openings, cut into horizontal bands. */
function wallWithHoles(m: Mesher, f: Face, H: number, P: number, holes: Hole[], wall: number, plinth: number): void {
  const breaks = [...new Set([0, P, H, ...holes.flatMap((h) => [h.v0, h.v1])])].filter((v) => v >= 0 && v <= H).sort((a, b) => a - b);
  for (let i = 0; i < breaks.length - 1; i++) {
    const va = breaks[i], vb = breaks[i + 1];
    if (vb - va < 1e-6) continue;
    m.color(vb <= P + 1e-6 ? plinth : wall);
    const cover = holes.filter((h) => h.v0 <= va + 1e-6 && h.v1 >= vb - 1e-6).sort((a, b) => a.u0 - b.u0);
    let u = -f.L / 2;
    for (const h of cover) { if (h.u0 > u) f.quad(m, u, h.u0, va, vb, 0); u = Math.max(u, h.u1); }
    if (u < f.L / 2) f.quad(m, u, f.L / 2, va, vb, 0);
  }
}

function openings(ms: Meshers, f: Face, holes: Hole[], trim: number, type: FacadeType): void {
  const r = F.recessM, [tx, , tz] = f.t;
  ms.trim.color(trim);
  for (const h of holes) {
    const { u0, u1, v0, v1 } = h;
    // reveals in the trim colour read as window frames
    ms.trim.quad([f.at(u0, v0, 0), f.at(u0, v0, -r), f.at(u0, v1, -r), f.at(u0, v1, 0)], [tx, 0, tz]);
    ms.trim.quad([f.at(u1, v0, 0), f.at(u1, v0, -r), f.at(u1, v1, -r), f.at(u1, v1, 0)], [-tx, 0, -tz]);
    ms.trim.quad([f.at(u0, v0, 0), f.at(u1, v0, 0), f.at(u1, v0, -r), f.at(u0, v0, -r)], [0, 1, 0]);
    ms.trim.quad([f.at(u0, v1, 0), f.at(u1, v1, 0), f.at(u1, v1, -r), f.at(u0, v1, -r)], [0, -1, 0]);
    for (const p of h.panes) f.quad(ms[p.glass], p.u0, p.u1, v0, v1, -r);
    for (const u of h.mullions) f.box(ms.trim, u - 0.06, u + 0.06, v0, v1, -r, -r + (type === 'kantoor' ? r : 0.06));
    if (h.sill) {
      f.box(ms.trim, u0 - 0.12, u1 + 0.12, v0 - 0.08, v0 + 0.02, -r + 0.01, 0.15);
      f.box(ms.trim, u0 - 0.12, u1 + 0.12, v1, v1 + 0.2, 0, 0.06);
    }
  }
}

/** Roof surface and the 0.5 m roof edge (protruding 0.1 m). */
function roofAndEdge(ms: Meshers, b: BuildingSpec, cx: number, cz: number, trim: number): void {
  const H = b.h, x0 = cx - b.w / 2, x1 = cx + b.w / 2, z0 = cz - b.d / 2, z1 = cz + b.d / 2;
  ms.wall.color(ROOF_COLOUR).quad([[x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1]], [0, 1, 0]);
  const t = 0.3, o = 0.1, top = H + 0.5;
  ms.trim.color(trim);
  ms.trim.box([x1 - t, H, z0 - o], [x1 + o, top, z1 + o]);
  ms.trim.box([x0 - o, H, z0 - o], [x0 + t, top, z1 + o]);
  ms.trim.box([x0 + t, H, z1 - t], [x1 - t, top, z1 + o]);
  ms.trim.box([x0 + t, H, z0 - o], [x1 - t, top, z0 + t]);
}

function buildingNear(ms: Meshers, b: BuildingSpec, l: FacadeLayout, cx: number, cz: number): void {
  const st = STYLE[l.type], H = b.h, P = Math.min(F.plinthH, H);
  const plinthColour = st.plinth(l.wall);
  for (const side of SIDES) {
    const f = new Face(cx, cz, b, side);
    const holes = holesFor(f, b, l, P);
    wallWithHoles(ms.wall, f, H, P, holes, l.wall, plinthColour);
    openings(ms, f, holes, st.trim, l.type);
    ms.trim.color(st.trim);
    if (l.type !== 'flat' && H > P + 0.4) f.ledge(ms.trim, P - 0.05, P + 0.2, 0.2);
    for (let j = 0; j < l.floors; j++) {
      const v = P + j * F.floorH;
      if (l.type === 'kantoor' && j > 0) f.ledge(ms.trim, v - 0.1, v + 0.12, 0.12);
      if (l.type === 'flat') {
        f.ledge(ms.trim, v, v + 0.2, 1.2);
        const e = f.wraps ? 1.2 : 1.1;
        f.box(ms.trim, -f.L / 2 - e, f.L / 2 + e, v + 0.2, v + 1.2, 1.1, 1.2);
      }
    }
    if (l.type === 'baksteen' && H > P + 1) f.ledge(ms.trim, H - 0.5, H - 0.2, 0.2);
  }
  roofAndEdge(ms, b, cx, cz, st.trim);
}

let materials: Record<'wall' | 'trim' | 'dark' | 'warm' | 'blue', THREE.Material> | null = null;
function facadeMaterials(): NonNullable<typeof materials> {
  materials ??= {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: F.glassDark, roughness: 0.15, metalness: 0.5, emissive: F.glassDarkEmissive, envMap: nightSky(), envMapIntensity: 1.5 }),
    warm: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: GLASS_GLOW.warm, emissiveMap: paneGlow() }),
    blue: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: GLASS_GLOW.blue, emissiveMap: paneGlow() }),
  };
  return materials;
}

/** Far level: one box per building, its window pattern painted into a colour and a glow atlas. */
function buildFar(specs: BuildingSpec[], layouts: FacadeLayout[], ox: number, oz: number): THREE.Mesh | null {
  const faces = specs.map((b) => SIDES.map((side) => new Face(b.x - ox, b.z - oz, b, side)));
  const walls: FarWall[] = specs.flatMap((b, i) => {
    const l = layouts[i], P = Math.min(F.plinthH, b.h), plinth = STYLE[l.type].plinth(l.wall);
    return faces[i].map((f) => ({
      L: f.L, H: b.h, wall: l.wall, plinth, plinthH: P,
      panes: holesFor(f, b, l, P).flatMap((h) => h.panes.map((p) => ({ u0: p.u0, u1: p.u1, v0: h.v0, v1: h.v1, glass: p.glass }))),
    }));
  });
  const atlas = farAtlas(walls, ROOF_COLOUR);
  const m = new Mesher();
  specs.forEach((b, i) => {
    faces[i].forEach((f, side) => f.quad(m, -f.L / 2, f.L / 2, 0, b.h, 0, atlas.wallUv[i * SIDES.length + side]));
    const x0 = b.x - ox - b.w / 2, x1 = b.x - ox + b.w / 2, z0 = b.z - oz - b.d / 2, z1 = b.z - oz + b.d / 2;
    m.quad([[x0, b.h, z0], [x1, b.h, z0], [x1, b.h, z1], [x0, b.h, z1]], [0, 1, 0], atlas.roofUv);
  });
  return m.mesh(new THREE.MeshStandardMaterial({
    map: atlas.map, emissiveMap: atlas.emissiveMap, emissive: 0xffffff, emissiveIntensity: F.farEmissiveIntensity, roughness: 0.9,
  }), { uv: true });
}

function bboxSize(parts: ModelParts): THREE.Vector3 {
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
  return box.getSize(new THREE.Vector3());
}

type Placed = { x: number; z: number; y: number; yaw: number; s: number; color: number };
function instance(group: THREE.Object3D, parts: ModelParts, items: Placed[], tint: boolean): void {
  if (!items.length) return;
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  addInstancedModel(group, parts, items, ONE_CHUNK, (it, m, c) => {
    m.compose(pos.set(it.x, it.y, it.z), q.setFromAxisAngle(up, it.yaw), sc.setScalar(it.s));
    c.setHex(it.color);
    return tint;
  });
}

/** Near level of a chunk: merged walls, trim, three kinds of glass, signs, awnings and roof parts. */
function buildNear(specs: BuildingSpec[], layouts: FacadeLayout[], ox: number, oz: number, lib: ModelLibrary): THREE.Group {
  const group = new THREE.Group();
  const ms: Meshers = { wall: new Mesher(), trim: new Mesher(), dark: new Mesher(), warm: new Mesher(), blue: new Mesher(), sign: new Mesher() };
  const awningParts = lib.get('prop.awning'), awningW = bboxSize(awningParts).x, awningD = bboxSize(awningParts).z;
  const awnings: Placed[] = [], roof: Record<RoofRole, Placed[]> = { 'roof.ac': [], 'roof.tank': [], 'roof.lift': [] };
  const shopsHere = [...new Set(layouts.flatMap((l) => l.plinth.map((p) => p.shop)).filter((s): s is string => !!s))];
  const signs = shopsHere.length ? signTexture(shopsHere) : null;

  specs.forEach((b, i) => {
    const l = layouts[i], cx = b.x - ox, cz = b.z - oz;
    buildingNear(ms, b, l, cx, cz);
    for (const p of l.plinth) {
      if (!p.awning || b.h < F.plinthH) continue;
      const f = new Face(cx, cz, b, p.side), yaw = Math.atan2(f.n[0], f.n[2]);
      for (const [u0, u1] of shopSegments(f.L)) {
        const s = ((u1 - u0) * 0.95) / awningW, [x, , z] = f.at((u0 + u1) / 2, 0, (awningD * s) / 2);
        awnings.push({ x, z, y: 0, yaw, s, color: 0xffffff });
      }
      if (p.shop && signs) {
        const k = shopsHere.indexOf(p.shop), h = F.signH, w = Math.min(signs.aspect[k] * h, f.L - 1), hh = Math.min(h, w / signs.aspect[k]);
        const v0 = 3.55 - hh / 2;
        f.quad(ms.sign, -w / 2, w / 2, v0, v0 + hh, 0.06, signs.atlas.uv(signs.cells[k], 1));
      }
    }
    for (const r of l.roof) roof[r.role].push({ x: cx + r.dx, z: cz + r.dz, y: b.h, yaw: 0, s: 1, color: l.wall });
  });

  const mat = facadeMaterials();
  const meshes = [
    ms.wall.mesh(mat.wall, { color: true }), ms.trim.mesh(mat.trim, { color: true }),
    ms.dark.mesh(mat.dark, {}), ms.warm.mesh(mat.warm, { uv: true }), ms.blue.mesh(mat.blue, { uv: true }),
    signs ? ms.sign.mesh(new THREE.MeshBasicMaterial({ map: signs.tex }), { uv: true }) : null,
  ];
  for (const mesh of meshes) if (mesh) group.add(mesh);
  instance(group, awningParts, awnings, false);
  for (const role of Object.keys(roof) as RoofRole[]) instance(group, codeModel(role), roof[role], role === 'roof.lift');
  return group;
}

/**
 * Facades built in code: per LOD cell (`facade.lodCellM`, one city block) a THREE.LOD with a detailed near
 * level (recessed windows, ledges, awnings, signs and roof parts) and a far level (flat boxes with a painted
 * window atlas). The LOD measures from the middle of its cell, so the cell must be small next to `lodNearM`.
 */
export function buildFacades(scene: THREE.Object3D, specs: readonly BuildingSpec[], layouts: readonly FacadeLayout[], lib: ModelLibrary): void {
  const indexed = specs.map((b, i) => ({ x: b.x, z: b.z, i }));
  for (const list of groupByChunk(indexed, F.lodCellM).values()) {
    const bs = list.map((e) => specs[e.i]), ls = list.map((e) => layouts[e.i]);
    const ox = Math.round(bs.reduce((a, b) => a + b.x, 0) / bs.length), oz = Math.round(bs.reduce((a, b) => a + b.z, 0) / bs.length);
    const lod = new THREE.LOD();
    lod.position.set(ox, 0, oz);
    lod.addLevel(buildNear(bs, ls, ox, oz, lib), 0);
    const far = buildFar(bs, ls, ox, oz);
    if (far) lod.addLevel(far, F.lodNearM);
    scene.add(lod);
  }
}
