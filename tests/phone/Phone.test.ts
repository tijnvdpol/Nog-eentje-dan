// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../../src/core/events';
import { drunkEffects } from '../../src/drunk/effects';
import { Phone, type Post } from '../../src/phone/Phone';
import { mulberry32 } from '../../src/util/rng';

const posts: Post[] = Array.from({ length: 60 }, (_, i) => ({
  id: `p${i}`, account: `@a${i}`, avatar: '🙂', type: 'photo', media: `media/p${i}.svg`, caption: `c${i}`, tags: [],
}));
let root: HTMLElement, bus: EventBus<GameEvents>, phone: Phone, feedEl: HTMLElement;
const articles = () => Array.from(root.querySelectorAll<HTMLElement>('article.post'));
beforeEach(() => {
  document.body.innerHTML = '<div id="phone"></div>'; root = document.getElementById('phone')!;
  bus = new EventBus<GameEvents>(); phone = new Phone(root, posts, bus, mulberry32(4));
  feedEl = root.querySelector('.phone__feed') as HTMLElement;
});
const dbl = (el: Element) => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

it('renders an initial batch of posts', () => { expect(articles().length).toBeGreaterThanOrEqual(8); });
it('wheel does nothing when down and is contained when up', () => {
  phone.setUp(false); const e = new WheelEvent('wheel', { deltaY: 100, cancelable: true }); feedEl.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true); expect(feedEl.scrollTop).toBe(0);
  phone.setUp(true); const e2 = new WheelEvent('wheel', { deltaY: 100, cancelable: true }); feedEl.dispatchEvent(e2);
  expect(e2.defaultPrevented).toBe(false);
});
it('double-click likes once and only when up', () => {
  const likes: string[] = []; bus.on('like', (p) => likes.push(p.postId));
  const post = articles()[0];
  phone.setUp(false); dbl(post); expect(likes).toEqual([]);
  phone.setUp(true); dbl(post); dbl(post);
  expect(likes).toEqual([post.dataset.postId]); expect(post.classList.contains('post--liked')).toBe(true);
});
it('a repeated post shows as already liked', () => {
  const likes: string[] = []; bus.on('like', (p) => likes.push(p.postId));
  phone.setUp(true);
  const first = articles()[0]; const id = first.dataset.postId!; dbl(first);
  let guard = 0;
  while (articles().filter((a) => a.dataset.postId === id).length < 2 && guard++ < 50) feedEl.dispatchEvent(new Event('scroll'));
  const again = articles().filter((a) => a.dataset.postId === id)[1];
  expect(again).toBeDefined(); expect(again.classList.contains('post--liked')).toBe(true);
  dbl(again); expect(likes).toEqual([id]);
});
it('removes a post whose media fails to load', () => {
  const a = articles()[0]; const n = articles().length;
  a.querySelector('img')!.dispatchEvent(new Event('error')); expect(articles().length).toBe(n - 1);
});
it('appends more posts when scrolled near the bottom', () => {
  const n = articles().length;
  Object.defineProperty(feedEl, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(feedEl, 'clientHeight', { value: 600, configurable: true });
  feedEl.scrollTop = 3000; feedEl.dispatchEvent(new Event('scroll')); expect(articles().length).toBe(n);
  feedEl.scrollTop = 4000; feedEl.dispatchEvent(new Event('scroll')); expect(articles().length).toBeGreaterThan(n);
});
it('applyEffects sets CSS variables', () => {
  phone.applyEffects({ ...drunkEffects(0), phoneBlurPx: 2 }); expect(root.style.getPropertyValue('--phone-blur')).toBe('2px');
});
it('notify shows a banner also when down', () => {
  phone.setUp(false); phone.notify('Mama', 'Waar ben je?'); expect(root.querySelector('.phone__banner')?.textContent).toContain('Mama');
});
it('prunes posts far above the viewport without moving what is on screen', () => {
  // jsdom has no layout: give every post a fixed height and stack them in DOM order.
  const H = 500;
  const proto = HTMLElement.prototype;
  const saved = ['offsetTop', 'offsetHeight'].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)!] as const);
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.matches('article.post') ? H : 0; } });
  Object.defineProperty(proto, 'offsetTop', { configurable: true, get(this: HTMLElement) {
    return this.matches('article.post') ? articles().indexOf(this) * H : 0;
  } });
  Object.defineProperty(feedEl, 'scrollHeight', { configurable: true, get: () => articles().length * H });
  Object.defineProperty(feedEl, 'clientHeight', { configurable: true, value: 600 });
  const above = () => articles().filter((a) => a.offsetTop + a.offsetHeight <= feedEl.scrollTop).length;
  try {
    phone.setUp(true);
    let maxAbove = 0;
    for (let step = 0; step < 200; step++) {
      feedEl.scrollTop += 250;
      const anchor = articles().find((a) => a.offsetTop + a.offsetHeight > feedEl.scrollTop)!;
      const rel = anchor.offsetTop - feedEl.scrollTop;
      feedEl.dispatchEvent(new Event('scroll'));
      expect(anchor.isConnected).toBe(true);
      expect(anchor.offsetTop - feedEl.scrollTop).toBe(rel);
      maxAbove = Math.max(maxAbove, above());
    }
    expect(maxAbove).toBeLessThanOrEqual(31);
    expect(above()).toBeGreaterThanOrEqual(25);
  } finally {
    for (const [k, d] of saved) Object.defineProperty(proto, k, d);
  }
});
