import { expect, it } from 'vitest';
import { FeedShuffler } from '../../src/phone/feed';
import { mulberry32 } from '../../src/util/rng';
it('never repeats within 20 picks', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `p${i}`); const f = new FeedShuffler(ids, 20, mulberry32(9));
  const picks = Array.from({ length: 500 }, () => f.next());
  for (let i = 0; i < picks.length; i++) expect(picks.slice(Math.max(0, i - 20), i)).not.toContain(picks[i]);
});
it('throws when there are not enough posts', () => { expect(() => new FeedShuffler(['a'], 20, Math.random)).toThrow(); });
