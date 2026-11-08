import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG } from '../config';

/** Filling station on the N-road forecourt: canopy on four posts, night shop, one light (spec fase 3 §3.4). */
export function buildTankstation(scene: THREE.Scene, world: RAPIER.World): void {
  const { cx, cz, d } = CONFIG.tankstation.forecourt;
  const CANOPY_W = 14, CANOPY_D = 8, CANOPY_Y = 5;
  const canopyZ = cz - 2;

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(CANOPY_W, 0.4, CANOPY_D), new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.6 }));
  canopy.position.set(cx, CANOPY_Y, canopyZ);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(CANOPY_W + 0.1, 0.25, CANOPY_D + 0.1), new THREE.MeshBasicMaterial({ color: 0xe03a2f }));
  stripe.position.set(cx, CANOPY_Y - 0.3, canopyZ);
  scene.add(canopy, stripe);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x888a90 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * (CANOPY_W / 2 - 0.5), z = canopyZ + sz * (CANOPY_D / 2 - 0.5);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, CANOPY_Y, 8), postMat);
    post.position.set(x, CANOPY_Y / 2, z);
    scene.add(post);
    world.createCollider(RAPIER.ColliderDesc.cylinder(CANOPY_Y / 2, 0.2).setTranslation(x, CANOPY_Y / 2, z));
  }

  const shopZ = cz + d / 2 - 3;
  const shop = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 6), new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.85 }));
  shop.position.set(cx, 2, shopZ);
  const window_ = new THREE.Mesh(new THREE.PlaneGeometry(9, 2), new THREE.MeshBasicMaterial({ color: 0xfff2b8 }));
  window_.position.set(cx, 2, shopZ - 3.05); window_.rotation.y = Math.PI;
  scene.add(shop, window_);
  world.createCollider(RAPIER.ColliderDesc.cuboid(6, 2, 3).setTranslation(cx, 2, shopZ));

  const light = new THREE.PointLight(0xfff2d0, 60, 40, 2);
  light.position.set(cx, CANOPY_Y - 0.8, canopyZ);
  scene.add(light);
}
