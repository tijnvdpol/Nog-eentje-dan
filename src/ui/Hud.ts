import { crackSvg } from './cracks';

const nl = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export class Hud {
  private score: HTMLElement;
  private combo: HTMLElement;
  private dash: HTMLElement;
  private cracks: HTMLElement;
  private fps: HTMLElement | null = null;
  private crackCount = 0;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="hud__score">0</div>
      <div class="hud__combo"></div>
      <div class="hud__dash"></div>
      <div class="hud__cracks"></div>`;
    this.score = root.querySelector('.hud__score')!;
    this.combo = root.querySelector('.hud__combo')!;
    this.dash = root.querySelector('.hud__dash')!;
    this.cracks = root.querySelector('.hud__cracks')!;
  }

  update(v: { score: number; speedKmh: number; damage: number; promille: number; multiplier: number; combo: number }): void {
    this.score.textContent = String(Math.round(v.score));
    this.combo.textContent = v.combo > 1 ? `combo ×${nl(v.combo, 2)}` : '';
    this.dash.innerHTML =
      `<span><b>${Math.round(v.speedKmh)}</b> km/u</span>` +
      `<span>schade <b>${Math.round(v.damage)}</b>%</span>` +
      `<span><b>${nl(v.promille, 2)}</b> ‰</span>` +
      `<span>×<b>${nl(v.multiplier, 1)}</b></span>`;
  }

  showCracks(levels: number[]): void {
    for (const l of levels) {
      const el = document.createElement('div');
      el.className = 'hud__crack';
      el.innerHTML = crackSvg(l as 25 | 50 | 75, 1000 + this.crackCount++);
      this.cracks.appendChild(el);
    }
  }

  showFps(fps: number): void {
    if (!this.fps) {
      this.fps = document.createElement('div');
      this.fps.className = 'hud__fps';
      this.root.appendChild(this.fps);
    }
    this.fps.textContent = `${Math.round(fps)} fps`;
  }

  reset(): void {
    this.cracks.innerHTML = '';
    this.crackCount = 0;
    this.update({ score: 0, speedKmh: 0, damage: 0, promille: 0, multiplier: 1, combo: 1 });
  }
}
