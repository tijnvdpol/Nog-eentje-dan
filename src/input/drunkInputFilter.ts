import type { DrunkEffects } from '../drunk/effects';
import type { DriveInput } from './input';

const NEUTRAL: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export class DrunkInputFilter {
  private buf: { t: number; input: DriveInput }[] = [];
  private driftDir: 1 | -1;
  private seg = -1;
  private n0 = 0;
  private n1 = 0;

  constructor(private rng: () => number) { this.driftDir = rng() < 0.5 ? -1 : 1; }

  /** Smooth ~1 Hz noise in [-1, 1]. */
  private noise(t: number): number {
    const seg = Math.floor(t);
    if (seg !== this.seg) {
      this.n0 = seg === this.seg + 1 ? this.n1 : this.rng() * 2 - 1;
      this.n1 = this.rng() * 2 - 1;
      this.seg = seg;
    }
    const f = t - seg;
    const s = f * f * (3 - 2 * f);
    return this.n0 + (this.n1 - this.n0) * s;
  }

  apply(input: DriveInput, fx: DrunkEffects, timeSec: number): DriveInput {
    this.buf.push({ t: timeSec, input });
    const cutoff = timeSec - fx.inputDelaySec;
    let chosen: DriveInput = NEUTRAL;
    let drop = 0;
    for (let i = 0; i < this.buf.length; i++) {
      if (this.buf[i].t <= cutoff + 1e-9) { chosen = this.buf[i].input; drop = i; } else break;
    }
    if (drop > 0) this.buf.splice(0, drop);
    if (fx.steerNoise === 0 && fx.driftBias === 0) return { ...chosen };
    const steer = chosen.steer + fx.steerNoise * this.noise(timeSec) + fx.driftBias * this.driftDir;
    return { ...chosen, steer: Math.max(-1, Math.min(1, steer)) };
  }
}
