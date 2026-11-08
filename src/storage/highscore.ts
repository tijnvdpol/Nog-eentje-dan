export interface HighscoreStore { getBest(): number; submit(score: number): { best: number; isNew: boolean } }
const KEY = 'nog-eentje-dan:highscore';

export class LocalHighscoreStore implements HighscoreStore {
  private memory = 0;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStorage()) {}
  getBest(): number {
    let stored = 0;
    try {
      const v = Number(this.storage?.getItem(KEY));
      if (Number.isFinite(v) && v > 0) stored = v;
    } catch { /* ignore */ }
    return Math.max(stored, this.memory);
  }
  submit(score: number): { best: number; isNew: boolean } {
    const prev = this.getBest();
    if (score > prev) {
      this.memory = score;
      try { this.storage?.setItem(KEY, String(score)); } catch { /* memory fallback */ }
      return { best: score, isNew: true };
    }
    return { best: prev, isNew: false };
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
