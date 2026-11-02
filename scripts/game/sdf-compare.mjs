// The art loop's fixed views, rendered with the SDF renderer and no overlays, so each art change can
// be compared before / after and against the cave painting:
//   painting  the Nest from the painting's own solved camera (the spawn pose, fov 58.3), 1024 x 572,
//             scored against docs/reference/cave-door.jpg by scripts/fp/compare_frame.py
//   nest      a closer look at the willow and the cube tree
//   creature  Biscuit up close
//   trip      a fixed meadow trip (seed P6ZJAM2) from its spawn
// Writes <outDir>/<label>-<view>.png and <label>-painting.json (the score).
//
// Usage: node scripts/game/sdf-compare.mjs <outDir> <label> [quality]   (needs npm run dev)
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}

const [out = 'scratch/art', label = 'now', quality = 'high'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 572 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async (view) => { await frames(5); await page.screenshot({ path: `${out}/${label}-${view}.png`, timeout: 900000 }); console.log(`shot ${view}`); };

await page.goto(`${base}/?renderer=sdf&autostart=1&nohud=1&nofs=1&fov=58.3&quality=${quality}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluphReady === true && window.__phluphGame.mode === 'play');
await shot('painting');

// Looks at (tx, tz) from (x, z), pitch p (yaw 0 looks down -z).
const lookFrom = (x, z, tx, tz, pitch) => page.evaluate(([x, z, tx, tz, pitch]) => {
  window.__phluphGame.teleport(x, z, Math.atan2(-(tx - x), -(tz - z)), pitch);
}, [x, z, tx, tz, pitch]);
await lookFrom(3.2, -2.6, -1.4, -5.6, -0.12);
await shot('nest');
const dog = await page.evaluate(() => window.__phluphGame.creatures.find((c) => c.kind === 'dog').position);
await lookFrom(dog[0] + 1.6, dog[1] + 1.6, dog[0], dog[1], -0.45);
await shot('creature');
await page.evaluate(() => window.__phluphGame.enterTrip('P6ZJAM2'));
await shot('trip');
await browser.close();

const score = execFileSync('python3', ['scripts/fp/compare_frame.py', `${out}/${label}-painting.png`, '--json', `${out}/${label}-painting.json`], { encoding: 'utf8' });
console.log(score.trim().split('\n').slice(-12).join('\n'));
if (errors.length) { console.log(`ERRORS:\n${errors.join('\n')}`); process.exit(1); }
