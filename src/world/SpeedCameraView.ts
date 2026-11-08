import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { RoadGraph } from './roadGraph';

/** Camera pole (3 m) with a grey box and yellow reflective stripes, right of the measured direction. */
export function buildSpeedCameras(scene: THREE.Scene, world: RAPIER.World, g: RoadGraph): void {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x777a80 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.6 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  for (const cam of g.speedCameras) {
    const e = g.edge(cam.edgeId);
    const a = g.node(e.from), b = g.node(e.to);
    const len = g.edgeLength(e.id);
    const ex = (b.x - a.x) / len, ez = (b.z - a.z) / len;
    const fx = ex * cam.dir, fz = ez * cam.dir;
    const off = e.lanesPerDir * CONFIG.traffic.laneWidthM + CONFIG.speedCamera.sideOffsetM;
    const x = a.x + ex * cam.s - fz * off, z = a.z + ez * cam.s + fx * off;
    const yaw = Math.atan2(fx, fz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 8), poleMat);
    pole.position.set(x, 1.5, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), boxMat);
    box.position.set(x, 3.5, z); box.rotation.y = yaw;
    scene.add(pole, box);
    for (const y of [3.2, 3.8]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.64), stripeMat);
      s.position.set(x, y, z); s.rotation.y = yaw;
      scene.add(s);
    }
    world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.15).setTranslation(x, 2, z));
  }
}
