import { CONFIG } from '../config';

export function damageFromImpact(impactKmh: number): number {
  const d = (impactKmh - CONFIG.damage.thresholdKmh) * CONFIG.damage.factor;
  return Math.min(CONFIG.damage.maxPerHit, Math.max(0, d));
}

export class DamageModel {
  value = 0;
  apply(impactKmh: number): number[] {
    const before = this.value;
    this.value = Math.min(100, before + damageFromImpact(impactKmh));
    return CONFIG.damage.crackLevels.filter((l) => before < l && this.value >= l);
  }
  get isWrecked(): boolean { return this.value >= 100; }
}
