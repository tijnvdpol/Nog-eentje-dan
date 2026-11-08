export class FeedShuffler {
  private recent: string[] = [];
  constructor(private ids: string[], private minGap: number, private rng: () => number) {
    if (ids.length <= minGap) throw new Error(`Need more than ${minGap} posts, got ${ids.length}`);
  }
  next(): string {
    const pool = this.ids.filter((id) => !this.recent.includes(id));
    const pick = pool[Math.floor(this.rng() * pool.length) % pool.length];
    this.recent.push(pick);
    if (this.recent.length > this.minGap) this.recent.shift();
    return pick;
  }
}
