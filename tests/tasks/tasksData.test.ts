import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { TaskSystem } from '../../src/tasks/taskSystem';

const tasks = JSON.parse(readFileSync('public/content/tasks.json', 'utf8')) as Record<string, unknown>[];
const posts = JSON.parse(readFileSync('public/content/posts.json', 'utf8')) as { id: string }[];
const places = buildRoadData().places;

it('ships 34 valid tasks: 15 chat, 7 like, 12 destination, within the spec ranges', () => {
  const ts = new TaskSystem(tasks, () => 0.5, { postIds: new Set(posts.map((p) => p.id)), placeIds: new Set(places.map((p) => p.id)) });
  expect(ts.defs).toHaveLength(34);
  expect(new Set(ts.defs.map((d) => d.id)).size).toBe(34);
  const by = (t: string) => ts.defs.filter((d) => d.type === t);
  expect(by('chat')).toHaveLength(15); expect(by('like')).toHaveLength(7); expect(by('destination')).toHaveLength(12);
  const range = (t: string, r: [number, number], s: [number, number]) => {
    for (const d of by(t)) {
      expect(d.reward, d.id).toBeGreaterThanOrEqual(r[0]); expect(d.reward, d.id).toBeLessThanOrEqual(r[1]);
      expect(d.timeLimitSec, d.id).toBeGreaterThanOrEqual(s[0]); expect(d.timeLimitSec, d.id).toBeLessThanOrEqual(s[1]);
    }
  };
  range('chat', [50, 200], [8, 15]); range('like', [50, 100], [20, 30]); range('destination', [300, 500], [60, 150]);
  for (const p of places) expect(ts.defs.filter((d) => d.type === 'destination' && d.target === p.id), p.id).toHaveLength(2);
  expect(new Set(by('like').map((d) => d.type === 'like' && d.postId)).size).toBe(7);
  expect(ts.defs.filter((d) => d.onSuccess && d.onFail).length).toBeGreaterThanOrEqual(15);
});

it('has 2 destination tasks each for tankstation and dorpscafe, reward 400–500, 120–150 s', () => {
  const ts = new TaskSystem(tasks, () => 0.5, { postIds: new Set(posts.map((p) => p.id)), placeIds: new Set(places.map((p) => p.id)) });
  for (const id of ['tankstation', 'dorpscafe']) {
    const t = ts.defs.filter((d) => d.type === 'destination' && d.target === id);
    expect(t.length).toBe(2);
    for (const d of t) { expect(d.reward).toBeGreaterThanOrEqual(400); expect(d.reward).toBeLessThanOrEqual(500);
      expect(d.timeLimitSec).toBeGreaterThanOrEqual(120); expect(d.timeLimitSec).toBeLessThanOrEqual(150); }
  }
});
