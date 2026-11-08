import { afterEach, expect, it, vi } from 'vitest';
import { buildRoadData } from '../../scripts/generate-roads';
import { TaskSystem, type TaskEvent } from '../../src/tasks/taskSystem';
import { mulberry32 } from '../../src/util/rng';

const places = buildRoadData().places;
const known = { postIds: new Set(['p07', 'p08']), placeIds: new Set(places.map((p) => p.id)) };
const chat = (id: string, over: object = {}) => ({ id, type: 'chat', from: 'Mama', text: 'Waar ben je?', timeLimitSec: 10, reward: 100, answers: ['a', 'b', 'c'], correct: [0], ...over });
const like = (id: string, postId = 'p07') => ({ id, type: 'like', from: 'Kevin', text: 'Like mijn post!', timeLimitSec: 20, reward: 60, postId });
const dest = (id: string, target: string) => ({ id, type: 'destination', from: 'Bram', text: 'Kom langs', timeLimitSec: 60, reward: 400, target });
const ctx = (timeSec: number, over: object = {}) => ({ timeSec, player: { x: -200, z: 200 }, speedKmh: 30, places, isLiked: () => false, ...over });

/** Advance with dt = 0.1 from `from` to `to`, collecting events. */
function run(ts: TaskSystem, from: number, to: number, over: object = {}): { t: number; e: TaskEvent }[] {
  const out: { t: number; e: TaskEvent }[] = [];
  for (let t = from; t < to - 1e-9; t += 0.1) for (const e of ts.update(0.1, ctx(t + 0.1, over))) out.push({ t: t + 0.1, e });
  return out;
}
afterEach(() => { vi.restoreAllMocks(); });

it('first task 20 s after intro end, next 45–60 s after resolve', () => {
  const ts = new TaskSystem([chat('a'), chat('b')], mulberry32(1), known);
  ts.start(13);
  expect(run(ts, 0, 32.9)).toEqual([]);
  const first = run(ts, 32.9, 33.2);
  expect(first.map((x) => x.e.type)).toEqual(['started']);
  expect(ts.answer(0)[0]).toMatchObject({ type: 'resolved', success: true });
  const later = run(ts, 33.2, 100, {}).filter((x) => x.e.type === 'started');
  expect(later[0].t).toBeGreaterThanOrEqual(33.2 + 45 - 0.1); expect(later[0].t).toBeLessThanOrEqual(33.2 + 60 + 0.2);
});
it('chat: correct answer succeeds, wrong answer fails, second answer ignored', () => {
  const ts = new TaskSystem([chat('a', { correct: [1, 2] })], mulberry32(1), known); ts.start(0); run(ts, 0, 21);
  const r = ts.answer(0); expect(r).toEqual([{ type: 'resolved', task: expect.objectContaining({ id: 'a' }), success: false, reply: 'Laat maar dan 🙄' }]);
  expect(ts.answer(1)).toEqual([]);
  const ts2 = new TaskSystem([chat('a', { correct: [1, 2], onSuccess: 'Lief!' })], mulberry32(1), known); ts2.start(0); run(ts2, 0, 21);
  expect(ts2.answer(2)[0]).toMatchObject({ success: true, reply: 'Lief!' });
});
it('chat: time out fails', () => {
  const ts = new TaskSystem([chat('a', { onFail: 'Dan niet!' })], mulberry32(1), known); ts.start(0); run(ts, 0, 20.05);
  expect(ts.active?.def.id).toBe('a');
  const ev = run(ts, 20.05, 30.2).filter((x) => x.e.type === 'resolved');
  expect(ev).toHaveLength(1); expect(ev[0].e).toMatchObject({ success: false, reply: 'Dan niet!' });
  expect(ev[0].t).toBeGreaterThan(30); expect(ts.active).toBeNull();
});
it('expires only through update dt (pause-safe)', () => {
  const ts = new TaskSystem([chat('a')], mulberry32(1), known); ts.start(0); run(ts, 0, 21);
  const left = ts.active!.remainingSec;
  expect(ts.active!.remainingSec).toBe(left); // no update calls → nothing changes
  ts.update(0.5, ctx(1000)); // a huge jump in time does not matter, only dt
  expect(ts.active!.remainingSec).toBeCloseTo(left - 0.5); expect(ts.active!.fraction).toBeCloseTo((left - 0.5) / 10);
});
it('destination: arrive within 15 m below 20 km/h', () => {
  const ts = new TaskSystem([dest('d', 'huis')], mulberry32(1), known); ts.start(0); run(ts, 0, 21);
  expect(ts.active?.def.id).toBe('d');
  expect(ts.update(0.1, ctx(21.1, { player: { x: 210, z: 200 }, speedKmh: 25 }))).toEqual([]);
  expect(ts.update(0.1, ctx(21.2, { player: { x: 220, z: 200 }, speedKmh: 15 }))).toEqual([]); // 20 m: too far
  expect(ts.update(0.1, ctx(21.3, { player: { x: 210, z: 200 }, speedKmh: 15 }))[0]).toMatchObject({ type: 'resolved', success: true, reply: 'Top! 👍' });
});
it('destination never picks a place within 150 m', () => {
  for (let seed = 1; seed < 20; seed++) {
    const ts = new TaskSystem([dest('d1', 'snackbar'), dest('d2', 'snackbar'), chat('c')], mulberry32(seed), known); ts.start(0);
    const started = run(ts, 0, 21, { player: { x: 100, z: 10 } }).filter((x) => x.e.type === 'started');
    expect(started[0].e.task.id).toBe('c');
  }
});
it('like: skipped when already liked; succeeds on liked(postId)', () => {
  const ts = new TaskSystem([like('l', 'p07'), chat('c')], mulberry32(1), known); ts.start(0);
  for (let i = 0; i < 10; i++) {
    const s = run(ts, 0, 21, { isLiked: (id: string) => id === 'p07' }).filter((x) => x.e.type === 'started');
    expect(s[0].e.task.id).toBe('c'); ts.reset(); ts.start(0);
  }
  const t2 = new TaskSystem([like('l', 'p07')], mulberry32(1), known); t2.start(0); run(t2, 0, 21);
  expect(t2.liked('p08')).toEqual([]);
  expect(t2.liked('p07')[0]).toMatchObject({ type: 'resolved', success: true });
});
it('never the same task twice in a row', () => {
  const ts = new TaskSystem([chat('a'), chat('b')], mulberry32(5), known); ts.start(0);
  const ids: string[] = []; let t = 0;
  for (let round = 0; round < 20; round++) {
    while (!ts.active) { ts.update(0.5, ctx(t += 0.5)); }
    ids.push(ts.active.def.id); ts.answer(0);
  }
  for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
});
it('drops invalid defs with a warning', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const ts = new TaskSystem([chat('ok'), like('l', 'p999'), dest('d', 'kroeg'), chat('two', { answers: ['a', 'b'] }), chat('badc', { correct: [3] }), { id: 'x', type: 'dance' }], mulberry32(1), known);
  expect(ts.defs.map((d) => d.id)).toEqual(['ok']);
  expect(warn).toHaveBeenCalledTimes(5);
});
it('reset clears the active task and schedule', () => {
  const ts = new TaskSystem([chat('a')], mulberry32(1), known); ts.start(0); run(ts, 0, 21); expect(ts.active).not.toBeNull();
  ts.reset(); expect(ts.active).toBeNull();
  expect(run(ts, 0, 100).filter((x) => x.e.type === 'started')).toEqual([]);
});
