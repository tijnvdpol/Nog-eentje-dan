import type { Settings } from '../settings/settings';

/** Settings overlay: volume slider, "Minder zwalk" checkbox and a back button. */
export function showSettings(root: HTMLElement, current: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
  const state = { ...current };
  root.innerHTML = `<div class="screen"><div class="screen__box">
    <h2>Instellingen</h2>
    <label class="settings__row">Volume <input type="range" name="volume" min="0" max="100" step="1"><output></output></label>
    <label class="settings__row"><input type="checkbox" name="reducedMotion"> Minder zwalk (rustiger beeld bij veel bier)</label>
  </div></div>`;
  const box = root.querySelector('.screen__box') as HTMLElement;
  const vol = box.querySelector<HTMLInputElement>('input[name=volume]')!;
  const out = box.querySelector('output')!;
  const rm = box.querySelector<HTMLInputElement>('input[name=reducedMotion]')!;
  vol.value = String(state.volume); out.textContent = `${state.volume}%`; rm.checked = state.reducedMotion;
  vol.addEventListener('input', () => { state.volume = Math.round(Number(vol.value)); out.textContent = `${state.volume}%`; onChange({ ...state }); });
  rm.addEventListener('change', () => { state.reducedMotion = rm.checked; onChange({ ...state }); });
  const back = document.createElement('button');
  back.textContent = 'Terug';
  back.addEventListener('click', onClose);
  box.appendChild(back);
}
