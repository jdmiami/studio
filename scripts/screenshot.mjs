// Renders the running Phluph dev server in headless Chromium and saves a screenshot.
// Usage: npm run dev (in another shell), then
//   node scripts/screenshot.mjs [out.png] [--shot=<seconds>] [--size=1600x900] [--page=kit.html]
// Env: BASE_URL (default http://127.0.0.1:5173)
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? 'screenshots/phluph.png';
const shot = args.find((a) => a.startsWith('--shot='))?.split('=')[1] ?? '4';
const [width, height] = (args.find((a) => a.startsWith('--size='))?.split('=')[1] ?? '1600x900')
  .split('x').map(Number);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}

const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  // No GPU in CI/containers: fall back to SwiftShader software WebGL.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const camArg = args.find((a) => a.startsWith('--cam='))?.split('=')[1];
// --query=lowfx=1&foo=bar appends extra URL flags (handy for bisecting effects).
const extra = args.find((a) => a.startsWith('--query='))?.slice('--query='.length);
// --page=kit.html renders another page of the site (default: the game).
const pagePath = args.find((a) => a.startsWith('--page='))?.split('=')[1] ?? '';
await page.goto(`${base}/${pagePath}?shot=${shot}${camArg ? `&cam=${camArg}` : ''}${extra ? `&${extra}` : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 180000 });
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 120000 });
console.log(`saved ${out}`);
if (problems.length) console.log('console problems:\n  ' + problems.slice(0, 10).join('\n  '));
await browser.close();
