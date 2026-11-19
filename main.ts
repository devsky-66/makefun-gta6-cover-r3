// Vice Cover Maker — entrypoint: copies app/ and screenshots/ into the
// output directory and writes dossier.json with the kit's buildDossier.
// Node 22 standard library only; no third-party packages.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
};

function copyTree(name) {
  const src = join(REPO_ROOT, name);
  const dst = join(OUTPUT_DIR, name);
  if (!existsSync(src)) {
    throw new Error(`missing ${name}/ in ${REPO_ROOT}`);
  }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
}

mkdirSync(OUTPUT_DIR, { recursive: true });
copyTree('app');
copyTree('screenshots');

const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
console.log(`wrote ${join(OUTPUT_DIR, 'dossier.json')} (${dossier.length} bytes)`);
