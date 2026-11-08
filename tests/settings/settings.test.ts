import { expect, it } from 'vitest';
import { drunkEffects } from '../../src/drunk/effects';
import { DEFAULT_SETTINGS, applyReducedMotion, loadSettings, saveSettings } from '../../src/settings/settings';

const st = (v: string | null) => ({ getItem: () => v });
it('defaults on missing, broken or odd data', () => {
  expect(loadSettings(null)).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st(null))).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st('geen json'))).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st('null'))).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st('5'))).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st('{"volume":500}'))).toEqual({ volume: 100, reducedMotion: false });
  expect(loadSettings(st('{"volume":-20}'))).toEqual({ volume: 0, reducedMotion: false });
  expect(loadSettings(st('{"volume":"hard","reducedMotion":"ja"}'))).toEqual({ volume: 80, reducedMotion: false });
  expect(loadSettings(st('{"volume":33.6,"reducedMotion":true}'))).toEqual({ volume: 34, reducedMotion: true });
  expect(loadSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_SETTINGS);
});
it('saving survives a throwing storage and round-trips', () => {
  expect(() => saveSettings({ setItem: () => { throw new Error('quota'); } }, DEFAULT_SETTINGS)).not.toThrow();
  let saved = ''; saveSettings({ setItem: (_k, v) => { saved = v; } }, { volume: 12, reducedMotion: true });
  expect(loadSettings(st(saved))).toEqual({ volume: 12, reducedMotion: true });
});
it('reduced motion halves sway, rgbShift and phoneDouble only', () => {
  const fx = drunkEffects(2.5); const r = applyReducedMotion(fx, true);
  expect(r.sway).toBeCloseTo(fx.sway / 2); expect(r.rgbShift).toBeCloseTo(fx.rgbShift / 2); expect(r.phoneDouble).toBeCloseTo(fx.phoneDouble / 2);
  expect(r.steerNoise).toBe(fx.steerNoise); expect(r.blackoutPerSec).toBe(fx.blackoutPerSec); expect(applyReducedMotion(fx, false)).toEqual(fx);
  expect(r).not.toBe(fx);
});
