import type RAPIER from '@dimforge/rapier3d-compat';
import type { EventBus, GameEvents } from '../core/events';
import { drunkEffects } from '../drunk/effects';
import { DrunkInputFilter } from '../input/drunkInputFilter';
import type { DriveInput } from '../input/input';
import { PedestrianManager } from '../pedestrians/pedestrianLogic';
import type { PedestrianView } from '../pedestrians/PedestrianView';
import type { GameSession } from '../state/GameSession';
import { TrafficManager } from '../traffic/trafficLogic';
import type { TrafficView } from '../traffic/TrafficView';
import type { PlayerCar } from '../vehicle/PlayerCar';
import type { RoadGraph } from '../world/roadGraph';

export interface SimulationDeps {
  world: RAPIER.World; graph: RoadGraph; car: PlayerCar; trafficView: TrafficView; pedView: PedestrianView; rng: () => number;
  bus: EventBus<GameEvents>;
}

/** One fixed simulation step of a run: input filter, player car, physics, traffic and the session. */
export class Simulation {
  traffic: TrafficManager;
  readonly peds: PedestrianManager;
  /** Simulated time of this run in seconds; only advances in `step`, so pausing stops it. */
  timeSec = 0;
  /** Steering after the drunk filter, for the cockpit's steering wheel. */
  lastSteer = 0;
  private filter: DrunkInputFilter;

  constructor(private d: SimulationDeps) {
    this.traffic = new TrafficManager(d.graph, d.rng);
    this.peds = new PedestrianManager(d.graph, d.rng);
    this.filter = new DrunkInputFilter(d.rng);
  }

  step(dt: number, drive: DriveInput, session: GameSession, phoneUp: boolean): void {
    const { world, graph, car, trafficView, pedView, bus } = this.d;
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
    this.timeSec += dt;
  }

  reset(): void {
    this.traffic.clear();
    this.traffic = new TrafficManager(this.d.graph, this.d.rng);
    this.peds.reset();
    this.d.pedView.sync([]);
    this.filter = new DrunkInputFilter(this.d.rng);
    this.timeSec = 0;
    this.lastSteer = 0;
  }
}
