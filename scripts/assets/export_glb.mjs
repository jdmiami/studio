// Exports the finished assets (built, fitted and projection-painted in the asset studio) as glTF
// binaries for the game's world: one file per asset, public/assets/glb/<id>.glb, plus
// public/assets/glb/manifest.json (id, family, height). Meshes carry their felt settings in extras
// (src/kit/export.js); the game rebuilds the textile shader from them (src/game/world/models.js).
// With the dev server up:
//   node scripts/assets/export_glb.mjs [id ...]      (default: the set below)
// then compress each with meshopt: scripts/assets/compress_glb.sh
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const DEFAULT = [
  'cube-tree-0', 'willow-0', 'broom-tree-0',
  'stone-0', 'stone-1', 'stone-2', 'stone-4', 'bush-0', 'bush-1', 'bush-2', 'bush-3',
  'mushroom-1', 'mushroom-4', 'mushroom-5', 'knit-shrub-0', 'knit-bush-0', 'pom-0',
  'fence-0', 'crate-0', 'critter-0', 'critter-1', 'critter-2', 'dog-0',
];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const refs = JSON.parse(readFileSync('docs/reference/assets/index.json', 'utf8')).assets;
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright')); }
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error(`pageerror: ${e.message}`));
mkdirSync('public/assets/glb', { recursive: true });
const manifestPath = 'public/assets/glb/manifest.json';
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { assets: {} };
for (const id of ids) {
  await page.goto(`${base}/asset.html?ref=${id}&shot=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 120000 });
  const { base64 } = await page.evaluate(() => window.__assetExportGLB());
  const info = await page.evaluate(() => window.__assetStudio);
  const buf = Buffer.from(base64, 'base64');
  writeFileSync(`public/assets/glb/${id}.glb`, buf);
  const ref = refs.find((r) => r.id === id);
  manifest.assets[id] = { family: ref.family, height: Number(info.size[1].toFixed(3)), size: info.size.map((v) => Number(v.toFixed(3))), kind: info.kind };
  console.log(`${id}: ${(buf.length / 1024).toFixed(0)} KB, ${info.kind}, size ${info.size.map((v) => v.toFixed(2)).join(' x ')}`);
}
manifest._ = 'Finished assets exported from the asset studio (scripts/assets/export_glb.mjs): family, height and size in world units.';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
await browser.close();
