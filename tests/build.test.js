import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The bundler only follows dynamic imports of literal paths; an import of a computed path is left
// as is and fails in production (the dev server resolves it, so only a production build shows it).
test('every dynamic import in src is a literal path', () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk('src');
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bimport\(\s*([^)]*?)\s*\)/g)) {
      if (!/^(['"`])[^'"`$]*\1$/.test(m[1])) bad.push(`${f}: import(${m[1]})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every game and cave source file parses', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk('src/game'); walk('src/cave');
  const bad = files.filter((f) => spawnSync(process.execPath, ['--check', f]).status !== 0);
  assert.deepEqual(bad, [], `files with syntax errors: ${bad.join(', ')}`);
});
