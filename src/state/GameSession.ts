import type { Zone } from '../config';
import { ComboTracker, bierMultiplier, likePoints, zoneMultiplier } from '../scoring/scoring';
import { PromilleModel } from '../drunk/promille';
import { DamageModel } from '../vehicle/damage';
import { RunStats } from '../stats/runStats';

export interface CarInfo { speedKmh: number; zone: Zone; speedLimitKmh: number; phoneUp: boolean }
export type OverReason = 'wrecked' | 'passedOut';

export class GameSession {
  score = 0;
  multiplier = 1;
  over: OverReason | null = null;
  readonly stats = new RunStats();
  private promilleModel: PromilleModel;
  private damageModel = new DamageModel();
  private comboTracker = new ComboTracker();
  private liked = new Set<string>();
  private zoneMult = 1;

  constructor(initialPromille = 0) { this.promilleModel = new PromilleModel(initialPromille); }

  get damage(): number { return this.damageModel.value; }
  get promille(): number { return this.promilleModel.value; }
  get combo(): number { return this.comboTracker.current; }
  comboAt(timeSec: number): number { return this.comboTracker.currentAt(timeSec); }
  get steerFactor(): number { return this.promilleModel.steerFactor; }
  get drinkProgress(): number | null { return this.promilleModel.drinkProgress; }

  tick(dt: number, car: CarInfo): void {
    if (this.over) return;
    const beersBefore = this.promilleModel.beers;
    this.promilleModel.update(dt);
    for (let i = beersBefore; i < this.promilleModel.beers; i++) this.stats.addBeer();
    this.stats.update(dt, car);
    this.zoneMult = zoneMultiplier(car.zone, car.speedKmh, car.speedLimitKmh);
    this.multiplier = bierMultiplier(this.promille) * this.zoneMult;
    this.checkOver();
  }

  like(postId: string, timeSec: number): number {
    if (this.over || this.liked.has(postId)) return 0;
    this.liked.add(postId);
    const combo = this.comboTracker.registerLike(timeSec);
    const pts = likePoints(combo, bierMultiplier(this.promille), this.zoneMult);
    this.score += pts;
    this.stats.addLike();
    return pts;
  }

  startDrink(): boolean { return this.over ? false : this.promilleModel.startDrink(); }

  impact(kmh: number): number[] {
    if (this.over) return [];
    const levels = this.damageModel.apply(kmh);
    this.checkOver();
    return levels;
  }

  /** Debug only (?debug): set the promille directly. */
  debugSetPromille(v: number): void { this.promilleModel.value = v; }

  private checkOver(): void {
    if (this.over) return;
    if (this.damageModel.isWrecked) this.over = 'wrecked';
    else if (this.promilleModel.isPassedOut) this.over = 'passedOut';
  }
}
