import { mkdirSync, writeFileSync } from 'node:fs';
import { GRADIENTS, POST_DEFS } from './posts-data';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

function wrap(text: string, max = 22): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

mkdirSync('public/content/media', { recursive: true });
const posts = POST_DEFS.map(([account, avatar, type, emoji, caption, tags], i) => {
  const id = `p${String(i + 1).padStart(2, '0')}`;
  const [c1, c2] = GRADIENTS[i % GRADIENTS.length];
  const lines = wrap(caption).map((l, k) => `<text x="256" y="${390 + k * 28}" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">${escapeXml(l)}</text>`).join('');
  const emojiEl = type === 'video'
    ? `<text x="256" y="250" font-size="150" text-anchor="middle"><animateTransform attributeName="transform" type="rotate" values="-12 256 210;12 256 210;-12 256 210" dur="1.2s" repeatCount="indefinite"/>${emoji}</text>`
    : `<text x="256" y="250" font-size="150" text-anchor="middle">${emoji}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/>${emojiEl}${lines}${type === 'video' ? '<text x="30" y="50" font-size="30" fill="#fff">▶</text>' : ''}</svg>\n`;
  writeFileSync(`public/content/media/${id}.svg`, svg);
  return { id, account, avatar, type, media: `media/${id}.svg`, caption, tags };
});
writeFileSync('public/content/posts.json', JSON.stringify(posts, null, 2) + '\n');
console.log(`${posts.length} posts geschreven`);
