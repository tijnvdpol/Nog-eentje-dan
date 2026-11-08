import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Post } from '../../src/phone/Phone';
const posts: Post[] = JSON.parse(readFileSync('public/content/posts.json', 'utf8'));
it('has >= 60 valid posts with existing media and no duplicate ids', () => {
  expect(posts.length).toBeGreaterThanOrEqual(60);
  expect(new Set(posts.map((p) => p.id)).size).toBe(posts.length);
  for (const p of posts) {
    expect(p.id && p.account && p.avatar && p.caption).toBeTruthy();
    expect(['photo', 'meme', 'video', 'ad']).toContain(p.type);
    expect(Array.isArray(p.tags)).toBe(true);
    expect(existsSync(`public/content/${p.media}`)).toBe(true);
  }
  const n = (t: string) => posts.filter((p) => p.type === t).length;
  expect(n('ad')).toBeGreaterThanOrEqual(8); expect(n('meme')).toBeGreaterThanOrEqual(8); expect(n('video')).toBeGreaterThanOrEqual(6);
});
