import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { yawQuat } from '../vehicle/PlayerCar';
import type { RoadGraph } from '../world/roadGraph';
import { lanePose, type TrafficCar } from './trafficLogic';

const COLORS = [0xc0392b, 0x2980b9, 0xd4ac0d, 0xecf0f1, 0x27ae60];
const TRAFFIC_GROUPS = (0x0002 << 16) | 0x0001; // collides with the player (group 1) only
const PARK = { x: 0, y: -200, z: 0 };
const dummy = new THREE.Object3D();

export class TrafficView {
  private bodies: RAPIER.RigidBody[] = [];
  private velocities = new Map<number, { x: number; z: number }>();
  private bodyMesh: THREE.InstancedMesh;
  private cabinMesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene, private world: RAPIER.World) {
    const n = CONFIG.traffic.maxCars;
    for (let i = 0; i < n; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(PARK.x, PARK.y, PARK.z));
      const col = world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.2).setCollisionGroups(TRAFFIC_GROUPS), body);
      this.bodies.push(body);
      this.velocities.set(col.handle, { x: 0, z: 0 });
    }
    this.bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.8, 4.4), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), n);
    this.cabinMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.3 }), n);
    this.bodyMesh.frustumCulled = false;
    this.cabinMesh.frustumCulled = false;
    this.bodyMesh.count = 0;
    this.cabinMesh.count = 0;
    scene.add(this.bodyMesh, this.cabinMesh);
  }

  /** Velocity of the kinematic traffic body owning this collider, or null. */
  velocityOfCollider(handle: number): { x: number; z: number } | null {
    return this.velocities.get(handle) ?? null;
  }

  sync(cars: readonly TrafficCar[], g: RoadGraph): void {
    const color = new THREE.Color();
    const n = Math.min(cars.length, this.bodies.length);
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      const handle = body.collider(0).handle;
      if (i < n) {
        const c = cars[i];
        const p = lanePose(c, g);
        body.setNextKinematicTranslation({ x: p.x, y: 0.7, z: p.z });
        body.setNextKinematicRotation(yawQuat(p.heading));
        this.velocities.set(handle, { x: Math.sin(p.heading) * c.speed, z: Math.cos(p.heading) * c.speed });

        dummy.position.set(p.x, 0.65, p.z); dummy.rotation.set(0, p.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        this.bodyMesh.setMatrixAt(i, dummy.matrix);
        this.bodyMesh.setColorAt(i, color.setHex(COLORS[c.id % COLORS.length]));
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        dummy.position.set(p.x - fx * 0.2, 1.3, p.z - fz * 0.2); dummy.updateMatrix();
        this.cabinMesh.setMatrixAt(i, dummy.matrix);
      } else {
        body.setNextKinematicTranslation(PARK);
        this.velocities.set(handle, { x: 0, z: 0 });
      }
    }
    this.bodyMesh.count = n;
    this.cabinMesh.count = n;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.cabinMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
  }
}
