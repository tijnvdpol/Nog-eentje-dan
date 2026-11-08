export type Zone = 'city' | 'nweg' | 'snelweg';

export const CONFIG = {
  like: { basePoints: 10, comboWindowSec: 2, comboStep: 0.25, comboMax: 3 },
  beer: { promillePerBeer: 0.3, decayPerSec: 0.005, drinkDurationSec: 1.5,
          steerFactorWhileDrinking: 0.5, multiplierPerBeer: 0.5, passOutAbove: 3.0 },
  zone: { city: 1, nweg: 1.25, snelweg: 1.5, minSpeedFraction: 0.5 },
  damage: { thresholdKmh: 5, factor: 0.8, maxPerHit: 60, crackLevels: [25, 50, 75] },
  feed: { minGapBeforeRepeat: 20 },
  traffic: { radiusM: 300, maxCars: 30, minGapM: 8, headwaySec: 2, laneWidthM: 3.5 },
  world: { fogFarM: 300, seed: 1337 },
  phone: { coverFraction: 0.4 },
  loop: { fixedDt: 1 / 60, maxFrameDt: 0.25 },
  blackout: { durationSec: 0.5 },
} as const;
