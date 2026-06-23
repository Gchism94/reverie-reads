#!/usr/bin/env node
// Build the single-file app: inject data/personal_seed.json into src/template.html -> index.html
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = await readFile(join(ROOT, 'src', 'template.html'), 'utf8');
const seed = (await readFile(join(ROOT, 'data', 'personal_seed.json'), 'utf8')).trim();

if (!tpl.includes('/*__SEED__*/[]')) {
  console.error('ERROR: src/template.html is missing the /*__SEED__*/[] placeholder.');
  process.exit(1);
}
const html = tpl.replace('/*__SEED__*/[]', seed);
if (html.includes('/*__SEED__*/')) {
  console.error('ERROR: seed injection failed (placeholder still present).');
  process.exit(1);
}
await writeFile(join(ROOT, 'index.html'), html);
const count = JSON.parse(seed).length;
console.log(`Built index.html  ·  ${(html.length / 1024).toFixed(1)} KB  ·  ${count} books embedded`);
