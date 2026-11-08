import { CONFIG } from '../config';
import type { EventBus, GameEvents } from '../core/events';
import type { DrunkEffects } from '../drunk/effects';
import { FeedShuffler } from './feed';

export interface Post {
  id: string; account: string; avatar: string;
  type: 'photo' | 'meme' | 'video' | 'ad';
  media: string; caption: string; tags: string[];
}

const BATCH = 8;
const NEAR_BOTTOM_PX = 600;
/** Posts kept above the first visible post; older ones are removed from the DOM. */
const KEEP_ABOVE = 30;
const BANNER_MS = 4000;

export class Phone {
  private up = false;
  private feed: HTMLElement;
  private shuffler: FeedShuffler;
  private byId = new Map<string, Post>();
  private liked = new Set<string>();
  private timers = new Set<number>();

  constructor(private root: HTMLElement, posts: Post[], private bus: EventBus<GameEvents>, rng: () => number) {
    for (const p of posts) this.byId.set(p.id, p);
    this.shuffler = new FeedShuffler(posts.map((p) => p.id), CONFIG.feed.minGapBeforeRepeat, rng);

    root.classList.remove('phone--up');
    root.classList.add('phone', 'phone--down');
    root.innerHTML = `
      <div class="phone__frame">
        <header class="phone__header"><span class="phone__logo">Swiep</span></header>
        <div class="phone__stories"></div>
        <div class="phone__feed"></div>
      </div>
      <div class="phone__banners"></div>`;
    const stories = root.querySelector('.phone__stories')!;
    const avatars = ['🍺', '🚗', '🐶', '🍟', '🎉', '😎'];
    for (const a of avatars) {
      const s = document.createElement('span');
      s.className = 'phone__story'; s.textContent = a;
      stories.appendChild(s);
    }
    this.feed = root.querySelector('.phone__feed') as HTMLElement;
    this.feed.addEventListener('wheel', this.onWheel, { passive: false });
    this.feed.addEventListener('scroll', this.onScroll);
    this.feed.addEventListener('dblclick', this.onDblClick);
    this.appendBatch();
  }

  isUp(): boolean { return this.up; }

  setUp(up: boolean): void {
    if (this.up === up) return;
    this.up = up;
    this.root.classList.toggle('phone--up', up);
    this.root.classList.toggle('phone--down', !up);
    this.bus.emit('phoneToggled', { up });
  }

  notify(from: string, text: string): void {
    const holder = this.root.querySelector('.phone__banners') ?? this.root;
    const b = document.createElement('div');
    b.className = 'phone__banner';
    const strong = document.createElement('strong'); strong.textContent = from;
    const span = document.createElement('span'); span.textContent = ` ${text}`;
    b.append(strong, span);
    holder.appendChild(b);
    const t = window.setTimeout(() => { b.remove(); this.timers.delete(t); }, BANNER_MS);
    this.timers.add(t);
  }

  applyEffects(fx: DrunkEffects): void {
    const st = this.root.style;
    st.setProperty('--phone-blur', `${fx.phoneBlurPx}px`);
    st.setProperty('--phone-double', `${fx.phoneDouble * 4}px`);
    st.setProperty('--phone-sway', String(fx.phoneSway));
  }

  dispose(): void {
    this.feed.removeEventListener('wheel', this.onWheel);
    this.feed.removeEventListener('scroll', this.onScroll);
    this.feed.removeEventListener('dblclick', this.onDblClick);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private onWheel = (e: WheelEvent): void => {
    // Down: the wheel must scroll neither the phone nor the page. Up: the feed scrolls
    // natively; CSS overscroll-behavior: contain stops the page from scrolling.
    if (!this.up) e.preventDefault();
  };

  private onScroll = (): void => {
    const f = this.feed;
    this.pruneAbove();
    if (f.scrollTop + f.clientHeight > f.scrollHeight - NEAR_BOTTOM_PX) this.appendBatch();
  };

  private onDblClick = (e: Event): void => {
    if (!this.up) return;
    const article = (e.target as Element).closest?.('article.post') as HTMLElement | null;
    if (!article) return;
    const id = article.dataset.postId!;
    if (this.liked.has(id)) return;
    this.liked.add(id);
    article.classList.add('post--liked');
    this.bus.emit('like', { postId: id });
  };

  /**
   * Removes posts more than KEEP_ABOVE posts above the first visible one, and shifts
   * scrollTop by the removed height so the visible content stays exactly in place.
   * (CSS overflow-anchor is off on the feed, so the browser does not also adjust.)
   */
  private pruneAbove(): void {
    const posts = Array.from(this.feed.querySelectorAll<HTMLElement>('article.post'));
    if (posts.length <= KEEP_ABOVE) return;
    const top = this.feed.scrollTop, base = posts[0].offsetTop;
    const firstVisible = posts.findIndex((a) => a.offsetTop - base + a.offsetHeight > top);
    const excess = (firstVisible === -1 ? posts.length : firstVisible) - KEEP_ABOVE;
    if (excess <= 0) return;
    const removedPx = posts[excess].offsetTop - base;
    for (let i = 0; i < excess; i++) posts[i].remove();
    this.feed.scrollTop = top - removedPx;
  }

  private appendBatch(): void {
    for (let i = 0; i < BATCH; i++) this.feed.appendChild(this.renderPost(this.byId.get(this.shuffler.next())!));
  }

  private renderPost(p: Post): HTMLElement {
    const a = document.createElement('article');
    a.className = `post post--${p.type}`;
    a.dataset.postId = p.id;
    if (this.liked.has(p.id)) a.classList.add('post--liked');

    const head = document.createElement('div'); head.className = 'post__head';
    const av = document.createElement('span'); av.className = 'post__avatar'; av.textContent = p.avatar;
    const name = document.createElement('span'); name.className = 'post__account'; name.textContent = p.account;
    head.append(av, name);
    if (p.type === 'ad') {
      const ad = document.createElement('span'); ad.className = 'post__ad'; ad.textContent = 'Advertentie';
      head.appendChild(ad);
    }

    const src = `content/${p.media}`;
    let media: HTMLElement;
    if (p.media.endsWith('.mp4')) {
      const v = document.createElement('video');
      v.src = src; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
      media = v;
    } else {
      const img = document.createElement('img');
      img.src = src; img.alt = p.caption; img.draggable = false;
      media = img;
    }
    media.classList.add('post__media');
    media.addEventListener('error', () => a.remove());

    const heart = document.createElement('div'); heart.className = 'post__heart'; heart.textContent = '❤️';
    const wrap = document.createElement('div'); wrap.className = 'post__mediawrap';
    wrap.append(media, heart);

    const cap = document.createElement('p'); cap.className = 'post__caption';
    cap.textContent = `${p.account} ${p.caption} ${p.tags.map((t) => `#${t}`).join(' ')}`;
    a.append(head, wrap, cap);
    return a;
  }
}
