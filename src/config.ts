export type Zone = 'city' | 'nweg' | 'snelweg';

export const CONFIG = {
  like: { basePoints: 10, comboWindowSec: 2, comboStep: 0.25, comboMax: 3 },
  beer: { promillePerBeer: 0.3, decayPerSec: 0.005, drinkDurationSec: 1.5,
          steerFactorWhileDrinking: 0.5, multiplierPerBeer: 0.5, passOutAbove: 3.0,
          stockMax: 6, refillPlaces: ['supermarkt', 'feestje', 'tankstation'] as readonly string[], refillRadiusM: 15, refillMaxKmh: 5, refillHoldSec: 2, emptyNoticeCooldownSec: 10, iconAtOrBelow: 2 },
  zone: { city: 1, nweg: 1.25, snelweg: 1.5, minSpeedFraction: 0.5 },
  damage: { thresholdKmh: 5, factor: 0.8, maxPerHit: 60, crackLevels: [25, 50, 75] },
  feed: { minGapBeforeRepeat: 20 },
  traffic: { radiusM: 300, maxCars: 30, minGapM: 8, headwaySec: 2, laneWidthM: 3.5 },
  world: { fogFarM: 300, seed: 1337, chunkSizeM: 250 },
  phone: { coverFraction: 0.4 },
  loop: { fixedDt: 1 / 60, maxFrameDt: 0.25 },
  blackout: { durationSec: 0.5 },
  signals: { greenSec: 8, orangeSec: 2, allRedSec: 1, offsetStepSec: 4, stopLineSignalM: 12.5, stopLineM: 6, clearAfterM: 8, orangeBrake: 6 },
  ring: { exitProb: 0.25, laneChangeProb: 0.2, laneChangeFreeM: 25, laneChangeSec: 1.5, mergeBehindSec: 2.5, mergeAheadM: 20, mergeZoneM: 5 },
  horn: { afterSec: 2, cooldownSec: 10 },
  redLight: { basePoints: 25, boxHalfM: 8, rearmM: 15 },
  peds: { radiusM: 150, max: 12, spawnPerSec: 0.2, carClearM: 25, dodgeTtcSec: 1.0, dodgeLateralM: 1.5, dodgeSec: 0.4, dodgeDistM: 3,
          nearMissM: 2, nearMissPenalty: 25, crossingWidthM: 3, crossingFromNodeM: 10,
          speeds: { jogger: 2.5, student: 1.0, oma: 0.6 }, mix: { jogger: 0.4, student: 0.4, oma: 0.2 } },
  tasks: { firstDelaySec: 20, gapMinSec: 45, gapMaxSec: 60, destMinDistM: 150, arriveRadiusM: 15, arriveMaxKmh: 20, likeWithinPosts: 10 },
  village: { houseSpacingM: 14, gapChance: 0.3, houseW: 8, houseD: 9, frontFromCenterM: 7, wallHMin: 3, wallHMax: 5, roofH: 2.5, nodeClearM: 20, lampEveryM: 40 },
  nweg: { treeOffsetM: 9, treeEveryM: 15, reflectorOffsetM: 4.5, reflectorEveryM: 50 },
  tankstation: { forecourt: { cx: 2460, cz: 18, w: 30, d: 20 } },
  speedCamera: { toleranceKmh: 4, rearmDistM: 50, maxHeadingDeg: 60, lateralMarginM: 2, flashSec: 0.3, sideOffsetM: 2 },
  fine: { baseEur: 50, eurPerKmh: 8, basePenalty: 50, penaltyPerKmh: 5, timeLimitSec: 12, surchargeEur: 50 },
  settings: { defaultVolume: 80, reducedMotionFactor: 0.5, storageKey: 'nog-eentje-dan:settings' },
  attract: { radiusM: 250, heightM: 60, periodSec: 90, blurPx: 4 },
  models: { budgetMB: 5 },
  facade: { floorH: 3, plinthH: 4, windowW: 1.4, windowGap: 1.2, recessM: 0.15, lodNearM: 120,
            typeMix: { kantoor: 0.3, baksteen: 0.45, flat: 0.25 }, awningShare: 0.4, roofPartsMax: 3,
            /** Wall colours per type, taken from the City Kit Commercial colormap (6 per type). */
            palette: {
              kantoor: [0x868ba1, 0xa0a8c9, 0x8e95b3, 0x666b80, 0xbcc5ec, 0x6d738a],
              baksteen: [0xb06041, 0xcf735b, 0x995a41, 0xab5f41, 0xc46d56, 0x875542],
              flat: [0xfde4c7, 0xf2bf99, 0xfaae8a, 0xf7f7fa, 0xf1976c, 0xdcdce9],
            } as Record<'kantoor' | 'baksteen' | 'flat', readonly number[]>,
            /** Share of shop windows without an awning that still have their lights on. */
            plinthLitShare: 0.45,
            /** Unlit window glass: colour and the faint glow that keeps it from going pitch black. */
            glassDark: 0x2a3a58, glassDarkEmissive: 0x0c1424,
            /** Glow of the lit windows painted into the far-level texture. */
            farEmissiveIntensity: 0.75,
            /** Height of a shop sign board, in metres (it hangs above the awning). */
            signH: 0.8,
            /** Facades are grouped per cell this size (one city block) for the near/far switch at `lodNearM`. */
            lodCellM: 100 },
  sidewalk: { widthM: 2.5, kerbH: 0.15,
              /** Slab and kerb-stone colours; `loweredH` is the height of the lowered parts (zebras, crossing corners). */
              colour: 0x666a78, kerbColour: 0x9da4b8, loweredH: 0.04 },
  props: { benchEveryM: 60, binEveryM: 45,
           /** Kept clear around nodes and places; distance from the sidewalk's back (building-side) edge. */
           nodeClearM: 15, placeClearM: 15, backM: 0.4 },
  light: { windowLitShare: 0.35, windowWarmShare: 0.8, houseLitShare: 0.6, bloomStrength: 0.6, bloomRadius: 0.4, bloomThreshold: 0.85 },
  audio: { lowpassMaxHz: 20000, lowpassMinHz: 800, wobbleFromPromille: 1.3, wobbleMaxCents: 30, gearBandKmh: 30, maxGear: 4, tiresMinKmh: 20 },
} as const;
