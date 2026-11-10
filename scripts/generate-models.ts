import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, prune, weld } from '@gltf-transform/functions';
import { CONFIG } from '../src/config';
import { MODEL_ROLES, type ModelIndex } from '../src/models/roles';
import { MANIFEST, findPackDir } from './models.manifest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'assets-src', 'kenney');
const OUT = join(ROOT, 'public', 'models');

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main(): Promise<void> {
  const packDirs = existsSync(SRC) ? readdirSync(SRC) : [];
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  mkdirSync(OUT, { recursive: true });
  const index: ModelIndex = {};
  let totalBytes = 0;

  for (const role of MODEL_ROLES) {
    const { pack, path, ...rest } = MANIFEST[role];
    const dir = findPackDir(packDirs, pack);
    const src = dir ? join(SRC, dir, path) : null;
    if (!src || !existsSync(src)) fail(`Ontbreekt: ${role} (${pack}/${path})`);

    const doc = await io.read(src);
    await doc.transform(dedup(), prune(), weld());
    const b = getBounds(doc.getRoot().listScenes()[0]);
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const file = `${role}.glb`;
    const bytes = await io.writeBinary(doc); // images are embedded: the .glb is self-contained
    writeFileSync(join(OUT, file), bytes);
    totalBytes += bytes.byteLength;
    index[role] = { file, size: { w: r(b.max[0] - b.min[0]), d: r(b.max[2] - b.min[2]), h: r(b.max[1] - b.min[1]) }, ...rest };
    console.log(`${role.padEnd(15)} ${file.padEnd(20)} ${(bytes.byteLength / 1024).toFixed(1)} KB`);
  }

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  const mb = totalBytes / (1024 * 1024);
  console.log(`Totaal: ${mb.toFixed(2)} MB (budget ${CONFIG.models.budgetMB} MB)`);
  if (mb > CONFIG.models.budgetMB) fail(`Te groot: ${mb.toFixed(2)} MB boven het budget van ${CONFIG.models.budgetMB} MB`);
}

main().catch((e) => fail(String(e)));
