import { expect, it } from 'vitest';
import { chunkKey, groupByChunk } from '../../src/world/chunking';

it('chunk keys floor negative coordinates', () => {
  expect(chunkKey(0, 0, 250)).toBe('0,0'); expect(chunkKey(-0.1, 249.9, 250)).toBe('-1,0'); expect(chunkKey(2700, -80, 250)).toBe('10,-1');
});
it('every item lands in exactly one chunk', () => {
  const items = Array.from({ length: 500 }, (_, i) => ({ x: (i * 37) % 3000 - 700, z: (i * 53) % 1400 - 700, i }));
  const m = groupByChunk(items, 250); const all = [...m.values()].flat();
  expect(all.length).toBe(500); expect(new Set(all.map((o) => o.i)).size).toBe(500);
  for (const [k, list] of m) for (const o of list) expect(chunkKey(o.x, o.z, 250)).toBe(k);
});
