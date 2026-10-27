// Shoots every asset of docs/reference/assets/index.json in the asset studio (asset.html): its
// colour shot and its silhouette mask at the painting's camera, to screenshots/assets/<id>.png and
// <id>-mask.png, for scripts/assets/score.py. Needs the dev server (npx vite).
// Usage: node scripts/assets/shoot.mjs [id-prefix ...]   (default: all)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright')); }
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const only = process.argv.slice(2);
const refs = JSON.parse(readFileSync('docs/reference/assets/index.json', 'utf8')).assets
  .filter((r) => !only.length || only.some((p) => r.id.startsWith(p)));
mkdirSync('screenshots/assets', { recursive: true });
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 572 } });
const status = {};
for (const r of refs) {
  for (const mask of [false, true]) {
    const errors = [];
    const onError = (e) => errors.push(String(e.message ?? e));
    page.on('pageerror', onError);
    await page.goto(`${base}/asset.html?ref=${r.id}&shot=4${mask ? '&mask=1' : ''}`, { waitUntil: 'load' });
    const ok = await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 60000 }).then(() => true, () => false);
    page.off('pageerror', onError);
    if (!ok) { status[r.id] = { error: errors[0] ?? 'timeout' }; break; }
    await page.screenshot({ path: `screenshots/assets/${r.id}${mask ? '-mask' : ''}.png` });
    if (!mask) status[r.id] = await page.evaluate(() => window.__assetStudio);
  }
  console.log(r.id, status[r.id]?.error ? `-- ${status[r.id].error}` : status[r.id]?.kind);
}
writeFileSync('screenshots/assets/status.json', JSON.stringify(status, null, 1));
await browser.close();
