import { CONFIG, type Zone } from '../config';
import type { PedKind } from '../pedestrians/pedestrianLogic';
import { ComboTracker, bierMultiplier, likePoints, zoneMultiplier } from '../scoring/scoring';
import { PromilleModel } from '../drunk/promille';
import { DamageModel } from '../vehicle/damage';
import { RunStats } from '../stats/runStats';
import { BeerStock } from '../beer/beerStock';

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
  private beerStock = new BeerStock();
  private zoneMult = 1;

  constructor(initialPromille = 0) { this.promilleModel = new PromilleModel(initialPromille); }

  get damage(): number { return this.damageModel.value; }
  get promille(): number { return this.promilleModel.value; }
  get combo(): number { return this.comboTracker.current; }
  comboAt(timeSec: number): number { return this.comboTracker.currentAt(timeSec); }
  get steerFactor(): number { return this.promilleModel.steerFactor; }
  get drinkProgress(): number | null { return this.promilleModel.drinkProgress; }
  get beersLeft(): number { return this.beerStock.count; }
  get refillProgress(): number { return this.beerStock.refillProgress; }

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

  /** Nearly hit a pedestrian (spec fase 2 §7.3): a flat penalty, never below zero. */
  nearMiss(kind: PedKind): void {
    if (this.over) return;
    this.score = Math.max(0, this.score - CONFIG.peds.nearMissPenalty);
    this.stats.addScared(kind);
  }

  /** Opens a beer from the sixpack; false when the run is over, a beer is already open or the stock is empty. */
  startDrink(): boolean {
    if (this.over || this.promilleModel.isDrinking || !this.beerStock.take()) return false;
    return this.promilleModel.startDrink();
  }

  /** Standing still at the supermarket or party refills the sixpack; true on the step it is refilled. */
  refill(dt: number, nearRefillPlace: boolean, speedKmh: number): boolean {
    return this.over ? false : this.beerStock.update(dt, nearRefillPlace, speedKmh);
  }

  hasLiked(postId: string): boolean { return this.liked.has(postId); }

  /** Ran a red light (spec fase 2 §6): 25 × bier × zone. Returns the points. */
  redLight(): number {
    if (this.over) return 0;
    const pts = this.award(CONFIG.redLight.basePoints);
    this.stats.redLights++;
    return pts;
  }

  /** Completed a task (spec fase 2 §3.3): reward × bier × zone, no combo. Returns the points. */
  taskReward(reward: number): number {
    if (this.over) return 0;
    const pts = this.award(reward);
    this.stats.tasksCompleted++;
    return pts;
  }

  private award(base: number): number {
    const pts = Math.round(base * bierMultiplier(this.promille) * this.zoneMult);
    this.score += pts;
    return pts;
  }

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
