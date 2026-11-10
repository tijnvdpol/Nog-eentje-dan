import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { SHOTS, shotById } from '../src/debug/shots';

/** Usage: npm run shots -- [ids...] [--out dir] [--query "proefblok"] */
const MAX_CALLS = 400;
const MAX_TRIANGLES = 1_500_000;
const SHOT_TIMEOUT_MS = 120_000;

function parseArgs(argv: string[]): { ids: string[]; out: string; query: string } {
  const ids: string[] = [];
  let out = 'docs/media/shots', query = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--query') query = argv[++i];
    else ids.push(argv[i]);
  }
  return { ids, out, query };
}

async function main(): Promise<void> {
  const { ids, out, query } = parseArgs(process.argv.slice(2));
  const wanted = ids.length ? ids.map((id) => shotById(id) ?? (() => { throw new Error(`Onbekende shot: ${id}`); })()) : [...SHOTS];
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
  mkdirSync(out, { recursive: true });

  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'warn' });
  await server.listen();
  const base = server.resolvedUrls!.local[0];
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const meting: Record<string, { calls: number; triangles: number }> = {};
  const failures: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });
    page.on('pageerror', (e) => warnings.push(`pageerror: ${e.message}`));
    for (const shot of wanted) {
      const url = `${base}?shot=${shot.id}${query ? `&${query}` : ''}`;
      console.log(`shot ${shot.id} ...`);
      await page.goto(url);
      try {
        await page.waitForFunction(() => (window as unknown as { __shot?: { ready?: boolean } }).__shot?.ready === true, undefined, { timeout: SHOT_TIMEOUT_MS });
      } catch {
        throw new Error(`Shot ${shot.id}: window.__shot.ready kwam niet binnen ${SHOT_TIMEOUT_MS / 1000} s. Console: ${warnings.join(' | ')}`);
      }
      const { calls, triangles } = await page.evaluate(() => (window as unknown as { __shot: { calls: number; triangles: number } }).__shot);
      await page.screenshot({ path: join(out, `${shot.id}.png`) });
      meting[shot.id] = { calls, triangles };
      console.log(`  ${calls} calls, ${triangles} driehoeken`);
      if (shot.measure) {
        if (calls > MAX_CALLS || triangles > MAX_TRIANGLES) failures.push(`${shot.id}: ${calls} calls (max ${MAX_CALLS}), ${triangles} driehoeken (max ${MAX_TRIANGLES})`);
      }
    }
    const missing = [...new Set(warnings.filter((w) => w.includes('Model ontbreekt')))];
    if (missing.length) console.log(`Waarschuwingen:\n${missing.join('\n')}`);
    writeFileSync(join(out, 'meting.json'), `${JSON.stringify(meting, null, 2)}\n`);
  } finally {
    await browser.close();
    await server.close();
  }
  if (failures.length) { console.error(`Budget overschreden:\n${failures.join('\n')}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
