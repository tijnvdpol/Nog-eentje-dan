import { CONFIG } from '../config';
import type { DrunkEffects } from '../drunk/effects';

export interface Settings { volume: number; reducedMotion: boolean }
export const DEFAULT_SETTINGS: Settings = { volume: CONFIG.settings.defaultVolume, reducedMotion: false };

/** Reads settings; anything missing, broken or odd falls back to a valid value per field. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  let raw: unknown = null;
  try {
    const text = storage?.getItem(CONFIG.settings.storageKey);
    if (text) raw = JSON.parse(text);
  } catch { /* unreadable: defaults */ }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const v = o.volume;
  const volume = typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : DEFAULT_SETTINGS.volume;
  return { volume, reducedMotion: typeof o.reducedMotion === 'boolean' ? o.reducedMotion : false };
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: Settings): void {
  try { storage?.setItem(CONFIG.settings.storageKey, JSON.stringify(s)); } catch { /* storage blocked */ }
}

/** "Minder zwalk": sway, rgbShift and phoneDouble are halved; steering and blackouts stay untouched. */
export function applyReducedMotion(fx: DrunkEffects, on: boolean): DrunkEffects {
  if (!on) return { ...fx };
  const f = CONFIG.settings.reducedMotionFactor;
  return { ...fx, sway: fx.sway * f, rgbShift: fx.rgbShift * f, phoneDouble: fx.phoneDouble * f };
}
