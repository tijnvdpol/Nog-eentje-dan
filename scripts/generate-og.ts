import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

/** Share card (1200 × 630): dark evening sky, text logo, a drawn beer mug (no emoji font needed) and the disclaimer. */
export function ogSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset="1" stop-color="#2a2150"/></linearGradient>
    <linearGradient id="beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc83d"/><stop offset="1" stop-color="#f2970f"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#sky)"/>
  <rect y="500" width="1200" height="130" fill="#14151c"/>
  <rect y="506" width="1200" height="4" fill="#ffd166" opacity="0.5"/>
  <g transform="translate(962 130) scale(0.8)">
    <rect x="0" y="40" width="170" height="230" rx="18" fill="url(#beer)" stroke="#fff3d0" stroke-width="8"/>
    <path d="M170 90 h50 a30 30 0 0 1 30 30 v70 a30 30 0 0 1 -30 30 h-50" fill="none" stroke="#fff3d0" stroke-width="14"/>
    <path d="M-6 52 a46 40 0 0 1 60 -42 a50 44 0 0 1 80 4 a40 36 0 0 1 48 38 z" fill="#fffaf0"/>
  </g>
  <text x="80" y="290" font-family="Inter, DejaVu Sans, sans-serif" font-size="110" font-weight="800" fill="#ffffff">Nog Eentje Dan</text>
  <text x="84" y="370" font-family="Inter, DejaVu Sans, sans-serif" font-size="38" fill="#66e0ff">Scroll op Swiep. Drink een biertje. Rij door.</text>
  <text x="84" y="590" font-family="Inter, DejaVu Sans, sans-serif" font-size="30" fill="#c9c9d6">Satire. Dit is precies waarom je dit nooit in het echt doet.</text>
</svg>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync('public/og.png', new Resvg(ogSvg(), { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
  console.log('public/og.png geschreven');
}
