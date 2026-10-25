// Drives the first-person controls in headless Chromium: holds W and checks the player moved
// forward (toward -Z) while staying on the ground, then walks into the right-hand terrace wall
// and checks collision stopped them. Usage: npm run dev, then node scripts/fp-walk-test.mjs
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
await hold('KeyD', 20000); // strafe right into the terrace (x >= 3 is 1 block up from the floor... then 2)
const afterD = await pos();
console.log(JSON.stringify({ start, afterW, afterD }, null, 1));
const ok = afterW.z < start.z - 0.3 && Math.abs(afterW.y - start.y) < 0.01 && afterD.x < 3.6;
console.log(ok ? 'PASS: moved forward on the ground; terrace wall stopped the strafe' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
