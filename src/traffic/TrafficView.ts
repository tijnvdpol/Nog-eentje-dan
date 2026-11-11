import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { yawQuat } from '../vehicle/PlayerCar';
import type { RoadGraph } from '../world/roadGraph';
import type { ModelLibrary } from '../models/modelLibrary';
import type { CarRole } from '../models/roles';
import { carLook } from './carLooks';
import { lanePose, type TrafficCar } from './trafficLogic';

const TRAFFIC_GROUPS = (0x0002 << 16) | 0x0001; // collides with the player (group 1) only
const PARK = { x: 0, y: -200, z: 0 };
const dummy = new THREE.Object3D();

export class TrafficView {
  private bodies: RAPIER.RigidBody[] = [];
  private velocities = new Map<number, { x: number; z: number }>();
  private sets = new Map<CarRole, { meshes: THREE.InstancedMesh[]; tint: boolean }>();
  private signMesh: THREE.InstancedMesh;
  private signY = 1.6;

  constructor(scene: THREE.Scene, private world: RAPIER.World, lib: ModelLibrary) {
    const n = CONFIG.traffic.maxCars;
    for (let i = 0; i < n; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(PARK.x, PARK.y, PARK.z));
      const col = world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.2).setCollisionGroups(TRAFFIC_GROUPS), body);
      this.bodies.push(body);
      this.velocities.set(col.handle, { x: 0, z: 0 });
    }
    for (const name of Object.keys(CONFIG.carLooks.mix)) {
      const role = `car.${name}` as CarRole;
      const meshes = lib.get(role).map((p) => {
        const mesh = new THREE.InstancedMesh(p.geometry, p.material, n);
        mesh.frustumCulled = false;
        mesh.count = 0;
        scene.add(mesh);
        return mesh;
      });
      // Kenney models share one colormap material: a tint would also colour glass and wheels, so only the fallback box is painted
      this.sets.set(role, { meshes, tint: lib.missing.includes(role) });
      if (role === 'car.taxi') {
        let top = 1.6;
        for (const p of lib.get(role)) { p.geometry.computeBoundingBox(); top = Math.max(top, p.geometry.boundingBox!.max.y); }
        this.signY = top;
      }
    }
    this.signMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.16, 0.22), new THREE.MeshStandardMaterial({
      map: taxiSignTexture(), emissive: 0xffe9a0, emissiveMap: taxiSignTexture(), emissiveIntensity: 0.8, roughness: 0.6,
    }), n);
    this.signMesh.frustumCulled = false;
    this.signMesh.count = 0;
    scene.add(this.signMesh);
  }

  /** Velocity of the kinematic traffic body owning this collider, or null. */
  velocityOfCollider(handle: number): { x: number; z: number } | null {
    return this.velocities.get(handle) ?? null;
  }

  sync(cars: readonly TrafficCar[], g: RoadGraph): void {
    const color = new THREE.Color();
    const counts = new Map<CarRole, number>();
    let signs = 0;
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

        const look = carLook(c.id);
        const set = this.sets.get(look.role)!;
        const k = counts.get(look.role) ?? 0;
        counts.set(look.role, k + 1);
        dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.heading, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        for (const mesh of set.meshes) {
          mesh.setMatrixAt(k, dummy.matrix);
          if (set.tint && look.color !== null) mesh.setColorAt(k, color.setHex(look.color));
        }
        if (look.role === 'car.taxi') {
          dummy.position.y = this.signY + 0.08;
          dummy.updateMatrix();
          this.signMesh.setMatrixAt(signs++, dummy.matrix);
        }
      } else {
        body.setNextKinematicTranslation(PARK);
        this.velocities.set(handle, { x: 0, z: 0 });
      }
    }
    for (const [role, set] of this.sets) {
      for (const mesh of set.meshes) {
        mesh.count = counts.get(role) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    this.signMesh.count = signs;
    this.signMesh.instanceMatrix.needsUpdate = true;
  }
}

/** Small roof sign: "TAXI" in black on warm yellow; no brand. */
function taxiSignTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffd84a'; ctx.fillRect(0, 0, 128, 48);
  ctx.fillStyle = '#111'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 64, 26);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
