import { mulberry32 } from '../util/rng';

export function crackSvg(level: 25 | 50 | 75, seed: number): string {
  const rng = mulberry32(seed + level);
  const cx = 300 + rng() * 400, cy = 150 + rng() * 300;
  const rays = level === 25 ? 5 : level === 50 ? 9 : 14;
  const paths: string[] = [];
  for (let r = 0; r < rays; r++) {
    let a = (r / rays) * Math.PI * 2 + rng() * 0.4;
    let x = cx, y = cy;
    let d = `M${cx.toFixed(1)} ${cy.toFixed(1)}`;
    const segs = 4 + Math.floor(rng() * 4);
    for (let s = 0; s < segs; s++) {
      const len = (level / 75 + 0.6) * (40 + rng() * 80);
      a += (rng() - 0.5) * 0.6;
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (rng() < 0.3 + level / 250) {
        const ba = a + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6);
        d += ` M${x.toFixed(1)} ${y.toFixed(1)} L${(x + Math.cos(ba) * len * 0.6).toFixed(1)} ${(y + Math.sin(ba) * len * 0.6).toFixed(1)} M${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    paths.push(`<path d="${d}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" preserveAspectRatio="none"><g fill="none" stroke="#e8f4ff" stroke-width="${level === 75 ? 2.4 : 1.6}" stroke-linecap="round" opacity="0.9">${paths.join('')}</g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${6 + level / 8}" fill="#cfe6ff" opacity="0.5"/></svg>`;
}
