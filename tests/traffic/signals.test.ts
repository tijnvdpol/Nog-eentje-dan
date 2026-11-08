import { expect, it } from 'vitest';
import { signalLights } from '../../src/traffic/signals';

const s0 = { nodeId: 'n', offsetSec: 0 };
it('follows the 22s cycle', () => {
  expect(signalLights(s0, 0)).toEqual({ nz: 'green', ow: 'red' });
  expect(signalLights(s0, 7.99)).toEqual({ nz: 'green', ow: 'red' });
  expect(signalLights(s0, 8)).toEqual({ nz: 'orange', ow: 'red' });
  expect(signalLights(s0, 10.5)).toEqual({ nz: 'red', ow: 'red' });
  expect(signalLights(s0, 11)).toEqual({ nz: 'red', ow: 'green' });
  expect(signalLights(s0, 19)).toEqual({ nz: 'red', ow: 'orange' });
  expect(signalLights(s0, 21.5)).toEqual({ nz: 'red', ow: 'red' });
  expect(signalLights(s0, 22)).toEqual({ nz: 'green', ow: 'red' });
});
it('applies the offset', () => { expect(signalLights({ nodeId: 'n', offsetSec: 4 }, 4)).toEqual({ nz: 'green', ow: 'red' }); });
it('never green or orange on both axes', () => {
  for (let t = 0; t < 44; t += 0.05) { const l = signalLights(s0, t); expect(l.nz === 'red' || l.ow === 'red').toBe(true); }
});
it('handles times before the offset', () => { expect(signalLights({ nodeId: 'n', offsetSec: 4 }, 0)).toEqual({ nz: 'red', ow: 'green' }); });
