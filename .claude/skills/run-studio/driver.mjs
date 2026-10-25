// Drives the running CocoSales AI dev server (http://localhost:9002) with Playwright.
// Usage (from repo root):
//   node .claude/skills/run-studio/driver.mjs smoke            # redirects + login round trip + screenshots
//   node .claude/skills/run-studio/driver.mjs shot /login      # screenshot one route
// Env: BASE_URL (default http://localhost:9002), SHOTS_DIR (default /tmp/studio-shots)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:9002';
const SHOTS = process.env.SHOTS_DIR || '/tmp/studio-shots';
const PROTECTED = ['/', '/clients', '/sales', '/inventory', '/invoices', '/settings'];

// Resolve Playwright: local install first, then the preinstalled tools dir.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const req = createRequire('/opt/node-tools/package.json');
  ({ chromium } = req('playwright'));
}

const launchOpts = existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' }
  : {};

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const cmd = process.argv[2];

if (cmd === 'shot') {
  const route = process.argv[3] || '/login';
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120000 });
  const file = `${SHOTS}/${route.replace(/\W+/g, '_') || 'root'}.png`;
  await page.screenshot({ path: file });
  console.log(`${route} -> ${page.url()}\nscreenshot: ${file}`);
} else if (cmd === 'smoke') {
  // 1. Protected routes must bounce unauthenticated visitors to /login.
  for (const route of PROTECTED) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120000 });
    const landed = new URL(page.url()).pathname;
    console.log(`${route.padEnd(11)} -> ${landed}  ${landed === '/login' ? 'OK' : 'UNEXPECTED'}`);
  }

  // 2. Real login round trip: bogus credentials reach Firebase Auth and come back as an error toast.
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 120000 });
  await page.screenshot({ path: `${SHOTS}/login.png` });
  await page.getByPlaceholder('m@example.com').fill('nobody@example.invalid');
  await page.locator('input[type="password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Login' }).click();
  const toast = page.locator('li[role="status"], ol li').filter({ hasText: /Login Failed/ }).first();
  await toast.waitFor({ timeout: 60000 });
  console.log('login toast:', (await toast.innerText()).replace(/\n/g, ' | '));
  await page.screenshot({ path: `${SHOTS}/login-toast.png` });
  console.log(`screenshots in ${SHOTS}`);
} else {
  console.error('usage: driver.mjs smoke | shot <route>');
  process.exitCode = 2;
}

if (pageErrors.length) console.log('uncaught page errors:', pageErrors.slice(0, 5));
await browser.close();
