// Drives the first-person controls in headless Chromium: holds W and checks the player walked
// forward (toward -Z) down the steps and is standing on a block surface, then strafes into the
// right-hand terrace and checks collision stopped them. Usage: npm run dev, then node scripts/fp-walk-test.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright')); }
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
await page.goto(`${base}/?lowfx=1&bloom=0`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluph, null, { timeout: 120000 });
const pos = () => page.evaluate(() => { const p = window.__phluph.position; return { x: p.x, y: p.y, z: p.z }; });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

const start = await pos();
await hold('KeyW', 12000);
const afterW = await pos();
await hold('KeyD', 20000); // strafe right across the floor into the right terrace (1 block up)
const afterD = await pos();
console.log(JSON.stringify({ start, afterW, afterD }, null, 1));
// Block tops are whole or half units, so a grounded player stands on a multiple of 0.5.
const onSurface = (p) => Math.abs(p.y * 2 - Math.round(p.y * 2)) < 0.01;
const ok = afterW.z < start.z - 0.3 && afterW.y <= start.y + 0.01 && onSurface(afterW) && afterD.x < 1;
console.log(ok ? 'PASS: walked forward onto a block surface; the terrace stopped the strafe' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
