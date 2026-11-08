import { CONFIG } from '../config';

export class PromilleModel {
  value: number;
  beers = 0;
  private drinkT: number | null = null;
  constructor(initial = 0) { this.value = initial; }
  get isDrinking(): boolean { return this.drinkT !== null; }
  get steerFactor(): number { return this.isDrinking ? CONFIG.beer.steerFactorWhileDrinking : 1; }
  get drinkProgress(): number | null {
    return this.drinkT === null ? null : Math.min(1, this.drinkT / CONFIG.beer.drinkDurationSec);
  }
  get isPassedOut(): boolean { return this.value > CONFIG.beer.passOutAbove + 1e-9; }
  startDrink(): boolean {
    if (this.isDrinking) return false;
    this.drinkT = 0;
    return true;
  }
  update(dt: number): void {
    this.value = Math.max(0, this.value - CONFIG.beer.decayPerSec * dt);
    if (this.drinkT !== null) {
      this.drinkT += dt;
      if (this.drinkT >= CONFIG.beer.drinkDurationSec - 1e-9) {
        this.drinkT = null;
        this.value += CONFIG.beer.promillePerBeer;
        this.beers++;
      }
    }
  }
}
