// Touch and phone-layout check in headless Chromium, emulating a phone (touch events, mobile
// viewport, device pixel ratio) in portrait and landscape: the title, play with the on-screen
// controls, the stick moving the player, a look drag turning the view, the jump button, the
// interact button opening Mira's dialogue and a tap advancing it, the pause menu and the felt lock.
// Touches are real touch events (DevTools Input.dispatchTouchEvent), so the controls see what a
// phone sends. Screenshots go to the folder given; failures exit 1.
//
// Env RENDERER=threejs|sdf picks the renderer (default threejs; the game would otherwise ask).
// Usage: node scripts/game/mobile-check.mjs [outDir]   (needs the dev server: npm run dev)
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const out = process.argv[2] ?? 'scratch/mobile';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const failures = [];
const PHONES = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
];

for (const phone of PHONES.filter((p) => !process.env.ONLY || p.name === process.env.ONLY)) {
  const context = await browser.newContext({
    viewport: phone.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const game = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${phone.name}-${n}.png`, timeout: 180000 });
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${phone.name}: ${what}`); if (!ok) failures.push(`${phone.name}: ${what}`); };
  const { width: W, height: H } = phone.viewport;

  await page.goto(`${base}/?nofs=1&renderer=${process.env.RENDERER ?? 'threejs'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__phluphReady === true);
  await frames(4);
  await shot('01-title');
  const settings = await game(() => ({ quality: window.__phluphGame.settingsNow?.quality }));
  console.log(`     first-run quality on a phone: ${settings.quality}`);

  // New game from the title by tapping (the menu's buttons are DOM).
  await game(() => window.__phluphGame.startGame(1));
  await frames(6);
  const visible = await game(() => !document.querySelector('.ptouch').hidden);
  check(visible, 'on-screen controls show in play');
  check(await game(() => !document.pointerLockElement), 'no pointer lock on touch');
  await shot('02-play');

  // The stick: thumb down at the lower left, pushed up (forward) and held.
  const before = await game(() => window.__phluphGame.player);
  const sx = W * 0.18;
  const sy = H * 0.78;
  await touch('touchStart', [[sx, sy]]);
  await frames(1);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[sx, sy - i * 12]]); await frames(1); }
  await frames(8);
  await shot('03-stick');
  await touch('touchEnd', []);
  await frames(2);
  const after = await game(() => window.__phluphGame.player);
  const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
  check(moved > 0.3, `the stick walks the player (${moved.toFixed(2)} m)`);
  check(Math.abs(after.yaw - before.yaw) < 1e-6, 'walking does not turn the view');

  // Look: drag on the right half to the left (turns left: yaw grows).
  const lx = W * 0.7;
  const ly = H * 0.4;
  await touch('touchStart', [[lx, ly]]);
  await frames(1);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [[lx - i * 20, ly]]); await frames(1); }
  await touch('touchEnd', []);
  await frames(2);
  const looked = await game(() => window.__phluphGame.player);
  check(looked.yaw - after.yaw > 0.2, `a drag to the left turns left (${(looked.yaw - after.yaw).toFixed(2)} rad)`);

  // Two thumbs at once: walk and look together.
  const y0 = await game(() => window.__phluphGame.player);
  await touch('touchStart', [[sx, sy], [lx, ly]]);
  await frames(1);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [[sx, sy - i * 12], [lx + i * 16, ly]]); await frames(1); }
  await frames(4);
  await touch('touchEnd', []);
  await frames(2);
  const y1 = await game(() => window.__phluphGame.player);
  check(Math.hypot(y1.position[0] - y0.position[0], y1.position[2] - y0.position[2]) > 0.2 && y0.yaw - y1.yaw > 0.15, 'walk and look with two thumbs at once');

  // Jump button.
  const jumpBox = await page.locator('.ptouch-jump').boundingBox();
  const feetY = (await game(() => window.__phluphGame.player)).position[1];
  await touch('touchStart', [[jumpBox.x + jumpBox.width / 2, jumpBox.y + jumpBox.height / 2]]);
  await frames(3);
  const midY = (await game(() => window.__phluphGame.player)).position[1];
  await touch('touchEnd', []);
  await frames(30);
  check(midY > feetY + 0.05, `the jump button jumps (${(midY - feetY).toFixed(2)} m up)`);

  // Interact: stand by Mira, the button names her, a tap opens the dialogue; taps advance it.
  await game(() => { const g = window.__phluphGame; const n = g._area.interactables().find((i) => i.id === 'npc'); g.teleport(n.position.x + 1.2, n.position.z + 1.2, Math.atan2(1.2, 1.2)); });
  await frames(6);
  const say = await game(() => document.querySelector('.ptouch-say').textContent);
  check(/Mira/.test(say), `the interact button says "${say}"`);
  await shot('04-near-mira');
  const ib = await page.locator('.ptouch-interact').boundingBox();
  await touch('touchStart', [[ib.x + ib.width / 2, ib.y + ib.height / 2]]);
  await touch('touchEnd', []);
  await frames(6);
  check(await game(() => window.__phluphGame.input.context === 'dialogue'), 'tapping interact opens the dialogue');
  check(await game(() => document.querySelector('.ptouch').hidden), 'controls hide during dialogue');
  await frames(10);
  await shot('05-dialogue');
  for (let i = 0; i < 40 && (await game(() => window.__phluphGame.input.context === 'dialogue')); i++) {
    const panel = await page.locator('.phl-layer-dialogue .phl-dialogue, .phl-layer-dialogue > *').first().boundingBox().catch(() => null);
    const choice = await page.locator('.phl-layer-dialogue button').first().boundingBox().catch(() => null);
    const p = choice ?? panel ?? { x: W / 2 - 10, y: H - 80, width: 20, height: 20 };
    await page.touchscreen.tap(p.x + p.width / 2, p.y + p.height / 2);
    await frames(4);
  }
  check(await game(() => window.__phluphGame.input.context === 'gameplay'), 'tapping through the dialogue returns to play');
  check(await game(() => window.__phluphGame.session().quests.status('welcome') === 'active'), 'the dialogue started the welcome quest');

  // Pause from its on-screen button; the menu fits; resume by tapping Resume.
  const pb = await page.locator('.ptouch-menu .ptouch-btn').first().boundingBox();
  await touch('touchStart', [[pb.x + pb.width / 2, pb.y + pb.height / 2]]);
  await touch('touchEnd', []);
  await frames(6);
  check(await game(() => window.__phluphGame.ui.top()?.name === 'pause' || window.__phluphGame.ui.top() === 'pause'), 'the pause button opens the pause menu');
  await shot('06-pause');
  const overflow = await game(() => [...document.querySelectorAll('.phl-layer-screens *')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }));
  check(!overflow, 'the pause menu fits the screen width');
  await game(() => window.__phluphGame.ui.open('settings'));
  await frames(6);
  await shot('07-settings');
  await game(() => { const g = window.__phluphGame; g.ui.close(); g.ui.close(); });
  await frames(6);

  // Decorating by touch: the nest button, then the place button.
  const tapEl = async (sel) => { const b = await page.locator(sel).boundingBox(); await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2]]); await frames(2); await touch('touchEnd', []); await frames(3); };
  await game(() => { const g = window.__phluphGame; const s = g.state; s.flags.basket = true; s.inventory['fluff-stone'] = 2; g.teleport(2, -4.2, 0, -0.75); });
  await frames(6);
  await tapEl('.ptouch-decorate');
  await frames(4);
  await shot('07b-decorate');
  await tapEl('.ptouch-interact');
  const placed = await game(() => window.__phluphGame.state.decor.length);
  check(placed === 1, `decorating by touch places a find (${placed})`);
  await tapEl('.ptouch-decorate');

  // The felt lock overlay fits.
  await game(() => { const s = window.__phluphGame.state; s.flags.lockNotes = true; window.__phluphGame.teleport(0, -12.5, 0); });
  await frames(4);
  game(() => window.__phluphGame.interact('door')).catch(() => null);
  await frames(8);
  const lock = await page.locator('.flock-panel').boundingBox();
  check(!!lock && lock.x >= 0 && lock.x + lock.width <= W + 1, 'the felt lock fits the screen');
  await shot('08-lock');
  const arrow = await page.locator('.flock-dial[data-i="1"] .flock-arrow').first().boundingBox();
  await page.touchscreen.tap(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);
  await frames(3);
  const dials = await game(() => window.__phluphGame.session().lock.state.dials.join());
  check(dials !== '0,3,1', `tapping a dial arrow turns it (${dials})`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await context.close();
}

await browser.close();
console.log(failures.length ? `FAILURES (${failures.length}):\n${failures.join('\n')}` : 'all mobile checks passed');
process.exit(failures.length ? 1 : 0);
