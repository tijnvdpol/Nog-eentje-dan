// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';

beforeEach(() => { window.localStorage.clear(); });
it('silent engine when Web Audio is missing', async () => {
  const e = AudioEngine.create({ ...window, AudioContext: undefined, localStorage: window.localStorage } as unknown as Window);
  await expect(e.resume()).resolves.toBeUndefined();
  expect(() => { e.play('crash'); e.update({ speedKmh: 50, slipping: false, promille: 1, timeSec: 1 }); e.suspend(); }).not.toThrow();
  await expect(e.loadOverrides()).resolves.toBeUndefined();
});
it('silent engine when creating the AudioContext throws', async () => {
  class Broken { constructor() { throw new Error('no audio'); } }
  const e = AudioEngine.create({ AudioContext: Broken, localStorage: window.localStorage } as unknown as Window);
  await expect(e.resume()).resolves.toBeUndefined(); expect(() => e.play('horn')).not.toThrow();
});
it('remembers mute', () => {
  const e = AudioEngine.create(window); expect(e.muted).toBe(false);
  e.setMuted(true); expect(window.localStorage.getItem('nog-eentje-dan:muted')).toBe('1');
  expect(AudioEngine.create(window).muted).toBe(true);
  e.setMuted(false); expect(AudioEngine.create(window).muted).toBe(false);
});
it('mute survives a broken localStorage', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const e = AudioEngine.create({ localStorage: bad } as unknown as Window);
  expect(() => e.setMuted(true)).not.toThrow(); expect(e.muted).toBe(true);
});
