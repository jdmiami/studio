// An automated playthrough of the game in headless Chromium: new game, talk to Mira, collect the
// Nest's finds, meet a critter, solve the felt lock, travel through the Wander Gate to a seeded
// trip, collect finds there, ring the chime mushrooms, come home, decorate, open the menus, save and
// reload. Screenshots of each beat go to the folder given (default scratch/playtest); console errors
// fail the run. Frame-time stats are printed at the end.
//
// Usage: node scripts/game/playtest.mjs [outDir]   (needs the dev server: npm run dev)
// Env: BASE_URL (default http://127.0.0.1:5173), SEED (trip seed code, default from the game)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const out = process.argv[2] ?? 'scratch/playtest';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const game = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const press = async (key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await wait(120); } };

/** Advances a running dialogue by confirming until it closes (choices pick the first). */
async function finishDialogue(max = 20) {
  for (let i = 0; i < max; i++) {
    const open = await game(() => !!document.querySelector('.phl-layer-dialogue *'));
    if (!open) return;
    await press('Enter');
    await wait(250);
  }
}

await step('load and title', async () => {
  await page.goto(`${base}/?fps=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 180000 });
  await wait(1500);
  await shot('01-title');
});

await step('new game', async () => {
  await game(() => window.__phluphGame.startGame(1));
  await wait(1500);
  await shot('02-nest');
  const s = await game(() => ({ mode: window.__phluphGame.mode, area: window.__phluphGame.area }));
  if (s.mode !== 'play' || s.area !== 'hub') throw new Error(JSON.stringify(s));
});

await step('talk to Mira (welcome quest)', async () => {
  const p = game(() => window.__phluphGame.interact('npc'));
  await wait(800);
  await shot('03-dialogue');
  await press('ArrowDown');
  await finishDialogue();
  await p;
  const q = await game(() => window.__phluphGame.session().quests.stepId('welcome'));
  if (q !== 'stone') throw new Error(`welcome step ${q}`);
});

await step('collect the Nest finds', async () => {
  const finds = await game(() => window.__phluphGame.hubFinds);
  for (const f of finds) {
    await game(([x, z]) => window.__phluphGame.teleport(x, z), [f.position[0], f.position[2]]);
    await wait(300);
  }
  await shot('04-collected');
  const c = await game(() => Object.keys(window.__phluphGame.state.collection));
  if (!c.includes('fluff-stone') || !c.includes('button-mushroom')) throw new Error(`collection ${c}`);
});

await step('meet a critter', async () => {
  const critters = await game(() => window.__phluphGame.creatures.filter((c) => c.kind === 'critter'));
  if (!critters.length) throw new Error('no critters');
  const [x, z] = critters[0].position;
  await game(([x, z]) => window.__phluphGame.teleport(x + 1.6, z + 1.6), [x, z]);
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const seen = await game(() => Object.keys(window.__phluphGame.state.collection).some((k) => k.startsWith('critter')));
    if (seen) break;
  }
  await shot('05-critter');
  const seen = await game(() => Object.keys(window.__phluphGame.state.collection).filter((k) => k.startsWith('critter')));
  if (!seen.length) throw new Error('no sighting');
});

await step('report to Mira, get the lock note', async () => {
  const p = game(() => window.__phluphGame.interact('npc'));
  await wait(600);
  await finishDialogue();
  await p;
  const st = await game(() => ({ welcome: window.__phluphGame.session().quests.status('welcome'), lock: window.__phluphGame.state.flags.lockNotes }));
  if (st.welcome !== 'done' || !st.lock) throw new Error(JSON.stringify(st));
});

await step('solve the felt lock', async () => {
  await game(() => window.__phluphGame.teleport(0, -12.5, 0));
  await wait(300);
  game(() => window.__phluphGame.interact('door'));
  await wait(700);
  await shot('06-lock');
  // Dials start cream/peach/sage; the answer is cream/sage/lilac.
  await press('ArrowRight');
  await press('ArrowDown'); // peach -> lilac -> sage: down twice
  await press('ArrowDown');
  await press('ArrowRight');
  await press('ArrowUp'); // sage -> lilac
  await press('Enter');
  await wait(3800);
  await shot('07-door-open');
  const open = await game(() => window.__phluphGame.state.flags.doorOpen);
  if (!open) throw new Error('door still shut');
});

await step('through the Wander Gate', async () => {
  const p = game(() => window.__phluphGame.interact('door'));
  await wait(600);
  await finishDialogue();
  await p;
  await wait(2500);
  if (process.env.SEED) { await game((c) => window.__phluphGame.enterTrip(c), process.env.SEED); await wait(1500); }
  await shot('08-trip');
  const tr = await game(() => ({ area: window.__phluphGame.area, trip: window.__phluphGame.trip }));
  if (tr.area !== 'trip') throw new Error(JSON.stringify(tr));
  console.log(`     trip ${tr.trip.name} (${tr.trip.biome}) seed ${tr.trip.code}, ${tr.trip.finds} finds`);
});

await step('collect trip finds', async () => {
  const finds = await game(() => window.__phluphGame.tripFinds);
  let i = 0;
  for (const f of finds.slice(0, 7)) {
    await game(([x, z]) => window.__phluphGame.teleport(x - 1.5, z, Math.PI / 2), [f.position[0], f.position[2]]);
    await wait(500);
    if (i++ === 0) await shot('09-trip-find');
    await game(([x, z]) => window.__phluphGame.teleport(x, z), [f.position[0], f.position[2]]);
    await wait(300);
  }
  const n = await game(() => window.__phluphGame.state.flags.tripFinds ?? 0);
  if (n < 5) throw new Error(`only ${n} trip finds`);
});

await step('look around the trip', async () => {
  await game(() => { const g = window.__phluphGame; const s = g.trip; return s; });
  const pos = await game(() => window.__phluphGame.player.position);
  await game(([x, z]) => window.__phluphGame.teleport(x, z, 0.8), [pos[0], pos[2]]);
  await wait(800);
  await shot('10-trip-view');
});

await step('home again', async () => {
  await game(() => window.__phluphGame.goHome());
  await wait(1500);
  await shot('11-home');
  const p = game(() => window.__phluphGame.interact('npc'));
  await wait(600);
  await finishDialogue();
  await p;
  const basket = await game(() => window.__phluphGame.state.flags.basket);
  if (!basket) throw new Error('no basket');
});

await step('menus', async () => {
  await press('Escape');
  await wait(600);
  await shot('12-pause');
  await press('Escape');
  await wait(300);
  await press('KeyJ');
  await wait(600);
  await shot('13-journal');
  await press('Escape');
  await wait(300);
  await press('KeyC');
  await wait(600);
  await shot('14-collection');
  await press('Escape');
  await wait(400);
});

await step('decorate the Nest', async () => {
  await game(() => window.__phluphGame.teleport(4, -2, Math.PI * 0.6));
  await wait(300);
  await press('KeyB');
  await wait(500);
  await shot('15-decorate');
  await press('KeyE');
  await wait(500);
  await press('KeyB');
  const n = await game(() => window.__phluphGame.state.decor.length);
  console.log(`     decorations placed: ${n}`);
});

await step('save and reload', async () => {
  await game(() => window.__phluphGame.ui && window.__phluphGame.saves.save(1, window.__phluphGame.state));
  const before = await game(() => Object.keys(window.__phluphGame.state.collection).length);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 180000 });
  await wait(800);
  const after = await game(() => { const s = window.__phluphGame.saves.load(1); return s ? Object.keys(s.collection).length : -1; });
  if (after !== before) throw new Error(`collection ${before} -> ${after}`);
  await shot('16-title-after-reload');
});

const perf = await game(() => window.__phluphGame.perf());
const f = perf.frames.sort((a, b) => a - b);
console.log(`frame cpu ms: median ${f[Math.floor(f.length / 2)]?.toFixed(1)}, p95 ${f[Math.floor(f.length * 0.95)]?.toFixed(1)}; draw calls ${perf.calls}, tris ${perf.tris}`);
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join('\n')}` : 'no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
