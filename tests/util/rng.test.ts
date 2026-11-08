import { expect, it } from 'vitest';
import { mulberry32 } from '../../src/util/rng';
it('is deterministic per seed and in [0,1)', () => {
  const a = mulberry32(1337), b = mulberry32(1337);
  for (let i = 0; i < 100; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});
