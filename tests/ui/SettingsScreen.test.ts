// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { showSettings } from '../../src/ui/SettingsScreen';

it('settings slider and checkbox call onChange, Terug closes', () => {
  const root = document.createElement('div');
  const changes: unknown[] = []; let closed = false;
  showSettings(root, { volume: 80, reducedMotion: false }, (s) => changes.push(s), () => (closed = true));
  const vol = root.querySelector<HTMLInputElement>('input[type=range][name=volume]')!;
  expect(vol.value).toBe('80');
  vol.value = '40'; vol.dispatchEvent(new Event('input'));
  expect(changes.at(-1)).toEqual({ volume: 40, reducedMotion: false });
  const rm = root.querySelector<HTMLInputElement>('input[type=checkbox][name=reducedMotion]')!;
  rm.checked = true; rm.dispatchEvent(new Event('change'));
  expect(changes.at(-1)).toEqual({ volume: 40, reducedMotion: true });
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Terug')!.click();
  expect(closed).toBe(true);
});
