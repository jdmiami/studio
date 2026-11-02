// Renders the game in the target shot's framing (?frame=target: the solved third-person camera and a
// stand-in explorer) at the reference's size, 1125 x 1979, with no HUD, for scripts/shot/score.py.
//
// Usage: node scripts/shot/capture.mjs <out.png> [renderer=sdf] [quality=high] [x z yawDeg]
// The optional pose places the explorer's feet (Nest coordinates); without it the spawn pose is used.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}

const [out = 'shot.png', renderer = 'sdf', quality = 'high', px, pz, pyaw] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1125, height: 1979 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

await page.goto(`${base}/?renderer=${renderer}&quality=${quality}&autostart=1&nohud=1&nofs=1&frame=target`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluphReady === true && window.__phluphGame.mode === 'play');
await frames(6);
await page.evaluate(() => window.__phluphGame.freeze(true));
if (px != null) await page.evaluate(([x, z, yaw]) => window.__phluphGame.teleport(x, z, yaw * Math.PI / 180, 0), [Number(px), Number(pz), Number(pyaw)]);
await frames(8);
await page.screenshot({ path: out });
await browser.close();
console.log(`shot ${out}`);
if (errors.length) { console.log(`ERRORS:\n${errors.join('\n')}`); process.exit(1); }
