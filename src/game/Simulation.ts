import type RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import { nearRefillPlace } from '../beer/beerStock';
import type { EventBus, GameEvents } from '../core/events';
import { drunkEffects } from '../drunk/effects';
import { DrunkInputFilter } from '../input/drunkInputFilter';
import type { DriveInput } from '../input/input';
import { PedestrianManager } from '../pedestrians/pedestrianLogic';
import type { PedestrianView } from '../pedestrians/PedestrianView';
import type { GameSession } from '../state/GameSession';
import { TaskSystem, type TaskEvent } from '../tasks/taskSystem';
import { TrafficManager } from '../traffic/trafficLogic';
import type { TrafficView } from '../traffic/TrafficView';
import type { PlayerCar } from '../vehicle/PlayerCar';
import { RedLightDetector } from '../world/redLightDetector';
import type { RoadGraph } from '../world/roadGraph';

export interface SimulationDeps {
  world: RAPIER.World; graph: RoadGraph; car: PlayerCar; trafficView: TrafficView; pedView: PedestrianView; rng: () => number;
  bus: EventBus<GameEvents>;
  /** Raw entries of tasks.json and the post ids they may refer to. */
  taskDefs: unknown[]; postIds: ReadonlySet<string>;
}


/** One fixed simulation step of a run: input filter, player car, physics, traffic and the session. */
export class Simulation {
  traffic: TrafficManager;
  readonly peds: PedestrianManager;
  readonly tasks: TaskSystem;
  private redLight: RedLightDetector;
  private session: GameSession | null = null;
  /** Simulated time of this run in seconds; only advances in `step`, so pausing stops it. */
  timeSec = 0;
  /** Steering after the drunk filter, for the cockpit's steering wheel. */
  lastSteer = 0;
  private filter: DrunkInputFilter;

  constructor(private d: SimulationDeps) {
    this.traffic = new TrafficManager(d.graph, d.rng);
    this.peds = new PedestrianManager(d.graph, d.rng);
    this.tasks = new TaskSystem(d.taskDefs, d.rng, { postIds: d.postIds, placeIds: new Set(d.graph.places.map((p) => p.id)) });
    this.redLight = new RedLightDetector(d.graph);
    this.filter = new DrunkInputFilter(d.rng);
  }

  step(dt: number, drive: DriveInput, session: GameSession, phoneUp: boolean): void {
    const { world, graph, car, trafficView, pedView, bus } = this.d;
    this.session = session;
    const fx = drunkEffects(session.promille);
    const filtered = this.filter.apply(drive, fx, this.timeSec);
    this.lastSteer = filtered.steer;
    car.step(filtered, dt, { steerFactor: session.steerFactor, steerResponse: fx.steerResponse });
    world.step(car.events);
    car.syncFromPhysics();
    const { nearMisses } = this.peds.update(dt, { ...car.state, speedMs: car.state.speed }, this.traffic.cars);
    for (const kind of nearMisses) { session.nearMiss(kind); bus.emit('nearMiss', { kind }); }
    pedView.sync(this.peds.peds);
    this.traffic.update(dt, car.state, this.timeSec, this.peds.obstacles());
    trafficView.sync(this.traffic.cars, graph);
    for (let i = this.traffic.takeHorns(); i > 0; i--) bus.emit('horn', {});
    session.tick(dt, { speedKmh: car.speedKmh, ...graph.zoneAt(car.state.x, car.state.z), phoneUp });

    if (session.refill(dt, this.nearRefillPlace(), car.speedKmh)) bus.emit('refilled', {});
    if (this.redLight.update(car.state, this.timeSec) && !session.over) bus.emit('redLight', { points: session.redLight() });
    const ctx = { timeSec: this.timeSec, player: car.state, speedKmh: car.speedKmh, places: graph.places, isLiked: (id: string) => session.hasLiked(id) };
    this.handleTasks(this.tasks.update(dt, ctx));
    this.timeSec += dt;
  }

  /** The player answered the active chat task. */
  answerTask(index: number): void { this.handleTasks(this.tasks.answer(index)); }

  /** A post was liked (after the session counted it). */
  likedPost(postId: string): void { this.handleTasks(this.tasks.liked(postId)); }

  /** Within refill range of the supermarket, the party or the filling station. */
  nearRefillPlace(): boolean {
    const { car, graph } = this.d;
    return nearRefillPlace(graph.places, car.state.x, car.state.z);
  }

  private handleTasks(events: TaskEvent[]): void {
    for (const e of events) {
      if (e.type === 'started') this.d.bus.emit('taskStarted', { taskId: e.task.id });
      else {
        const points = e.success && this.session ? this.session.taskReward(e.task.reward) : 0;
        this.d.bus.emit('taskResolved', { taskId: e.task.id, success: e.success, points, reply: e.reply });
      }
    }
  }

  reset(): void {
    this.traffic.clear();
    this.traffic = new TrafficManager(this.d.graph, this.d.rng);
    this.peds.reset();
    this.tasks.reset();
    this.redLight.reset();
    this.session = null;
    this.d.pedView.sync([]);
    this.filter = new DrunkInputFilter(this.d.rng);
    this.timeSec = 0;
    this.lastSteer = 0;
  }
}
