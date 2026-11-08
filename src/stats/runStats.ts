export type ScaredCounts = { jogger: number; student: number; oma: number };

export class RunStats {
  phoneUpSec = 0; beers = 0; likes = 0; distanceM = 0; topSpeedKmh = 0;
  scared: ScaredCounts = { jogger: 0, student: 0, oma: 0 };
  tasksCompleted = 0; redLights = 0;
  flitsen = 0; fineTotalEur = 0; finePaidEur = 0;
  update(dt: number, s: { speedKmh: number; phoneUp: boolean }): void {
    if (s.phoneUp) this.phoneUpSec += dt;
    this.distanceM += (Math.abs(s.speedKmh) / 3.6) * dt;
    this.topSpeedKmh = Math.max(this.topSpeedKmh, Math.abs(s.speedKmh));
  }
  addLike(): void { this.likes++; }
  addBeer(): void { this.beers++; }
  /** A camera flash opened or raised a fine by `eur`. */
  addFlash(eur: number): void { this.flitsen++; this.fineTotalEur += eur; }
  /** Surcharge for a refused fine. */
  addSurcharge(eur: number): void { this.fineTotalEur += eur; }
  addPaid(eur: number): void { this.finePaidEur += eur; }
  addScared(kind: keyof ScaredCounts): void { this.scared[kind]++; }
}

const SCARED_WORDS: [keyof ScaredCounts, string, string][] = [
  ['jogger', 'jogger', 'joggers'], ['student', 'student', 'studenten'], ['oma', 'bejaarde', 'bejaarden'],
];

/** Dutch list: "a", "a en b", "a, b en c". */
function joinNl(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}`;
}

function scareLine(s: ScaredCounts): string {
  const parts = SCARED_WORDS.filter(([k]) => s[k] > 0).map(([k, one, many]) => `${s[k]} ${s[k] === 1 ? one : many}`);
  return parts.length ? `${joinNl(parts)} laten schrikken.` : 'Niemand laten schrikken. Knap.';
}

export function formatEndLines(s: RunStats): string[] {
  const km = (s.distanceM / 1000).toFixed(1).replace('.', ',');
  return [
    `Je keek ${Math.round(s.phoneUpSec)} seconden niet naar de weg.`,
    `${s.beers} ${s.beers === 1 ? 'biertje' : 'biertjes'}, ${s.likes} ${s.likes === 1 ? 'like' : 'likes'}.`,
    `Je reed ${km} km, met een topsnelheid van ${Math.round(s.topSpeedKmh)} km/u.`,
    `${s.tasksCompleted} ${s.tasksCompleted === 1 ? 'opdracht' : 'opdrachten'} voltooid, ${s.redLights} keer door rood.`,
    scareLine(s.scared),
    s.flitsen > 0
      ? `${s.flitsen} keer geflitst. €${s.fineTotalEur} aan boetes, waarvan je €${s.finePaidEur} hebt betaald.`
      : 'Geen enkele keer geflitst. Saai.',
  ];
}
