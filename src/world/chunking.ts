/** Spatial grid used to split instanced objects into chunks so the renderer can frustum-cull them. */
export function chunkKey(x: number, z: number, size: number): string {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

export function groupByChunk<T extends { x: number; z: number }>(items: readonly T[], size: number): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = chunkKey(it.x, it.z, size);
    const list = map.get(k);
    if (list) list.push(it); else map.set(k, [it]);
  }
  return map;
}
