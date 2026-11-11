import * as THREE from 'three';
import { CONFIG } from '../config';

/** Canvas textures for the code facades: glass reflection and glow, the far-level atlas and shop signs. */

export type Glass = 'dark' | 'warm' | 'blue';
/** Glow colours of the lit windows (warm living rooms, blue screens). */
export const GLASS_GLOW: Record<Exclude<Glass, 'dark'>, number> = { warm: 0xffd27a, blue: 0x8fb8ff };
const SIGN_COLOURS = [0x38a177, 0xffc044, 0xff7e44, 0xcf534f, 0x6794d9, 0xa878e8];
/** Resolution of the far-level atlas. */
const PX_PER_M = 4;

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Glass reflects a dim night sky: dark above, a warm city glow at the horizon. */
let skyEnv: THREE.Texture | null = null;
export function nightSky(): THREE.Texture {
  if (skyEnv) return skyEnv;
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, '#15182e'); grad.addColorStop(0.35, '#2f3358'); grad.addColorStop(0.48, '#6a6488');
  grad.addColorStop(0.52, '#9a7c70'); grad.addColorStop(0.62, '#3a3644'); grad.addColorStop(1, '#1a1a22');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 32);
  skyEnv = new THREE.CanvasTexture(c);
  skyEnv.mapping = THREE.EquirectangularReflectionMapping;
  skyEnv.colorSpace = THREE.SRGBColorSpace;
  return skyEnv;
}

/** Soft falloff inside a lit pane: brighter ceiling, darker curtain edges. */
let paneTex: THREE.Texture | null = null;
export function paneGlow(): THREE.Texture {
  if (paneTex) return paneTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const ctx = c.getContext('2d')!;
  const v = ctx.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, '#ffffff'); v.addColorStop(1, '#9a9a9a');
  ctx.fillStyle = v; ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, 5, 32); ctx.fillRect(27, 0, 5, 32);
  paneTex = new THREE.CanvasTexture(c);
  paneTex.colorSpace = THREE.SRGBColorSpace;
  return paneTex;
}

/** Shelf-packed canvas atlas; cells are allocated top-left to bottom-right. */
export class Atlas {
  readonly canvas = document.createElement('canvas');
  private rects: { x: number; y: number; w: number; h: number }[] = [];
  private cx = 0; private cy = 0; private row = 0;
  constructor(private width: number) {}
  alloc(w: number, h: number): number {
    w = Math.min(Math.ceil(w), this.width);
    if (this.cx + w > this.width) { this.cx = 0; this.cy += this.row; this.row = 0; }
    this.rects.push({ x: this.cx, y: this.cy, w, h: Math.ceil(h) });
    this.cx += w; this.row = Math.max(this.row, Math.ceil(h));
    return this.rects.length - 1;
  }
  rect(i: number): { x: number; y: number; w: number; h: number } { return this.rects[i]; }
  /** Sizes the canvas (power of two height) and returns its 2D context. */
  finish(): CanvasRenderingContext2D {
    this.canvas.width = this.width;
    this.canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, this.cy + this.row));
    return this.canvas.getContext('2d')!;
  }
  /** UVs of a cell corner order (bottom-left, bottom-right, top-right, top-left); canvas y runs down. */
  uv(i: number, pad = 0): [number, number][] {
    const r = this.rects[i], W = this.canvas.width, H = this.canvas.height;
    const u0 = (r.x + pad) / W, u1 = (r.x + r.w - pad) / W, vTop = 1 - (r.y + pad) / H, vBot = 1 - (r.y + r.h - pad) / H;
    return [[u0, vBot], [u1, vBot], [u1, vTop], [u0, vTop]];
  }
}

/** A pane in wall coordinates: u from the wall centre (−L/2 … L/2), v up from the ground. */
export interface FarPane { u0: number; u1: number; v0: number; v1: number; glass: Glass }
/** One building side of the far level: length L, height H, wall and plinth colour, its panes. */
export interface FarWall { L: number; H: number; wall: number; plinth: number; plinthH: number; panes: FarPane[] }
export interface FarAtlas {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  /** UVs (corner order of Atlas.uv) of each wall, in input order. */
  wallUv: [number, number][][];
  roofUv: [number, number][];
}

/** Paints the far-level window pattern of all walls of a chunk into a colour and a glow atlas. */
export function farAtlas(walls: readonly FarWall[], roofColour: number): FarAtlas {
  const PAD = 2, atlas = new Atlas(1024);
  const cells = walls.map((w) => atlas.alloc(w.L * PX_PER_M + PAD * 2, w.H * PX_PER_M + PAD * 2));
  const roofCell = atlas.alloc(8, 8);
  const ctx = atlas.finish();
  const glow = document.createElement('canvas'); glow.width = atlas.canvas.width; glow.height = atlas.canvas.height;
  const gctx = glow.getContext('2d')!;
  gctx.fillStyle = '#000'; gctx.fillRect(0, 0, glow.width, glow.height);
  const r0 = atlas.rect(roofCell); ctx.fillStyle = hex(roofColour); ctx.fillRect(r0.x, r0.y, r0.w, r0.h);

  walls.forEach((wall, i) => {
    const r = atlas.rect(cells[i]);
    const px = (u: number): number => r.x + PAD + (u + wall.L / 2) * PX_PER_M;
    const py = (v: number): number => r.y + PAD + (wall.H - v) * PX_PER_M;
    ctx.fillStyle = hex(wall.wall); ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hex(wall.plinth); ctx.fillRect(r.x, py(wall.plinthH), r.w, r.y + r.h - py(wall.plinthH));
    for (const p of wall.panes) {
      const x = px(p.u0), y = py(p.v1), w = (p.u1 - p.u0) * PX_PER_M, hh = (p.v1 - p.v0) * PX_PER_M;
      const lit = p.glass === 'dark' ? null : hex(GLASS_GLOW[p.glass]);
      ctx.fillStyle = lit ?? hex(CONFIG.facade.glassDark); ctx.fillRect(x, y, w, hh);
      if (lit) { gctx.fillStyle = lit; gctx.fillRect(x, y, w, hh); }
    }
  });
  const map = new THREE.CanvasTexture(atlas.canvas), emissiveMap = new THREE.CanvasTexture(glow);
  map.colorSpace = emissiveMap.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, emissiveMap, wallUv: cells.map((c) => atlas.uv(c, PAD)), roofUv: atlas.uv(roofCell, 2) };
}

/** Shop signs: one canvas atlas per chunk, drawn on an unlit material so they read as lightboxes. */
export function signTexture(names: string[]): { tex: THREE.CanvasTexture; atlas: Atlas; cells: number[]; aspect: number[] } {
  const atlas = new Atlas(512), cellH = 64, font = 'bold 36px "Trebuchet MS", Arial, sans-serif';
  const measure = document.createElement('canvas').getContext('2d')!; measure.font = font;
  const widths = names.map((n) => Math.min(512, Math.ceil(measure.measureText(n).width) + 40));
  const cells = widths.map((w) => atlas.alloc(w, cellH));
  const ctx = atlas.finish();
  names.forEach((name, i) => {
    const r = atlas.rect(cells[i]);
    const bg = SIGN_COLOURS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % SIGN_COLOURS.length];
    ctx.fillStyle = '#2c2a33'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hex(bg); ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    ctx.fillStyle = bg === 0xffc044 ? '#2c2a33' : '#ffffff'; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 24);
  });
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, atlas, cells, aspect: widths.map((w) => w / cellH) };
}
