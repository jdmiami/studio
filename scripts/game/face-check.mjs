// Face check: each creature with a face, seen from in front (normal, then happy with a heart), so
// the eyes, blush and bubbles can be judged on the real painted models.
// Writes <outDir>/face-<kind>-<i>-<state>.png. Usage: node scripts/game/face-check.mjs <outDir> [renderer] [quality]
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}

const [out = 'scratch/faces', renderer = 'sdf', quality = 'medium'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

await page.goto(`${base}/?renderer=${renderer}&autostart=1&nohud=1&nofs=1&fov=40&quality=${quality}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluphReady === true && window.__phluphGame.mode === 'play');
await frames(10);
await page.evaluate(() => window.__phluphGame.freeze(true));
await frames(20);
const spots = await page.evaluate(() => window.__phluphGame.faceSpots());
console.log(JSON.stringify(spots.map((s) => [s.kind, s.p.map((v) => +v.toFixed(2)), s.n.map((v) => +v.toFixed(2))])));
const seen = {};
for (const [i, s] of spots.entries()) {
  if ((seen[s.kind] = (seen[s.kind] ?? 0) + 1) > 2) continue;
  // Stand in front of the face, a little above it, and look at it (yaw 0 looks down -z).
  const dist = s.kind === 'dog' ? 2.0 : 1.5;
  const x = s.p[0] + s.n[0] * dist;
  const z = s.p[2] + s.n[2] * dist;
  const feet = await page.evaluate(([x, z]) => window.__phluphGame.heightAt?.(x, z) ?? 0, [x, z]);
  const pitch = Math.atan2(s.p[1] - 1.775 - feet, dist);
  const aim = () => page.evaluate(([x, z, yaw, pitch]) => window.__phluphGame.teleport(x, z, yaw, pitch), [x, z, Math.atan2(-(s.p[0] - x), -(s.p[2] - z)), pitch]);
  await aim();
  await frames(4);
  await page.screenshot({ path: `${out}/face-${s.kind}-${i}-normal.png` });
  await page.evaluate(([kind, i]) => {
    const g = window.__phluphGame;
    if (kind === 'dog') g.emit('creature:petted', { creature: 'dog' });
    else g.emit('critter:squeak', { position: { x: g.faceSpots()[i].p[0], z: g.faceSpots()[i].p[2] } });
  }, [s.kind, i]);
  await frames(6);
  await page.screenshot({ path: `${out}/face-${s.kind}-${i}-feel.png` });
  console.log(`shot ${s.kind} ${i}`);
}
await browser.close();
if (errors.length) { console.log(`ERRORS:\n${errors.join('\n')}`); process.exit(1); }
