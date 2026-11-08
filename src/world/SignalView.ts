import * as THREE from 'three';
import { CONFIG } from '../config';
import { signalLights, type Light } from '../traffic/signals';
import type { RoadGraph } from './roadGraph';
import type { SignalSpec } from './types';

const LANE_W = CONFIG.traffic.laneWidthM;
const MARK_Y = 0.045;
const STRIPE_W = 0.5;
const LIGHTS: Light[] = ['red', 'orange', 'green'];
const ON: Record<Light, number> = { red: 0xff2a1a, orange: 0xffa21a, green: 0x2aff5a };
const OFF: Record<Light, number> = { red: 0x3a0f0c, orange: 0x3a2a0c, green: 0x0c3a16 };
const dummy = new THREE.Object3D();

interface Arm { signal: SignalSpec; axis: 'nz' | 'ow'; lamp0: number }

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
  m.count = count;
  m.frustumCulled = false;
  return m;
}

/** Traffic light poles with lamps, stop lines and zebra crossings (spec fase 2 §5.1, §7.1). */
export class SignalView {
  private arms: Arm[] = [];
  private lamps: THREE.InstancedMesh;
  private shown: string[] = [];
  private color = new THREE.Color();

  constructor(scene: THREE.Scene, g: RoadGraph) {
    type Placed = { x: number; z: number; yaw: number; width: number; lanes: number; ux: number; uz: number; rx: number; rz: number };
    const placed: { arm: Arm; p: Placed }[] = [];
    for (const signal of g.signals) {
      const n = g.node(signal.nodeId);
      for (const e of g.edgesAt(signal.nodeId)) {
        const other = g.node(e.from === signal.nodeId ? e.to : e.from);
        const len = g.edgeLength(e.id);
        // u: driving direction towards the node; r: right of u (cars approach on the right)
        const ux = (n.x - other.x) / len, uz = (n.z - other.z) / len;
        const rx = -uz, rz = ux;
        const d = CONFIG.signals.stopLineSignalM;
        placed.push({
          arm: { signal, axis: g.axisOf(e.id), lamp0: 0 },
          p: { x: n.x - ux * d, z: n.z - uz * d, yaw: Math.atan2(ux, uz), width: e.lanesPerDir * LANE_W, lanes: e.lanesPerDir, ux, uz, rx, rz },
        });
      }
    }

    const poles = instanced(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x2b2e33 }), placed.length);
    const boxes = instanced(new THREE.BoxGeometry(0.45, 1.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x15171a }), placed.length);
    const stops = instanced(new THREE.BoxGeometry(1, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), placed.length);
    this.lamps = instanced(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), placed.length * 3);
    placed.forEach(({ arm, p }, i) => {
      const px = p.x + p.rx * (p.width + 1), pz = p.z + p.rz * (p.width + 1);
      dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(px, 1.7, pz); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, 3.4, pz); dummy.updateMatrix(); boxes.setMatrixAt(i, dummy.matrix);
      // lamps face the approaching cars (towards −u)
      arm.lamp0 = i * 3;
      LIGHTS.forEach((_, k) => {
        dummy.position.set(px - p.ux * 0.2, 3.8 - k * 0.4, pz - p.uz * 0.2); dummy.updateMatrix();
        this.lamps.setMatrixAt(i * 3 + k, dummy.matrix);
      });
      // stop line across the approach lanes (right half of the road)
      dummy.position.set(p.x + p.rx * (p.width / 2), MARK_Y, p.z + p.rz * (p.width / 2));
      dummy.scale.set(p.width, 1, 1); dummy.updateMatrix(); stops.setMatrixAt(i, dummy.matrix);
      this.arms.push(arm);
    });
    scene.add(poles, boxes, stops, this.lamps);

    // zebra crossings: 0.5 m stripes, 3 m long in the driving direction, across the whole road
    const stripes: { x: number; z: number; yaw: number }[] = [];
    for (const c of g.crossings) {
      const e = g.edge(c.edgeId);
      const a = g.node(e.from), b = g.node(e.to);
      const len = g.edgeLength(e.id);
      const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
      const cx = a.x + fx * c.s, cz = a.z + fz * c.s;
      const half = e.lanesPerDir * LANE_W;
      for (let off = -half + STRIPE_W; off <= half - STRIPE_W / 2; off += 2 * STRIPE_W)
        stripes.push({ x: cx - fz * off, z: cz + fx * off, yaw: Math.atan2(fx, fz) });
    }
    const zebra = instanced(new THREE.BoxGeometry(STRIPE_W, 0.02, CONFIG.peds.crossingWidthM), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), stripes.length);
    stripes.forEach((s, i) => {
      dummy.position.set(s.x, MARK_Y, s.z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      zebra.setMatrixAt(i, dummy.matrix);
    });
    scene.add(zebra);
    this.update(0);
  }

  update(timeSec: number): void {
    let changed = false;
    this.arms.forEach((arm, i) => {
      const light = signalLights(arm.signal, timeSec)[arm.axis];
      if (this.shown[i] === light) return;
      this.shown[i] = light;
      changed = true;
      LIGHTS.forEach((l, k) => this.lamps.setColorAt(arm.lamp0 + k, this.color.setHex(l === light ? ON[l] : OFF[l])));
    });
    if (changed && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
}
