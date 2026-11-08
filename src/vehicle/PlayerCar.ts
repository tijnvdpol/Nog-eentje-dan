import RAPIER from '@dimforge/rapier3d-compat';
import type { DriveInput } from '../input/input';
import { stepCar, type CarState } from './carModel';

const HALF = { x: 0.9, y: 0.7, z: 2.2 };
const IMPACT_COOLDOWN_SEC = 0.25;

export class PlayerCar {
  readonly state: CarState;
  readonly collider: RAPIER.Collider;
  readonly events: RAPIER.EventQueue;
  private body: RAPIER.RigidBody;
  private intended = { x: 0, z: 0 };
  private handlers: ((kmh: number) => void)[] = [];
  private otherVelocity: (colliderHandle: number) => { x: number; z: number } | null = () => null;
  private cooldown = 0;
  private lastDt = 1 / 60;
  /** Sideways speed relative to the heading (m/s), e.g. when sliding along a wall. */
  lateralSpeedMs = 0;

  constructor(private world: RAPIER.World, spawn: { x: number; z: number; heading: number }) {
    this.state = { x: spawn.x, z: spawn.z, heading: spawn.heading, speed: 0, steerSmoothed: 0 };
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, HALF.y, spawn.z)
        .setRotation(yawQuat(spawn.heading))
        .enabledRotations(false, false, false)
        .enabledTranslations(true, false, true)
        .setCanSleep(false),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setMass(1200),
      this.body,
    );
    this.events = new RAPIER.EventQueue(true);
  }

  get speedKmh(): number { return Math.abs(this.state.speed) * 3.6; }

  onImpact(fn: (kmh: number) => void): void { this.handlers.push(fn); }
  setOtherVelocityResolver(fn: (colliderHandle: number) => { x: number; z: number } | null): void { this.otherVelocity = fn; }

  step(input: DriveInput, dt: number, mods: { steerFactor: number; steerResponse: number }): void {
    this.lastDt = dt;
    const next = stepCar(this.state, input, dt, mods);
    this.state.heading = next.heading;
    this.state.speed = next.speed;
    this.state.steerSmoothed = next.steerSmoothed;
    this.intended = { x: Math.sin(next.heading) * next.speed, z: Math.cos(next.heading) * next.speed };
    this.body.setRotation(yawQuat(next.heading), true);
    this.body.setLinvel({ x: this.intended.x, y: 0, z: this.intended.z }, true);
  }

  /** Call after world.step(this.events). */
  syncFromPhysics(): void {
    const t = this.body.translation();
    this.state.x = t.x;
    this.state.z = t.z;
    const v = this.body.linvel();
    const fx = Math.sin(this.state.heading), fz = Math.cos(this.state.heading);
    const actual = v.x * fx + v.z * fz;
    this.lateralSpeedMs = v.x * -fz + v.z * fx;

    this.cooldown = Math.max(0, this.cooldown - this.lastDt);
    let started = false;
    let otherVel: { x: number; z: number } | null = null;
    this.events.drainCollisionEvents((h1, h2, isStart) => {
      if (!isStart) return;
      const own = this.collider.handle;
      if (h1 !== own && h2 !== own) return;
      started = true;
      otherVel = this.otherVelocity(h1 === own ? h2 : h1) ?? otherVel;
    });
    if (started && this.cooldown === 0) {
      const ov = (otherVel ?? { x: 0, z: 0 }) as { x: number; z: number };
      const dvx = this.intended.x - v.x, dvz = this.intended.z - v.z;
      // speed lost against the obstacle, relative to whatever it was doing
      const lost = Math.hypot(dvx, dvz);
      const rel = Math.hypot(this.intended.x - ov.x, this.intended.z - ov.z);
      const kmh = Math.min(lost, rel) * 3.6;
      if (kmh > 0) { this.cooldown = IMPACT_COOLDOWN_SEC; for (const h of this.handlers) h(kmh); }
    }
    this.state.speed = actual;
  }

  teleport(spawn: { x: number; z: number; heading: number }): void {
    this.state.x = spawn.x; this.state.z = spawn.z; this.state.heading = spawn.heading;
    this.state.speed = 0; this.state.steerSmoothed = 0;
    this.body.setTranslation({ x: spawn.x, y: HALF.y, z: spawn.z }, true);
    this.body.setRotation(yawQuat(spawn.heading), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}

export function yawQuat(h: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) };
}
