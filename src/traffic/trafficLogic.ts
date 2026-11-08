import { CONFIG } from '../config';
import type { RoadGraph } from '../world/roadGraph';
import { IntersectionManager } from './intersections';
import { CAR_LEN, LaneIndex, occupiedLanes } from './lanes';
import { chooseNext, endNode, isRingEdge, isRingNode, maybeChangeLane, type NextHop } from './routing';

export interface TrafficCar {
  id: number; edgeId: string; dir: 1 | -1; lane: number; s: number; speed: number;
  /** Where the car goes after this edge; chosen ahead of time so the lookahead can follow the route. */
  next?: { edgeId: string; dir: 1 | -1; lane: number };
  /** Lane change in progress: the lane the car comes from and how far along the change is (0..1). */
  laneFrom?: number; laneT?: number;
  /** The intersection the car is on: from passing its stop line until 8 m past the node. */
  insideNode?: string;
  /** Seconds the car has been standing still because the player is in front of it. */
  blockedByPlayerSec?: number;
  /** Seconds until this car may honk again. */
  hornCooldown?: number;
}
export interface PlayerObstacle { x: number; z: number }
/** A zebra crossing with a pedestrian on it; blocks both directions of the edge at `s` (from the edge's `from` node). */
export interface Obstacle { edgeId: string; s: number }

const ACCEL = 3;
const BRAKE = 6;
const EMERGENCY_BRAKE = 12;
const SPAWN_MIN_DIST = 60;
const SPAWN_CLEAR_M = 20;
const SPAWN_EDGE_START_M = 10;
const SPAWN_EDGE_END_M = 20;
const DESPAWN_MARGIN = 50;
const SPAWN_ATTEMPTS = 10;
const MIN_LOOKAHEAD = 80;
const LOOKAHEAD_MARGIN = 20;
/** Half-width of the "player is in my lane" corridor; wide enough for a car that spun sideways. */
const PLAYER_LATERAL = 2.5;
const CORNER_OVERLAP = 3;
/** Cars stop with their centre this far before a stop line. */
const STOP_LINE_MARGIN = 0.5;
/** A merge stop line sits this far before the ring node (within the spec's 5 m merge zone). */
const MERGE_LINE_M = 1;
/** Cars stop this far before the centre of a zebra crossing with a pedestrian on it. */
const CROSSING_STOP_M = 3.5;
/** Below this speed a car counts as "standing still" for the horn. */
const HORN_STILL_MS = 1;

type StopLine = { nodeId: string; stopS: number; kind: 'intersection' | 'merge' };

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

/** Sideways lane position: slides from `laneFrom` to `lane` during a lane change. */
export function laneOffset(car: TrafficCar): number {
  const t = car.laneT ?? 1;
  return car.laneFrom !== undefined && t < 1 ? car.laneFrom + (car.lane - car.laneFrom) * t : car.lane;
}

export function lanePose(car: TrafficCar, g: RoadGraph): { x: number; z: number; heading: number } {
  const { ax, az, dx, dz, len } = edgeDir(g, car.edgeId);
  const fx = dx * car.dir, fz = dz * car.dir;
  const sx = car.dir === 1 ? ax : ax + dx * len;
  const sz = car.dir === 1 ? az : az + dz * len;
  const off = (laneOffset(car) + 0.5) * CONFIG.traffic.laneWidthM;
  // right of forward (fx, fz) with heading 0 = +z (y up): right = (-fz, fx)
  return { x: sx + fx * car.s - fz * off, z: sz + fz * car.s + fx * off, heading: Math.atan2(fx, fz) };
}

/** Gap to keep so that the speed rule stops a car's centre `margin` before position `atS`. */
const stopGap = (atS: number, s: number, margin: number) => atS - margin - s + CONFIG.traffic.minGapM;

export class TrafficManager {
  cars: TrafficCar[] = [];
  readonly intersections: IntersectionManager;
  private nextId = 1;
  private spawning = true;
  private clock = 0;
  private horns = 0;
  /** Cars inside an intersection that have already moved past its node onto their next edge. */
  private pastNode = new Set<number>();
  private stopLines = new Map<string, StopLine | null>();

  constructor(private g: RoadGraph, private rng: () => number) {
    this.intersections = new IntersectionManager(g);
  }

  static forTest(g: RoadGraph, cars: TrafficCar[], rng: () => number = () => 0.5): TrafficManager {
    const m = new TrafficManager(g, rng);
    m.cars = cars;
    m.spawning = false;
    return m;
  }

  clear(): void { this.cars = []; this.intersections.reset(); this.pastNode.clear(); this.horns = 0; }

  /** Number of horns since the previous call. */
  takeHorns(): number { const n = this.horns; this.horns = 0; return n; }

  update(dt: number, player: PlayerObstacle, timeSec: number = this.clock, obstacles: readonly Obstacle[] = []): void {
    const g = this.g;
    this.clock = timeSec + dt;
    const idx = new LaneIndex(this.cars);

    for (const c of this.cars) {
      const limit = g.edge(c.edgeId).speedLimitKmh / 3.6;
      const len = g.edgeLength(c.edgeId);
      const remaining = len - c.s;
      const lookahead = this.lookahead(c.speed);
      let gap = Infinity;
      const consider = (v: number) => { if (v < gap) gap = v; };

      // leader on our own lane(s), then the first car on the lane of our next edge
      for (const lane of occupiedLanes(c)) {
        const leader = idx.leaderOnLane(c.edgeId, c.dir, lane, c.s, c.id);
        if (leader) consider(leader.s - c.s - CAR_LEN);
      }
      let n: NextHop | null = null;
      if (remaining < lookahead) {
        n = this.nextOf(c);
        const ahead = idx.leaderOnLane(n.edgeId, n.dir, n.lane, -Infinity, c.id);
        if (ahead) consider(remaining + ahead.s - CAR_LEN);
        consider(this.turningLeaderGap(c, n, remaining));
      }

      const pg = this.playerGap(c, player, c.speed);
      consider(pg);

      // stop line: intersection right of way or merging onto the ring
      const line = this.stopLine(c);
      let allowed = true;
      if (line && c.s < line.stopS && line.stopS - c.s <= lookahead) {
        const toLine = line.stopS - c.s;
        if (line.kind === 'intersection') {
          const canStop = (c.speed * c.speed) / (2 * CONFIG.signals.orangeBrake) <= toLine;
          allowed = this.intersections.mayEnter(c.id, line.nodeId, { edgeId: c.edgeId, dir: c.dir }, timeSec, canStop);
        } else allowed = this.mergeFree(c, idx);
        if (!allowed) consider(stopGap(line.stopS, c.s, STOP_LINE_MARGIN));
      }

      // zebra crossings with a pedestrian, on this edge and (when close) the next one
      for (const ob of obstacles) {
        if (ob.edgeId === c.edgeId) {
          const at = (c.dir === 1 ? ob.s : len - ob.s) - CROSSING_STOP_M;
          if (at > c.s) consider(stopGap(at, c.s, STOP_LINE_MARGIN));
        } else if (n && ob.edgeId === n.edgeId) {
          const at = remaining + (n.dir === 1 ? ob.s : g.edgeLength(n.edgeId) - ob.s) - CROSSING_STOP_M;
          if (at > 0) consider(stopGap(c.s + at, c.s, STOP_LINE_MARGIN));
        }
      }

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
      const before = c.s;
      c.s += c.speed * dt;

      if (line) {
        // never pass a stop line without right of way
        if (!allowed && c.s >= line.stopS && before < line.stopS) { c.s = line.stopS - 0.01; c.speed = 0; }
        if (line.kind === 'intersection' && c.s >= line.stopS && c.insideNode !== line.nodeId) {
          this.intersections.enter(c.id, line.nodeId, { edgeId: c.edgeId, dir: c.dir });
          c.insideNode = line.nodeId;
          this.pastNode.delete(c.id);
        }
      }

      if (c.laneT !== undefined) {
        c.laneT = Math.min(1, c.laneT + dt / CONFIG.ring.laneChangeSec);
        if (c.laneT >= 1) { c.laneT = undefined; c.laneFrom = undefined; }
      }

      this.updateHorn(c, dt, pg <= gap && pg < Infinity);
    }

    for (const c of this.cars) this.advanceEdge(c, idx);

    const maxDist = CONFIG.traffic.radiusM + DESPAWN_MARGIN;
    this.cars = this.cars.filter((c) => {
      const p = lanePose(c, g);
      return Math.hypot(p.x - player.x, p.z - player.z) <= maxDist;
    });
    const alive = new Set(this.cars.map((c) => c.id));
    this.intersections.prune(alive);
    for (const id of this.pastNode) if (!alive.has(id)) this.pastNode.delete(id);

    if (this.spawning) this.trySpawn(player);
  }

  private lookahead(speed: number): number {
    // look at least as far as our stopping distance, so highway traffic sees a stopped player in time
    return Math.max(MIN_LOOKAHEAD, (speed * speed) / (2 * BRAKE) + CONFIG.traffic.minGapM + LOOKAHEAD_MARGIN);
  }

  private updateHorn(c: TrafficCar, dt: number, blockedByPlayer: boolean): void {
    c.hornCooldown = Math.max(0, (c.hornCooldown ?? 0) - dt);
    c.blockedByPlayerSec = blockedByPlayer && c.speed < HORN_STILL_MS ? (c.blockedByPlayerSec ?? 0) + dt : 0;
    if (c.blockedByPlayerSec > CONFIG.horn.afterSec && c.hornCooldown <= 0) {
      this.horns++;
      c.hornCooldown = CONFIG.horn.cooldownSec;
    }
  }

  /** The stop line at the end of the car's edge, if its end node needs right of way or a merge. */
  private stopLine(c: TrafficCar): StopLine | null {
    const k = `${c.edgeId}|${c.dir}`;
    let line = this.stopLines.get(k);
    if (line === undefined) {
      const g = this.g;
      const nodeId = endNode(g, c);
      const len = g.edgeLength(c.edgeId);
      if (g.isIntersection(nodeId))
        line = { nodeId, kind: 'intersection', stopS: len - (g.signalAt(nodeId) ? CONFIG.signals.stopLineSignalM : CONFIG.signals.stopLineM) };
      else if (isRingNode(nodeId) && !isRingEdge(c.edgeId)) line = { nodeId, kind: 'merge', stopS: len - MERGE_LINE_M };
      else line = null;
      this.stopLines.set(k, line);
    }
    return line;
  }

  /**
   * Merging from a ramp (spec fase 2 §5.3): lane 0 of the ring edge we join must be clear 20 m ahead, and the
   * nearest ring car coming up behind must be more than 2.5 s (and at least one car plus gap) away.
   */
  private mergeFree(c: TrafficCar, idx: LaneIndex): boolean {
    const g = this.g;
    const n = this.nextOf(c);
    if (!idx.isFree(n.edgeId, n.dir, n.lane, 0, 0, CONFIG.ring.mergeAheadM, c.id)) return false;
    const nodeId = endNode(g, c);
    for (const p of g.edgesAt(nodeId)) {
      if (p.id === n.edgeId || !isRingEdge(p.id)) continue;
      const dir: 1 | -1 = p.to === nodeId ? 1 : -1;
      const lenP = g.edgeLength(p.id);
      const behind = idx.nearestBehind(p.id, dir, n.lane, lenP);
      if (behind && lenP - behind.s < Math.max(CONFIG.ring.mergeBehindSec * behind.speed, CAR_LEN + CONFIG.traffic.minGapM)) return false;
    }
    return true;
  }

  /**
   * A car from another approach that is already on the intersection we drive to and turns into the same lane
   * as we will: it is ahead of us if it is closer to the node.
   */
  private turningLeaderGap(c: TrafficCar, n: NextHop, remaining: number): number {
    const nodeId = endNode(this.g, c);
    let gap = Infinity;
    for (const o of this.cars) {
      if (o === c || o.insideNode !== nodeId || o.edgeId === c.edgeId || this.pastNode.has(o.id)) continue;
      const on = o.next;
      if (!on || on.edgeId !== n.edgeId || on.dir !== n.dir || on.lane !== n.lane) continue;
      const rem = this.g.edgeLength(o.edgeId) - o.s;
      if (rem < remaining || (rem === remaining && o.id < c.id)) gap = Math.min(gap, remaining - rem - CAR_LEN);
    }
    return gap;
  }

  /** Distance to the player along the car's route (current edge, then its next edge), or Infinity. */
  private playerGap(c: TrafficCar, player: PlayerObstacle, speed: number): number {
    const lookahead = this.lookahead(speed);
    const remaining = this.g.edgeLength(c.edgeId) - c.s;
    // a little overlap at the node, so a player standing right in a bend is not missed
    // (both lanes count while changing lanes)
    let here = Infinity;
    for (const lane of occupiedLanes(c))
      here = Math.min(here, laneDistance(this.g, c.edgeId, c.dir, lane, player, c.s, c.s + Math.min(lookahead, remaining + CORNER_OVERLAP)));
    if (here < Infinity) return here - c.s - CAR_LEN;
    if (remaining >= lookahead) return Infinity;
    const n = this.nextOf(c);
    const there = laneDistance(this.g, n.edgeId, n.dir, n.lane, player, -CORNER_OVERLAP, lookahead - remaining);
    return there < Infinity ? remaining + there - CAR_LEN : Infinity;
  }

  private nextOf(c: TrafficCar): NextHop {
    if (c.next) return c.next;
    return (c.next = chooseNext(this.g, c, this.rng));
  }

  private advanceEdge(c: TrafficCar, idx: LaneIndex): void {
    let len = this.g.edgeLength(c.edgeId);
    let guard = 4;
    while (c.s >= len && guard-- > 0) {
      const n = this.nextOf(c);
      const prev = { edgeId: c.edgeId, dir: c.dir };
      c.s -= len;
      c.edgeId = n.edgeId; c.dir = n.dir; c.lane = n.lane;
      c.next = undefined;
      if (c.insideNode) this.pastNode.add(c.id);
      maybeChangeLane(this.g, c, prev, idx, this.rng);
      len = this.g.edgeLength(c.edgeId);
    }
    if (c.insideNode && this.pastNode.has(c.id) && c.s >= CONFIG.signals.clearAfterM) {
      this.intersections.leave(c.id, c.insideNode);
      c.insideNode = undefined;
      this.pastNode.delete(c.id);
    }
  }

  private trySpawn(player: PlayerObstacle): void {
    const g = this.g;
    for (let a = 0; a < SPAWN_ATTEMPTS && this.cars.length < CONFIG.traffic.maxCars; a++) {
      const e = g.edges[Math.floor(this.rng() * g.edges.length) % g.edges.length];
      const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
      const lane = Math.floor(this.rng() * e.lanesPerDir) % e.lanesPerDir;
      const len = g.edgeLength(e.id);
      const s = this.rng() * len;
      // not on or right next to a node: a car there would be on an intersection without having asked
      if (s < SPAWN_EDGE_START_M || len - s < SPAWN_EDGE_END_M) continue;
      const car: TrafficCar = { id: this.nextId, edgeId: e.id, dir, lane, s, speed: e.speedLimitKmh / 3.6 };
      const p = lanePose(car, g);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < SPAWN_MIN_DIST || d > CONFIG.traffic.radiusM) continue;
      const clash = this.cars.some((o) => { const q = lanePose(o, g); return Math.hypot(q.x - p.x, q.z - p.z) < SPAWN_CLEAR_M; });
      if (clash) continue;
      // never spawn at a speed from which we cannot stop for the player ahead or at the stop line
      const pg = this.playerGap(car, player, car.speed);
      if (pg < Infinity) car.speed = Math.min(car.speed, Math.sqrt(2 * BRAKE * Math.max(0, pg - CONFIG.traffic.minGapM)));
      const line = this.stopLine(car);
      if (line) car.speed = Math.min(car.speed, Math.sqrt(2 * BRAKE * Math.max(0, line.stopS - s - 1)));
      this.nextId++;
      this.cars.push(car);
    }
  }
}
