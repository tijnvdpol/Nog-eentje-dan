import type { OverReason } from '../state/GameSession';

const CONTROLS: [string, string][] = [
  ['W / ↑', 'Gas'], ['S / ↓', 'Remmen / achteruit'], ['A D / ← →', 'Sturen'], ['Spatie', 'Handrem'],
  ['Q', 'Telefoon pakken / wegleggen'], ['Dubbelklik', 'Post liken (telefoon omhoog)'],
  ['Muiswiel', 'Feed scrollen (telefoon omhoog)'], ['E', 'Biertje drinken'], ['Esc', 'Pauze'],
];

const REASONS: Record<OverReason, string> = {
  passedOut: 'Je bent in slaap gevallen achter het stuur.',
  wrecked: 'Je auto is total loss.',
};

export class Screens {
  constructor(private root: HTMLElement) {}

  private show(html: string): HTMLElement {
    this.root.innerHTML = `<div class="screen"><div class="screen__box">${html}</div></div>`;
    return this.root.querySelector('.screen__box') as HTMLElement;
  }

  private button(box: HTMLElement, label: string, onClick: () => void): void {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    box.appendChild(b);
  }

  showLoading(progress: number): void {
    this.show(`<h2>Laden…</h2><p>${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</p>`);
  }

  showWebGLError(): void {
    this.show('<h2>Oeps</h2><p>Je browser ondersteunt geen WebGL, dus de game kan hier niet draaien. Probeer een recente versie van Chrome, Edge of Firefox.</p>');
  }

  showStart(onStart: () => void): void {
    const rows = CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    const box = this.show(`<h1>Nog Eentje Dan</h1><p>Satire. Dit is precies waarom je dit nooit in het echt doet.</p><table>${rows}</table>`);
    this.button(box, 'Start', onStart);
  }

  showPause(onResume: () => void): void {
    const box = this.show('<h2>Pauze</h2>');
    this.button(box, 'Verder rijden', onResume);
  }

  showGameOver(
    r: { reason: OverReason; score: number; best: number; isNew: boolean; lines: string[] },
    onRestart: () => void,
  ): void {
    const lines = r.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
    const box = this.show(
      `<h2>${REASONS[r.reason]}</h2><p>Score: <b>${r.score}</b></p>` +
      (r.isNew ? '<p class="screen__new">Nieuwe highscore!</p>' : `<p>Highscore: ${r.best}</p>`) + lines,
    );
    this.button(box, 'Nog een rondje', onRestart);
  }

  hide(): void { this.root.innerHTML = ''; }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
