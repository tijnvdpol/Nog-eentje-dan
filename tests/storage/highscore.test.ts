// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { LocalHighscoreStore } from '../../src/storage/highscore';
beforeEach(() => window.localStorage.clear());
it('stores and returns the best score', () => {
  const s = new LocalHighscoreStore(window.localStorage);
  expect(s.getBest()).toBe(0);
  expect(s.submit(120)).toEqual({ best: 120, isNew: true });
  expect(s.submit(80)).toEqual({ best: 120, isNew: false });
  expect(new LocalHighscoreStore(window.localStorage).getBest()).toBe(120);
});
it('falls back to memory when storage throws', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const s = new LocalHighscoreStore(broken);
  expect(s.submit(50)).toEqual({ best: 50, isNew: true }); expect(s.getBest()).toBe(50);
});
it('ignores corrupt stored values', () => {
  window.localStorage.setItem('nog-eentje-dan:highscore', 'abc');
  expect(new LocalHighscoreStore(window.localStorage).getBest()).toBe(0);
});
