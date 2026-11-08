import { CONFIG } from '../config';
import type { FlashEvent } from '../core/events';

export const FINE_ANSWERS = ['Betalen', 'Bezwaar maken', 'Ik was het niet'] as const;

export interface OpenFine {
  amountEur: number; penalty: number; remainingSec: number; fraction: number;
  answers: string[]; payIndex: number; last: FlashEvent;
}
export type FineEvent =
  | { type: 'opened' | 'raised'; fine: OpenFine; addedEur: number }
  | { type: 'paid'; amountEur: number }
  | { type: 'refused'; amountEur: number; penalty: number; reason: 'answer' | 'timeout' };

/**
 * The speed fine (spec fase 3 §4.3): one open fine at a time. A new flash adds to it and restarts the clock.
 * The clock only runs through `update(dt)`, so pausing the game pauses the fine.
 */
export class FineSystem {
  private fine: OpenFine | null = null;

  constructor(private rng: () => number) {}

  get open(): OpenFine | null { return this.fine; }

  flash(f: FlashEvent): FineEvent {
    const F = CONFIG.fine;
    const addedEur = F.baseEur + F.eurPerKmh * f.kmhOver;
    const addedPenalty = F.basePenalty + F.penaltyPerKmh * f.kmhOver;
    if (this.fine) {
      this.fine.amountEur += addedEur; this.fine.penalty += addedPenalty;
      this.fine.remainingSec = F.timeLimitSec; this.fine.fraction = 1; this.fine.last = f;
      return { type: 'raised', fine: this.fine, addedEur };
    }
    const answers = [...FINE_ANSWERS] as string[];
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    this.fine = { amountEur: addedEur, penalty: addedPenalty, remainingSec: F.timeLimitSec, fraction: 1, answers, payIndex: answers.indexOf('Betalen'), last: f };
    return { type: 'opened', fine: this.fine, addedEur };
  }

  update(dt: number): FineEvent[] {
    const f = this.fine;
    if (!f) return [];
    f.remainingSec -= dt;
    f.fraction = Math.max(0, f.remainingSec / CONFIG.fine.timeLimitSec);
    return f.remainingSec > 0 ? [] : [this.refuse('timeout')];
  }

  answer(index: number): FineEvent[] {
    const f = this.fine;
    if (!f) return [];
    if (index === f.payIndex) { this.fine = null; return [{ type: 'paid', amountEur: f.amountEur }]; }
    return [this.refuse('answer')];
  }

  reset(): void { this.fine = null; }

  private refuse(reason: 'answer' | 'timeout'): FineEvent {
    const f = this.fine!;
    this.fine = null;
    return { type: 'refused', amountEur: f.amountEur + CONFIG.fine.surchargeEur, penalty: f.penalty, reason };
  }
}
