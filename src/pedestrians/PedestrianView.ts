import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Ped, PedKind } from './pedestrianLogic';

const COLORS: Record<PedKind, number> = { jogger: 0xff8a1f, student: 0x2f6bff, oma: 0x8e44ad };
const SKIN = 0xf0c8a0;
const dummy = new THREE.Object3D();

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** A walking frame: two side frames joined by a handle bar. */
function rollatorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (const x of [-0.25, 0.25]) { bar(0.04, 0.85, 0.04, x, 0.42, 0.15); bar(0.04, 0.6, 0.04, x, 0.3, -0.15); bar(0.04, 0.04, 0.34, x, 0.6, 0); }
  bar(0.54, 0.04, 0.04, 0, 0.85, 0.15);
  return mergeGeometries(parts)!;
}

/** Low-poly pedestrians: capsule body, sphere head, a phone for students and a walking frame for grannies. */
export class PedestrianView {
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private phones: THREE.InstancedMesh;
  private rollators: THREE.InstancedMesh;
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const n = CONFIG.peds.max;
    this.bodies = instanced(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    this.heads = instanced(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }), n);
    this.phones = instanced(new THREE.BoxGeometry(0.08, 0.15, 0.02), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), n);
    this.rollators = instanced(rollatorGeometry(), new THREE.MeshStandardMaterial({ color: 0x777c85, metalness: 0.4, roughness: 0.5 }), n);
    scene.add(this.bodies, this.heads, this.phones, this.rollators);
  }

  sync(peds: readonly Ped[]): void {
    let nb = 0, np = 0, nr = 0;
    for (const p of peds.slice(0, CONFIG.peds.max)) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const scale = p.kind === 'oma' ? 0.9 : 1;
      dummy.rotation.set(0, p.heading, 0); dummy.scale.set(scale, scale, scale);
      dummy.position.set(p.x, 0.62 * scale, p.z); dummy.updateMatrix();
      this.bodies.setMatrixAt(nb, dummy.matrix);
      this.bodies.setColorAt(nb, this.color.setHex(COLORS[p.kind]));
      dummy.position.set(p.x, 1.4 * scale, p.z); dummy.updateMatrix();
      this.heads.setMatrixAt(nb, dummy.matrix);
      nb++;
      if (p.kind === 'student') {
        dummy.scale.set(1, 1, 1); dummy.rotation.set(-0.6, p.heading, 0, 'YXZ');
        dummy.position.set(p.x + fx * 0.3, 1.15, p.z + fz * 0.3); dummy.updateMatrix();
        this.phones.setMatrixAt(np++, dummy.matrix);
      } else if (p.kind === 'oma') {
        dummy.scale.set(1, 1, 1); dummy.rotation.set(0, p.heading, 0);
        dummy.position.set(p.x + fx * 0.35, 0, p.z + fz * 0.35); dummy.updateMatrix();
        this.rollators.setMatrixAt(nr++, dummy.matrix);
      }
    }
    this.bodies.count = nb; this.heads.count = nb; this.phones.count = np; this.rollators.count = nr;
    for (const m of [this.bodies, this.heads, this.phones, this.rollators]) m.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }
}
