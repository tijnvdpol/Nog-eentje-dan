import * as THREE from 'three';
import { groupByChunk } from './chunking';

/**
 * One InstancedMesh per chunk, each with a bounding sphere so three.js can cull whole chunks.
 * `write` fills the instance matrix (and colour) of one item; it returns true when it set the colour.
 */
export function addInstancedChunks<T extends { x: number; z: number }>(
  scene: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, items: readonly T[], size: number,
  write: (item: T, m: THREE.Matrix4, color: THREE.Color) => boolean,
): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(), color = new THREE.Color();
  for (const list of groupByChunk(items, size).values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((item, i) => {
      if (write(item, m, color)) mesh.setColorAt(i, color);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Instances a multi-part model (one InstancedMesh per part per chunk). The colour from `write` is applied
 * to parts with `tint`, or to every part when none is marked as tint.
 */
export function addInstancedModel<T extends { x: number; z: number }>(
  scene: THREE.Object3D, parts: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; tint: boolean }[],
  items: readonly T[], size: number,
  write: (item: T, m: THREE.Matrix4, color: THREE.Color) => boolean,
): THREE.InstancedMesh[] {
  const anyTint = parts.some((p) => p.tint);
  const meshes: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(), color = new THREE.Color();
  for (const list of groupByChunk(items, size).values()) {
    const chunk = parts.map((p) => ({ p, mesh: new THREE.InstancedMesh(p.geometry, p.material, list.length) }));
    list.forEach((item, i) => {
      const coloured = write(item, m, color);
      for (const { p, mesh } of chunk) {
        if (coloured && (p.tint || !anyTint)) mesh.setColorAt(i, color);
        mesh.setMatrixAt(i, m);
      }
    });
    for (const { mesh } of chunk) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      meshes.push(mesh);
    }
  }
  return meshes;
}
