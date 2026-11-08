import { CONFIG } from '../config';
import type { Obstacle, TrafficCar } from '../traffic/trafficLogic';
import type { RoadGraph } from '../world/roadGraph';
import type { Crossing } from '../world/types';

export type PedKind = 'jogger' | 'student' | 'oma';
export interface Ped {
  id: number; crossingId: string; kind: PedKind;
  state: 'waiting' | 'crossing' | 'dodging' | 'done';
  /** Progress over the crossing, 0..1. */
  t: number;
  x: number; z: number; heading: number;
  /** A near miss has been counted for this pedestrian. */
  scared: boolean;
}
export interface PedPlayer { x: number; z: number; heading: number; speedMs: number }

interface CrossingGeo { c: Crossing; cx: number; cz: number; /** across the road, unit */ ax: number; az: number; len: number }
interface PedState extends Ped {
  side: 1 | -1;
  dodgeFrom?: { x: number; z: number }; dodgeDir?: { x: number; z: number }; dodgeT?: number;
  doneSec?: number;
}

const REMOVE_AFTER_SEC = 1;
/** Pedestrians at crossings further away than this (beyond the spawn radius) are removed. */
const DESPAWN_MARGIN_M = 30;
const DODGE_MIN_SPEED = 0.5;
const CAR_ON_CROSSING_M = 3;

/** Pedestrians at zebra crossings (spec fase 2 §7). Pure: no three.js, no DOM. */
export class PedestrianManager {
  private list: PedState[] = [];
  private geo = new Map<string, CrossingGeo>();
  private nextId = 1;
  private spawning = true;

  constructor(private g: RoadGraph, private rng: () => number) {
    for (const c of g.crossings) {
      const e = g.edge(c.edgeId);
      const a = g.node(e.from), b = g.node(e.to);
      const len = g.edgeLength(e.id);
      const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
      this.geo.set(c.id, { c, cx: a.x + fx * c.s, cz: a.z + fz * c.s, ax: -fz, az: fx, len: 2 * e.lanesPerDir * CONFIG.traffic.laneWidthM + 2 });
    }
  }

  static forTest(g: RoadGraph, peds: Ped[], rng: () => number = () => 0.5): PedestrianManager {
    const m = new PedestrianManager(g, rng);
    m.spawning = false;
    for (const p of peds) { const s: PedState = { ...p, side: 1 }; m.place(s); m.list.push(s); m.nextId = Math.max(m.nextId, p.id + 1); }
    return m;
  }

  get peds(): readonly Ped[] { return this.list; }

  reset(): void { this.list = []; }

  /** Crossings with someone on the road: traffic stops for these (both directions). */
  obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const p of this.list)
      if (p.state === 'crossing' || p.state === 'dodging') {
        const { c } = this.geo.get(p.crossingId)!;
        if (!out.some((o) => o.edgeId === c.edgeId && o.s === c.s)) out.push({ edgeId: c.edgeId, s: c.s });
      }
    return out;
  }

  update(dt: number, player: PedPlayer, cars: readonly TrafficCar[]): { nearMisses: PedKind[] } {
    const P = CONFIG.peds;
    const nearMisses: PedKind[] = [];
    for (const p of this.list) {
      const geo = this.geo.get(p.crossingId)!;
      if (p.state === 'waiting' && !this.carComing(geo, cars)) p.state = 'crossing';
      if (p.state === 'crossing') {
        p.t = Math.min(1, p.t + (P.speeds[p.kind] * dt) / geo.len);
        this.place(p);
        if (p.t >= 1) { p.state = 'done'; p.doneSec = 0; }
      }
      if ((p.state === 'waiting' || p.state === 'crossing') && this.wouldBeHit(p, player)) this.startDodge(p, geo);
      if (p.state === 'dodging') {
        p.dodgeT = Math.min(1, p.dodgeT! + dt / P.dodgeSec);
        p.x = p.dodgeFrom!.x + p.dodgeDir!.x * P.dodgeDistM * p.dodgeT;
        p.z = p.dodgeFrom!.z + p.dodgeDir!.z * P.dodgeDistM * p.dodgeT;
        if (p.dodgeT >= 1) { p.state = 'done'; p.doneSec = 0; }
      } else if (p.state === 'done') p.doneSec! += dt;
      if (!p.scared && Math.hypot(p.x - player.x, p.z - player.z) < P.nearMissM) { p.scared = true; nearMisses.push(p.kind); }
    }
    this.list = this.list.filter((p) => {
      if (p.state === 'done' && p.doneSec! >= REMOVE_AFTER_SEC) return false;
      const geo = this.geo.get(p.crossingId)!;
      return Math.hypot(geo.cx - player.x, geo.cz - player.z) <= P.radiusM + DESPAWN_MARGIN_M;
    });
    if (this.spawning) this.spawn(dt, player);
    return { nearMisses };
  }

  /** A traffic car within 25 m driving towards the crossing (on its edge, or about to turn onto it). */
  private carComing(geo: CrossingGeo, cars: readonly TrafficCar[]): boolean {
    const g = this.g;
    const edgeLen = g.edgeLength(geo.c.edgeId);
    const along = (dir: 1 | -1) => (dir === 1 ? geo.c.s : edgeLen - geo.c.s);
    for (const car of cars) {
      let d = Infinity;
      if (car.edgeId === geo.c.edgeId) d = along(car.dir) - car.s;
      else if (car.next?.edgeId === geo.c.edgeId) d = g.edgeLength(car.edgeId) - car.s + along(car.next.dir);
      if (d >= -CAR_ON_CROSSING_M && d <= CONFIG.peds.carClearM) return true;
    }
    return false;
  }

  /** The player would pass within 1.5 m of the pedestrian within the next second. */
  private wouldBeHit(p: PedState, player: PedPlayer): boolean {
    if (Math.abs(player.speedMs) < DODGE_MIN_SPEED) return false;
    const vx = Math.sin(player.heading) * player.speedMs, vz = Math.cos(player.heading) * player.speedMs;
    const dx = p.x - player.x, dz = p.z - player.z;
    const tca = (dx * vx + dz * vz) / (vx * vx + vz * vz);
    if (tca < 0 || tca > CONFIG.peds.dodgeTtcSec) return false;
    return Math.hypot(dx - vx * tca, dz - vz * tca) <= CONFIG.peds.dodgeLateralM;
  }

  /** Jump towards the nearest kerb (along the crossing). */
  private startDodge(p: PedState, geo: CrossingGeo): void {
    const towardsStart = p.t < 0.5 ? -1 : 1;
    const s = p.side * towardsStart;
    p.state = 'dodging';
    p.dodgeT = 0;
    p.dodgeFrom = { x: p.x, z: p.z };
    p.dodgeDir = { x: geo.ax * s, z: geo.az * s };
    p.heading = Math.atan2(p.dodgeDir.x, p.dodgeDir.z);
  }

  private place(p: PedState): void {
    const geo = this.geo.get(p.crossingId)!;
    const k = (p.t - 0.5) * geo.len * p.side;
    p.x = geo.cx + geo.ax * k;
    p.z = geo.cz + geo.az * k;
    p.heading = Math.atan2(geo.ax * p.side, geo.az * p.side);
  }

  private spawn(dt: number, player: PedPlayer): void {
    const P = CONFIG.peds;
    for (const geo of this.geo.values()) {
      if (this.list.length >= P.max) return;
      if (Math.hypot(geo.cx - player.x, geo.cz - player.z) > P.radiusM) continue;
      if (this.list.some((p) => p.crossingId === geo.c.id)) continue;
      if (this.rng() >= P.spawnPerSec * dt) continue;
      const r = this.rng();
      const kind: PedKind = r < P.mix.jogger ? 'jogger' : r < P.mix.jogger + P.mix.student ? 'student' : 'oma';
      const p: PedState = { id: this.nextId++, crossingId: geo.c.id, kind, state: 'waiting', t: 0, x: 0, z: 0, heading: 0, scared: false, side: this.rng() < 0.5 ? 1 : -1 };
      this.place(p);
      this.list.push(p);
    }
  }
}
