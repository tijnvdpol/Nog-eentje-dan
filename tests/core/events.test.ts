import { expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
it('delivers payload and unsubscribes', () => {
  const bus = new EventBus<{ a: number }>(); const got: number[] = [];
  const off = bus.on('a', (n) => got.push(n)); bus.emit('a', 1); off(); bus.emit('a', 2);
  expect(got).toEqual([1]);
});
