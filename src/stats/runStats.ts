export class RunStats {
  phoneUpSec = 0; beers = 0; likes = 0; distanceM = 0; topSpeedKmh = 0;
  update(dt: number, s: { speedKmh: number; phoneUp: boolean }): void {
    if (s.phoneUp) this.phoneUpSec += dt;
    this.distanceM += (Math.abs(s.speedKmh) / 3.6) * dt;
    this.topSpeedKmh = Math.max(this.topSpeedKmh, Math.abs(s.speedKmh));
  }
  addLike(): void { this.likes++; }
  addBeer(): void { this.beers++; }
}

export function formatEndLines(s: RunStats): string[] {
  const km = (s.distanceM / 1000).toFixed(1).replace('.', ',');
  return [
    `Je keek ${Math.round(s.phoneUpSec)} seconden niet naar de weg.`,
    `${s.beers} ${s.beers === 1 ? 'biertje' : 'biertjes'}, ${s.likes} ${s.likes === 1 ? 'like' : 'likes'}.`,
    `Je reed ${km} km, met een topsnelheid van ${Math.round(s.topSpeedKmh)} km/u.`,
  ];
}
