import { CONFIG } from '../config';
import type { RoadGraph } from '../world/roadGraph';

export interface TrafficCar {
  id: number; edgeId: string; dir: 1 | -1; lane: number; s: number; speed: number;
  /** Where the car goes after this edge; chosen ahead of time so the lookahead can follow the route. */
  next?: { edgeId: string; dir: 1 | -1; lane: number };
}
export interface PlayerObstacle { x: number; z: number }

const CAR_LEN = 4.5;
const ACCEL = 3;
const BRAKE = 6;
const EMERGENCY_BRAKE = 12;
const SPAWN_MIN_DIST = 60;
const DESPAWN_MARGIN = 50;
const SPAWN_ATTEMPTS = 10;
const MIN_LOOKAHEAD = 80;
const LOOKAHEAD_MARGIN = 20;
/** Half-width of the "player is in my lane" corridor; wide enough for a car that spun sideways. */
const PLAYER_LATERAL = 2.5;
const CORNER_OVERLAP = 3;

/**
 * Position of the player along a lane, measured from the lane's start, if the player is within the lane
 * corridor between `from` and `to` (metres along the lane); otherwise Infinity.
 */
function laneDistance(g: RoadGraph, edgeId: string, dir: 1 | -1, lane: number, player: PlayerObstacle, from: number, to: number): number {
  const p = lanePose({ id: 0, edgeId, dir, lane, s: 0, speed: 0 }, g);
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const dx = player.x - p.x, dz = player.z - p.z;
  const along = dx * fx + dz * fz;
  const lateral = dx * -fz + dz * fx;
  if (along <= from || along > to || Math.abs(lateral) > PLAYER_LATERAL) return Infinity;
  return along;
}

function edgeDir(g: RoadGraph, edgeId: string): { ax: number; az: number; dx: number; dz: number; len: number } {
  const e = g.edge(edgeId);
  const a = g.node(e.from), b = g.node(e.to);
  const len = g.edgeLength(edgeId);
  return { ax: a.x, az: a.z, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, len };
}

export function lanePose(car: TrafficCar, g: RoadGraph): { x: number; z: number; heading: number } {
  const { ax, az, dx, dz, len } = edgeDir(g, car.edgeId);
  const fx = dx * car.dir, fz = dz * car.dir;
  const sx = car.dir === 1 ? ax : ax + dx * len;
  const sz = car.dir === 1 ? az : az + dz * len;
  const off = (car.lane + 0.5) * CONFIG.traffic.laneWidthM;
  // right of forward (fx, fz) with heading 0 = +z (y up): right = (-fz, fx)
  return { x: sx + fx * car.s - fz * off, z: sz + fz * car.s + fx * off, heading: Math.atan2(fx, fz) };
}

export class TrafficManager {
  cars: TrafficCar[] = [];
  private nextId = 1;
  private spawning = true;

  constructor(private g: RoadGraph, private rng: () => number) {}

  static forTest(g: RoadGraph, cars: TrafficCar[], rng: () => number = () => 0.5): TrafficManager {
    const m = new TrafficManager(g, rng);
    m.cars = cars;
    m.spawning = false;
    return m;
  }

  clear(): void { this.cars = []; }

  update(dt: number, player: PlayerObstacle): void {
    const g = this.g;
    // group by lane for leader lookup
    const groups = new Map<string, TrafficCar[]>();
    for (const c of this.cars) {
      const k = `${c.edgeId}|${c.dir}|${c.lane}`;
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push(c);
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.s - b.s);

    for (const arr of groups.values()) {
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        const limit = g.edge(c.edgeId).speedLimitKmh / 3.6;
        let gap = Infinity;
        const leader = arr[i + 1];
        if (leader) gap = leader.s - c.s - CAR_LEN;
        const pg = this.playerGap(c, player, c.speed);
        if (pg < gap) gap = pg;
        let target = limit;
        if (gap < Infinity) {
          const free = Math.max(0, gap - CONFIG.traffic.minGapM);
          // headway keeps distance in queues; the braking curve guarantees we can stop within the gap
          target = Math.min(limit, free / CONFIG.traffic.headwaySec, Math.sqrt(2 * BRAKE * free));
        }
        if (target > c.speed) c.speed = Math.min(target, c.speed + ACCEL * dt);
        else {
          const brake = gap < CONFIG.traffic.minGapM + 2 ? EMERGENCY_BRAKE : BRAKE;
          c.speed = Math.max(target, c.speed - brake * dt, 0);
        }
        c.s += c.speed * dt;
      }
    }

    for (const c of this.cars) this.advanceEdge(c);

    const maxDist = CONFIG.traffic.radiusM + DESPAWN_MARGIN;
    this.cars = this.cars.filter((c) => {
      const p = lanePose(c, g);
      return Math.hypot(p.x - player.x, p.z - player.z) <= maxDist;
    });

    if (this.spawning) this.trySpawn(player);
  }

  /** Distance to the player along the car's route (current edge, then its next edge), or Infinity. */
  private playerGap(c: TrafficCar, player: PlayerObstacle, speed: number): number {
    // look at least as far as our stopping distance, so highway traffic sees a stopped player in time
    const lookahead = Math.max(MIN_LOOKAHEAD, (speed * speed) / (2 * BRAKE) + CONFIG.traffic.minGapM + LOOKAHEAD_MARGIN);
    const remaining = this.g.edgeLength(c.edgeId) - c.s;
    // a little overlap at the node, so a player standing right in a bend is not missed
    const here = laneDistance(this.g, c.edgeId, c.dir, c.lane, player, c.s, c.s + Math.min(lookahead, remaining + CORNER_OVERLAP));
    if (here < Infinity) return here - c.s - CAR_LEN;
    if (remaining >= lookahead) return Infinity;
    const n = this.nextOf(c);
    const there = laneDistance(this.g, n.edgeId, n.dir, n.lane, player, -CORNER_OVERLAP, lookahead - remaining);
    return there < Infinity ? remaining + there - CAR_LEN : Infinity;
  }

  private nextOf(c: TrafficCar): NonNullable<TrafficCar['next']> {
    if (c.next) return c.next;
    const g = this.g;
    const e = g.edge(c.edgeId);
    const nodeId = c.dir === 1 ? e.to : e.from;
    const options = g.edgesAt(nodeId).filter((x) => x.id !== e.id);
    const next = options.length ? options[Math.floor(this.rng() * options.length) % options.length] : e;
    const dir: 1 | -1 = next === e ? (c.dir === 1 ? -1 : 1) : next.from === nodeId ? 1 : -1;
    let lane = Math.min(c.lane, next.lanesPerDir - 1);
    if (next.lanesPerDir > 1 && lane === 0) lane = Math.floor(this.rng() * next.lanesPerDir) % next.lanesPerDir;
    return (c.next = { edgeId: next.id, dir, lane });
  }

  private advanceEdge(c: TrafficCar): void {
    let len = this.g.edgeLength(c.edgeId);
    let guard = 4;
    while (c.s >= len && guard-- > 0) {
      const n = this.nextOf(c);
      c.s -= len;
      c.edgeId = n.edgeId; c.dir = n.dir; c.lane = n.lane;
      c.next = undefined;
      len = this.g.edgeLength(c.edgeId);
    }
  }

  private trySpawn(player: PlayerObstacle): void {
    const g = this.g;
    for (let a = 0; a < SPAWN_ATTEMPTS && this.cars.length < CONFIG.traffic.maxCars; a++) {
      const e = g.edges[Math.floor(this.rng() * g.edges.length) % g.edges.length];
      const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
      const lane = Math.floor(this.rng() * e.lanesPerDir) % e.lanesPerDir;
      const s = this.rng() * g.edgeLength(e.id);
      const car: TrafficCar = { id: this.nextId, edgeId: e.id, dir, lane, s, speed: e.speedLimitKmh / 3.6 };
      const p = lanePose(car, g);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < SPAWN_MIN_DIST || d > CONFIG.traffic.radiusM) continue;
      const clash = this.cars.some((o) => o.edgeId === e.id && o.dir === dir && o.lane === lane && Math.abs(o.s - s) < 20);
      if (clash) continue;
      // never spawn at a speed from which we cannot stop for the player ahead
      const pg = this.playerGap(car, player, car.speed);
      if (pg < Infinity) car.speed = Math.min(car.speed, Math.sqrt(2 * BRAKE * Math.max(0, pg - CONFIG.traffic.minGapM)));
      this.nextId++;
      this.cars.push(car);
    }
  }
}
