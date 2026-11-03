// Stickerwild — game loop, camera, rendering, player, creatures, weather effects,
// travel, adventures, HUD and input.
'use strict';
(function () {
  const { clamp, lerp, TAU, dist } = SW;
  const LH = SW.LEVEL_H, CHUNK = SW.CHUNK, OBJ = SW.OBJ;
  const TS = SW.TEX_SCALE, MARGIN = SW.TEX_MARGIN;
  const ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, TOOLS = SW.TOOLS, RECIPES = SW.RECIPES, ENEMIES = SW.ENEMIES;
  const WX = SW.weather;
  const DAY_LEN = 180;           // seconds per full day
  const PR = 11;                 // player radius
  const $ = (id) => document.getElementById(id);

  // ---------------- canvases & sizing ----------------
  const canvas = $('game');
  const sctx = canvas.getContext('2d');          // the screen
  const buf = document.createElement('canvas');  // the flat world, before bending
  const ctx = buf.getContext('2d');
  const lightCv = document.createElement('canvas');
  const lctx = lightCv.getContext('2d');
  // W,H: screen (CSS px). VW,VH: flat world buffer (CSS px). VCX,VCY: camera point in the buffer.
  // DPR: buffer pixel ratio (adapts to keep the frame rate up). SDPR: screen pixel ratio.
  let W = 0, H = 0, DPR = 1, SDPR = 1, maxDPR = 1.5, Zb = 1, Z = 1;
  let VW = 0, VH = 0, VCX = 0, VCY = 0;
  let zoomMul = clamp(SW.store.get('zoom', 1), 0.55, 1.6);
  const curve = { yA: 0, yTop: 0, R: 1, K: 0.75, a: 0, TH: 1.3, Rs: 1e9, Dk: 0.42, globe: false, bands: [] };
  // ---------------- views ----------------
  // Four cameras over the same sticker world (parallax is its own renderer below). 2.5D looks down at Ene from
  // above. Third person drops the camera low behind Ene and turns with them.
  // First person puts it at Ene's eyes, with your tool held in view. The
  // lower the camera, the flatter the ground (tilt) and the further the
  // horizon; zoom still works in all three.
  const VIEWS = {
    classic: { name: '2.5D view', tilt: 0.625, yA: 0.6, yTop: 0.11, th: 0, follow: false, hero: true, zoom: 1 },
    third: { name: 'Third-person view', tilt: 0.42, yA: 0.78, yTop: 0.14, th: 0.12, follow: true, hero: true, zoom: 1.3 },
    first: { name: 'First-person view', tilt: 0.3, yA: 1.05, yTop: 0.18, th: 0.18, follow: true, hero: false, zoom: 1.1 },
    parallax: { name: 'Parallax view', tilt: 0.625, yA: 0.6, yTop: 0.11, th: 0, follow: false, hero: true, zoom: 1, parallax: true },
  };
  const VIEW_ORDER = ['classic', 'third', 'first', 'parallax'];
  let view = VIEWS[SW.store.get('view', 'classic')] ? SW.store.get('view', 'classic') : 'classic';
  let TILT = VIEWS[view].tilt;
  const globe = SW.makeGlobe ? SW.makeGlobe() : null;   // WebGL planet; null means draw strips instead
  // Layers: #game holds the sky; the planet canvas (WebGL) sits on it, and a thin
  // effects canvas (weather gloom, grain) on top. The browser composites them,
  // so the planet never has to be copied back into a 2D canvas.
  const fxCv = document.createElement('canvas');
  const fxctx = fxCv.getContext('2d');
  if (globe) {
    globe.canvas.className = fxCv.className = 'layer';
    canvas.after(globe.canvas); globe.canvas.after(fxCv);
  }
  let grain = null;

  function resize() {
    SDPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * SDPR); canvas.height = Math.round(H * SDPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    fxCv.width = canvas.width; fxCv.height = canvas.height;
    maxDPR = Math.min(SDPR, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5);
    if (!resize.done) { DPR = maxDPR; resize.done = true; } else DPR = Math.min(DPR, maxDPR);
    Zb = clamp(Math.min(W, H * 1.7) / 740, 0.9, 2.1);
    Z = Zb * zoomMul * VIEWS[view].zoom;
    buildCurve();
    sizeBuffers();
    layoutHUD();
  }
  function sizeBuffers() {
    buf.width = Math.ceil(VW * DPR); buf.height = Math.ceil(VH * DPR);
    lightCv.width = Math.ceil(VW / 2); lightCv.height = Math.ceil(VH / 2);
  }
  function setZoom(z) {
    zoomMul = clamp(z, 0.55, 1.6);
    Z = Zb * zoomMul * VIEWS[view].zoom;
    buildCurve(); sizeBuffers();
    SW.store.set('zoom', zoomMul);
    clearTimeout(setZoom.t);
    setZoom.t = setTimeout(rescale, 280);
  }
  // Re-render stickers at the new on-screen scale.
  function rescale() {
    sizeBuffers();
    const S = clamp(Z * DPR, 0.6, 3);
    if (!SW.SPR || Math.abs(SW.SPR - S) > 0.01) SW.buildSprites(S);
  }

  // ---------------- the round world ----------------
  // The flat world is wrapped onto a small planet. Rows above the hero roll
  // away toward a curved horizon (shrinking and squashing), rows below swell
  // slightly toward the camera:  y = yA + R sin(d/R) above, yA + d + a d^2 below.
  // Columns wrap round a second radius Rs, so the sides fall away and the
  // horizon is an arc:  x = W/2 + Rs sin(t),  y += Dk Rs (1 - cos t),  t = u / Rs.
  // Zooming in makes the planet rounder; zooming out flattens it, like a
  // wider lens. globe.js does the same mapping per pixel on the GPU.
  function buildCurve() {
    const c = curve;
    const t = clamp((zoomMul - 0.55) / 1.05, 0, 1);
    c.globe = !!(globe && !globe.lost);
    const V = VIEWS[view];
    c.TH = 1.0 + 0.55 * t + V.th;
    c.Rs = c.globe ? W * (1.5 - 0.95 * t) : 1e9;
    c.yA = H * V.yA; c.yTop = H * V.yTop;
    c.R = (c.yA - c.yTop) / Math.sin(c.TH);
    c.a = 0.09 / c.R;
    const dTop = c.R * c.TH;
    const dBot = H > c.yA ? (-1 + Math.sqrt(1 + 4 * c.a * (H - c.yA))) / (2 * c.a) : -(c.yA - H);
    VCY = Math.ceil(dTop + 6);
    VH = Math.ceil(VCY + dBot + 10);
    const half = c.globe ? c.Rs * Math.asin(Math.min(0.999, W / 2 / c.Rs)) : W / 2;
    VW = Math.ceil((2 * half) / curveScale(-dTop)) + 12;
    VCX = VW / 2;
    c.drop = c.globe ? c.Dk * c.Rs * (1 - Math.cos(Math.asin(Math.min(1, W / 2 / c.Rs)))) : 0;
    c.bands = [];
    if (c.globe) return;
    const step = 2 / SDPR;
    for (let v = c.yTop; v < H; v += step) {
      const v1 = Math.min(H, v + step);
      const d0 = curveInv(v), d1 = curveInv(v1);
      c.bands.push([v, v1, VCY + d0, VCY + d1, curveScale((d0 + d1) / 2)]);
    }
  }
  function curveInv(v) {
    const c = curve, dv = v - c.yA;
    if (dv < 0) return c.R * Math.asin(Math.max(-1, dv / c.R));
    return (-1 + Math.sqrt(1 + 4 * c.a * dv)) / (2 * c.a);
  }
  function curveY(d) { const c = curve; return d < 0 ? c.yA + c.R * Math.sin(d / c.R) : c.yA + d + c.a * d * d; }
  function curveScale(d) { const c = curve; return d < 0 ? 1 / (1 + c.K * (1 - Math.cos(d / c.R))) : 1 + 2 * c.a * d; }
  function screenToFlat(mx, my) {
    const c = curve, u = mx - W / 2;
    let side = u, drop = 0;
    if (c.globe) {
      const q = u / c.Rs;
      if (Math.abs(q) >= 1) return null;
      const ang = Math.asin(q);
      side = c.Rs * ang; drop = c.Dk * c.Rs * (1 - Math.cos(ang));
    }
    const v = my - drop;
    if (v < c.yTop) return null;
    const d = curveInv(Math.min(H, v)), s = curveScale(d);
    return { x: VCX + side / s, y: VCY + d };
  }
  function flatToScreen(fx, fy) {
    const c = curve, d = fy - VCY, s = curveScale(d);
    let u = (fx - VCX) * s, y = curveY(d);
    if (c.globe) { const ang = clamp(u / c.Rs, -1.5, 1.5); u = c.Rs * Math.sin(ang); y += c.Dk * c.Rs * (1 - Math.cos(ang)); }
    return { x: W / 2 + u, y, s };
  }

  // ---------------- camera rotation ----------------
  let camA = 0, cosA = 1, sinA = 0, camGoal = null;
  function setAngle(a) { camA = ((a % TAU) + TAU) % TAU; cosA = Math.cos(camA); sinA = Math.sin(camA); }
  setAngle(SW.store.get('camA', 0));
  function saveAngle() { clearTimeout(saveAngle.t); saveAngle.t = setTimeout(() => SW.store.set('camA', camA), 400); }
  // world -> flat buffer. Returns a shared point {x, y, d}; d is depth (larger = nearer).
  // The camera also rises with the character (cam.lv) so plateaus and gliding stay centred.
  const PT = { x: 0, y: 0, d: 0 };
  function proj(x, y, lv) {
    const rx = x - G.cam.x, ry = y - G.cam.y;
    const vx = rx * cosA + ry * sinA, vy = -rx * sinA + ry * cosA;
    PT.x = VCX + vx * Z; PT.y = VCY + (vy * TILT - lv + G.cam.lv) * Z; PT.d = vy;
    return PT;
  }
  const depthOf = (x, y) => -x * sinA + y * cosA;
  const screenDX = (dx, dy) => dx * cosA + dy * sinA;        // world direction -> screen x
  const worldDir = (ix, iy) => [ix * cosA - iy * sinA, ix * sinA + iy * cosA]; // screen direction -> world

  // ---------------- state ----------------
  let G = null;
  let last = performance.now();
  const keys = new Set();
  const input = { x: 0, y: 0, act: false, actTouch: false, mouseX: -1, mouseY: -1, holdMove: false, spin: 0, rotating: false };
  const scratch = [];

  function newGame(seed, mode, seedText, density) {
    const world = new SW.World(seed, density || 1);
    WX.resetSoak(); popState.clear();
    const sp = world.findSpawn();
    G = {
      seed, seedText: seedText || String(seed), density: density || 1, world, mode,
      time: DAY_LEN * 0.03,
      player: {
        x: sp.x, y: sp.y, vx: 0, vy: 0, fx: 1, fy: 0, face: 1, hp: 100, maxHp: 100, hunger: 100, level: 1, xp: 0,
        atkCd: 0, swingT: 0, swingTool: null, hurtT: 0, iframes: 0, walkT: 0, moving: false, running: false, lvlOff: LH, dustT: 0,
        energy: 1, alt: 0, vz: 0, flying: false, boat: false, leafWet: 0, raftWet: 0, lastLand: { x: sp.x, y: sp.y },
      },
      inv: { berry: 2 }, tools: {},
      mobs: [], parts: [], floaters: [],
      spawnT: 1, hitT: new Map(),
      cam: { x: sp.x, y: sp.y, lv: LH, shake: 0 },
      stats: { harvested: 0, kills: 0, crafted: 0, fish: 0, chests: 0, deaths: 0, best: null, pages: 0, treasures: 0 },
      tips: {}, lastPhaseNight: false, deadT: 0, saveT: 8, cloudT: 45,
      quests: [], questSeq: 0, regionsSeen: new Set(), region: null, regionT: 0, radarPick: null,
      order: null, fishing: null, hover: null, marker: null,
      drift: Math.random() * TAU, worldMap: null, adv: null, climateT: 0, climate: 'temperate',
      realm: null, known: STARTER_KNOWN(), mods: {}, caves: {}, tq: {}, zonesSeen: [0], inCave: null, talking: false, won: false,
      ene: { face: null, faceT: 0, cry: 0.35, cryT: 0, cryHitT: 0 },
      star: { x: sp.x + 30, y: sp.y, z: 70, vx: 0, vy: 0, t: 0, mood: 'happy', moodT: 0, zapT: 2, zap: null, guiding: false },
    };
    setupRealm(); lastZone = 0;
    for (const ch of nearChunks(sp.x, sp.y, 1)) ch.objs = ch.objs.filter((o) => !(OBJ[o.type].r && dist(o.x, o.y, sp.x, sp.y) < 64));
    if (mode === 'play') { for (let i = 0; i < 3; i++) addQuest(); G.adv = SW.makeAdventure(world); }
    hotbarDirty = craftDirty = questDirty = true;
    prebuild();
  }

  function* nearChunks(x, y, r) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) yield G.world.getChunk(i, j);
  }
  function prebuild() {
    const v = viewChunks();
    for (let cy = v.cy0; cy <= v.cy1; cy++) for (let cx = v.cx0; cx <= v.cx1; cx++) {
      const ch = G.world.getChunk(cx, cy);
      if (!ch.tex) G.world.buildTextures(ch);
    }
  }

  // ---------------- clock & moon ----------------
  const phaseOf = (t) => (t % DAY_LEN) / DAY_LEN;
  const dayOf = (t) => Math.floor(t / DAY_LEN) + 1;
  function darkness(p) {
    if (p < 0.58) return 0;
    if (p < 0.68) return (p - 0.58) / 0.1;
    if (p < 0.93) return 1;
    return 1 - (p - 0.93) / 0.07;
  }
  const isNight = (p) => p >= 0.64 && p < 0.955;
  const moonNow = () => SW.moon(dayOf(G.time));

  // ---------------- view ----------------
  function viewChunks(pad = 0) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [fx, fy] of [[-pad, -pad], [VW + pad, -pad], [-pad, VH + pad], [VW + pad, VH + pad]]) {
      for (const lv of [0, 2 * LH + 30]) {
        const vx = (fx - VCX) / Z, vy = ((fy - VCY) / Z - G.cam.lv + lv) / TILT;
        const wx = G.cam.x + vx * cosA - vy * sinA, wy = G.cam.y + vx * sinA + vy * cosA;
        x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
      }
    }
    return { cx0: Math.floor((x0 - 40) / CHUNK), cx1: Math.floor((x1 + 40) / CHUNK), cy0: Math.floor((y0 - 40) / CHUNK), cy1: Math.floor((y1 + 40) / CHUNK) };
  }
  // Flat buffer point -> world point on the camera's ground level (cheap; used by weather).
  const FW = [0, 0];
  function flatToWorld(fx, fy) {
    const vx = (fx - VCX) / Z, vy = ((fy - VCY) / Z - G.cam.lv) / TILT;
    FW[0] = G.cam.x + vx * cosA - vy * sinA; FW[1] = G.cam.y + vx * sinA + vy * cosA;
    return FW;
  }
  // Flat buffer point -> world point on whichever ground layer is drawn there.
  function screenToWorld(fx, fy) {
    const vx = (fx - VCX) / Z;
    for (let L = 2; L >= 0; L--) {
      const vy = ((fy - VCY) / Z - G.cam.lv + L * LH) / TILT;
      const wx = G.cam.x + vx * cosA - vy * sinA, wy = G.cam.y + vx * sinA + vy * cosA;
      if (G.world.levelAt(wx, wy) === L) return { x: wx, y: wy };
    }
    const vy = ((fy - VCY) / Z - G.cam.lv) / TILT;
    return { x: G.cam.x + vx * cosA - vy * sinA, y: G.cam.y + vx * sinA + vy * cosA };
  }

  // ---------------- messages ----------------
  // Tips go to a small ticker that the layout keeps away from the character.
  function toast(msg, ms = 3600) {
    const t = $('toast');
    t.firstElementChild.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function banner(big, small, color) {
    const b = $('banner');
    b.querySelector('.big').textContent = big;
    b.querySelector('.big').style.color = color || '';
    b.querySelector('.small').textContent = small;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    banner.until = performance.now() + 3000;
    layoutHUD();
    clearTimeout(banner._t); banner._t = setTimeout(layoutHUD, 3050);
  }
  function tipOnce(key, msg) { if (!G.tips[key]) { G.tips[key] = 1; toast(msg); } }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }

  function addItem(item, n, fromWorld) {
    G.inv[item] = (G.inv[item] || 0) + n;
    hotbarDirty = true; craftDirty = true;
    bump(item);
    if (fromWorld) questEvent('gather', item, n);
  }
  function hasCost(cost) { for (const k in cost) if ((G.inv[k] || 0) < cost[k]) return false; return true; }
  function payCost(cost) { for (const k in cost) { G.inv[k] -= cost[k]; if (G.inv[k] <= 0) delete G.inv[k]; } hotbarDirty = true; craftDirty = true; }

  function burningFires() { return G.world.structures.filter((s) => s.type === 'campfire' && s.fuel > 0); }
  function fireRadius(s) { return 210 + Math.sin(G.time * 9 + s.id) * 6 + Math.sin(G.time * 23 + s.id * 3) * 3; }
  function nearFire(x, y, pad = 0) { for (const s of burningFires()) if (dist(x, y, s.x, s.y) < 130 + pad) return s; return null; }
  function inFireLight(x, y) { for (const s of burningFires()) if (dist(x, y, s.x, s.y) < fireRadius(s) * 0.82) return s; return null; }

  // ---------------- RPG: xp, levels, quests ----------------
  function gainXP(n, x, y, lv) {
    if (!n || G.mode !== 'play') return;
    const p = G.player;
    p.xp += n;
    if (x !== undefined) spawnText(x, y, lv + 70, '+' + n + ' xp', '#8a63e8');
    while (p.xp >= SW.xpToNext(p.level)) {
      p.xp -= SW.xpToNext(p.level);
      p.level++;
      p.maxHp += 10; p.hp = p.maxHp;
      banner('Level ' + p.level, '+10 max health. You hit harder.', '#8a63e8');
      eneReact('joy');
      SW.audio.play('craft');
      spawnPoof(p.x, p.y, p.lvlOff + 20, '#a78bfa');
      craftDirty = true;
    }
    hud.xp = -1;
  }
  function attackPower() {
    let w = 1;
    for (const k of ['inkBlade', 'gemSword', 'sword']) if (G.tools[k]) { w = TOOLS[k].dmg; break; }
    return w + Math.floor((G.player.level - 1) * 0.5) + 2 * modsOn('weapon', 'runeKeen');
  }
  function bestWeapon() { for (const k of ['inkBlade', 'gemSword', 'sword']) if (G.tools[k]) return k; return null; }
  function armorBase() { for (const k of ['crystalPlate', 'stoneMail', 'barkVest']) if (G.tools[k]) return TOOLS[k].def; return 0; }
  function armorDef() { const b = armorBase(); return b > 0 ? Math.min(0.75, b + 0.1 * modsOn('armor', 'runeWard')) : 0; }

  function addQuest() {
    const p = G.player;
    G.quests.push(SW.makeQuest(G.world, G.questSeq++, { level: p.level, x: p.x, y: p.y, hasRod: !!G.tools.rod, maxZone: G.realm ? maxZone() : 0 }));
    questDirty = true;
  }
  function questEvent(kind, key, n) {
    for (const q of G.quests) {
      if (q.done || q.kind !== kind || q.key !== key) continue;
      q.have = Math.min(q.need, q.have + n);
      questDirty = true;
      if (q.have >= q.need) completeQuest(q);
    }
  }
  function completeQuest(q) {
    q.done = true;
    const p = G.player;
    toast(`Quest complete: ${q.title}. +${q.xp} xp`);
    SW.audio.play('dawn');
    for (const k in q.reward) dropItems({ [k]: q.reward[k] }, p.x, p.y, p.lvlOff / LH);
    gainXP(q.xp, p.x, p.y, p.lvlOff);
    setTimeout(() => {
      if (!G || !G.quests.includes(q)) return;
      G.quests.splice(G.quests.indexOf(q), 1);
      addQuest();
    }, 1600);
  }

  // ---------------- adventure: Lost Pages & treasure maps ----------------
  function collectPage(i) {
    const adv = G.adv, page = adv.pages[i], p = G.player;
    page.found = true; adv.next = i + 1; G.stats.pages = adv.next;
    const lore = SW.LOST_PAGE_LORE[i];
    banner('Lost Page ' + (i + 1) + '/6', lore.replace(/^Page \d+: /, ''), '#e0a400');
    eneReact('joy');
    toast(lore, 7000);
    SW.audio.play('sting'); setTimeout(() => SW.audio.play('dawn'), 600);
    spawnPoof(page.x, page.y, G.world.levelAt(page.x, page.y) * LH + 20, '#ffd23f');
    gainXP(40 * (i + 1), p.x, p.y, p.lvlOff);
    dropItems(i >= 3 ? { gem: 2 + i, salve: 1 } : { gem: 1 + i, berry: 3 }, page.x, page.y, G.world.levelAt(page.x, page.y));
    if (adv.next >= adv.pages.length) setTimeout(() => banner('The Book is whole', 'Every Lost Page is home. The Scribbles grow quiet.', '#e0a400'), 3500);
    questDirty = true;
  }
  function digTreasure(t) {
    t.dug = true; G.stats.treasures++;
    const p = G.player, danger = G.world.dangerAt(t.x, t.y);
    spawnChips(t.x, t.y, G.world.levelAt(t.x, t.y) * LH, '#c98f4a', 12);
    SW.audio.play('mine'); setTimeout(() => SW.audio.play('craft'), 300);
    const loot = SW.chestLoot(Math.random, danger + 2);
    loot.gem = (loot.gem || 0) + 2; loot.salve = (loot.salve || 0) + 1;
    dropItems(loot, t.x, t.y, G.world.levelAt(t.x, t.y));
    gainXP(30 + danger * 10, p.x, p.y, p.lvlOff);
    toast('You dug up buried treasure!');
    questDirty = true;
  }
  function updateAdventure() {
    const adv = G.adv, p = G.player;
    if (!adv || p.flying) return;
    const page = adv.pages[adv.next];
    if (page && dist(p.x, p.y, page.x, page.y) < 42) collectPage(adv.next);
    for (const t of adv.treasures) if (!t.dug && dist(p.x, p.y, t.x, t.y) < 36) digTreasure(t);
  }

  // ---------------- particles ----------------
  function spawnPeel(sprName, x, y, lvl) { G.parts.push({ k: 'peel', spr: sprName, x, y, lvl, t: 0, life: 0.9, dir: Math.random() < 0.5 ? -1 : 1 }); }
  function spawnFall(sprName, x, y, lvl, dir) { G.parts.push({ k: 'fall', spr: sprName, x, y, lvl, t: 0, life: 1.5, dir, thud: false }); }
  function spawnChips(x, y, lvl, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 40 + Math.random() * 90;
      G.parts.push({ k: 'chip', x, y, lvl, z: 20 + Math.random() * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 120 + Math.random() * 140, t: 0, life: 0.7, color, size: 2.5 + Math.random() * 2.5 });
    }
  }
  function spawnText(x, y, lvl, text, color) { G.parts.push({ k: 'text', x, y, lvl, t: 0, life: 1, text, color }); }
  function spawnPoof(x, y, lvl, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      G.parts.push({ k: 'dot', x, y, lvl, vx: Math.cos(a) * 90, vy: Math.sin(a) * 55, z: 14, t: 0, life: 0.55, r: 4 + Math.random() * 4, color: i % 2 ? '#ffffff' : color });
    }
  }
  function spawnRing(x, y, lvl) { G.parts.push({ k: 'ring', x, y, lvl, t: 0, life: 0.9 }); }
  function dropItems(drops, x, y, lvl, fromWorld) {
    for (const item in drops) {
      for (let i = 0; i < drops[item]; i++) {
        const a = Math.random() * TAU, s = 50 + Math.random() * 60;
        G.floaters.push({ item, x, y, lvl, z: 18, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 220 + Math.random() * 80, t: -i * 0.05, w: !!fromWorld });
      }
    }
  }

  // ---------------- interactions ----------------
  function faceToward(dx, dy) { const sx = screenDX(dx, dy); if (Math.abs(sx) > 2) G.player.face = sx > 0 ? 1 : -1; }
  function harvestObject(o) {
    const p = G.player;
    const def = OBJ[o.type];
    p.atkCd = 0.36; p.swingT = 0.24;
    p.swingTool = def.tool === 'axe' && G.tools.axe ? 'axe' : def.tool === 'pick' && G.tools.pick ? 'pick' : null;
    if (def.needs && !G.tools[def.needs]) {
      G.hitT.set(o.id, G.time);
      SW.audio.play('deny');
      toast('Crystals are too hard by hand. Craft a Pickaxe first.');
      G.order = null;
      return;
    }
    let dmg = 1 + Math.floor((p.level - 1) * 0.25);
    if (def.tool === 'axe' && G.tools.axe) dmg *= 2 * Math.pow(1.5, modsOn('axe', 'runeSwift'));
    if (def.tool === 'pick' && G.tools.pick) dmg *= 2.5 * Math.pow(1.5, modsOn('pick', 'runeSwift'));
    let hp = G.world.damage.has(o.id) ? G.world.damage.get(o.id) : def.hp;
    hp -= dmg;
    G.hitT.set(o.id, G.time);
    const chip = def.tool === 'pick' ? (o.type === 'crystal' ? '#8fe8f6' : '#a3a1b5') : o.type.startsWith('flower') ? '#ff7aa8' : def.chest ? '#ffc93c' : '#6bbf4a';
    spawnChips(o.x, o.y, o.lvl * LH + 20, chip, 5);
    SW.audio.play(def.sound || 'chop');
    buzz(8);
    if (hp > 0) { G.world.damage.set(o.id, hp); return; }
    G.world.removed.set(o.id, G.time);
    G.world.damage.delete(o.id);
    G.stats.harvested++;
    if (def.tree) {
      // timber! the tree topples away from you, then its loot bounces out
      const dir = screenDX(o.x - p.x, o.y - p.y) >= 0 ? 1 : -1;
      spawnFall(o.type, o.x, o.y, o.lvl, dir);
      SW.audio.play('whoosh');
      setTimeout(() => { if (G && G.mode !== 'title') dropItems(def.drops, o.x, o.y, o.lvl, true); }, 560);
    } else spawnPeel(o.type, o.x, o.y, o.lvl);
    if (!def.tree) setTimeout(() => SW.audio.play('peel'), 40);
    if (def.chest) {
      const danger = G.world.dangerAt(o.x, o.y);
      const rand = SW.rng((G.seed + o.x * 7 + o.y * 13) >>> 0);
      const loot = SW.chestLoot(rand, danger);
      if (rand() < 0.18 + danger * 0.03) loot[danger >= 7 ? 'moonOpal' : danger >= 4 ? 'ruby' : 'amber'] = 1;
      if (rand() < 0.08 + danger * 0.01) { const mods = Object.keys(SW.MODS); loot[mods[Math.floor(rand() * mods.length)]] = 1; }
      dropItems(loot, o.x, o.y, o.lvl);
      gainXP(10 * danger, o.x, o.y, o.lvl * LH);
      G.stats.chests++;
      const open = G.adv ? G.adv.treasures.filter((t) => !t.dug).length : 9;
      const t = G.adv && open < 3 && rand() < 0.35 ? SW.makeTreasure(G.world, o.x, o.y, rand) : null;
      if (t) { G.adv.treasures.push(t); toast('The chest held a treasure map! The X is on your island map.', 5200); questDirty = true; }
      else toast('Treasure! The chest held some loot.');
    } else {
      if (!def.tree) dropItems(def.drops, o.x, o.y, o.lvl, true);
      gainXP(def.tool ? 2 : 1, o.x, o.y, o.lvl * LH);
      // Lucky Runes on the pickaxe turn up bonus crystals, and now and then amber
      const luck = def.tool === 'pick' ? modsOn('pick', 'runeLucky') : 0;
      if (luck && Math.random() < 0.22 * luck) dropItems(Math.random() < 0.2 ? { amber: 1 } : { gem: 1 }, o.x, o.y, o.lvl, true);
    }
    if (G.order && G.order.o === o) G.order = null;
  }

  function useStructure(s) {
    const p = G.player;
    p.atkCd = 0.36; p.swingT = 0.24; p.swingTool = null;
    if (s.type === 'campfire' && (G.inv.wood || 0) > 0 && s.fuel < 150) {
      G.inv.wood--; if (!G.inv.wood) delete G.inv.wood; hotbarDirty = craftDirty = true;
      s.fuel = Math.min(170, Math.max(0, s.fuel) + 45);
      spawnText(s.x, s.y, s.lvl * LH + 40, 'fuel +45s', '#ffb13b');
      SW.audio.play('place');
      G.order = null;
      return;
    }
    s.hp -= 1; s.hitT = G.time; SW.audio.play('chop');
    spawnChips(s.x, s.y, s.lvl * LH, '#b07a46', 4);
    if (s.hp <= 0) {
      G.world.structures.splice(G.world.structures.indexOf(s), 1);
      spawnPeel(s.type === 'campfire' ? (s.fuel > 0 ? 'campfire' : 'campfireOut') : 'wall', s.x, s.y, s.lvl);
      dropItems({ wood: 1 }, s.x, s.y, s.lvl);
      SW.audio.play('peel');
      G.order = null;
    }
  }

  // Space / Use button: act on whatever is in front of you.
  function act() {
    const p = G.player;
    if (G.mode !== 'play' || p.flying) return;
    if (G.fishing) { reel(); return; }
    if (p.atkCd > 0) return;
    const hx = p.x + p.fx * 20, hy = p.y + p.fy * 20;
    let best = null, bd = 1e9;
    for (const m of G.mobs) {
      if (m.dying) continue;
      const d = dist(hx, hy, m.x, m.y);
      if (d < 30 + m.r && d < bd) { bd = d; best = m; }
    }
    if (best) { swingAt(best); return; }
    if (G.realm) {
      for (const t of G.realm.tribes) for (const n of t.npcs) if (dist(p.x, p.y, n.x, n.y) < 60) { talkTo(n); return; }
      for (const c of G.realm.caves) if (dist(p.x, p.y, c.x, c.y + 40) < 80) { openTalk({ kind: 'cave', cave: c }); return; }
    }
    for (const s of G.world.structures) if (dist(hx, hy, s.x, s.y) < 30 + s.r) { useStructure(s); return; }
    let target = null; bd = 1e9;
    for (const ch of nearChunks(p.x, p.y, 1)) {
      for (const o of ch.objs) {
        const def = OBJ[o.type];
        if (def.decor) continue;
        const d = dist(hx, hy, o.x, o.y);
        if (d > 26 + (def.r || 6) || d >= bd) continue;
        if (G.world.objState(o, G.time) !== 'full') continue;
        bd = d; target = o;
      }
    }
    if (target) { harvestObject(target); return; }
    const wx = p.x + p.fx * 70, wy = p.y + p.fy * 70;
    if ((G.world.isWater(wx, wy) || p.boat) && G.tools.rod) { startFishing(wx, wy); return; }
    p.atkCd = 0.36; p.swingT = 0.24; p.swingTool = bestWeapon();
    SW.audio.play('swing');
  }

  function swingAt(m) {
    const p = G.player;
    p.atkCd = 0.4; p.swingT = 0.24;
    p.swingTool = bestWeapon() || (G.tools.axe ? 'axe' : null);
    faceToward(m.x - p.x, m.y - p.y);
    hitMob(m, attackPower());
  }

  function hitMob(m, dmg) {
    const crit = Math.random() < 0.1;
    if (crit) dmg *= 2;
    m.hp -= dmg; m.hurtT = 0.25;
    const p = G.player;
    const d = Math.max(1, dist(m.x, m.y, p.x, p.y));
    const kb = m.type === 'pebblor' ? 90 : 260;
    m.kx = ((m.x - p.x) / d) * kb; m.ky = ((m.y - p.y) / d) * kb;
    if (m.state === 'idle' || m.state === 'return') m.state = 'chase';
    spawnText(m.x, m.y, m.lvlOff + 50 * m.scale, (crit ? 'crit ' : '') + '-' + dmg, crit ? '#ff9a3c' : '#ff3b5c');
    SW.audio.play('hit'); buzz(crit ? 25 : 10);
    G.cam.shake = Math.max(G.cam.shake, crit ? 6 : 3);
    if (m.hp <= 0) killMob(m);
  }
  function killMob(m) {
    m.dying = 0.001;
    const def = ENEMIES[m.type];
    spawnPoof(m.x, m.y, m.lvlOff, m.type === 'scribble' ? '#2b2340' : m.type === 'gloop' ? '#5fd3a0' : '#f4ecff');
    SW.audio.play('poof');
    const drops = {};
    for (const [item, n, chance] of def.drops) if (Math.random() < chance * (m.small ? 0.5 : 1)) drops[item] = (drops[item] || 0) + n;
    if (m.elite) { drops.gem = (drops.gem || 0) + 1 + Math.floor(m.lvl / 4); drops.salve = 1; }
    dropItems(drops, m.x, m.y, m.lvlOff / LH);
    gainXP(Math.round(SW.xpForKill(m) * (m.small ? 0.4 : 1)), m.x, m.y, m.lvlOff);
    if (!def.passive) {
      G.stats.kills++; questEvent('hunt', m.type, 1); chargeCry(0.09);
      for (const t of SW.TRIBES) for (const q of t.quests) {
        const st = G.tq[q.id];
        if (q.kind === 'hunt' && q.key === m.type && st && st.state === 'active' && (st.have || 0) < q.need) {
          st.have = (st.have || 0) + 1; questDirty = true;
          if (st.have === q.need) toast(`${q.title}: done! Go back to ${t.elder} in ${t.name}.`, 4800);
        }
      }
    }
    if (def.split && !m.small) {
      for (let i = 0; i < 2; i++) {
        const s = SW.makeEnemy('gloop', m.x + (i ? 14 : -14), m.y, m.lvl, false);
        s.small = true; s.scale = 0.7; s.r *= 0.7; s.hp = s.maxHp = Math.max(1, Math.round(s.maxHp * 0.4)); s.state = 'chase';
        s.kx = (i ? 1 : -1) * 200; s.lvlOff = m.lvlOff;
        G.mobs.push(s);
      }
    }
    if (G.order && G.order.m === m) G.order = null;
  }

  function hurtPlayer(dmg, fromX, fromY) {
    const p = G.player;
    if (p.iframes > 0 || G.mode !== 'play' || p.flying) return;
    dmg = Math.max(1, Math.round(dmg * (1 - armorDef())));
    p.hp -= dmg; p.iframes = 0.7; p.hurtT = 0.35;
    const d = Math.max(1, dist(p.x, p.y, fromX, fromY));
    p.vx += ((p.x - fromX) / d) * 320; p.vy += ((p.y - fromY) / d) * 320;
    G.cam.shake = 9;
    spawnText(p.x, p.y, p.lvlOff + 60, '-' + dmg, '#ff3b5c');
    SW.audio.play('hurt'); buzz(40);
    G.fishing = null;
    eneReact('ay'); chargeCry(0.04);
    $('hud').classList.remove('ouch'); void $('hud').offsetWidth; $('hud').classList.add('ouch');
    if (p.hp <= 0) die();
  }

  function useItem(item) {
    if (G.mode !== 'play' || !(G.inv[item] > 0)) return;
    const def = ITEMS[item], p = G.player;
    if (def.food) {
      if (def.food.hp > 0 && def.food.hunger === 0 && p.hp >= p.maxHp) { toast('You are already at full health.'); return; }
      G.inv[item]--; if (!G.inv[item]) delete G.inv[item];
      const spice = 1 + 0.5 * modsOn('food', 'firePepper');
      const fh = Math.round(def.food.hunger * spice), fp = def.food.hp > 0 ? Math.round(def.food.hp * spice) : def.food.hp;
      p.hunger = clamp(p.hunger + fh, 0, 100);
      p.hp = clamp(p.hp + fp, 0, p.maxHp);
      if (fh) spawnText(p.x, p.y, p.lvlOff + 56, '+' + fh + ' food', '#ff9a3c');
      if (fp) spawnText(p.x + 10, p.y, p.lvlOff + 40, (fp > 0 ? '+' : '') + fp + ' hp', fp > 0 ? '#2fb36f' : '#ff3b5c');
      if (item === 'meat' || item === 'fish') tipOnce('raw', 'Raw food hurts a little. Grill it at a campfire.');
      SW.audio.play('eat');
      hotbarDirty = craftDirty = true;
      if (p.hp <= 0) die();
      return;
    }
    if (def.place) {
      if (p.boat || p.flying) { toast('Build on dry land.'); SW.audio.play('deny'); return; }
      const x = p.x + p.fx * 38, y = p.y + p.fy * 38;
      if (G.world.isWater(x, y)) { toast('You cannot build on water.'); SW.audio.play('deny'); return; }
      const r = item === 'campfire' ? 16 : 15;
      for (const s of G.world.solidsNear(x, y, 60, G.time, scratch)) {
        if (dist(x, y, s.x, s.y) < s.r + r - 4) { toast('Something is in the way. Face an open spot.'); SW.audio.play('deny'); return; }
      }
      G.inv[item]--; if (!G.inv[item]) delete G.inv[item];
      const st = { id: G.world.nextId++, type: item, x, y, r, lvl: G.world.levelAt(x, y), hp: item === 'campfire' ? 3 : 6, fuel: item === 'campfire' ? 150 : 0, hitT: -9 };
      G.world.structures.push(st);
      spawnPoof(x, y, st.lvl * LH, '#ffd23f');
      SW.audio.play('place');
      hotbarDirty = craftDirty = true;
      if (item === 'campfire') tipOnce('placedfire', 'Fire lit. You can fast-travel to it from the map.');
    }
  }

  function eatBest() {
    const p = G.player;
    const order = p.hp < p.maxHp * 0.45 && G.inv.salve ? ['salve', 'koi', 'grilledFish', 'cooked', 'berry', 'mushroom', 'fish', 'meat'] : ['grilledFish', 'cooked', 'berry', 'mushroom', 'koi', 'fish', 'meat', 'salve'];
    for (const it of order) if (G.inv[it] > 0) { useItem(it); return; }
    toast('Nothing to eat. Pick berries, catch fish, or hunt Puffs.');
    SW.audio.play('deny');
  }

  function craft(r) {
    if (G.mode !== 'play') return;
    if (r.tool && G.tools[r.tool]) return;
    if (r.requires && !G.tools[r.requires]) { toast('Craft a ' + TOOLS[r.requires].name + ' first.'); return; }
    const lock = recipeLock(r);
    if (lock) { toast(lock); SW.audio.play('deny'); return; }
    if (r.fire && !nearFire(G.player.x, G.player.y)) { toast('Stand next to a lit campfire to cook.'); SW.audio.play('deny'); return; }
    if (!hasCost(r.cost)) { SW.audio.play('deny'); return; }
    payCost(r.cost);
    if (r.tool) {
      G.tools[r.tool] = true; toast(TOOLS[r.tool].name + ' crafted.');
      if (r.tool === 'rod') tipOnce('rod', 'Tap any water to fish. Reel in when the "!" appears.');
      if (r.tool === 'raft') tipOnce('raft', 'Walk into the water to sail, or tap far water to sail there.');
      if (r.tool === 'glider') tipOnce('glider', 'Press G or the Fly button to take off. The blue bar shows how long you can glide.');
      if (r.tool === 'greatBook') winGame();
    } else addItem(r.gives, 1);
    G.stats.crafted++;
    gainXP(3);
    SW.audio.play('craft');
    spawnPoof(G.player.x, G.player.y, G.player.lvlOff + 20, '#ffd23f');
    craftDirty = hotbarDirty = true;
    renderToolbelt();
  }

  // ---------------- travel: raft & glider ----------------
  // The leaf glider launches you up, then you sink steadily: it is a glide,
  // not a flight. Gusts give lift, flying with the wind carries you farther,
  // and the wind pushes you sideways whether you like it or not. Rain soaks
  // the leaf: a wet leaf sinks faster and must dry on the ground before the
  // next launch. The raft soaks up water while you sail and folds up when
  // it is soggy; it dries out on land.
  const ALT_MAX = 170, LEAF_SOGGY = 0.5, RAFT_SOGGY = 0.35;
  const canSail = () => !!G.tools.raft && (G.player.boat || G.player.raftWet < RAFT_SOGGY);
  function toggleFly() {
    const p = G.player;
    if (G.mode !== 'play' || !G.tools.glider) return;
    if (p.flying) { p.flying = false; return; }
    if (p.leafWet > LEAF_SOGGY) { toast('The leaf is soggy. Let it dry out on the ground before you launch.'); SW.audio.play('deny'); return; }
    // launch: a hop that goes higher from a cliff top
    p.flying = true; p.boat = false; G.order = null; G.fishing = null;
    p.vz = 150 + Math.min(70, p.lvlOff * 1.4);
    SW.audio.play('whoosh');
    tipOnce('fly2', 'Gliding! You sink slowly. Gusts lift you, flying with the wind carries you farther, and rain soaks the leaf.');
  }
  // touching down: on water you need a raft that isn't soggy, or you swim ashore
  function landPlayer(force) {
    const p = G.player;
    if (!force && (!G.world.isWater(p.x, p.y) || (G.tools.raft && p.raftWet < 1))) return;
    const spot = G.world.isWater(p.lastLand.x, p.lastLand.y) ? G.world.landNear(p.x, p.y) : p.lastLand;
    spawnRing(p.x, p.y, 0); spawnRing(p.x, p.y, 0);
    SW.audio.play('poof');
    if (spot) { p.x = spot.x; p.y = spot.y; }
    p.hp -= force ? 5 : 10; p.vx = p.vy = 0; p.boat = false;
    toast(force ? 'Your raft got soggy and folded up! You swam back to shore. Let it dry out on land.' : 'Splash! You swam back to shore. A raft lets you land on water.');
    if (p.hp <= 0) die();
  }


  // ---------------- fishing ----------------
  function startFishing(x, y) {
    const p = G.player;
    if (!G.tools.rod) { toast('Craft a Fishing Rod (3 wood, 3 fiber) to fish here.'); SW.audio.play('deny'); return; }
    const d = Math.max(1, dist(p.x, p.y, x, y));
    if (d > 150) { x = p.x + ((x - p.x) / d) * 150; y = p.y + ((y - p.y) / d) * 150; }
    if (!G.world.isWater(x, y)) return;
    p.fx = (x - p.x) / d; p.fy = (y - p.y) / d;
    faceToward(x - p.x, y - p.y);
    G.fishing = { phase: 'cast', t: 0, x, y, biteAt: (1.6 + Math.random() * 3.2) * WX.biteMul() * Math.pow(0.8, modsOn('rod', 'runeLucky')), nibbles: 0 };
    G.order = null;
    SW.audio.play('swing');
  }
  function reel() {
    const f = G.fishing;
    if (!f) return;
    const p = G.player;
    if (f.phase === 'bite') {
      const deep = G.world.elev(f.x, f.y) < 0.37;
      const fish = SW.rollFish(Math.random, deep, G.world.dangerAt(p.x, p.y) + 4 * modsOn('rod', 'runeLucky'));
      const cm = Math.round(fish.min + Math.random() * (fish.max - fish.min));
      f.phase = 'reel'; f.t = 0; f.fish = fish;
      SW.audio.play('pickup'); buzz(15);
      spawnRing(f.x, f.y, 0);
      if (fish.junk) dropItems({ fiber: 2 }, f.x, f.y, 0);
      else {
        dropItems({ [fish.item]: 1 }, f.x, f.y, 0);
        G.stats.fish++;
        questEvent('fish', 'fish', 1);
        if (!G.stats.best || cm > G.stats.best.cm) G.stats.best = { name: fish.name, cm };
      }
      spawnText(p.x, p.y, p.lvlOff + 80, `${fish.name} ${fish.junk ? '' : cm + ' cm'}`.trim(), fish.id === 'koi' ? '#5cc8e8' : '#2f7fd0');
      gainXP(fish.xp, p.x, p.y, p.lvlOff + 20);
    } else if (f.phase === 'wait') {
      spawnText(p.x, p.y, p.lvlOff + 70, 'Too early!', '#7a6f8f');
      f.t = 0; f.biteAt = (1.5 + Math.random() * 3) * WX.biteMul();
      SW.audio.play('deny');
    }
  }
  function updateFishing(dt) {
    const f = G.fishing;
    if (!f) return;
    if (G.world.frozen > 0.5 && !G.world.isWater(f.x, f.y)) { G.fishing = null; toast('The water is frozen here.'); return; }
    f.t += dt;
    if (f.phase === 'cast' && f.t > 0.45) { f.phase = 'wait'; f.t = 0; spawnRing(f.x, f.y, 0); SW.audio.play('rustle'); }
    else if (f.phase === 'wait' && f.t > f.biteAt) { f.phase = 'bite'; f.t = 0; spawnRing(f.x, f.y, 0); SW.audio.play('mine'); buzz(30); }
    else if (f.phase === 'bite' && f.t > 1.0) {
      f.nibbles++;
      spawnText(G.player.x, G.player.y, G.player.lvlOff + 70, 'It got away...', '#7a6f8f');
      f.phase = 'wait'; f.t = 0; f.biteAt = (1.5 + Math.random() * 3) * WX.biteMul();
    } else if (f.phase === 'reel' && f.t > 1.1) { f.phase = 'cast'; f.t = 0; f.biteAt = (1.6 + Math.random() * 3.2) * WX.biteMul(); }
  }

  function die() {
    const p = G.player;
    p.hp = 0; p.flying = false;
    G.mode = 'dead'; G.deadT = 0; G.order = null; G.fishing = null;
    G.stats.deaths++;
    spawnPeel(p.face < 0 ? 'player0L' : 'player0', p.x, p.y, p.lvlOff / LH);
    SW.audio.play('death'); buzz(120);
    const days = dayOf(G.time) - 1 + phaseOf(G.time);
    const best = SW.store.get('best', 0);
    if (days > best) SW.store.set('best', days);
    setTimeout(() => {
      $('deathDays').textContent = 'Level ' + p.level;
      $('deathSub').textContent = `Day ${dayOf(G.time)} · ${G.stats.deaths} ${G.stats.deaths === 1 ? 'fall' : 'falls'}`;
      $('deathStats').innerHTML =
        `<li><b>${G.stats.harvested}</b> stickers peeled</li><li><b>${G.stats.kills}</b> creatures beaten</li><li><b>${G.stats.fish}</b> fish caught</li><li><b>${G.stats.pages || 0}</b>/6 Lost Pages</li>`;
      $('deathSeed').textContent = G.seedText;
      showScreen('deathScreen');
    }, 1300);
  }

  function respawn() {
    const p = G.player;
    let home = G.world.spawn, bd = 1e9;
    for (const s of G.world.structures) if (s.type === 'campfire') { const d = dist(s.x, s.y, p.x, p.y); if (d < bd) { bd = d; home = { x: s.x, y: s.y + 30 }; } }
    const lost = {};
    for (const k of ['wood', 'stone', 'fiber', 'petal', 'gem', 'ink', 'meat', 'fish']) {
      const n = Math.floor((G.inv[k] || 0) / 2);
      if (n > 0) { G.inv[k] -= n; lost[k] = n; if (!G.inv[k]) delete G.inv[k]; }
    }
    p.x = home.x; p.y = home.y; p.vx = p.vy = 0;
    p.hp = p.maxHp; p.hunger = Math.max(p.hunger, 70); p.iframes = 3; p.energy = 1; p.flying = false; p.alt = 0; p.vz = 0; p.boat = false;
    G.mobs = G.mobs.filter((m) => dist(m.x, m.y, p.x, p.y) > 600);
    G.cam.x = p.x; G.cam.y = p.y;
    G.mode = 'play';
    showScreen(null);
    hotbarDirty = craftDirty = true;
    prebuild();
    toast(Object.keys(lost).length ? 'Back on your feet. You dropped half your materials.' : 'Back on your feet.');
  }

  // ---------------- the realm: zones, tribes, caves, know-how, trade, mods ----------------
  const ZONES = SW.ZONES;
  const STARTER_KNOWN = () => new Set(RECIPES.filter((r) => !r.learn).map((r) => r.id));
  function setupRealm() {
    const w = G.world;
    const R = SW.placeRealm(w);
    for (const t of R.tribes) {
      const n = t.buildings.length, rad = t.city ? 210 : 150;
      t.spots = t.buildings.map((spr, i) => {
        const a = (i / n) * TAU - Math.PI / 2 + 0.3;
        return { x: Math.round(t.x + Math.cos(a) * rad), y: Math.round(t.y + Math.sin(a) * rad * 0.8 - 30), spr };
      });
      t.npcs = [
        { role: 'elder', tribe: t, x: t.x - 46, y: t.y + 34, spr: 'elder_' + t.style, name: t.elder },
        { role: 'trader', tribe: t, x: t.x + 52, y: t.y + 30, spr: 'trader_' + t.style, name: t.trader },
      ];
      w.clearings.push([t.x, t.y, rad + 120]);
      for (const s of t.spots) w.fixed.push({ x: s.x, y: s.y, r: 38 });
      for (const n2 of t.npcs) w.fixed.push({ x: n2.x, y: n2.y, r: 12 });
    }
    R.caves.forEach((c, i) => {
      c.spr = 'caveMount' + i;
      w.clearings.push([c.x, c.y - 40, 240]);
      // the mountain is solid except for its doorway
      w.fixed.push({ x: c.x, y: c.y - 70, r: 70 }, { x: c.x - 80, y: c.y - 20, r: 34 }, { x: c.x + 80, y: c.y - 20, r: 34 });
    });
    G.realm = R;
  }
  function maxZone() { let z = 0; while (z + 1 < ZONES.length && G.player.level >= ZONES[z + 1].level) z++; return z; }
  const zoneOf = (x, y) => SW.zoneAt(G.world, x, y);
  const caveSave = (id) => (G.caves[id] = G.caves[id] || { solved: false, taken: false, broken: [], picked: [] });
  const has = (name) => !!(G.tools[name] || (G.inv[name] || 0) > 0);
  // the ink barrier between zones
  let barrierT = 0;
  function checkBarrier(px, py) {
    const p = G.player;
    if (zoneOf(p.x, p.y) <= maxZone()) return;
    // pushed back over the line you crossed
    p.x = px; p.y = py; p.vx *= -0.4; p.vy *= -0.4; G.order = null;
    if (zoneOf(p.x, p.y) > maxZone()) { const sp = G.world.spawn, d = dist(p.x, p.y, sp.x, sp.y), R = SW.ZONE_R[maxZone()] - 30; p.x = sp.x + ((p.x - sp.x) / d) * R; p.y = sp.y + ((p.y - sp.y) / d) * R; }
    if (G.time - barrierT > 3) {
      barrierT = G.time;
      const z = ZONES[maxZone() + 1];
      toast(`The ink barrier holds you back. You need Level ${z.level} to enter the ${z.name}.`);
      SW.audio.play('deny'); buzz(30);
      spawnPoof(p.x, p.y, p.lvlOff + 20, '#5b4f78');
    }
  }
  let lastZone = 0;
  function zoneWatch() {
    const z = zoneOf(G.player.x, G.player.y);
    if (z !== lastZone) {
      if (z > lastZone && !G.zonesSeen.includes(z)) {
        G.zonesSeen.push(z);
        const Zd = ZONES[z], hi = z + 1 < ZONES.length ? ZONES[z + 1].minDanger - 1 : 15;
        setTimeout(() => banner(Zd.name, `Danger ${Zd.minDanger}–${hi}. Find ${SW.TRIBES[z].name} and the cave of this land.`, Zd.color), 600);
        gainXP(20 + z * 30);
      }
      lastZone = z;
    }
  }

  // ---------------- talking ----------------
  let talk = null;   // { kind: 'elder' | 'trader' | 'cave', tribe, cave, tab, loreI }
  function openTalk(t) { talk = t; G.talking = true; G.order = null; toggleCraft(false); renderTalk(); $('talkPanel').hidden = false; SW.audio.play('pickup'); }
  function closeTalk() { talk = null; G.talking = false; $('talkPanel').hidden = true; }
  function talkTo(n) {
    G.metTribes = G.metTribes || [];
    if (!G.metTribes.includes(n.tribe.id)) { G.metTribes.push(n.tribe.id); gainXP(15 + n.tribe.zone * 15); questDirty = true; }
    openTalk({ kind: n.role, tribe: n.tribe });
  }
  function questOf(tribe) {
    for (const q of tribe.quests) if ((G.tq[q.id] || {}).state !== 'done') return q;
    return null;
  }
  function questText(q, tribe) {
    const cave = G.realm.caves[tribe.zone];
    return q.ask.replace('{dir}', SW.dirWord(cave.x - tribe.x, cave.y - tribe.y));
  }
  function questReady(q) {
    const st = G.tq[q.id] || {};
    if (q.kind === 'hunt') return (st.have || 0) >= q.need;
    if (q.kind === 'bring') return hasCost(q.cost);
    if (q.kind === 'relic') return (G.inv[q.key] || 0) > 0;
    if (q.kind === 'deliver') return st.state === 'relay';
    return false;
  }
  function questProgress(q) {
    const st = G.tq[q.id] || {};
    if (q.kind === 'hunt') return `${Math.min(q.need, st.have || 0)}/${q.need}`;
    if (q.kind === 'bring') return Object.entries(q.cost).map(([k, n]) => `${Math.min(n, G.inv[k] || 0)}/${n} ${ITEMS[k].name.toLowerCase()}`).join(', ');
    if (q.kind === 'relic') return G.inv[q.key] ? 'found!' : 'in the cave';
    if (q.kind === 'deliver') return st.state === 'relay' ? 'answer in hand' : 'to ' + SW.TRIBES.find((t) => t.id === q.key).name;
    return '';
  }
  function finishQuest(q, tribe) {
    if (q.kind === 'bring') payCost(q.cost);
    G.tq[q.id] = { state: 'done' };
    gainXP(q.xp);
    addItem('shell', q.shells);
    if (q.gift) for (const k in q.gift) addItem(k, q.gift[k]);
    if (q.teach) { G.known.add(q.teach); for (const r of RECIPES) if (r.learn === q.teach) G.known.add(r.id); setTimeout(() => banner('New know-how: ' + SW.KNOW[q.teach].name, 'Taught by ' + tribe.elder + '. Check the Craft panel.', tribe.color), 400); }
    SW.audio.play('sting');
    spawnPoof(G.player.x, G.player.y, G.player.lvlOff + 30, '#ffd23f');
    questDirty = craftDirty = true;
    eneReact('joy');
  }
  function talkAction(a) {
    if (!talk) return;
    const tribe = talk.tribe;
    if (a === 'bye') { closeTalk(); return; }
    if (a === 'accept') { const q = questOf(tribe); G.tq[q.id] = { state: 'active', have: 0 }; questDirty = true; SW.audio.play('craft'); toast('New side quest: ' + q.title); }
    else if (a === 'handin') { const q = questOf(tribe); if (questReady(q)) { finishQuest(q, tribe); talk.note = q.done; } }
    else if (a === 'lore') { talk.loreI = ((talk.loreI ?? -1) + 1) % tribe.lore.length; talk.note = tribe.lore[talk.loreI]; }
    else if (a === 'relay') { G.tq[talk.relay.id].state = 'relay'; talk.note = talk.relay.relay; questDirty = true; SW.audio.play('pickup'); }
    else if (a === 'buy' || a === 'sell') { talk.tab = a; }
    else if (a.startsWith('b:')) { const [, item, price] = a.split(':'); if ((G.inv.shell || 0) >= +price) { payCost({ shell: +price }); addItem(item, 1); SW.audio.play('craft'); } else SW.audio.play('deny'); }
    else if (a.startsWith('s:')) { const item = a.slice(2); if ((G.inv[item] || 0) > 0) { payCost({ [item]: 1 }); addItem('shell', SW.VALUE[item]); SW.audio.play('pickup'); } }
    else if (a === 'enter') { const c = talk.cave; closeTalk(); enterCave(c); return; }
    renderTalk();
  }
  function renderTalk() {
    if (!talk) return;
    const t = talk, tribe = t.tribe;
    let face, name, role, body = '', acts = [];
    const btn = (id, label, cls = '') => `<button class="big-btn ${cls}" data-talk="${id}">${label}</button>`;
    if (t.kind === 'cave') {
      const c = t.cave, st = caveSave(c.id);
      face = c.spr; name = c.name; role = st.taken ? 'Finished' : ZONES[c.zone].name;
      const needs = c.needs.map((n) => `<li class="${has(n) ? 'ok' : 'no'}">${has(n) ? '✓' : '✗'} ${(TOOLS[n] || ITEMS[n]).name}</li>`).join('');
      body = `<p>${st.taken ? 'You found the ' + ITEMS[c.relic].name + ' here. There may still be gems in the side tunnels.' : 'A cave mountain. Somewhere inside is the ' + ITEMS[c.relic].name + ', sealed behind a rune puzzle.'}</p>` +
        `<p class="talk-small">To get all the way through you will need:</p><ul class="needs">${needs}</ul>` +
        `<p class="talk-small">You can come back out of the door any time.</p>`;
      acts = [btn('enter', 'Enter the cave'), btn('bye', 'Not yet', 'plain')];
    } else if (t.kind === 'elder') {
      face = 'elder_' + tribe.style; name = tribe.elder; role = 'Elder of ' + tribe.name;
      const q = questOf(tribe), st = q ? G.tq[q.id] || {} : {};
      // someone else's letter?
      const relayQ = SW.TRIBES.flatMap((tr) => tr.quests).find((qq) => qq.kind === 'deliver' && qq.key === tribe.id && (G.tq[qq.id] || {}).state === 'active');
      t.relay = relayQ;
      body = `<p>${t.note || tribe.greet}</p>`;
      if (relayQ) acts.push(btn('relay', 'Hand over the letter'));
      if (q && !st.state) { body += `<div class="quest-card"><b>${q.title}</b><p>${questText(q, tribe)}</p></div>`; acts.push(btn('accept', 'Accept quest')); }
      else if (q && st.state) {
        body += `<div class="quest-card"><b>${q.title}</b><p>${questText(q, tribe)}</p><p class="talk-small">Progress: ${questProgress(q)}</p></div>`;
        if (questReady(q)) acts.push(btn('handin', 'Hand in'));
      } else if (!q) body += '<p class="talk-small">You have done everything we asked. Thank you, little sticker.</p>';
      acts.push(btn('lore', 'Ask about the island', 'alt'), btn('bye', 'Goodbye', 'plain'));
    } else {
      face = 'trader_' + tribe.style; name = tribe.trader; role = 'Trader in ' + tribe.name;
      const tab = t.tab || 'buy';
      body = `<p class="talk-small">You have <b>${G.inv.shell || 0}</b> shells. ${tab === 'buy' ? 'What catches your eye?' : 'I pay fair prices. Rare gems pay best.'}</p><div class="trade">`;
      if (tab === 'buy') {
        for (const [item, price] of tribe.stock) {
          const ok = (G.inv.shell || 0) >= price;
          body += `<div class="trow"><img src="${SW.spriteURL(ITEMS[item].icon)}" alt=""><span>${ITEMS[item].name}${ITEMS[item].mod ? `<small>${SW.MODS[item].desc}</small>` : ''}</span><button class="chip-btn" data-talk="b:${item}:${price}" ${ok ? '' : 'disabled'}>${price} shells</button></div>`;
        }
      } else {
        const sellable = SW.ITEM_ORDER.filter((k) => (G.inv[k] || 0) > 0 && SW.VALUE[k]);
        if (!sellable.length) body += '<p class="talk-small">You have nothing I can buy.</p>';
        for (const item of sellable) body += `<div class="trow"><img src="${SW.spriteURL(ITEMS[item].icon)}" alt=""><span>${ITEMS[item].name} <small>you have ${G.inv[item]}</small></span><button class="chip-btn" data-talk="s:${item}">Sell for ${SW.VALUE[item]}</button></div>`;
      }
      body += '</div>';
      acts = [btn('buy', 'Buy', tab === 'buy' ? '' : 'plain'), btn('sell', 'Sell', tab === 'sell' ? '' : 'plain'), btn('bye', 'Goodbye', 'plain')];
    }
    $('talkFace').src = SW.spriteURL(face);
    $('talkName').textContent = name; $('talkRole').textContent = role;
    $('talkBody').innerHTML = body;
    $('talkActions').innerHTML = acts.join('');
  }

  // ---------------- caves ----------------
  const caveHud = { x: 0, y: 0 };
  const caves = SW.makeCaves({
    player: () => G.player,
    view: () => ({ w: W, h: H, k: clamp(H / (11.5 * 32), 0.85, 2.4), hudX: caveHud.x, hudY: caveHud.y }),
    sound: (n) => SW.audio.play(n),
    toast: (m) => toast(m, 4200),
    banner: (a, b, c) => banner(a, b, c),
    xp: (n) => gainXP(n),
    give: (item, n) => { addItem(item, n); },
    has,
    attack: () => attackPower(),
    hurt: (dmg) => {
      const p = G.player;
      const n = Math.max(1, Math.round(dmg * (1 - armorDef())));
      p.hp -= n; p.hurtT = 0.35;
      SW.audio.play('hurt'); buzz(40);
      eneReact('ay'); chargeCry(0.04);
      $('hud').classList.remove('ouch'); void $('hud').offsetWidth; $('hud').classList.add('ouch');
      return n;
    },
    shake: () => {},
    toolSprite: () => { const w = bestWeapon(); return w ? { sword: 'toolSword', gemSword: 'toolGemSword', inkBlade: 'toolInkBlade' }[w] : G.tools.pick ? 'toolPick' : G.tools.axe ? 'toolAxe' : 'toolHand'; },
    exitCave: () => exitCave(),
    died: () => { const c = G.inCave; exitCave(true); die(); return c; },
    caveDone: (def) => { G.stats.caves = (G.stats.caves || 0) + 1; questDirty = true; eneReact('joy'); },
    heroFace: () => { const e = G.ene; return !e ? null : e.cryT > 0 ? 'playerCry' : e.faceT > 0 && e.face ? 'player' + e.face : null; },
    crying: () => !!(G.ene && G.ene.cryT > 0),
    eneReact: () => G.ene,
    // her outline in a cave: her gear, plus being hurt there
    eneOutline: (unit, hurt) => { const c = eneGear(G.player, bestWeapon()); c.hurt = !!hurt; c.night = true; return eneOutline(c, unit); },
    charge: (n) => chargeCry(n),
    starMood: () => (G.star ? G.star.mood : 'happy'),
    starFeel: (m, t) => starFeel(m, t),
  });
  function enterCave(c) {
    G.inCave = c.id; G.order = null; G.fishing = null; G.player.flying = false; G.player.alt = 0; G.player.boat = false;
    caves.enter(c, caveSave(c.id));
    document.body.classList.add('in-cave');
    if (globe) globe.canvas.hidden = fxCv.hidden = true;
    SW.audio.play('whoosh');
    setTimeout(() => banner(c.name, caveSave(c.id).taken ? 'Finished. Explore the side tunnels.' : 'Read the mural, then strike the runes in its order.', ZONES[c.zone].color), 200);
    tipOnce('cave1', touchMode() ? 'Stick to move, push up to jump or climb ladders, Use to strike and open. Walk into the glowing door to leave.' : 'A/D move, W or Space jump, W/S climb ladders, E or J to strike and open. The glowing door takes you outside.');
    hud.region = '';
  }
  function exitCave(silent) {
    const c = G.realm.caves.find((cc) => cc.id === G.inCave);
    caves.leave();
    G.inCave = null;
    document.body.classList.remove('in-cave');
    if (globe && curve.globe && !VIEWS[view].parallax) globe.canvas.hidden = fxCv.hidden = false;
    if (c) { G.player.x = c.x; G.player.y = c.y + 70; G.player.vx = G.player.vy = 0; G.cam.x = G.player.x; G.cam.y = G.player.y; }
    if (!silent) { SW.audio.play('whoosh'); toast('Back outside.'); }
    hud.region = '';
    prebuild();
  }
  const touchMode = () => document.body.classList.contains('touch');
  let caveUp = false;
  function caveInput() {
    let x = input.x, y = input.y;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x = -1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x = 1;
    const up = keys.has('KeyW') || keys.has('ArrowUp') || input.y < -0.55;
    if (up) y = -1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y = 1;
    const upEdge = up && !caveUp; caveUp = up;
    const jumpKey = input.jumpEdge || false; input.jumpEdge = false;
    const use = input.useEdge || false; input.useEdge = false;
    return { x: Math.abs(x) < 0.2 ? 0 : clamp(x, -1, 1), y: Math.abs(y) < 0.45 ? 0 : Math.sign(y), upEdge, jumpKey, use };
  }

  function caveSurvival(dt) {
    const p = G.player;
    updateEne(dt);
    if (G.star) { G.star.t += dt; G.star.moodT -= dt; if (G.star.moodT <= 0) G.star.mood = p.hp < p.maxHp * 0.3 ? 'sad' : 'happy'; }
    p.hurtT -= dt;
    p.hunger = Math.max(0, p.hunger - dt * 0.4);
    if (p.hunger <= 0) p.hp -= dt * 1.6;
    else if (p.hunger > 50 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * (0.8 + p.level * 0.1));
  }

  // ---------------- mods ----------------
  const modsOn = (slot, id) => (G.mods[slot] || []).filter((m) => !id || m === id).length;
  function slotOwned(slot) {
    if (slot === 'weapon') return !!bestWeapon();
    if (slot === 'armor') return armorBase() > 0;
    if (slot === 'food') return true;
    return !!G.tools[slot];
  }
  function fitMod(id, slot) {
    if (!(G.inv[id] > 0) || !slotOwned(slot) || modsOn(slot) >= SW.MOD_MAX) { SW.audio.play('deny'); return; }
    payCost({ [id]: 1 });
    (G.mods[slot] = G.mods[slot] || []).push(id);
    SW.audio.play('craft');
    toast(`${ITEMS[id].name} fitted to your ${SW.MOD_SLOTS[slot]}.`);
    craftDirty = true; renderToolbelt();
  }

  // ---------------- Ene and Star ----------------
  // Ene reacts with her faces: "AY!!" when she's hurt, joy when something good
  // happens. Close-ups use the original drawings (SW.ART_IMG). Her rainbow cry
  // is a special move: it charges as she fights, then two rainbows pour from
  // her eyes, knocking back everything around her and washing the ink out of
  // Scribbles. Star floats beside her, flies ahead to show the way, lights up
  // the dark, zaps enemies now and then, and wears its feelings on its face.
  const CRY_TIME = 1.9, CRY_R = 175;
  function eneReact(kind) {
    const e = G.ene;
    if (!e) return;
    if (kind === 'ay') {
      e.face = 'Ay'; e.faceT = 0.9;
      G.parts.push({ k: 'ay', x: G.player.x, y: G.player.y, lvl: G.player.lvlOff + 112, t: 0, life: 0.9 });
      portrait('eneFront', 'AY!!');
      starFeel('surprised', 1.2);
    } else if (kind === 'joy') {
      e.face = 'Joy'; e.faceT = 1.6;
      portrait('eneJoy');
      starFeel('laugh', 2);
    }
  }
  let portraitT = 0;
  function portrait(art, word) {
    const el = $('enePop');
    if (!el || !SW.artURL) return;
    $('enePopImg').src = SW.artURL(art);
    $('enePopWord').textContent = word || '';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(portraitT); portraitT = setTimeout(() => el.classList.remove('show'), word ? 1300 : 1900);
  }
  function chargeCry(n) {
    const e = G.ene;
    if (!e || e.cryT > 0) return;
    const was = e.cry;
    e.cry = Math.min(1, e.cry + n);
    if (was < 1 && e.cry >= 1) { tipOnce('cry', touchMode() ? 'Rainbow cry is ready! Tap the rainbow button.' : 'Rainbow cry is ready! Press R.'); SW.audio.play('sting'); }
  }
  function rainbowCry() {
    const e = G.ene, p = G.player;
    if (!e || G.mode !== 'play' || e.cryT > 0) return;
    if (e.cry < 1) { toast('The rainbow cry is still charging. Fight to fill the rainbow bar.'); SW.audio.play('deny'); return; }
    e.cry = 0; e.cryT = CRY_TIME; e.cryHitT = 0;
    p.flying = false; G.order = null; G.fishing = null;
    portrait('eneCry');
    starFeel('surprised', 1.4);
    SW.audio.play('boom'); buzz(60);
    G.cam.shake = 8;
  }
  function updateEne(dt) {
    const e = G.ene, p = G.player;
    if (!e) return;
    e.faceT -= dt;
    if (e.cryT > 0) {
      e.cryT -= dt; e.cryHitT -= dt;
      p.vx *= 0.8; p.vy *= 0.8;
      if (e.cryHitT <= 0 && !G.inCave) {
        e.cryHitT = 0.32;
        for (const m of G.mobs) {
          if (m.dying || ENEMIES[m.type].passive) continue;
          const d = dist(m.x, m.y, p.x, p.y);
          if (d > CRY_R) continue;
          if (m.type === 'scribble') { m.hp = 0; spawnPoof(m.x, m.y, m.lvlOff, '#a78bfa'); killMob(m); continue; }
          hitMob(m, Math.max(2, attackPower() * 2));
          m.kx = ((m.x - p.x) / Math.max(1, d)) * 520; m.ky = ((m.y - p.y) / Math.max(1, d)) * 520;
        }
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * TAU, r = CRY_R * (0.5 + Math.random() * 0.5);
          spawnChips(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.lvlOff, ['#e8322a', '#f5861f', '#f8d81e', '#4fb04a', '#3a3ad0', '#7a35c8'][i], 3);
        }
      }
      if (e.cryT <= 0) { e.face = 'Joy'; e.faceT = 1; }
    } else e.cry = Math.min(1, e.cry + dt * 0.004);
  }

  function starFeel(mood, t) { const s = G.star; if (s) { s.mood = mood; s.moodT = t; } }
  function starGoal() {
    const goal = realmGoal();
    if (goal) return goal;
    const page = G.adv && G.adv.pages[G.adv.next];
    if (page) return page;
    const q = G.quests.find((q) => q.kind === 'explore' && !q.done);
    return q ? { x: q.tx, y: q.ty } : null;
  }
  function updateStar(dt) {
    const s = G.star, p = G.player;
    if (!s) return;
    s.t += dt; s.moodT -= dt; s.zapT -= dt;
    if (s.zap) { s.zap.t += dt; if (s.zap.t > 0.3) s.zap = null; }
    // the nearest foe that is after Ene
    let foe = null, fd = 260;
    for (const m of G.mobs) {
      if (m.dying || ENEMIES[m.type].passive || m.state === 'idle') continue;
      const d = dist(m.x, m.y, p.x, p.y);
      if (d < fd) { fd = d; foe = m; }
    }
    let tx, ty;
    const goal = !foe && G.mode === 'play' ? starGoal() : null;
    s.guiding = !!(goal && dist(goal.x, goal.y, p.x, p.y) > 320);
    if (foe) { const d = Math.max(1, fd), [rx, ry] = worldDir(1, 0); tx = p.x + ((foe.x - p.x) / d) * 30 - rx * 52; ty = p.y + ((foe.y - p.y) / d) * 30 - ry * 52; }
    else if (s.guiding) {
      // fly out ahead toward the goal, and loop back now and then so Ene follows
      const d = dist(goal.x, goal.y, p.x, p.y), ux = (goal.x - p.x) / d, uy = (goal.y - p.y) / d;
      const lead = 95 + Math.sin(s.t * 1.3) * 25;
      tx = p.x + ux * lead - uy * Math.sin(s.t * 2.1) * 18; ty = p.y + uy * lead + ux * Math.sin(s.t * 2.1) * 18;
      if (s.moodT <= 0 && Math.random() < dt * 0.15) starFeel('happy', 1);
    } else {
      // beside Ene, on the camera's right, bobbing
      const [rx, ry] = worldDir(1, 0);
      tx = p.x + rx * 50 - p.fx * 10; ty = p.y + ry * 50 - p.fy * 10;
    }
    const k = Math.min(1, dt * 5);
    s.vx += ((tx - s.x) * 9 - s.vx * 4.2) * dt; s.vy += ((ty - s.y) * 9 - s.vy * 4.2) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (dist(s.x, s.y, p.x, p.y) > 600) { s.x = p.x; s.y = p.y; s.vx = s.vy = 0; }
    s.z += ((p.lvlOff + p.alt + 62 + Math.sin(s.t * 3) * 7 + (s.guiding ? 12 : 0)) - s.z) * k;
    // a zap now and then
    if (foe && s.zapT <= 0 && G.mode === 'play') {
      s.zapT = 3.2;
      s.zap = { x: foe.x, y: foe.y, lv: foe.lvlOff + 20, t: 0 };
      foe.stunT = 0.9;
      starFeel('angry', 1.2);
      hitMob(foe, 1 + Math.floor(p.level / 2));
    }
    // default feelings: worried when Ene is hurt badly, cross when Scribbles are about
    if (s.moodT <= 0) {
      if (p.hp < p.maxHp * 0.3) s.mood = 'sad';
      else if (foe) s.mood = 'angry';
      else s.mood = 'happy';
    }
  }
  function drawStar(d) {
    const s = G.star;
    const pt = proj(s.x, s.y, s.z);
    d.sx = pt.x; d.sy = pt.y;
    const fr = Math.floor(s.t * 5) % 2;
    const glowA = Math.max(darkness(phaseOf(G.time)), 0.25);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createRadialGradient(pt.x, pt.y - 20 * Z, 0, pt.x, pt.y - 20 * Z, 46 * Z);
    g.addColorStop(0, `rgba(255,230,120,${0.45 * glowA})`); g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g; ctx.fillRect(pt.x - 50 * Z, pt.y - 70 * Z, 100 * Z, 100 * Z);
    drawSprite('star_' + s.mood + fr, pt.x, pt.y, Math.sin(s.t * 2.4) * 0.12 + (s.guiding ? 0.15 : 0), 1, 1);
    if (s.zap) {
      // a zigzag of starlight to whatever Star zapped
      // proj() hands back one shared point, so Star's spot (kept in d) is read before the
      // target's projection overwrites it
      const t = proj(s.zap.x, s.zap.y, s.zap.lv), a = { x: t.x, y: t.y }, b = { x: d.sx, y: d.sy - 22 * Z };
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 1 - s.zap.t / 0.3;
      for (const [w, col] of [[7, '#ffffff'], [3.5, '#ffd23f']]) {
        ctx.lineWidth = w * Z; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(b.x, b.y);
        for (let i = 1; i <= 5; i++) { const t = i / 5; ctx.lineTo(lerp(b.x, a.x, t) + (i < 5 ? (Math.random() - 0.5) * 14 * Z : 0), lerp(b.y, a.y, t) + (i < 5 ? (Math.random() - 0.5) * 14 * Z : 0)); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  // two rainbows from Ene's eyes, arcing out to either side and splashing down
  function drawRainbows(sx, sy, g = ctx, zz = Z, dpr = DPR) {
    const e = G.ene;
    if (!e || e.cryT <= 0) return;
    const k = Math.min(1, (CRY_TIME - e.cryT) / 0.35) * Math.min(1, e.cryT / 0.3);
    const bands = ['#e8322a', '#f5861f', '#f8d81e', '#4fb04a', '#3a3ad0', '#7a35c8', '#b03ec2'];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    const eyeY = sy - 84 * zz;
    for (const side of [-1, 1]) {
      const x0 = sx + side * 5 * zz, x1 = sx + side * 120 * zz * k, y1 = sy + 6 * zz;
      const cx = sx + side * 70 * zz * k, cy = eyeY - 50 * zz * k;
      g.lineWidth = 34 * zz * k; g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(x0, eyeY); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
      bands.forEach((col, i) => {
        const o = (i - 3) * 4 * zz * k * side;
        g.lineWidth = 4.6 * zz * k; g.strokeStyle = col;
        g.beginPath(); g.moveTo(x0, eyeY); g.quadraticCurveTo(cx + o, cy + o * 0.6, x1 + o, y1); g.stroke();
      });
      // splash where it lands
      g.fillStyle = bands[(Math.floor(G.time * 12) + (side > 0 ? 3 : 0)) % bands.length];
      for (let i = 0; i < 4; i++) { const a = -Math.PI * (0.15 + i * 0.22); g.beginPath(); g.ellipse(x1 + Math.cos(a) * 16 * zz * side, y1 + Math.sin(a) * 9 * zz, 5 * zz * k, 3.4 * zz * k, a, 0, TAU); g.fill(); }
    }
  }

  // ---------------- parallax view ----------------
  // The island seen side-on as rows of rolling hills, like a cartoon
  // backdrop. The world is cut into bands BAND units deep running east-west.
  // The band you stand in is the stage: A/D walk along it, W/S walk up and
  // down its hill. Walk over the crest and the camera dollies forward into
  // the next band, whose trees, rocks and creatures pop up as you arrive.
  // Hills further back are smaller, hazier and lie flat until you get there.
  const BAND = 300, PX_D0 = 0.9, PX_TC = 0.8, PX_BACK = 6;
  const px = { cb: null, list: [], hz: 0, camh: 0, hh: 0, k: 1 };
  function pxSetup() {
    px.hz = H * 0.3;
    px.camh = (0.9 * H - px.hz) * PX_D0;                     // camera height: the stage's foot sits near the bottom
    px.hh = px.camh - (0.5 * H - px.hz) * (PX_D0 + PX_TC);   // hill height: its crest a little above the middle
    px.k = 0.0022 * H * zoomMul;                            // px per world unit at depth 1: Ene stands about a fifth of the screen tall
  }
  const pxU = (y) => -y / BAND;
  // Each hill holds a few things, not a forest: a tree or two, a rock, some crystals, a bush.
  function pxKeep(def) { return def.chest ? 0.45 : def.tree ? 0.1 : def.rock || def.needs ? 0.16 : def.glow ? 0.14 : def.decor ? 0.05 : 0.08; }                               // world y -> band coordinate (forward = north)
  function pxHill(i, t, wx) {
    const r = SW.hash(i, 7, G.seed);
    const mul = 0.72 + r * 0.45 + 0.22 * Math.sin(wx / 610 + i * 1.7) + 0.12 * Math.sin(wx / 233 + i * 3.1);
    const f = t < PX_TC ? Math.pow(Math.sin((Math.PI / 2) * (t / PX_TC)), 1.4) : Math.cos((Math.PI / 2) * ((t - PX_TC) / (1 - PX_TC)));
    return px.hh * mul * Math.max(0, f);
  }
  // a world point on the hills -> screen; returns null if it is behind the camera
  const PXP = { x: 0, y: 0, s: 1, z: 1 };
  function pxProj(wx, u, lift = 0) {
    const i = Math.floor(u), t = u - i;
    let z = u - px.cb + PX_D0;
    if (z < 0.25) return null;
    const flat = clamp((z - 0.45) / 0.5, 0, 1);              // hills slide down out of view as they pass the camera
    const h = pxHill(i, t, wx) * flat + lift;
    PXP.s = px.k / z; PXP.z = z;
    PXP.x = W / 2 + (wx - G.cam.x) * PXP.s;
    PXP.y = px.hz + (px.camh - h) / z;
    return PXP;
  }
  function pxColor(i, z) {
    const b = G.world.biomeAt(G.cam.x, -(i + 0.5) * BAND);
    let c = hexRGB(SW.MAP_COLOR[b] || '#7cc34f');
    if (b <= 2) c = hexRGB('#6fb3e0');
    else if (b !== 10 && b !== 11 && b !== 3) c = mixRGB(c, [86, 170, 70], 0.45);  // cartoon green hills
    if (i % 2) c = mixRGB(c, [40, 70, 60], 0.12);           // alternate rows a shade darker, like the drawings
    const d = darkness(phaseOf(G.time));
    const haze = mixRGB(mixRGB(SKY.dayLow, [120, 170, 170], 0.45), SKY.nightLow, d);
    return mixRGB(c, haze, clamp((z - PX_D0) / 6.5, 0, 0.78));
  }
  // pop-up for the parallax rows: the stage stands up, the row behind it half way, the rest lie flat
  function pxPop(id, rel, dt) {
    const target = rel < 0.6 ? 0 : rel < 1.6 ? 0.6 : POP_FLAT;
    let st = popState.get(id);
    if (!st) { st = { a: target, v: 0, seen: 0 }; popState.set(id, st); }
    st.seen = popFrame;
    const h = Math.min(dt, 1 / 30);
    st.v += ((target - st.a) * 120 - st.v * 10.5) * h;
    st.a = clamp(st.a + st.v * h, -0.4, 1.5);
    return st.a;
  }
  function pxSprite(name, x, y, sc, rot = 0, kx = 1, ky = 1, which = 'img') {
    const spr = SW.sprites[name];
    if (!spr) return null;
    const img = which === 'glow' ? tintOf(spr, 'glow', '#ffd23f') : spr[which];
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    sctx.translate(x, y); if (rot) sctx.rotate(rot); sctx.scale(kx * sc, ky * sc);
    sctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h);
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    return spr;
  }
  function renderParallax(dt) {
    const p = G.player, world = G.world, t = G.time;
    pxSetup();
    updatePopZone();
    // the camera frames the band you are in; past the crest it moves on to the next
    const u = pxU(p.y), target = Math.floor(u + (1 - PX_TC));
    if (px.cb === null || Math.abs(px.cb - target) > 3) px.cb = target;
    px.cb += (target - px.cb) * Math.min(1, dt * 3.2);
    const skyLow = paintSky(px.hz * 0.8, px.hz + H * 0.08, -0.75);
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    // far snow-capped mountains on the horizon, drifting slowly as you walk
    pxMountains();
    // haze at the horizon
    const hz = sctx.createLinearGradient(0, px.hz - 30, 0, px.hz + 40);
    hz.addColorStop(0, rgba(skyLow, 0)); hz.addColorStop(1, rgba(skyLow, 1));
    sctx.fillStyle = hz; sctx.fillRect(0, px.hz - 30, W, H);
    // gather what lives in each visible row
    const i0 = Math.floor(px.cb) - 1, i1 = Math.floor(px.cb) + PX_BACK;
    const rows = new Map();
    for (let i = i0; i <= i1; i++) rows.set(i, []);
    const halfFar = (W / 2) * (i1 - px.cb + PX_D0 + 1) / px.k + 200;
    const yMin = -(i1 + 1) * BAND, yMax = -i0 * BAND;
    const cx0 = Math.floor((G.cam.x - halfFar) / CHUNK), cx1 = Math.floor((G.cam.x + halfFar) / CHUNK);
    const cy0 = Math.floor(yMin / CHUNK), cy1 = Math.floor(yMax / CHUNK);
    const add = (e, x, y) => {
      const uu = pxU(y), i = Math.floor(uu);
      const row = rows.get(i);
      if (!row) return;
      const zz = uu - px.cb + PX_D0, half = (W / 2) * zz / px.k + 80;
      if (Math.abs(x - G.cam.x) > half) return;
      e.x = x; e.y = y; e.u = uu; e.t = uu - i; row.push(e);
    };
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = world.getChunk(cx, cy);
      for (const o of ch.objs) {
        const def = OBJ[o.type];
        if (SW.hash(Math.round(o.x), Math.round(o.y), 911) > pxKeep(def)) continue;
        const st = world.objState(o, t);
        if (st === 'gone') continue;
        const uu = pxU(o.y), rel = Math.floor(uu) - px.cb;
        if (def.decor && rel > 0.6) continue;                 // grass and flowers only on the stage
        if (!def.r && !def.decor && rel > 1.6 && !def.tree) continue;
        add({ k: 0, o, spr: st === 'after' ? def.after : o.type }, o.x, o.y);
      }
    }
    for (const s of world.structures) add({ k: 1, s, spr: s.type === 'campfire' ? (s.fuel > 0 ? 'campfire' : 'campfireOut') : 'wall' }, s.x, s.y);
    for (const m of G.mobs) add({ k: 2, m, spr: mobSprite(m), sc: m.scale }, m.x, m.y);
    if (G.realm) {
      for (const tr of G.realm.tribes) { for (const sp of tr.spots) add({ k: 6, spr: sp.spr }, sp.x, sp.y); for (const n of tr.npcs) add({ k: 7, npc: n, spr: n.spr }, n.x, n.y); }
      for (const c of G.realm.caves) add({ k: 6, cave: c, spr: c.spr }, c.x, c.y);
    }
    if (G.adv) { const pg = G.adv.pages[G.adv.next]; if (pg) add({ k: 4, spr: 'lostPage' }, pg.x, pg.y); }
    add({ k: 3 }, p.x, p.y);
    if (G.star) add({ k: 8 }, G.star.x, G.star.y);
    px.list.length = 0;
    // draw from the back row to the front
    for (let i = i1; i >= i0; i--) {
      const z0 = i - px.cb + PX_D0;
      if (z0 + 1 < 0.3) continue;
      const row = rows.get(i).sort((a, b) => b.t - a.t);
      const behind = row.filter((e) => e.t > PX_TC), front = row.filter((e) => e.t <= PX_TC);
      for (const e of behind) pxDrawEntity(e, i, dt);
      // the hill: a crest line across the screen, filled down to the bottom
      const zc = i + PX_TC - px.cb + PX_D0;
      if (zc > 0.25) {
        const col = pxColor(i, zc);
        sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
        sctx.beginPath(); sctx.moveTo(-10, H + 10);
        for (let sx = -10; sx <= W + 10; sx += 8) {
          const wx = G.cam.x + (sx - W / 2) * zc / px.k;
          const q = pxProj(wx, i + PX_TC);
          sctx.lineTo(sx, q ? q.y : H + 10);
        }
        sctx.lineTo(W + 10, H + 10); sctx.closePath();
        const gr = sctx.createLinearGradient(0, px.hz, 0, H);
        gr.addColorStop(0, rgba(mixRGB(col, [255, 255, 255], 0.12))); gr.addColorStop(1, rgba(mixRGB(col, [20, 40, 30], 0.25)));
        sctx.fillStyle = gr; sctx.fill();
        // sticker rim and an inked crest line
        const near = clamp(1.6 - (zc - PX_D0) * 0.35, 0.35, 1.4);
        sctx.lineJoin = 'round';
        sctx.lineWidth = 5 * near; sctx.strokeStyle = 'rgba(255,255,255,0.85)'; sctx.stroke();
        sctx.lineWidth = 2.2 * near; sctx.strokeStyle = `rgba(22,18,28,${0.75 * near})`; sctx.stroke();
        // zigzag grass on the near rows
        if (zc < PX_D0 + 2.2) {
          sctx.lineWidth = 1.4 * near; sctx.strokeStyle = rgba(mixRGB(col, [20, 60, 30], 0.35), 0.7);
          for (let n = 0; n < 26; n++) {
            const r1 = SW.hash(i, n, 31), r2 = SW.hash(n, i, 37);
            const tt = 0.12 + r2 * (PX_TC - 0.2);
            const wx = G.cam.x + (r1 - 0.5) * W * (i - px.cb + tt + PX_D0) / px.k * 1.1;
            const q = pxProj(wx, i + tt);
            if (!q) continue;
            const w = 9 * q.s;
            sctx.beginPath(); sctx.moveTo(q.x - w, q.y); sctx.lineTo(q.x - w / 2, q.y - w * 0.6); sctx.lineTo(q.x, q.y); sctx.lineTo(q.x + w / 2, q.y - w * 0.6); sctx.lineTo(q.x + w, q.y); sctx.stroke();
          }
        }
      }
      for (const e of front) pxDrawEntity(e, i, dt);
    }
    // weather in front of everything
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    const windX = Math.cos(WX.windAngle);
    const toW = (fx, fy) => { FW[0] = G.cam.x + (fx - W / 2) / px.k; FW[1] = p.y; return FW; };
    WX.draw(sctx, W, H, 1, Math.min(dt, 0.05), 0, 0, windX, toW);
    pxLighting();
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    WX.overlay(sctx, W, H);
    if (grain) { sctx.fillStyle = grain; sctx.fillRect(0, 0, W, H); }
  }
  function pxDrawEntity(e, i, dt) {
    const p = G.player;
    const rel = i - px.cb;
    const q = pxProj(e.x, e.u);
    if (!q) return;
    const sx = q.x, sy = q.y, sc = q.s;
    if (sx < -200 || sx > W + 200) return;
    if (e.k === 3) {
      const e2 = G.ene || {};
      const moving = p.moving && !p.flying && !p.boat;
      // across the hill: side-on; up it: her back; down it: toward you
      eneLook(p, p.vx, p.vy, moving || (p.moving && p.boat), false);
      const bob = p.alt * sc + (p.boat ? Math.sin(G.time * 3) * 2 * sc : 0);
      sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
      sctx.fillStyle = 'rgba(46,34,82,0.22)'; sctx.beginPath(); sctx.ellipse(sx, sy, 15 * sc, 5 * sc, 0, 0, TAU); sctx.fill();
      if (e2.cryT > 0) drawRainbows(sx, sy - bob, sctx, sc, SDPR);
      const fishing = !!G.fishing;
      const toolName = fishing ? 'rod' : p.swingT > 0 ? p.swingTool : bestWeapon() || (G.tools.axe ? 'axe' : G.tools.pick ? 'pick' : null);
      const toolSpr = eneToolSpr(toolName);
      const P = SW.ene.pose(eneState(p, { fish: fishing, glide: p.flying || p.alt > 4, boat: p.boat }));
      const s = ENE_UNITS * sc / SW.ene.height, f = eneFacing(P, p);
      const inHand = (p.swingT > 0 || fishing) && toolSpr;
      sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
      const flick = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
      const info = SW.ene.draw(sctx, sx, sy - bob, s, P, Object.assign({ dpr: SDPR, flash: p.hurtT > 0 || flick ? 0.7 : 0,
        tool: inHand && SW.sprites[toolSpr] ? { spr: SW.sprites[toolSpr], off: fishing ? 1.25 : 0.55 } : null,
        outline: eneOutline(eneGear(p, inHand ? toolName : bestWeapon()), sc) }, eneProps(p, toolSpr, inHand)));
      if (info) px.list.push({ k: 3, x0: sx - 20 * sc, y0: sy - 100 * sc, x1: sx + 20 * sc, y1: sy });
      return;
    }
    if (e.k === 8) {
      const s = G.star, fr = Math.floor(s.t * 5) % 2;
      const z = s.z - (G.player.lvlOff || 0);
      const yy = sy - z * sc;
      sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
      const g = sctx.createRadialGradient(sx, yy - 20 * sc, 0, sx, yy - 20 * sc, 46 * sc);
      g.addColorStop(0, `rgba(255,230,120,${0.45 * Math.max(0.25, darkness(phaseOf(G.time)))})`); g.addColorStop(1, 'rgba(255,230,120,0)');
      sctx.fillStyle = g; sctx.fillRect(sx - 50 * sc, yy - 70 * sc, 100 * sc, 100 * sc);
      pxSprite('star_' + s.mood + fr, sx, yy, sc, Math.sin(s.t * 2.4) * 0.12);
      if (s.zap) {
        const a = pxProj(s.zap.x, pxU(s.zap.y));
        if (a) {
          sctx.globalAlpha = 1 - s.zap.t / 0.3; sctx.lineJoin = 'round';
          for (const [w, col] of [[7, '#ffffff'], [3.5, '#ffd23f']]) {
            sctx.lineWidth = w * sc; sctx.strokeStyle = col; sctx.beginPath(); sctx.moveTo(sx, yy - 22 * sc);
            const ax = a.x, ay = a.y - 20 * a.s;
            for (let n = 1; n <= 5; n++) { const tt = n / 5; sctx.lineTo(lerp(sx, ax, tt) + (n < 5 ? (Math.random() - 0.5) * 14 * sc : 0), lerp(yy - 22 * sc, ay, tt) + (n < 5 ? (Math.random() - 0.5) * 14 * sc : 0)); }
            sctx.stroke();
          }
          sctx.globalAlpha = 1;
        }
      }
      return;
    }
    const id = e.k === 0 ? e.o.id : e.k === 2 ? 'm' + (e.m.id || (e.m.id = Math.random())) : e.k + ':' + e.x + ',' + e.y;
    const pop = e.k === 2 ? (rel < 1.6 ? 0 : POP_FLAT) : pxPop('px' + id, rel, dt);
    const ky = popScale(pop);
    if (ky < 0.2 && rel > 1.6) {
      // far rows: just a flat dab of colour where the sticker will stand
      return;
    }
    let rot = 0, kx = 1, ox = 0;
    if (e.k === 0) {
      const def = OBJ[e.o.type];
      if (def.sway) rot = WX.sway(G.time, e.o.seed, Math.cos(WX.windAngle), WX.gustAt(e.o.x, e.o.y)) * def.sway * ky;
      const ht = G.hitT.get(e.o.id);
      if (ht !== undefined && G.time - ht < 0.25) { const k2 = 1 - (G.time - ht) / 0.25; kx = 1 + 0.1 * k2; ox = Math.sin((G.time - ht) * 60) * 3 * k2 * sc; }
    }
    const sca = sc * (e.sc || 1);
    // haze the far rows into the hills
    const zf = clamp((rel - 0.6) / 4, 0, 0.7);
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    if (rel < 1) { sctx.fillStyle = 'rgba(46,34,82,0.2)'; sctx.beginPath(); sctx.ellipse(sx, sy, 16 * sca * ky, 5 * sca, 0, 0, TAU); sctx.fill(); }
    const hov = G.hover && ((e.k === 0 && G.hover.o === e.o) || (e.k === 2 && G.hover.m === e.m) || (e.k === 7 && G.hover.npc === e.npc));
    if (hov) pxSprite(e.spr, sx + ox, sy + 3 * sca, sca, rot, kx * 1.08, ky * 1.06, 'glow');
    sctx.globalAlpha = 1 - zf * 0.6;
    const spr = pxSprite(e.spr, sx + ox, sy, sca, rot, kx, ky);
    sctx.globalAlpha = 1;
    if (e.k === 2 && e.m.hurtT > 0) { sctx.globalAlpha = 0.6; pxSprite(e.spr, sx, sy, sca, 0, 1, ky, 'flash'); sctx.globalAlpha = 1; }
    if (spr && rel < 1.6) px.list.push({ k: e.k, o: e.o, m: e.m, s: e.s, npc: e.npc, cave: e.cave, x0: sx - (spr.ax - 4) * sca, x1: sx + (spr.w - spr.ax - 4) * sca, y0: sy - (spr.ay - 4) * sca * ky, y1: sy + 4 });
    if (e.k === 2 && (e.m.hp < e.m.maxHp || e.m.elite) && rel < 1) {
      const w = 30 * sca, yy = sy - (spr ? spr.ay : 30) * sca - 8;
      sctx.fillStyle = '#3b2f4f'; sctx.fillRect(sx - w / 2, yy, w, 5); sctx.fillStyle = '#ff4d6d'; sctx.fillRect(sx - w / 2, yy, w * clamp(e.m.hp / e.m.maxHp, 0, 1), 5);
    }
  }
  function pxMountains() {
    const d = darkness(phaseOf(G.time));
    const rock = rgba(mixRGB([178, 160, 196], [60, 58, 110], d)), shade = rgba(mixRGB([150, 132, 176], [44, 42, 90], d));
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    sctx.lineJoin = 'round';
    for (let n = 0; n < 4; n++) {
      const r = SW.hash(n, 3, G.seed), w = W * (0.28 + r * 0.22), h = H * (0.1 + SW.hash(n, 9, G.seed) * 0.09);
      const span = W * 1.6;
      const x = ((n * span / 4 + r * 200 - G.cam.x * 0.04) % span + span) % span - W * 0.3;
      const base = px.hz + 6, top = base - h;
      sctx.beginPath(); sctx.moveTo(x - w / 2, base); sctx.lineTo(x - w * 0.08, top + h * 0.06); sctx.quadraticCurveTo(x, top - 4, x + w * 0.08, top + h * 0.08); sctx.lineTo(x + w / 2, base); sctx.closePath();
      sctx.fillStyle = rock; sctx.fill();
      sctx.lineWidth = 2; sctx.strokeStyle = 'rgba(40,30,60,0.45)'; sctx.stroke();
      // shaded side and ridge lines
      sctx.beginPath(); sctx.moveTo(x + w * 0.04, top + h * 0.1); sctx.lineTo(x + w / 2, base); sctx.lineTo(x + w * 0.1, base); sctx.closePath(); sctx.fillStyle = shade; sctx.fill();
      // snow cap with a wavy hem
      sctx.beginPath(); sctx.moveTo(x - w * 0.1, top + h * 0.1); sctx.quadraticCurveTo(x, top - 4, x + w * 0.1, top + h * 0.1);
      for (let k = 0; k <= 4; k++) { const fx = x + w * 0.13 - k * (w * 0.065); sctx.quadraticCurveTo(fx + w * 0.02, top + h * (0.36 + (k % 2) * 0.1), fx - w * 0.012, top + h * 0.28); }
      sctx.closePath(); sctx.fillStyle = '#ffffff'; sctx.fill(); sctx.stroke();
    }
  }
  // night: darkness with pools of light around Ene, Star and fires
  let pxLight = null;
  function pxLighting() {
    const d = darkness(phaseOf(G.time));
    if (d <= 0.01) return;
    if (!pxLight) pxLight = document.createElement('canvas');
    const lw = Math.ceil(W / 2), lh = Math.ceil(H / 2);
    if (pxLight.width !== lw || pxLight.height !== lh) { pxLight.width = lw; pxLight.height = lh; }
    const g = pxLight.getContext('2d'), moon = moonNow();
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, lw, lh);
    g.fillStyle = `rgba(16,18,54,${0.8 * d * (1 - 0.3 * moon.bright)})`; g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, 'rgba(0,0,0,0.95)'); q.addColorStop(0.6, 'rgba(0,0,0,0.6)'); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); };
    const p = G.player, a = pxProj(p.x, pxU(p.y));
    if (a) hole(a.x / 2, (a.y - 50 * a.s) / 2, (G.tools.lantern ? 220 : 150) * a.s / 2);
    if (G.star) { const b = pxProj(G.star.x, pxU(G.star.y)); if (b) hole(b.x / 2, (b.y - 70 * b.s) / 2, 140 * b.s / 2); }
    for (const s of burningFires()) { const c = pxProj(s.x, pxU(s.y)); if (c) hole(c.x / 2, (c.y - 14 * c.s) / 2, fireRadius(s) * c.s / 2); }
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    sctx.drawImage(pxLight, 0, 0, W, H);
  }
  // a click or tap in the parallax view: on something, or on the stage's hill
  function pxPick(sx, sy) {
    for (let n = px.list.length - 1; n >= 0; n--) {
      const d = px.list[n];
      if (d.k === 3) continue;
      if (sx < d.x0 || sx > d.x1 || sy < d.y0 || sy > d.y1) continue;
      if (d.k === 0 && (OBJ[d.o.type].decor)) continue;
      if (d.k === 7) return { kind: 'talk', npc: d.npc };
      if (d.k === 6 && d.cave) return { kind: 'cave', cave: d.cave };
      if (d.k === 2 && !d.m.dying) return { kind: 'attack', m: d.m };
      if (d.k === 1) return { kind: 'use', s: d.s };
      if (d.k === 0) return { kind: 'gather', o: d.o };
    }
    // the ground: find the spot on the stage row under the pointer
    const i = Math.round(px.cb);
    let best = null, bd = 1e9;
    for (let tt = 0; tt <= PX_TC; tt += 0.02) {
      const z = i + tt - px.cb + PX_D0;
      const wx = G.cam.x + (sx - W / 2) * z / px.k;
      const q = pxProj(wx, i + tt);
      if (!q) continue;
      const dd = Math.abs(q.y - sy);
      if (dd < bd) { bd = dd; best = { x: wx, y: -(i + tt) * BAND }; }
    }
    if (!best) return null;
    if (G.world.isWater(best.x, best.y)) return canSail() ? { kind: 'move', x: best.x, y: best.y } : G.tools.rod ? { kind: 'fish', x: best.x, y: best.y } : { kind: 'move', x: best.x, y: best.y };
    return { kind: 'move', x: best.x, y: best.y };
  }

  // ---------------- orders (click / tap to act) ----------------
  function setOrder(o) {
    G.order = o;
    G.fishing = null;
    if (o) { o.t = 0; o.lx = G.player.x; o.ly = G.player.y; o.progT = 0; o.detourT = 0; o.detour = 1; }
    // a fresh order (walk there, chop that, go talk): Ene points the way for a moment
    if (o) G.player.pointT = 0.7;
  }
  function orderTarget(o) {
    const w = G.world;
    if (o.kind === 'move') return { x: o.x, y: o.y, reach: 8 };
    if (o.kind === 'gather') {
      if (w.objState(o.o, G.time) !== 'full') return null;
      return { x: o.o.x, y: o.o.y, reach: (OBJ[o.o.type].r || 5) + PR + 14 };
    }
    if (o.kind === 'attack') {
      if (o.m.dying || !G.mobs.includes(o.m)) return null;
      return { x: o.m.x, y: o.m.y, reach: o.m.r + PR + 18 };
    }
    if (o.kind === 'use') {
      if (!w.structures.includes(o.s)) return null;
      return { x: o.s.x, y: o.s.y, reach: o.s.r + PR + 14 };
    }
    if (o.kind === 'fish') return { x: o.x, y: o.y, reach: 0 };
    if (o.kind === 'talk') return { x: o.npc.x, y: o.npc.y, reach: 52 };
    if (o.kind === 'cave') return { x: o.cave.x, y: o.cave.y + 40, reach: 70 };
    return null;
  }
  function runOrder(dt) {
    const o = G.order, p = G.player;
    const t = orderTarget(o);
    o.t += dt;
    if (!t || o.t > (o.kind === 'move' || o.kind === 'fish' ? 30 : 14)) { G.order = null; return [0, 0]; }
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (o.kind === 'fish') {
      const ax = p.x + (dx / d) * 34, ay = p.y + (dy / d) * 34;
      if (G.world.isWater(ax, ay) || d < 60 || (p.boat && d < 150)) {
        G.order = null;
        if (G.tools.rod) startFishing(t.x, t.y); else { toast('Craft a Fishing Rod (3 wood, 3 fiber) to fish.'); SW.audio.play('deny'); }
        return [0, 0];
      }
    } else if (d <= t.reach) {
      p.fx = dx / d; p.fy = dy / d;
      faceToward(dx, dy);
      if (o.kind === 'move') { G.order = null; return [0, 0]; }
      if (o.kind === 'talk') { G.order = null; talkTo(o.npc); return [0, 0]; }
      if (o.kind === 'cave') { G.order = null; openTalk({ kind: 'cave', cave: o.cave }); return [0, 0]; }
      if (p.atkCd <= 0 && !p.flying) {
        if (o.kind === 'gather') harvestObject(o.o);
        else if (o.kind === 'attack') swingAt(o.m);
        else if (o.kind === 'use') useStructure(o.s);
      }
      return [0, 0];
    }
    let ux = dx / d, uy = dy / d;
    if (!p.flying) {
      o.progT += dt;
      if (o.progT > 0.35) {
        if (dist(p.x, p.y, o.lx, o.ly) < 10) { o.detourT = 0.7; o.detour = -o.detour; }
        o.progT = 0; o.lx = p.x; o.ly = p.y;
      }
      if (o.detourT > 0) {
        o.detourT -= dt;
        const a = o.detour * 1.25, c = Math.cos(a), s = Math.sin(a);
        [ux, uy] = [ux * c - uy * s, ux * s + uy * c];
      }
      if (!canSail() && G.world.isWater(p.x + ux * 26, p.y + uy * 26)) {
        for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const c = Math.cos(a), s = Math.sin(a);
          const vx = ux * c - uy * s, vy = ux * s + uy * c;
          if (!G.world.isWater(p.x + vx * 26, p.y + vy * 26)) { ux = vx; uy = vy; break; }
        }
      }
    }
    p.running = d > 320 && o.kind === 'move';
    return [ux, uy];
  }

  // What's under the cursor? Creatures win over structures, structures over scenery.
  function pick(mx, my) {
    for (const want of [2, 7, 6, 1, 0]) { const hit = pickKind(mx, my, want); if (hit) return hit; }
    return null;
  }
  function pickKind(mx, my, want) {
    for (let i = drawList.length - 1; i >= 0; i--) {
      const d = drawList[i];
      if (d.k !== want || d.sx === undefined) continue;
      if (d.k === 0) { if (OBJ[d.o.type].decor || d.spr !== d.o.type) continue; }
      if (d.k === 2 && d.m.dying) continue;
      if (d.k === 6 && !d.cave) continue;
      const spr = SW.sprites[d.spr];
      if (!spr) continue;
      const sc = Z * (d.sc || 1), ky = d.ky || 1;
      const pad = want === 2 ? 0 : 6;
      let x0 = d.sx - (spr.ax - pad) * sc, x1 = d.sx + (spr.w - spr.ax - pad) * sc;
      let y0 = d.sy - (spr.ay - pad) * sc * ky, y1 = d.sy + 4 * sc;
      if (x1 - x0 < 30) { const c = (x0 + x1) / 2; x0 = c - 15; x1 = c + 15; }
      if (y1 - y0 < 30) y0 = y1 - 30;
      if (mx < x0 || mx > x1 || my < y0 || my > y1) continue;
      if (want === 2 || solidAt(spr, (mx - d.sx) / sc + spr.ax, (my - d.sy) / (sc * ky) + spr.ay)) return d;
    }
    return null;
  }
  function solidAt(spr, ax, ay) {
    if (!spr.alpha) {
      const c = spr.flash, g = c.getContext('2d', { willReadFrequently: true });
      spr.alpha = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
    }
    const a = spr.alpha, S = spr.S;
    for (const [ox, oy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const px = Math.floor((ax + ox) * S), py = Math.floor((ay + oy) * S);
      if (px >= 0 && py >= 0 && px < a.w && py < a.h && a.data[(py * a.w + px) * 4 + 3] > 40) return true;
    }
    return false;
  }
  function orderFromPoint(mx, my) {
    const hit = pick(mx, my);
    if (hit) {
      if (hit.k === 7) return { kind: 'talk', npc: hit.npc };
      if (hit.k === 6) return { kind: 'cave', cave: hit.cave };
      if (hit.k === 2) return { kind: 'attack', m: hit.m };
      if (hit.k === 1) return { kind: 'use', s: hit.s };
      return { kind: 'gather', o: hit.o };
    }
    const w = screenToWorld(mx, my);
    if (G.world.isWater(w.x, w.y)) {
      const p = G.player;
      // with a raft, far water means "sail there"; near water means "fish"
      if (canSail() && (dist(p.x, p.y, w.x, w.y) > 170 || !G.tools.rod)) return { kind: 'move', x: w.x, y: w.y };
      if (G.tools.raft && !canSail() && !G.tools.rod) { tipOnce('raftDry', 'Your raft is still drying out. Give it a moment on land.'); }
      return { kind: 'fish', x: w.x, y: w.y };
    }
    return { kind: 'move', x: w.x, y: w.y };
  }
  function pointerOrder(sx, sy) {
    if (G.mode !== 'play') return null;
    if (VIEWS[view].parallax) {
      if (G.fishing) { reel(); return null; }
      const o = pxPick(sx, sy);
      if (!o) return null;
      setOrder(o);
      if (o.kind === 'move' || o.kind === 'fish') G.marker = { x: o.x, y: o.y, t: 0, lvl: G.world.levelAt(o.x, o.y) };
      return o;
    }
    const f = screenToFlat(sx, sy);
    if (!f) return null;
    const mx = f.x, my = f.y;
    if (G.fishing) {
      const w = screenToWorld(mx, my);
      if (G.fishing.phase === 'bite' || G.world.isWater(w.x, w.y)) { reel(); return null; }
    }
    let o = orderFromPoint(mx, my);
    if (G.player.flying && o.kind !== 'move') { const w = screenToWorld(mx, my); o = { kind: 'move', x: w.x, y: w.y }; }
    setOrder(o);
    if (o.kind === 'move' || o.kind === 'fish') G.marker = { x: o.x, y: o.y, t: 0, lvl: G.world.levelAt(o.x, o.y) };
    else G.marker = null;
    return o;
  }

  // ---------------- update ----------------
  function climateAt(x, y) {
    const b = G.world.biomeAt(x, y), B = SW.BIOME;
    if (b === B.TUNDRA || b === B.PEAK) return 'cold';
    if (b === B.DESERT) return 'hot';
    return 'temperate';
  }

  function update(dt) {
    const p = G.player, world = G.world;
    G.time += dt;
    const phase = phaseOf(G.time), day = dayOf(G.time);

    // weather follows the climate where you stand
    G.climateT -= dt;
    if (G.climateT <= 0) { G.climateT = 1; G.climate = climateAt(p.x, p.y); }
    WX.update(dt, G.climate, (name, note) => { if (G.mode === 'play') toast(name + '. ' + note, 5200); });
    WX.updateSoak(p.x, p.y, dt);
    WX.sense(p.x, p.y);
    world.frozen = G.climate === 'cold' ? WX.snow : Math.max(0, world.frozen - dt / 30);
    world.regrowMul = 1 - Math.min(0.4, WX.wet * 0.4);

    // camera rotation (Q/E, gamepad, buttons, gestures) and its smooth reset
    let spin = input.spin;
    if (G.mode === 'play') { if (keys.has('KeyQ')) spin -= 1; if (keys.has('KeyE')) spin += 1; }
    if (VIEWS[view].follow && !G.inCave) {
      if (spin) { p.hd = (p.hd ?? Math.atan2(p.fy, p.fx)) + spin * 2.2 * dt; p.fx = Math.cos(p.hd); p.fy = Math.sin(p.hd); }
      if (camGoal !== null) { p.hd = camGoal - Math.PI / 2; p.fx = Math.cos(p.hd); p.fy = Math.sin(p.hd); camGoal = null; }
      const want = Math.atan2(p.fx, -p.fy);
      const dA = ((want - camA + Math.PI * 3) % TAU) - Math.PI;
      // settle once it's behind Ene, so the ground cache stays valid while walking straight
      if (Math.abs(dA) > 0.004) setAngle(camA + dA * Math.min(1, dt * (view === 'first' ? 9 : 5)));
      else if (dA !== 0 && Math.abs(dA) > 1e-6) setAngle(want);
      spin = 0;
    }
    if (VIEWS[view].parallax) { spin = 0; camGoal = null; if (camA !== 0) setAngle(0); }
    if (spin) { setAngle(camA + spin * 1.7 * dt); camGoal = null; saveAngle(); }
    if (camGoal !== null) {
      const dA = ((camGoal - camA + Math.PI * 3) % TAU) - Math.PI;
      if (Math.abs(dA) < 0.01) { setAngle(camGoal); camGoal = null; saveAngle(); }
      else setAngle(camA + dA * Math.min(1, dt * 7));
    }

    if (G.mode === 'play') {
      const night = isNight(phase);
      if (night && !G.lastPhaseNight) {
        const moon = moonNow();
        banner('Night ' + day, moon.ink ? 'The Ink Moon rises. Scribbles everywhere.' : moon.name + '. Stay in the light.', moon.ink ? '#c46bff' : '');
        SW.audio.play('night');
      }
      if (!night && G.lastPhaseNight) { banner('Day ' + day, 'You made it through the night.'); SW.audio.play('dawn'); gainXP(5 + day * 3, p.x, p.y, p.lvlOff); }
      G.lastPhaseNight = night;
      if (phase > 0.5 && phase < 0.6 && !G.tips['dusk' + day]) {
        G.tips['dusk' + day] = 1;
        toast(world.structures.some((s) => s.type === 'campfire' && s.fuel > 30) ? 'Dusk. Head back to a fire.' : 'Dusk is coming. Craft a Campfire before dark.');
      }

      // movement: keyboard / stick / gamepad in screen directions, turned into world directions
      let ix = input.x, iy = input.y;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
      // third and first person: left/right turn Ene, up/down walk forward and back
      const follow = VIEWS[view].follow;
      let tank = false;
      if (follow) {
        if (p.hd === undefined) p.hd = Math.atan2(p.fy, p.fx);
        if (Math.abs(ix) > 0.15) { G.order = null; p.hd += ix * 2.6 * dt; p.fx = Math.cos(p.hd); p.fy = Math.sin(p.hd); }
        ix = 0; tank = Math.abs(iy) > 0.15;
      }
      let il = Math.hypot(ix, iy);
      p.running = keys.has('ShiftLeft') || keys.has('ShiftRight') || (il > 0.97 && !!(input.x || input.y));
      let mx = 0, my = 0;
      if (il > 0.15) {
        G.order = null; G.fishing = null; G.marker = null;
        [mx, my] = tank ? [p.fx * -iy, p.fy * -iy] : worldDir(ix, iy);
        if (Math.abs(ix) > 0.2) p.face = ix > 0 ? 1 : -1;
      } else if (input.holdMove && input.mouseX >= 0 && VIEWS[view].parallax) {
        const o = pxPick(input.mouseX, input.mouseY);
        if (o && o.kind === 'move') { if (!G.order || G.order.kind !== 'move') setOrder(o); else { G.order.x = o.x; G.order.y = o.y; } }
      } else if (input.holdMove && input.mouseX >= 0 && screenToFlat(input.mouseX, input.mouseY)) {
        const f = screenToFlat(input.mouseX, input.mouseY);
        const w = screenToWorld(f.x, f.y);
        if (!G.order || G.order.kind !== 'move') setOrder({ kind: 'move', x: w.x, y: w.y });
        else { G.order.x = w.x; G.order.y = w.y; }
        G.marker = null;
      }
      if (il <= 0.15 && G.order) { [mx, my] = runOrder(dt); il = Math.hypot(mx, my); if (il > 0.15) faceToward(mx, my); }
      if (il > 1) { mx /= il; my /= il; il = 1; }

      // where are we standing: land, raft, or sky?
      p.boat = !p.flying && !!G.tools.raft && world.isWater(p.x, p.y) && p.raftWet < 1;
      const here = WX.here;
      const windX = Math.cos(WX.windAngle), windY = Math.sin(WX.windAngle);
      const downwind = il > 0.15 ? (mx * windX + my * windY) / il : 0;   // -1 into the wind .. 1 with it
      let spd = 160 * (p.running ? 1.5 : 1) * (p.hunger <= 0 ? 0.7 : 1) * WX.speedMul();
      if (p.boat) spd = 125 * (1 + 0.5 * here.gust * Math.max(0, downwind));
      if (p.flying) spd = 190 * (1 + 0.3 * here.gust * downwind);
      if (G.fishing) spd = 0;
      // the wind carries you: strongly in the air, a little on the water
      const drift = p.flying ? 150 * here.gust : p.boat ? 40 * here.gust : 0;
      // snow underfoot makes you slide
      const grip = p.flying ? 0.35 : p.boat ? 0.5 : G.tools.warmCloak ? Math.max(0.6, WX.grip()) : WX.grip();
      const k = 1 - Math.exp(-dt * 14 * grip);
      p.vx = lerp(p.vx, mx * spd + windX * drift, k); p.vy = lerp(p.vy, my * spd + windY * drift, k);
      p.moving = il > 0.15 && spd > 0;
      if (p.moving) {
        if (!tank) { p.fx = mx / il; p.fy = my / il; p.hd = Math.atan2(p.fy, p.fx); }
        p.walkT += dt * (p.running ? 1.4 : 1);
        p.dustT -= dt * (p.running ? 1.8 : 1);
        if (p.dustT <= 0 && !p.flying) {
          p.dustT = p.boat ? 0.35 : 0.2;
          if (p.boat) spawnRing(p.x - p.fx * 14, p.y - p.fy * 14, 0);
          else G.parts.push({ k: 'dust', x: p.x - p.fx * 8, y: p.y + 2, lvl: p.lvlOff, t: 0, life: 0.45 });
        }
      } else p.running = false;
      if (G.ene && G.ene.cryT > 0) { p.vx = p.vy = 0; }
      const bx = p.x, by = p.y;
      moveBody(p, PR, dt, { water: p.flying || canSail(), ghost: p.flying });
      checkBarrier(bx, by);
      zoneWatch();
      updateEne(dt);
      updateStar(dt);
      if (!world.isWater(p.x, p.y) && !p.flying) { p.lastLand.x = p.x; p.lastLand.y = p.y; }

      // gliding: launch hop, then a steady sink; gusts give lift, more when you ride the wind
      if (p.flying) {
        const sink = 20 * (1 + p.leafWet * 2.4) * Math.pow(0.7, modsOn('glider', 'featherCharm'));
        const lift = here.gust * 20 * (0.55 + 0.75 * Math.max(0, downwind));
        p.vz = lerp(p.vz, lift - sink, 1 - Math.exp(-dt * 1.6));
        p.alt += p.vz * dt;
        if (p.alt > ALT_MAX) { p.alt = ALT_MAX; p.vz = Math.min(0, p.vz); }
        p.leafWet = Math.min(1, p.leafWet + dt * here.rain / 9);
        if (p.alt <= 0) { p.alt = 0; p.vz = 0; p.flying = false; SW.audio.play('place'); landPlayer(); }
      } else {
        if (p.alt > 0) { p.alt = lerp(p.alt, 0, 1 - Math.exp(-dt * 6)); if (p.alt < 2) { p.alt = 0; landPlayer(); } }
        // the leaf dries on the ground, faster in a breeze, not under a shower
        p.leafWet = Math.max(0, p.leafWet - dt * (1 + here.gust) * (1 - Math.min(1, here.rain)) / 22);
      }
      // the raft soaks up water while you sail (rain and choppy gusts make it worse) and dries on land
      if (p.boat) {
        p.raftWet = Math.min(1, p.raftWet + dt * (1 + here.rain * 2 + here.gust * 0.6) * Math.pow(0.5, modsOn('raft', 'tarPot')) / 55);
        if (p.raftWet >= 1) landPlayer(true);
        else if (p.raftWet > 0.75) tipOnce('raftSoggy', 'Your raft is getting soggy. Head for land before it folds!');
      } else if (!world.isWater(p.x, p.y)) {
        p.raftWet = Math.max(0, p.raftWet - dt * (1 + here.gust * 0.5) * (1 - Math.min(1, here.rain) * 0.85) / 28);
      }

      p.atkCd -= dt; p.swingT -= dt; p.hurtT -= dt; p.iframes -= dt;
      if (input.act || keys.has('Space') || keys.has('KeyJ')) { if (!G.fishing) act(); }
      updateFishing(dt);
      if (G.marker) { G.marker.t += dt; if (G.marker.t > 1.2 || !G.order) G.marker = null; }
      // standing still with no orders? fight back against whatever is biting you
      if (il <= 0.15 && !G.order && !G.fishing && p.atkCd <= 0 && !p.flying) {
        let foe = null, fd = 1e9;
        for (const m of G.mobs) {
          if (m.dying || ENEMIES[m.type].passive || m.state === 'idle') continue;
          const d = dist(m.x, m.y, p.x, p.y);
          if (d < m.r + PR + 16 && d < fd) { fd = d; foe = m; }
        }
        if (foe) { p.fx = (foe.x - p.x) / fd; p.fy = (foe.y - p.y) / fd; swingAt(foe); }
      }

      // hunger & health (cold makes you hungrier unless you're near a fire)
      const warm = !!nearFire(p.x, p.y, 40);
      p.hunger = Math.max(0, p.hunger - dt * 0.4 * (p.running && p.moving ? 1.8 : 1) * WX.hungerMul(warm || !!G.tools.warmCloak));
      if (p.hunger <= 0) { p.hp -= dt * 1.6; if (p.hp <= 0) die(); }
      else if (p.hunger > 50 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * (0.8 + p.level * 0.1));
      if (p.hunger < 30 && !G.tips.hungry) { G.tips.hungry = 1; toast('Your tummy is rumbling. Press F to eat.'); }
      if (p.hunger > 60) G.tips.hungry = 0;
      if ((G.inv.wood || 0) >= 3 && !G.tips.craft) { G.tips.craft = 1; toast('Nice haul. Open Craft to make tools.'); }

      // regions
      G.regionT -= dt;
      if (G.regionT <= 0) {
        G.regionT = 0.5;
        const r = world.regionAt(p.x, p.y);
        if (!G.region || r.id !== G.region.id) {
          G.region = r;
          if (!G.regionsSeen.has(r.id)) {
            G.regionsSeen.add(r.id);
            if (G.regionsSeen.size > 1) { banner(r.name, 'Danger ' + r.danger + (r.danger > p.level + 2 ? ' · tough creatures live here' : ''), r.danger > p.level + 2 ? '#ff4d6d' : '#ffb13b'); gainXP(4 + r.danger, p.x, p.y, p.lvlOff); }
          }
          questEvent('explore', r.id, 1);
          hud.region = '';
        }
      }
      updateAdventure();

      G.saveT -= dt;
      if (G.saveT <= 0) { G.saveT = 8; SW.store.set('save', serialize()); }
      G.cloudT -= dt;
      if (G.cloudT <= 0) { G.cloudT = 60; SW.saves && SW.saves.cloudSave(serialize(), true); }
    } else if (G.mode === 'title') {
      G.drift += dt * 0.05;
      p.x += Math.cos(G.drift) * 40 * dt; p.y += Math.sin(G.drift * 0.7) * 30 * dt;
      setAngle(camA + dt * 0.04);
    } else if (G.mode === 'dead') {
      G.deadT += dt;
    }

    p.lvlOff = lerp(p.lvlOff, world.levelAt(p.x, p.y) * LH, 1 - Math.exp(-dt * 12));
    const ck = 1 - Math.exp(-dt * 6);
    G.cam.x = lerp(G.cam.x, p.x, ck);
    G.cam.y = lerp(G.cam.y, p.y, ck);
    G.cam.lv = lerp(G.cam.lv, p.lvlOff + p.alt * 0.6, ck);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 30);

    for (const s of world.structures) {
      if (s.type !== 'campfire' || s.fuel <= 0) continue;
      s.fuel -= dt * WX.fireBurn(s.x, s.y);
      if (Math.random() < dt * 6) G.parts.push({ k: 'ember', x: s.x + (Math.random() - 0.5) * 14, y: s.y, lvl: s.lvl * LH + 24, t: 0, life: 1 + Math.random(), vx: (Math.random() - 0.5) * 20 });
      if (s.fuel <= 0) spawnPoof(s.x, s.y, s.lvl * LH + 10, '#5b4840');
    }

    if (G.mode !== 'title') { updateMobs(dt, phase, day); spawnMobs(dt, phase, day); }
    updateParticles(dt);
    if (G.hitT.size > 40) for (const [id, t] of G.hitT) if (G.time - t > 0.5) G.hitT.delete(id);
  }

  function moveBody(b, r, dt, opt = {}) {
    const world = G.world;
    const nx = b.x + b.vx * dt;
    if (opt.water || !world.isWater(nx + Math.sign(b.vx) * 5, b.y)) b.x = nx; else b.vx = 0;
    const ny = b.y + b.vy * dt;
    if (opt.water || !world.isWater(b.x, ny + Math.sign(b.vy) * 4)) b.y = ny; else b.vy = 0;
    const R = SW.ISLAND_R * 1.3, d = Math.hypot(b.x, b.y);
    if (d > R) { b.x *= R / d; b.y *= R / d; }
    if (opt.ghost) return;
    for (const s of world.solidsNear(b.x, b.y, 50, G.time, scratch)) {
      const dx = b.x - s.x, dy = b.y - s.y;
      const dd = Math.hypot(dx, dy), min = s.r + r;
      if (dd < min && dd > 0.001) { b.x = s.x + (dx / dd) * min; b.y = s.y + (dy / dd) * min; }
    }
  }

  function spawnMobs(dt, phase, day) {
    G.spawnT -= dt;
    if (G.spawnT > 0) return;
    G.spawnT = 1.6;
    const p = G.player, world = G.world;
    const night = isNight(phase), moon = moonNow();
    let scribbles = 0, hostiles = 0, puffs = 0;
    for (const m of G.mobs) { if (m.dying) continue; if (m.type === 'scribble') scribbles++; else if (ENEMIES[m.type].passive) puffs++; else hostiles++; }
    const danger = world.dangerAt(p.x, p.y);
    const ring = () => { const a = Math.random() * TAU, d = 480 + Math.random() * 240; return [p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]; };
    // the moon and the Lost Pages change how many Scribbles come out
    const moonMod = moon.ink ? 4 : moon.index === 0 ? 2 : moon.index === 4 ? -1 : 0;
    const cap = Math.max(1, Math.min(16, 1 + day + danger + moonMod - (G.adv ? G.adv.next : 0)));
    if (night && !G.won && phase < 0.93 && scribbles < cap && WX.rain() < 1.2) {
      for (let tries = 0; tries < 8; tries++) {
        const [x, y] = ring();
        if (world.isWater(x, y) || inFireLight(x, y)) continue;
        const m = SW.makeEnemy('scribble', x, y, world.dangerAt(x, y) + Math.floor(day / 4), moon.ink && Math.random() < 0.18);
        m.state = 'chase'; m.lvlOff = world.levelAt(x, y) * LH;
        G.mobs.push(m);
        break;
      }
    }
    const hcap = 3 + Math.min(5, danger);
    const puffOK = !night && WX.snowing() < 0.3 && WX.sanding() < 0.3;
    if (hostiles < hcap || (puffs < 3 && puffOK)) {
      for (let tries = 0; tries < 6; tries++) {
        const [x, y] = ring();
        if (world.isWater(x, y) || inFireLight(x, y)) continue;
        const list = SW.biomeEnemies(world.biomeAt(x, y));
        if (!list.length) continue;
        const type = list[Math.floor(Math.random() * list.length)];
        if (ENEMIES[type].passive ? puffs >= 3 || !puffOK : hostiles >= hcap) continue;
        const lvl = world.dangerAt(x, y);
        const m = SW.makeEnemy(type, x, y, lvl, !ENEMIES[type].passive && lvl >= 2 && Math.random() < 0.06);
        m.lvlOff = world.levelAt(x, y) * LH;
        G.mobs.push(m);
        break;
      }
    }
  }

  function updateMobs(dt, phase, day) {
    const p = G.player, world = G.world;
    const night = isNight(phase);
    const lanternR = G.tools.lantern ? 190 : 0;
    const playing = G.mode === 'play';
    const unreachable = p.flying || p.boat;
    const anyRain = WX.rain() > 0.05;
    for (let i = G.mobs.length - 1; i >= 0; i--) {
      const m = G.mobs[i];
      const def = ENEMIES[m.type];
      m.t += dt; m.hurtT -= dt; m.atkCd -= dt; m.stateT -= dt;
      if (m.stunT > 0) { m.stunT -= dt; m.atkCd = Math.max(m.atkCd, 0.3); m.vx *= 0.6; m.vy *= 0.6; }
      const dp = dist(m.x, m.y, p.x, p.y);
      if (m.dying) { m.dying += dt; if (m.dying > 0.6) G.mobs.splice(i, 1); continue; }
      if (dp > 1500) { G.mobs.splice(i, 1); continue; }
      let tx = 0, ty = 0, spd = m.spd;
      const toP = () => { tx = (p.x - m.x) / Math.max(1, dp); ty = (p.y - m.y) / Math.max(1, dp); };

      if (def.passive) {
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderT = 1.5 + Math.random() * 2; m.wander = Math.random() * TAU; m.idle = Math.random() < 0.35; }
        if (dp < 150 && playing) { tx = (m.x - p.x) / dp; ty = (m.y - p.y) / dp; spd = 135; m.idle = false; }
        else if (!m.idle) { tx = Math.cos(m.wander); ty = Math.sin(m.wander); }
        m.hop = m.idle ? 0 : (m.hop + dt * (spd > 100 ? 5 : 3)) % 1;
        spd *= 0.4 + Math.sin(m.hop * Math.PI) * 1.1;
      } else {
        if (def.night && !night) { m.dying = 0.001; spawnPoof(m.x, m.y, m.lvlOff, '#2b2340'); continue; }
        // rain washes the ink out of Scribbles
        const wash = anyRain && def.night ? WX.inkWash(m.x, m.y) : 0;
        if (def.night && wash > 0.05) {
          m.hp -= dt * wash;
          if (Math.random() < dt * 4) spawnChips(m.x, m.y, m.lvlOff + 20, '#5b4f78', 1);
          if (m.hp <= 0) { killMob(m); continue; }
        }
        const aggro = def.aggro * (m.lvl <= 1 && !def.night ? 0.55 : 1) * WX.aggroMul(m.x, m.y);
        if (m.state === 'idle') {
          m.wanderT -= dt;
          if (m.wanderT <= 0) { m.wanderT = 2 + Math.random() * 2.5; m.wander = Math.random() * TAU; m.idle = Math.random() < 0.4; }
          if (!m.idle) { tx = Math.cos(m.wander) * 0.5; ty = Math.sin(m.wander) * 0.5; }
          if (dist(m.x, m.y, m.homeX, m.homeY) > 260) { tx = (m.homeX - m.x) / 260; ty = (m.homeY - m.y) / 260; }
          if (playing && dp < aggro && !unreachable) { m.state = 'chase'; spawnText(m.x, m.y, m.lvlOff + 54 * m.scale, '!', '#ff4d6d'); }
        } else if (m.state === 'chase') {
          if (!playing || (dp > aggro * 2.4 && !def.night) || dist(m.x, m.y, m.homeX, m.homeY) > 1000 || (unreachable && !def.night)) m.state = def.night ? 'chase' : 'return';
          toP();
          if (def.charge && dp < 150 && dp > 40 && m.stateT <= -1.5) { m.state = 'windup'; m.stateT = 0.45; }
          if (m.type === 'snapjaw') { const s = Math.sin(m.t * 5) * 0.7; [tx, ty] = [tx - ty * s, ty + tx * s]; }
          if (def.night) {
            const fire = inFireLight(m.x, m.y);
            if (fire) { const d = Math.max(1, dist(m.x, m.y, fire.x, fire.y)); tx = (m.x - fire.x) / d; ty = (m.y - fire.y) / d; spd *= 1.3; }
            else {
              const ax = m.x + tx * 30, ay = m.y + ty * 30, f2 = inFireLight(ax, ay);
              if (f2) { const d = Math.max(1, dist(ax, ay, f2.x, f2.y)); const ox = (ax - f2.x) / d, oy = (ay - f2.y) / d; const sg = Math.sign(tx * -oy + ty * ox) || 1; tx = -oy * sg; ty = ox * sg; spd *= 0.6; }
              if (lanternR && dp < lanternR * 0.7) spd *= 0.6;
              const w = Math.sin(m.t * 3 + i) * 0.35, c = Math.cos(w), s = Math.sin(w);
              [tx, ty] = [tx * c - ty * s, tx * s + ty * c];
            }
          }
          if (m.type === 'gloop') { m.hop = (m.hop + dt * 2.6) % 1; spd *= 0.3 + Math.sin(m.hop * Math.PI) * 1.4; }
        } else if (m.state === 'windup') {
          if (m.stateT <= 0) { m.state = 'dash'; m.stateT = 0.45; m.dx = (p.x - m.x) / Math.max(1, dp); m.dy = (p.y - m.y) / Math.max(1, dp); }
        } else if (m.state === 'dash') {
          tx = m.dx; ty = m.dy; spd = 310;
          if (m.stateT <= 0) { m.state = 'chase'; m.stateT = 0; }
        } else if (m.state === 'return') {
          const dh = dist(m.x, m.y, m.homeX, m.homeY);
          tx = (m.homeX - m.x) / Math.max(1, dh); ty = (m.homeY - m.y) / Math.max(1, dh);
          m.hp = Math.min(m.maxHp, m.hp + dt * m.maxHp * 0.2);
          if (dh < 40) m.state = 'idle';
          if (playing && dp < aggro * 0.6 && !unreachable) m.state = 'chase';
        }
        if (playing && dp < m.r + PR + 5 && m.atkCd <= 0 && m.state !== 'windup') {
          m.atkCd = m.type === 'pebblor' ? 1.6 : 1;
          hurtPlayer(m.dmg, m.x, m.y);
          if (m.state === 'dash') m.state = 'chase';
        }
      }
      const k = 1 - Math.exp(-dt * 6);
      m.vx = lerp(m.vx, tx * spd, m.state === 'dash' ? 1 : k) + m.kx * dt * 8;
      m.vy = lerp(m.vy, ty * spd, m.state === 'dash' ? 1 : k) + m.ky * dt * 8;
      m.kx *= Math.exp(-dt * 10); m.ky *= Math.exp(-dt * 10);
      const sxv = screenDX(m.vx, m.vy);
      if (Math.abs(sxv) > 8) m.face = sxv > 0 ? 1 : -1;
      const ox = m.x, oy = m.y;
      moveBody(m, m.r * 0.8, dt);
      if (m.state === 'dash' && ox === m.x && oy === m.y) m.state = 'chase';
      if (def.passive && ox === m.x && oy === m.y) m.wanderT = 0;
      m.lvlOff = lerp(m.lvlOff, world.levelAt(m.x, m.y) * LH, 1 - Math.exp(-dt * 10));
    }
  }

  function updateParticles(dt) {
    const p = G.player;
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.t += dt;
      if (q.t >= q.life) { G.parts.splice(i, 1); continue; }
      if (q.k === 'chip' || q.k === 'dot') {
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.k === 'chip') { q.z += q.vz * dt; q.vz -= 700 * dt; if (q.z < 0) { q.z = 0; q.vz *= -0.3; q.vx *= 0.6; q.vy *= 0.6; } }
        else { q.vx *= Math.exp(-dt * 5); q.vy *= Math.exp(-dt * 5); }
      } else if (q.k === 'ember') { q.x += q.vx * dt; q.lvl += 40 * dt; }
      else if (q.k === 'fall' && !q.thud && q.t > 0.55) {
        q.thud = true; SW.audio.play('boom'); G.cam.shake = Math.max(G.cam.shake, 4); buzz(20);
        for (let j = 0; j < 6; j++) G.parts.push({ k: 'dust', x: q.x + (Math.random() - 0.5) * 50, y: q.y + (Math.random() - 0.5) * 20, lvl: q.lvl * LH, t: 0, life: 0.6 });
      }
    }
    for (let i = G.floaters.length - 1; i >= 0; i--) {
      const f = G.floaters[i];
      f.t += dt;
      if (f.t < 0) continue;
      if (f.t < 0.4 || G.mode !== 'play') {
        f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-dt * 3); f.vy *= Math.exp(-dt * 3);
        f.z += f.vz * dt; f.vz -= 900 * dt;
        if (f.z < 4) { f.z = 4; f.vz = Math.abs(f.vz) * 0.35; }
      } else {
        const d = dist(f.x, f.y, p.x, p.y);
        const sp = 260 + f.t * 700;
        if (d < 14) { G.floaters.splice(i, 1); addItem(f.item, 1, f.w); SW.audio.play('pickup'); continue; }
        f.x += ((p.x - f.x) / d) * sp * dt; f.y += ((p.y - f.y) / d) * sp * dt;
        f.z = lerp(f.z, 22 + p.alt, 1 - Math.exp(-dt * 8));
        f.lvl = lerp(f.lvl, p.lvlOff / LH, 1 - Math.exp(-dt * 8));
      }
    }
  }

  // ---------------- rendering ----------------
  function setSpriteTransform(sx, sy, rot, kx, ky) {
    const s = DPR * Z;
    const c = Math.cos(rot), n = Math.sin(rot);
    ctx.setTransform(c * kx * s, n * kx * s, -n * ky * s, c * ky * s, sx * DPR, sy * DPR);
  }
  function tintOf(spr, key, color) {
    if (!spr[key]) {
      const c = document.createElement('canvas'); c.width = spr.flash.width; c.height = spr.flash.height;
      const x = c.getContext('2d'); x.drawImage(spr.flash, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      spr[key] = c;
    }
    return spr[key];
  }
  function drawSprite(name, sx, sy, rot = 0, kx = 1, ky = 1, which = 'img') {
    const spr = SW.sprites[name];
    if (!spr) return;
    const img = which === 'glow' ? tintOf(spr, 'glow', '#ffd23f') : spr[which];
    if (rot === 0 && kx === 1 && ky === 1 && Math.abs(spr.S - DPR * Z) < 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(img, Math.round(sx * DPR - spr.ax * spr.S), Math.round(sy * DPR - spr.ay * spr.S));
      return;
    }
    setSpriteTransform(sx, sy, rot, kx, ky);
    ctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h);
  }
  // Draw just the top part of a sticker in a tint (snow caps, wet sheen).
  function drawCap(name, sx, sy, rot, kx, ky, frac, key, color, alpha) {
    const spr = SW.sprites[name];
    if (!spr || alpha < 0.02) return;
    const img = tintOf(spr, key, color), S = spr.S;
    setSpriteTransform(sx, sy, rot, kx, ky);
    ctx.globalAlpha = alpha;
    const hpx = Math.max(1, Math.round(img.height * frac));
    ctx.drawImage(img, 0, 0, img.width, hpx, -spr.ax, -spr.ay, spr.w, hpx / S);
    ctx.globalAlpha = 1;
  }

  // The ground: flat textures per chunk, extruded into cardboard cliffs by
  // stacking copies of each raised layer. Works at any camera angle.
  function texTransform(ch, lift, g = ctx, pad = 0) {
    const ox = ch.cx * CHUNK - MARGIN, oy = ch.cy * CHUNK - MARGIN;
    const rx = ox - G.cam.x, ry = oy - G.cam.y;
    const bx = VCX + pad + (rx * cosA + ry * sinA) * Z, by = VCY + pad + ((-rx * sinA + ry * cosA) * TILT - lift + G.cam.lv) * Z;
    const k = (DPR * Z) / TS;
    g.setTransform(k * cosA, -k * sinA * TILT, k * sinA, k * cosA * TILT, bx * DPR, by * DPR);
  }
  // Base ground, ice and the stacked cliff layers for a list of chunks.
  function groundLayers(g, list, pad) {
    const world = G.world;
    g.imageSmoothingEnabled = false;
    for (const ch of list) { texTransform(ch, 0, g, pad); g.drawImage(ch.tex.base, 0, 0); }
    if (world.frozen > 0.02) {
      g.globalAlpha = Math.min(0.92, world.frozen);
      for (const ch of list) if (ch.tex.ice) { texTransform(ch, 0, g, pad); g.drawImage(ch.tex.ice, 0, 0); }
      g.globalAlpha = 1;
    }
    const slices = clamp(Math.round((LH * Z * DPR) / 3), 3, 9);
    const snow = WX.snow;
    for (const L of [1, 2]) {
      const any = list.filter((ch) => ch.tex.has[L]);
      if (!any.length) continue;
      const lo = (L - 1) * LH, hi = L * LH;
      for (const ch of any) { texTransform(ch, lo, g, pad); g.drawImage(ch.tex['white' + L], 0, 0); }
      for (let s = 0; s < slices; s++) {
        const lift = lo + ((hi - lo) * s) / slices;
        for (const ch of any) { texTransform(ch, lift, g, pad); g.drawImage(ch.tex['side' + L], 0, 0); }
      }
      for (const ch of any) { texTransform(ch, hi, g, pad); g.drawImage(ch.tex['white' + L], 0, 0); }
      for (const ch of any) { texTransform(ch, hi, g, pad); g.drawImage(ch.tex['top' + L], 0, 0); }
      if (snow > 0.02) {
        g.globalAlpha = Math.min(0.85, snow * 0.9);
        for (const ch of any) { texTransform(ch, hi, g, pad); g.drawImage(ch.tex['white' + L], 0, 0); }
        g.globalAlpha = 1;
      }
    }
    g.imageSmoothingEnabled = true;
  }
  // The composed ground is cached in a padded offscreen buffer. While the view
  // only scrolls, each frame is a single blit; it is redrawn when the view turns,
  // zooms, scrolls past the padding, or snow/ice changes.
  const GPAD = 180;
  const gc = { cv: document.createElement('canvas'), key: '', x: 0, y: 0, lv: 0, dirty: true };
  gc.g = gc.cv.getContext('2d');
  function drawGround(v) {
    const world = G.world;
    const key = camA.toFixed(5) + '|' + TILT + '|' + Z + '|' + DPR + '|' + VW + '|' + VH + '|' + Math.round(world.frozen * 20) + '|' + Math.round(WX.snow * 20) + '|' + world.seed;
    if (gc.world !== world) { gc.world = world; gc.dirty = true; }
    const rx = gc.x - G.cam.x, ry = gc.y - G.cam.y;
    let dx = (rx * cosA + ry * sinA) * Z, dy = ((-rx * sinA + ry * cosA) * TILT + G.cam.lv - gc.lv) * Z;
    const must = key !== gc.key || Math.abs(dx) > GPAD * 0.85 || Math.abs(dy) > GPAD * 0.85;
    let ready = false;
    if (!must && gc.dirty) {
      // chunks in the off-screen padding load a couple per frame; redraw once they are all in
      const pv = viewChunks(GPAD);
      let budget = 2; ready = true;
      for (let cy = pv.cy0; cy <= pv.cy1 && ready; cy++) for (let cx = pv.cx0; cx <= pv.cx1; cx++) {
        const ch = world.getChunk(cx, cy);
        if (!ch.tex) { if (budget-- > 0) world.buildTextures(ch); else { ready = false; break; } }
      }
    }
    if (must || ready) {
      const pv = viewChunks(GPAD), list = [];
      let budget = 2, missing = false;
      for (let cy = pv.cy0; cy <= pv.cy1; cy++) for (let cx = pv.cx0; cx <= pv.cx1; cx++) {
        const ch = world.getChunk(cx, cy);
        const visible = cx >= v.cx0 && cx <= v.cx1 && cy >= v.cy0 && cy <= v.cy1;
        if (!ch.tex) { if (visible || budget-- > 0) world.buildTextures(ch); else { missing = true; continue; } }
        list.push(ch);
      }
      const w = Math.ceil((VW + GPAD * 2) * DPR), h = Math.ceil((VH + GPAD * 2) * DPR);
      if (gc.cv.width !== w || gc.cv.height !== h) { gc.cv.width = w; gc.cv.height = h; }
      gc.g.setTransform(1, 0, 0, 1, 0, 0);
      gc.g.clearRect(0, 0, w, h);
      groundLayers(gc.g, list, GPAD);
      gc.key = key; gc.x = G.cam.x; gc.y = G.cam.y; gc.lv = G.cam.lv; gc.dirty = missing;
      dx = dy = 0;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(gc.cv, Math.round((dx - GPAD) * DPR), Math.round((dy - GPAD) * DPR));
    ctx.imageSmoothingEnabled = true;
    const list = [];
    for (let cy = v.cy0; cy <= v.cy1; cy++) for (let cx = v.cx0; cx <= v.cx1; cx++) { const ch = world.getChunk(cx, cy); if (ch.tex) list.push(ch); }
    drawWaves(list);
    drawPuddles(list);
  }
  function drawWaves(list) {
    const t = G.time;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * Z;
    const windX = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle));
    for (const ch of list) {
      for (const w of ch.waves) {
        const a = Math.sin(t * (1.3 + WX.wind) + w[2]);
        if (a < 0.1) continue;
        const pt = proj(w[0], w[1], 0);
        if (pt.x < -20 || pt.x > VW + 20 || pt.y < -20 || pt.y > VH + 20) continue;
        const sx = pt.x + windX * WX.wind * 3 * Math.sin(t * 2 + w[2]), sy = pt.y + Math.sin(t * 2 + w[2]) * 1.5 * Z;
        ctx.globalAlpha = a * 0.6 * (1 - G.world.frozen);
        const L = (5 + WX.wind * 3) * Z;
        ctx.beginPath(); ctx.moveTo(sx - L, sy); ctx.quadraticCurveTo(sx - L / 2, sy - 3 * Z, sx, sy); ctx.quadraticCurveTo(sx + L / 2, sy - 3 * Z, sx + L, sy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // puddles fill where a shower has passed, and ripple while it is still raining there
  function drawPuddles(list) {
    if (WX.wet < 0.02 && WX.rain() < 0.02) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const ch of list) {
      for (const [x, y, r, s] of ch.puddles) {
        const wet = WX.wetAt(x, y);
        if (wet < 0.2) continue;
        const pt = proj(x, y, LH);
        if (pt.x < -40 || pt.x > VW + 40 || pt.y < -20 || pt.y > VH + 20) continue;
        const rr = r * Z * Math.min(1, (wet - 0.2) * 2);
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, rr + 2, rr * TILT + 2, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, rr, rr * TILT, 0, 0, TAU); ctx.fillStyle = '#6fb6e6'; ctx.fill();
        if (WX.rainAt(x, y) > 0.2) {
          const k = (G.time * 1.5 + s * 5) % 1;
          ctx.globalAlpha = 0.6 * (1 - k); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(pt.x + (s - 0.5) * rr, pt.y, rr * 0.5 * k, rr * 0.5 * k * TILT, 0, 0, TAU); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- pop-up book ----------------
  // Stickers near the hero stand up like a pop-up book; farther out they fold
  // back flat onto the page. Each one hangs on a damped spring, so when it
  // crosses the edge of the zone (because you walked, or turned the view) it
  // flaps up or flips down with a little bounce.
  const POP_FLAT = 1.3;                 // radians: how far a sticker folds back outside the zone
  const popState = new Map();
  const popZone = { x: 400, far: 300, near: 400 };
  let popFrame = 0;
  function updatePopZone() {
    // the zone covers the middle of the view at any zoom
    const c = curve;
    popZone.x = (0.36 * W) / Z;
    popZone.far = (0.5 * c.R * c.TH) / (Z * TILT);
    popZone.near = Math.max(160, 1.6 * (H - c.yA)) / (Z * TILT);
    popFrame++;
    if (popFrame % 240 === 0) for (const [id, st] of popState) if (popFrame - st.seen > 240) popState.delete(id);
  }
  function popTarget(x, y) {
    const rx = x - G.player.x, ry = y - G.player.y;
    const vx = rx * cosA + ry * sinA, vy = -rx * sinA + ry * cosA;
    const e = Math.hypot(vx / popZone.x, vy / (vy < 0 ? popZone.far : popZone.near));
    const k = clamp((e - 0.88) / 0.24, 0, 1);
    return k * k * (3 - 2 * k) * POP_FLAT;
  }
  // current fold angle: 0 standing, POP_FLAT lying flat, a little negative on the rebound
  function popOf(id, x, y, dt) {
    const target = popTarget(x, y);
    let st = popState.get(id);
    if (!st) { st = { a: target, v: 0, seen: 0 }; popState.set(id, st); }
    st.seen = popFrame;
    const h = Math.min(dt, 1 / 30);
    st.v += ((target - st.a) * 120 - st.v * 10.5) * h;
    st.a = clamp(st.a + st.v * h, -0.4, 1.5);
    return st.a;
  }
  // vertical scale for a fold angle: folding back shortens the sticker; the
  // rebound past upright stretches it a touch, like a card springing up
  const popScale = (a) => (a >= 0 ? Math.max(0.16, Math.cos(a)) : 1 + Math.min(0.12, -a * 0.3));

  // Draw a sticker whose top part is bent forward along a fold line, like
  // damp paper: frac is how much of its height bends, ang how far.
  function drawFolded(name, sx, sy, rot, kx, ky, frac, ang, which = 'img') {
    const spr = SW.sprites[name];
    if (!spr) return;
    if (ang < 0.03) { drawSprite(name, sx, sy, rot, kx, ky, which); return; }
    const img = spr[which], S = spr.S;
    const foldRow = Math.max(1, Math.min(img.height - 1, Math.round(spr.ay * S * frac)));
    const fy = -spr.ay + foldRow / S;
    // the part below the fold, as normal
    setSpriteTransform(sx, sy, rot, kx, ky);
    ctx.drawImage(img, 0, foldRow, img.width, img.height - foldRow, -spr.ax, fy, spr.w, (img.height - foldRow) / S);
    // the bent top: foreshortened, and shaded as it turns away from the light
    ctx.translate(0, fy);
    ctx.scale(1, Math.cos(ang));
    ctx.drawImage(img, 0, 0, img.width, foldRow, -spr.ax, -foldRow / S, spr.w, foldRow / S);
    const shade = Math.min(0.4, ang * 0.35);
    if (shade > 0.03) {
      const t = tintOf(spr, 'shade', '#2e2252');
      const a = ctx.globalAlpha; ctx.globalAlpha = a * shade;
      ctx.drawImage(t, 0, 0, t.width, foldRow, -spr.ax, -foldRow / S, spr.w, foldRow / S);
      ctx.globalAlpha = a;
    }
  }

  const drawList = [];
  let lastCamBX = 0, lastCamBY = 0;
  function render(dt) {
    const world = G.world, p = G.player, t = G.time;
    const shx = (Math.random() - 0.5) * G.cam.shake, shy = (Math.random() - 0.5) * G.cam.shake;
    const camX = G.cam.x, camY = G.cam.y;
    G.cam.x += shx / Z; G.cam.y += shy / Z;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#3b86c9';
    ctx.fillRect(0, 0, VW, VH);

    const v = viewChunks();
    drawGround(v);
    drawGroundMarkers();

    drawList.length = 0;
    updatePopZone();
    const windX = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle));
    for (let cy = v.cy0; cy <= v.cy1; cy++) for (let cx = v.cx0; cx <= v.cx1; cx++) {
      for (const o of world.getChunk(cx, cy).objs) {
        const pt = proj(o.x, o.y, 0);
        if (pt.x < -100 * Z || pt.x > VW + 100 * Z || pt.y < -30 || pt.y > VH + 140 * Z) continue;
        const st = world.objState(o, t);
        if (st === 'gone') continue;
        if (view === 'first' && pt.d > -26) continue;
        drawList.push({ d: pt.d, k: 0, o, spr: st === 'after' ? OBJ[o.type].after : o.type, pop: popOf(o.id, o.x, o.y, dt) });
      }
    }
    for (const s of world.structures) drawList.push({ d: depthOf(s.x - G.cam.x, s.y - G.cam.y), k: 1, s, spr: s.type === 'campfire' ? 'campfire' : 'wall', pop: popOf('s' + s.id, s.x, s.y, dt) });
    for (const m of G.mobs) { if (view === 'first' && depthOf(m.x - G.cam.x, m.y - G.cam.y) > -20) continue; drawList.push({ d: depthOf(m.x - G.cam.x, m.y - G.cam.y), k: 2, m, spr: mobSprite(m), sc: m.scale }); }
    if (G.realm) {
      const near = (x, y) => Math.abs(x - G.cam.x) < 2600 && Math.abs(y - G.cam.y) < 2600;
      for (const t of G.realm.tribes) {
        if (!near(t.x, t.y)) continue;
        for (const sp of t.spots) drawList.push({ d: depthOf(sp.x - G.cam.x, sp.y - G.cam.y), k: 6, x: sp.x, y: sp.y, spr: sp.spr, pop: popOf('h' + sp.x + ',' + sp.y, sp.x, sp.y, dt) });
        for (const n of t.npcs) drawList.push({ d: depthOf(n.x - G.cam.x, n.y - G.cam.y), k: 7, x: n.x, y: n.y, spr: n.spr, npc: n, pop: popOf('n' + n.x + ',' + n.y, n.x, n.y, dt) });
      }
      for (const c of G.realm.caves) if (near(c.x, c.y)) drawList.push({ d: depthOf(c.x - G.cam.x, c.y - G.cam.y), k: 6, x: c.x, y: c.y, spr: c.spr, cave: c, pop: popOf('c' + c.id, c.x, c.y, dt) });
    }
    if (G.adv && G.mode !== 'title') {
      const page = G.adv.pages[G.adv.next];
      if (page) drawList.push({ d: depthOf(page.x - G.cam.x, page.y - G.cam.y), k: 4, x: page.x, y: page.y, spr: 'lostPage' });
      for (const tr of G.adv.treasures) if (!tr.dug) drawList.push({ d: depthOf(tr.x - G.cam.x, tr.y - G.cam.y) - 30, k: 5, x: tr.x, y: tr.y, spr: 'digX' });
    }
    if (G.mode === 'play') drawList.push({ d: depthOf(p.x - G.cam.x, p.y - G.cam.y) + (p.flying || p.alt > 10 ? 400 : 0), k: 3 });
    if (G.mode === 'play' && G.star) drawList.push({ d: depthOf(G.star.x - G.cam.x, G.star.y - G.cam.y) + 380, k: 8 });
    drawList.sort((a, b) => a.d - b.d);

    // contact shadows
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgba(46, 34, 82, 0.2)';
    ctx.beginPath();
    for (const d of drawList) {
      let x, y, lv, rx;
      if (d.k === 0) { const def = OBJ[d.o.type]; if (def.decor || (!def.r && SW.sprites[d.spr].w < 40) || d.pop > 1.1) continue; x = d.o.x; y = d.o.y; lv = d.o.lvl * LH; rx = ((def.r || 6) + 6) * popScale(Math.max(0, d.pop)); }
      else if (d.k === 1) { x = d.s.x; y = d.s.y; lv = d.s.lvl * LH; rx = (d.s.r + 6) * popScale(Math.max(0, d.pop)); }
      else if (d.k === 2) { if (d.m.dying) continue; x = d.m.x; y = d.m.y; lv = d.m.lvlOff; rx = d.m.r; }
      else if (d.k === 3) { x = p.x; y = p.y; lv = p.lvlOff; rx = 13 * (1 - Math.min(0.5, p.alt / 130)); }
      else continue;
      const pt = proj(x, y, lv);
      ctx.moveTo(pt.x + rx * Z, pt.y); ctx.ellipse(pt.x, pt.y, rx * Z, rx * 0.42 * Z, 0, 0, TAU);
    }
    ctx.fill();

    // the player's on-screen box: anything drawn in front of it turns see-through
    const pp = proj(p.x, p.y, p.lvlOff + p.alt);
    const pbox = [pp.x - 18 * Z, pp.y - 100 * Z, pp.x + 18 * Z, pp.y + 2 * Z];
    let pastPlayer = false;
    const hov = G.hover;
    for (const d of drawList) {
      if (d.k === 3) { pastPlayer = true; drawPlayer(); continue; }
      d.glow = !!(hov && ((d.k === 0 && hov.o === d.o) || (d.k === 1 && hov.s === d.s) || (d.k === 2 && hov.m === d.m) || (d.k === 7 && hov.npc === d.npc) || (d.k === 6 && d.cave && hov.cave === d.cave))) ||
        !!(G.order && ((d.k === 0 && G.order.o === d.o) || (d.k === 2 && G.order.m === d.m) || (d.k === 1 && G.order.s === d.s)));
      d.cover = pastPlayer && G.mode === 'play' ? pbox : null;
      if (d.k === 0) drawObject(d, windX);
      else if (d.k === 1) drawStructure(d);
      else if (d.k === 2) drawMob(d);
      else if (d.k === 6 || d.k === 7) drawLandmark(d);
      else if (d.k === 8) drawStar(d);
      else drawMarker(d);
    }

    drawFishing();
    drawParticles();
    drawFloaters();
    drawTags();
    // weather particles live in the world buffer so they bend with the horizon
    const camBX = G.cam.x * cosA + G.cam.y * sinA, camBY = (-G.cam.x * sinA + G.cam.y * cosA) * TILT;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    let shiftX = (camBX - lastCamBX) * Z, shiftY = (camBY - lastCamBY) * Z;
    if (Math.abs(shiftX) > 200 || Math.abs(shiftY) > 200) shiftX = shiftY = 0;
    WX.drawShadows(ctx, VW, VH, flatToWorld);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    WX.draw(ctx, VW, VH, Z, Math.min(dt, 0.05), shiftX, shiftY, windX, flatToWorld);
    lastCamBX = camBX; lastCamBY = camBY;
    drawLighting();

    G.cam.x = camX; G.cam.y = camY;
    presentCurved();
  }

  // does a sticker's box overlap the player's box?
  function covers(d, spr, sx, sy, sc) {
    const b = d.cover;
    if (!b || !spr) return false;
    const x0 = sx - (spr.ax - 6) * Z * sc, x1 = sx + (spr.w - spr.ax - 6) * Z * sc, y0 = sy - (spr.ay - 6) * Z * sc;
    return x1 > b[0] && x0 < b[2] && sy > b[1] && y0 < b[3];
  }

  function drawGroundMarkers() {
    const mk = G.marker;
    if (mk) {
      const k = mk.t / 1.2, pt = proj(mk.x, mk.y, mk.lvl * LH);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 4 * Z; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(pt.x, pt.y, (10 + k * 14) * Z, (4 + k * 6) * Z, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2 * Z; ctx.strokeStyle = '#ffb13b'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (G.mode !== 'play') return;
    // compass arrows around the player: gold for the next Lost Page, yellow for an explore quest
    const p = G.player;
    const arrows = [];
    const page = G.adv && G.adv.pages[G.adv.next];
    if (page) arrows.push([page.x, page.y, 0.9]);
    const q = G.quests.find((q) => q.kind === 'explore' && !q.done);
    if (q) arrows.push([q.tx, q.ty, 0.7]);
    drawBarrier();
    if (G.star) arrows.length = 0;          // Star shows the way now
    const base = proj(p.x, p.y, p.lvlOff);
    const bx = base.x, by = base.y;
    for (const [tx, ty, s] of arrows) {
      const dx = screenDX(tx - p.x, ty - p.y), dy = (-(tx - p.x) * sinA + (ty - p.y) * cosA) * TILT;
      const a = Math.atan2(dy, dx);
      ctx.globalAlpha = 0.85;
      drawSprite('uiArrow', bx + Math.cos(a) * 46 * Z, by + Math.sin(a) * 28 * Z + 8 * Z, a, s, s);
      ctx.globalAlpha = 1;
    }
  }

  function drawObject(d, windX) {
    const o = d.o, def = OBJ[o.type];
    const pt = proj(o.x, o.y, o.lvl * LH);
    const sx = pt.x, sy = pt.y;
    d.sx = sx; d.sy = sy;
    // pop-up: lying-down stickers are foreshortened from their base
    const pk = popScale(d.pop || 0);
    let rot = 0, kx = 1, ky = pk, ox = 0;
    const up = clamp(1 - (d.pop || 0) / POP_FLAT, 0, 1);    // 1 standing .. 0 flat
    // wind: each plant feels the gust passing over its own spot
    if (def.sway && up > 0.2) rot = WX.sway(G.time, o.seed, windX, WX.gustAt(o.x, o.y)) * def.sway * up;
    // rain: where a shower has passed, soft stickers bend over at the top (never all the way)
    const wet = def.tree || def.plant || def.glow ? WX.wetAt(o.x, o.y) : 0;
    const fold = wet > 0.05 && up > 0.3 ? wet * (def.tree ? 0.75 : 0.95) * up : 0;
    const ht = G.hitT.get(o.id);
    if (ht !== undefined && G.time - ht < 0.25) {
      const k = 1 - (G.time - ht) / 0.25;
      kx = 1 + 0.1 * k; ky *= 1 - 0.1 * k; ox = Math.sin((G.time - ht) * 60) * 3 * k * Z;
    }
    d.ky = ky;
    const see = covers(d, SW.sprites[d.spr], sx, sy, 1);
    if (see) ctx.globalAlpha = 0.35;
    if (d.glow) drawSprite(d.spr, sx + ox, sy + 3 * Z, rot, kx * 1.09, ky * 1.07, 'glow');
    drawFolded(d.spr, sx + ox, sy, rot, kx, ky, def.tree ? 0.42 : 0.55, fold);
    // wet rocks shine on top; snow settles where it has fallen
    if (def.rock) { const rw = WX.wetAt(o.x, o.y); if (rw > 0.05) drawCap(d.spr, sx + ox, sy, rot, kx, ky, 0.42, 'wetCap', '#bfe2ff', 0.45 * rw * (see ? 0.35 : 1)); }
    if ((def.tree || def.rock || def.plant) && o.type !== 'treePineSnow' && o.type !== 'snowRock' && fold < 0.15) {
      const sc = WX.coverAt(o.x, o.y);
      if (sc > 0.05) drawCap(d.spr, sx + ox, sy, rot, kx, ky, def.tree ? 0.3 : 0.4, 'snowCap', '#ffffff', Math.min(0.9, sc) * (see ? 0.35 : 1));
    }
    ctx.globalAlpha = 1;
  }

  function drawStructure(d) {
    const s = d.s;
    const pt = proj(s.x, s.y, s.lvl * LH);
    const sx = pt.x, sy = pt.y;
    d.sx = sx; d.sy = sy;
    let kx = 1, ky = popScale(d.pop || 0);
    if (G.time - s.hitT < 0.2) { kx = 1.08; ky *= 0.92; }
    d.ky = ky;
    const name = s.type === 'campfire' ? (s.fuel > 0 ? 'campfire' : 'campfireOut') : 'wall';
    if (covers(d, SW.sprites[name], sx, sy, 1)) ctx.globalAlpha = 0.4;
    if (d.glow) drawSprite(name, sx, sy + 3 * Z, 0, 1.09, 1.07 * ky, 'glow');
    drawSprite(name, sx, sy, 0, kx, ky);
    if (s.type === 'campfire' && s.fuel > 0 && ky > 0.5) {
      const f = Math.floor(G.time * 8 + s.id) % 3;
      const fk = s.fuel < 25 ? 0.55 + (s.fuel / 25) * 0.45 : 1;
      const lean = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle)) * WX.gustAt(s.x, s.y) * 0.35;
      drawSprite('flame' + f, sx, sy - 10 * Z * ky, Math.sin(G.time * 5) * 0.06 + lean, fk * (1 + Math.sin(G.time * 13) * 0.04), fk * (1 + Math.sin(G.time * 11) * 0.06));
    }
    ctx.globalAlpha = 1;
  }

  // settlement buildings, tribe folk and cave mountains: pop-up stickers like the rest
  // where the realm wants you next: this zone's tribe if you haven't met it,
  // else the cave of an active relic quest
  function realmGoal() {
    if (!G.realm || G.mode !== 'play') return null;
    const z = Math.min(maxZone(), zoneOf(G.player.x, G.player.y));
    const t = G.realm.tribes[z];
    if (!(G.metTribes || []).includes(t.id)) return t;
    for (const tr of G.realm.tribes) for (const q of tr.quests) {
      const st = G.tq[q.id];
      if (q.kind === 'relic' && st && st.state === 'active') return (G.inv[q.key] || 0) > 0 ? tr : G.realm.caves[tr.zone];
      if (q.kind === 'deliver' && st && st.state === 'active') return G.realm.tribes.find((x) => x.id === q.key);
      if (q.kind === 'deliver' && st && st.state === 'relay') return tr;
      if (st && st.state === 'active' && questReady(q)) return tr;
    }
    return null;
  }
  // the ink barrier: a wobbly line of ink posts where the next zone starts
  function drawBarrier() {
    if (!G.realm) return;
    const mz = maxZone();
    if (mz >= SW.ZONE_R.length) return;
    const R0 = SW.ZONE_R[mz], sp = G.world.spawn, p = G.player;
    const dp = dist(p.x, p.y, sp.x, sp.y);
    if (Math.abs(dp - R0) > 1300) return;
    const a0 = Math.atan2(p.y - sp.y, p.x - sp.x), span = 1500 / R0, step = 26 / R0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = [];
    for (let a = a0 - span; a <= a0 + span; a += step) {
      const x = sp.x + Math.cos(a) * R0, y = sp.y + Math.sin(a) * R0;
      if (G.world.isWater(x, y)) { pts.push(null); continue; }
      const pt = proj(x, y, G.world.levelAt(x, y) * LH);
      pts.push([pt.x, pt.y + Math.sin(G.time * 3 + a * 900) * 2 * Z]);
    }
    for (const [w, col] of [[9, '#ffffff'], [5, '#5b4f78']]) {
      ctx.lineWidth = w * Z; ctx.strokeStyle = col; ctx.setLineDash(col === '#ffffff' ? [] : [10 * Z, 8 * Z]);
      ctx.beginPath(); let pen = false;
      for (const q of pts) { if (!q) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // ink posts
    for (let i = 0; i < pts.length; i += 5) {
      const q = pts[i]; if (!q) continue;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(q[0], q[1] - 14 * Z, 6 * Z, 16 * Z, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2340'; ctx.beginPath(); ctx.ellipse(q[0], q[1] - 14 * Z, 4 * Z, 13 * Z, 0, 0, TAU); ctx.fill();
    }
    if (Math.abs(dp - R0) < 500) { const z = ZONES[mz + 1]; pillText(`${z.name}: Level ${z.level}`, VCX, VCY - 120 * Z, '#5b4f78', 12); }
  }

  function drawLandmark(d) {
    const lvl = G.world.levelAt(d.x, d.y) * LH;
    const pt = proj(d.x, d.y, lvl);
    const ky = popScale(d.pop || 0), bob = d.k === 7 ? Math.abs(Math.sin(G.time * 2.2 + d.x)) * 2 * Z : 0;
    d.sx = pt.x; d.sy = pt.y; d.ky = ky;
    if (covers(d, SW.sprites[d.spr], pt.x, pt.y, 1)) ctx.globalAlpha = d.k === 6 ? 0.45 : 0.6;
    if (d.glow) drawSprite(d.spr, pt.x, pt.y + 3 * Z, 0, 1.06, 1.05 * ky, 'glow');
    drawSprite(d.spr, pt.x, pt.y - bob, 0, 1, ky);
    ctx.globalAlpha = 1;
    // a name tag over folk near you, and over cave doors
    const p = G.player;
    if (ky > 0.7 && d.k === 7 && dist(p.x, p.y, d.x, d.y) < 300) {
      const q = d.npc.role === 'elder' ? questOf(d.npc.tribe) : null;
      const mark = q && (!(G.tq[q.id] || {}).state || questReady(q)) ? (questReady(q) ? ' ✓' : ' !') : '';
      pillText(d.npc.name + mark, pt.x, pt.y - 62 * Z, mark ? '#e0a400' : '#3b2f4f', 11);
    }
    if (ky > 0.7 && d.cave && dist(p.x, p.y, d.x, d.y) < 520) pillText(d.cave.name + (caveSave(d.cave.id).taken ? ' ✓' : ''), pt.x, pt.y - 160 * Z, '#3b2f4f', 12);
  }

  function drawMarker(d) {
    const lvl = G.world.levelAt(d.x, d.y) * LH;
    const pt = proj(d.x, d.y, lvl);
    d.sx = pt.x; d.sy = pt.y;
    if (d.k === 4) {
      // a Lost Page floats and glows
      const bob = Math.sin(G.time * 2.4) * 5 * Z;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const g = ctx.createRadialGradient(pt.x, pt.y - 22 * Z, 0, pt.x, pt.y - 22 * Z, 46 * Z);
      g.addColorStop(0, 'rgba(255,220,90,0.55)'); g.addColorStop(1, 'rgba(255,220,90,0)');
      ctx.fillStyle = g; ctx.fillRect(pt.x - 50 * Z, pt.y - 72 * Z, 100 * Z, 100 * Z);
      drawSprite('lostPage', pt.x, pt.y - 10 * Z + bob, Math.sin(G.time * 1.7) * 0.12);
    } else drawSprite('digX', pt.x, pt.y + 6 * Z, 0, 1, 0.7);
  }

  function mobSprite(m) {
    let f = 0;
    if (m.type === 'scribble') f = Math.floor(m.t * 7) % 2;
    else if (m.type === 'puff' || m.type === 'gloop') f = m.hop > 0.15 && m.hop < 0.85 ? 1 : 0;
    else if (m.type === 'snail') f = Math.floor(m.t * 2) % 2;
    else if (m.type === 'pebblor') f = m.atkCd > 1.2 ? 1 : Math.floor(m.t * 2.5) % 2;
    else f = Math.hypot(m.vx, m.vy) > 20 ? Math.floor(m.t * 8) % 2 : 0;
    return m.type + f + (m.face < 0 ? 'L' : '');
  }

  function drawMob(d) {
    const m = d.m, sc = m.scale;
    const pt = proj(m.x, m.y, m.lvlOff);
    const sx = pt.x, sy = pt.y;
    d.sx = sx; d.sy = sy;
    let kx = sc, ky = sc, rot = 0, alpha = 1, ox = 0;
    if (m.type === 'scribble') { ky *= 1 + Math.sin(m.t * 9) * 0.05; kx *= 2 - ky / sc; rot = Math.sin(m.t * 5) * 0.05; }
    else if (m.type === 'puff') ky *= 1 + Math.sin(m.hop * Math.PI) * 0.1;
    else if (m.type === 'gloop') { const h = Math.sin(m.hop * Math.PI); ky *= 1 + h * 0.15; kx *= 1 - h * 0.08; }
    if (m.state === 'windup') ox = Math.sin(m.t * 60) * 2.5 * Z;
    if (m.state === 'dash') rot = m.face * 0.25;
    const lift = (m.type === 'puff' ? Math.sin(m.hop * Math.PI) * 10 : m.type === 'gloop' ? Math.sin(m.hop * Math.PI) * 6 : 0) * Z;
    if (m.dying) { const k = clamp(m.dying / 0.6, 0, 1); ky *= 1 - k * 0.8; kx *= 1 + k * 0.6; alpha = 1 - k; }
    ctx.globalAlpha = alpha;
    if (d.glow) drawSprite(d.spr, sx + ox, sy - lift + 3 * Z, rot, kx * 1.1, ky * 1.08, 'glow');
    drawSprite(d.spr, sx + ox, sy - lift, rot, kx, ky);
    if (m.hurtT > 0) { ctx.globalAlpha = 0.8 * alpha; drawSprite(d.spr, sx + ox, sy - lift, rot, kx, ky, 'flash'); }
    ctx.globalAlpha = 1;
  }

  function drawTags() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = G.player, hov = G.hover;
    for (const d of drawList) {
      if (d.k !== 2 || d.m.dying || d.sx === undefined) continue;
      const m = d.m, def = ENEMIES[m.type];
      const show = m.hp < m.maxHp || (hov && hov.m === m) || (!def.passive && m.state !== 'idle' && dist(m.x, m.y, p.x, p.y) < 360) || m.elite;
      if (!show) continue;
      const spr = SW.sprites[d.spr];
      const top = d.sy - (spr.ay - 6) * Z * m.scale - 8 * Z;
      const w = 34 * Z;
      if (m.hp < m.maxHp) {
        const x = d.sx - w / 2, y = top - 2;
        ctx.fillStyle = '#ffffff'; roundRect(x - 2, y - 2, w + 4, 7 * Z + 4, 5); ctx.fill();
        ctx.fillStyle = '#3b2f4f'; roundRect(x, y, w, 7 * Z, 4); ctx.fill();
        ctx.fillStyle = def.passive ? '#2fb36f' : '#ff4d6d'; roundRect(x, y, w * Math.max(0, m.hp / m.maxHp), 7 * Z, 4); ctx.fill();
      }
      if (!def.passive) {
        const danger = m.lvl - p.level;
        const col = m.elite ? '#e0a400' : danger >= 3 ? '#ff3b5c' : danger >= 1 ? '#ff8a2a' : '#3b2f4f';
        pillText((m.elite ? 'Elite ' : '') + 'Lv' + m.lvl + ' ' + def.name, d.sx, top - 10 * Z, col, 12);
      }
    }
    if (hov && hov.label) pillText(hov.label, hov.lx, hov.ly, '#3b2f4f', 13);
  }
  function pillText(text, x, y, color, size) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = `${Math.round(size * Math.max(0.85, Z))}px "Sniglet", ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14, h = size * Math.max(0.85, Z) + 8;
    ctx.fillStyle = 'rgba(52,38,84,0.25)'; roundRect(x - w / 2 + 1.5, y - h / 2 + 2.5, w, h, h / 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, r); else ctx.rect(x, y, w, h); }

  // ---------------- Ene, the puppet ----------------
  // Her head, hair and dress are the character sheet's own drawing; arms and
  // legs are jointed and posed every frame (js/ene.js). Here the game decides
  // what she is doing and which way she is seen from: side-on walking across
  // the screen, three-quarter or front coming toward you, her back going away,
  // and turned to the camera when she stands still.
  const ENE_UNITS = 108;                 // her height in sticker units, like every other sticker
  // swinging or fishing she turns side-on, so the stroke and the rod read clearly
  const eneLook = (p, sdx, sdy, moving, forceBack) => SW.ene.look(p, sdx, sdy, moving, forceBack, G.time, p.swingT > 0 || G.fishing ? (p.face || 1) : 0);
  const eneState = (p, extra) => SW.ene.state(p, G.ene, G.time, extra);
  const eneToolSpr = (n) => n ? { axe: 'toolAxe', pick: 'toolPick', sword: 'toolSword', gemSword: 'toolGemSword', inkBlade: 'toolInkBlade', rod: 'toolRod' }[n] : null;


  // ---- her sticker outline, from what she carries and what she is doing ----
  // One white die-cut outline wraps Ene and everything she holds. Its look comes from her
  // gear: each row below can set `color` (the white itself), `rim` (a coloured band on the
  // outside of the white), `glow` (a soft halo beyond it) and `width`. Rows apply in order,
  // later ones winning, so the moment-to-moment states at the bottom override the gear.
  const OUTLINE_RULES = [
    { when: (c) => c.has('barkVest'), rim: '#b07a44' },
    { when: (c) => c.has('stoneMail'), rim: '#8e94aa' },
    { when: (c) => c.has('crystalPlate'), rim: '#7fd8f0', glow: '#bff4ff', glowAlpha: 0.35 },
    { when: (c) => c.has('warmCloak'), color: '#eef4ff' },
    { when: (c) => c.weapon === 'gemSword', glow: '#8fe8f6', glowAlpha: 0.5 },
    { when: (c) => c.weapon === 'inkBlade', glow: '#6a46b0', glowAlpha: 0.55 },
    { when: (c) => c.has('lantern') && c.night, glow: '#ffd76a', glowAlpha: 0.45 },
    { when: (c) => c.gliding, rim: '#7cbf4a' },
    { when: (c) => c.sailing, rim: '#6cb6f0' },
    { when: (c) => c.hurt, rim: '#ff4d6d' },
    { when: (c) => c.crying, glow: (c) => `hsl(${(c.t * 240) % 360} 95% 65%)`, glowAlpha: 0.7, width: 1.25 },
  ];
  function eneOutline(c, unit) {
    const o = { color: '#ffffff', width: 2.4 * unit };
    for (const r of OUTLINE_RULES) if (r.when(c)) {
      if (r.color) o.color = r.color;
      if (r.rim) o.rim = r.rim;
      if (r.glow) { o.glow = typeof r.glow === 'function' ? r.glow(c) : r.glow; o.glowAlpha = r.glowAlpha; }
      if (r.width) o.width = 2.4 * unit * r.width;
    }
    return o;
  }
  function eneGear(p, weapon) {
    const e = G.ene || {};
    return {
      has: (k) => !!G.tools[k], weapon, t: G.time,
      night: darkness(phaseOf(G.time)) > 0.35 || G.inCave != null,
      gliding: p.flying || p.alt > 4, sailing: !!p.boat,
      hurt: p.hurtT > 0, crying: e.cryT > 0,
    };
  }
  // her gear as layers of her sticker: the tool on her back, the raft, the leaf glider
  function eneProps(p, toolSpr, inHand) {
    const o = {};
    if (toolSpr && !inHand && !p.flying && SW.sprites[toolSpr]) o.carry = { spr: SW.sprites[toolSpr] };
    if (p.boat && SW.sprites.raft) o.raft = { spr: SW.sprites.raft, rot: Math.sin(G.time * 2) * 0.03, kx: 1 - p.raftWet * 0.12, ky: 1 - p.raftWet * 0.2 };
    if ((p.flying || p.alt > 4) && SW.sprites.glider) {
      const bank = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle)) * WX.here.gust * 0.22;
      o.glider = { spr: SW.sprites.glider, rot: 0.1 + Math.sin(G.time * 2) * 0.03 + bank + Math.sin(G.time * 3) * 0.04, ky: 1 - p.leafWet * 0.25 };
    }
    return o;
  }
  // which way she faces on screen, from the pose
  const eneFacing = (P, p) => P.view === 'side' || P.view === 'threeQ' ? (P.flip ? 1 : -1) : P.view === 'front' ? 1 : (p.face || 1);

  function drawPlayer() {
    const p = G.player;
    const pt = proj(p.x, p.y, p.lvlOff);
    const gx = pt.x, gy = pt.y;
    const sx = gx, sy = gy - p.alt * Z;
    if (!VIEWS[view].hero) return;                     // first person: you are the camera
    const ground = !p.flying && !p.boat;
    const back = view === 'third';
    const e = G.ene || {};
    // which way she is seen, from where she is heading on screen
    const sdx = screenDX(p.vx, p.vy), sdy = -p.vx * sinA + p.vy * cosA;
    eneLook(p, sdx, sdy, p.moving && (ground || p.boat), back);
    const bob = p.boat ? Math.sin(G.time * 3) * 2 * Z : 0;
    const fishing = !!G.fishing;
    const toolName = fishing ? 'rod' : p.swingT > 0 ? p.swingTool : bestWeapon() || (G.tools.axe ? 'axe' : G.tools.pick ? 'pick' : null);
    const toolSpr = eneToolSpr(toolName);
    const P = SW.ene.pose(eneState(p, {
      fish: fishing, glide: p.flying || p.alt > 4, air: !p.flying && p.alt > 2 && p.alt <= 4, boat: p.boat,
    }));
    const s = ENE_UNITS * Z / SW.ene.height;
    const inHand = (p.swingT > 0 || fishing) && toolSpr;
    const f = eneFacing(P, p);
    const flick = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    drawRainbows(sx, sy);                       // behind her, so they pour out past her face
    // the tool in her hand is drawn inside her sticker, between her body and her hand
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const heldTool = inHand && SW.sprites[toolSpr] ? { spr: SW.sprites[toolSpr], off: fishing ? 1.25 : 0.55 } : null;
    // she, the tool in her hand, the tool on her back, the raft and the leaf glider are one
    // sticker with one outline, styled by her gear
    const weapon = bestWeapon();
    const info = SW.ene.draw(ctx, sx, sy - bob, s, P, Object.assign({ dpr: DPR, flash: p.hurtT > 0 || flick ? 0.75 : 0, tool: heldTool,
      outline: eneOutline(eneGear(p, inHand ? toolName : weapon), Z) }, eneProps(p, toolSpr, inHand)));
    G.eneHand = info ? info.hand : null;
    if (fishing && G.fishing.phase === 'bite') { const s = 1 + Math.sin(G.time * 20) * 0.12; drawSprite('uiBang', sx, sy - 120 * Z, 0, s, s); }
  }

  function drawFishing() {
    const f = G.fishing;
    if (!f) return;
    const p = G.player;
    const pp = proj(p.x, p.y, p.lvlOff);
    const tipX = pp.x + p.face * 30 * Z, tipY = pp.y - 40 * Z;
    const fp = proj(f.x, f.y, 0);
    let bx = fp.x, by = fp.y;
    if (f.phase === 'cast') { const k = Math.min(1, f.t / 0.45); bx = lerp(tipX, bx, k); by = lerp(tipY, by, k) - Math.sin(k * Math.PI) * 50 * Z; }
    else if (f.phase === 'reel') { const k = Math.min(1, f.t / 0.4); bx = lerp(bx, tipX, k); by = lerp(by, tipY, k) - Math.sin(k * Math.PI) * 40 * Z; }
    else by += (f.phase === 'bite' ? 4 + Math.sin(G.time * 25) * 2 : Math.sin(G.time * 3) * 1.5) * Z;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + 18 * Z, bx, by); ctx.stroke();
    if (f.phase !== 'reel' || f.t < 0.4) drawSprite('bobber', bx, by + 6 * Z, 0, f.phase === 'bite' ? 1.1 : 1, f.phase === 'bite' ? 0.8 : 1);
  }

  function drawParticles() {
    for (const q of G.parts) {
      const k = q.t / q.life;
      if (q.k === 'ay') {
        const pt = proj(q.x, q.y, q.lvl);
        const sc = (k < 0.2 ? 0.6 + k * 2.6 : 1.12 - (k - 0.2) * 0.15) * Z;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.save(); ctx.translate(pt.x - 30 * Z, pt.y); ctx.rotate(-0.18); ctx.scale(sc, sc);
        ctx.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
        ctx.font = '30px "Bagel Fat One", "Arial Rounded MT Bold", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff'; ctx.strokeText('AY!!', 0, 0);
        ctx.lineWidth = 5; ctx.strokeStyle = '#16121c'; ctx.strokeText('AY!!', 0, 0);
        ctx.fillStyle = '#ffe23a'; ctx.fillText('AY!!', 0, 0);
        ctx.restore(); ctx.globalAlpha = 1;
        continue;
      }
      if (q.k === 'peel') {
        const pt = proj(q.x, q.y, q.lvl * LH);
        const sx = pt.x + q.dir * k * 40 * Z, sy = pt.y - (Math.sin(k * Math.PI * 0.8) * 60 + k * 30) * Z;
        const flip = Math.cos(k * Math.PI * 2.2), sc = 1 - k * 0.55;
        ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        drawSprite(q.spr, sx, sy, q.dir * k * 1.4, Math.abs(flip) * sc + 0.02, sc, flip < 0 ? 'back' : 'img');
        ctx.globalAlpha = 1;
        continue;
      }
      if (q.k === 'fall') {
        // timber: rotate about the base, speeding up like a falling trunk, then a little bounce
        const pt = proj(q.x, q.y, q.lvl * LH);
        const tt = q.t;
        const a = tt < 0.55 ? Math.pow(tt / 0.55, 2) * (Math.PI / 2) : Math.PI / 2 - Math.sin(Math.min(1, (tt - 0.55) / 0.25) * Math.PI) * 0.08;
        ctx.globalAlpha = tt > 1.0 ? Math.max(0, 1 - (tt - 1.0) / 0.5) : 1;
        drawSprite(q.spr, pt.x, pt.y, q.dir * a * 0.97, 1, 1);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (q.k === 'chip') {
        const pt = proj(q.x, q.y, q.lvl); const sx = pt.x, sy = pt.y - q.z * Z;
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - q.size * Z / 2 - 1.2, sy - q.size * Z / 2 - 1.2, q.size * Z + 2.4, q.size * Z + 2.4);
        ctx.fillStyle = q.color; ctx.fillRect(sx - q.size * Z / 2, sy - q.size * Z / 2, q.size * Z, q.size * Z);
      } else if (q.k === 'dot') {
        const pt = proj(q.x, q.y, q.lvl);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y - q.z * Z, q.r * Z * (1 - k * 0.5), 0, TAU); ctx.fill();
      } else if (q.k === 'dust') {
        const pt = proj(q.x, q.y, q.lvl);
        ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = WX.snow > 0.4 ? '#f4f8ff' : '#ffffff';
        ctx.beginPath(); ctx.arc(pt.x, pt.y - k * 6 * Z, (3 + k * 5) * Z, 0, TAU); ctx.fill();
      } else if (q.k === 'ring') {
        const pt = proj(q.x, q.y, q.lvl);
        ctx.globalAlpha = 0.8 * (1 - k); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * Z;
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, (6 + k * 26) * Z, (2.5 + k * 10) * Z, 0, 0, TAU); ctx.stroke();
      } else if (q.k === 'ember') {
        const pt = proj(q.x, q.y, q.lvl);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.5 ? '#ffd23f' : '#ff7a2a';
        ctx.fillRect(pt.x - 1.5 * Z, pt.y - 1.5 * Z, 3 * Z, 3 * Z);
      } else if (q.k === 'text') {
        const pt = proj(q.x, q.y, q.lvl); const sx = pt.x, sy = pt.y - k * 30 * Z;
        ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        ctx.font = `${Math.round(17 * Math.max(0.85, Z))}px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        ctx.lineWidth = 6 * Z; ctx.strokeStyle = '#ffffff'; ctx.strokeText(q.text, sx, sy);
        ctx.fillStyle = q.color; ctx.fillText(q.text, sx, sy);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    for (const f of G.floaters) {
      if (f.t < 0) continue;
      const pt = proj(f.x, f.y, f.lvl * LH);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = 'rgba(46,34,82,0.18)';
      ctx.beginPath(); ctx.ellipse(pt.x, pt.y, 7 * Z, 3 * Z, 0, 0, TAU); ctx.fill();
      drawSprite(ITEMS[f.item].icon, pt.x, pt.y - f.z * Z + 10 * Z, Math.sin(f.t * 12) * 0.2, 0.75, 0.75);
    }
  }

  function drawLighting() {
    const d = darkness(phaseOf(G.time));
    if (d <= 0.01) return;
    const p = G.player, moon = moonNow();
    const lw = lightCv.width, lh = lightCv.height;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    // a full moon lights the night; a new moon (and the Ink Moon) makes it darker
    const deep = 0.84 * d * (1 - 0.3 * moon.bright) + (moon.ink ? 0.06 * d : 0);
    lctx.fillStyle = moon.ink ? `rgba(30, 10, 50, ${deep})` : `rgba(16, 18, 54, ${deep})`;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, strength) => {
      const g = lctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const pr = ((G.tools.lantern ? 200 : 115) * Z) / 2;
    if (G.mode !== 'title') { const pt = proj(p.x, p.y, p.lvlOff + p.alt); hole(pt.x / 2, (pt.y - 20 * Z) / 2, pr, G.tools.lantern ? 0.95 : 0.8); }
    if (G.mode !== 'title' && G.star) { const pt = proj(G.star.x, G.star.y, G.star.z); hole(pt.x / 2, (pt.y - 20 * Z) / 2, (150 * Z) / 2, 0.85); }
    const fires = burningFires();
    for (const s of fires) { const pt = proj(s.x, s.y, s.lvl * LH); hole(pt.x / 2, (pt.y - 14 * Z) / 2, ((fireRadius(s) * Z) / 2) * Math.min(1, s.fuel / 20 + 0.3), 1); }
    // glowing mushrooms and crystals make little pools of light
    let glows = 0;
    for (const dl of drawList) {
      if (dl.k !== 0 || dl.sx === undefined || glows > 40) continue;
      const def = OBJ[dl.o.type];
      if (!def.glow || dl.spr !== dl.o.type) continue;
      glows++;
      hole(dl.sx / 2, (dl.sy - 16 * Z) / 2, ((def.tree ? 70 : 34) * Z) / 2, 0.55 + Math.sin(G.time * 2 + dl.o.seed * 9) * 0.1);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(lightCv, 0, 0, VW, VH);
    const warm = Math.sin(clamp(d, 0, 1) * Math.PI) * 0.16;
    if (warm > 0.01) { ctx.fillStyle = `rgba(255, 120, 70, ${warm})`; ctx.fillRect(0, 0, VW, VH); }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of fires) {
      const pt = proj(s.x, s.y, s.lvl * LH);
      const x = pt.x, y = pt.y - 14 * Z, r = fireRadius(s) * Z * 0.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 150, 60, ${0.28 * d})`);
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------- sky & the bend ----------------
  const stars = [];
  for (let i = 0; i < 60; i++) stars.push([Math.random(), Math.random(), 0.5 + Math.random() * 1.2, Math.random() * 6]);
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixRGB = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  const rgba = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
  const SKY = { dayTop: hexRGB('#6fc0f2'), dayLow: hexRGB('#d6f1ff'), duskTop: hexRGB('#ff9a6a'), duskLow: hexRGB('#ffd2a0'), nightTop: hexRGB('#0d0f33'), nightLow: hexRGB('#2b2d70'), grey: hexRGB('#8c98a8'), inkTop: hexRGB('#2a0f3d') };
  // The sky: gradient by time of day and weather, the swirl pattern from the
  // drawings, stars, the cartoon moon and clouds. Returns the horizon colour.
  function paintSky(yTop, skyH, moonA) {
    const d = darkness(phaseOf(G.time)), warm = Math.sin(clamp(d, 0, 1) * Math.PI), moon = moonNow();
    const overcast = Math.min(1, WX.rain() * 0.7 + WX.snowing() * 0.5 + WX.fogAmt * 0.6 + WX.sandAmt * 0.4);
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    let skyTop = mixRGB(mixRGB(SKY.dayTop, SKY.duskTop, warm * 0.8), moon.ink ? SKY.inkTop : SKY.nightTop, d);
    let skyLow = mixRGB(mixRGB(SKY.dayLow, SKY.duskLow, warm), SKY.nightLow, d);
    skyTop = mixRGB(skyTop, SKY.grey, overcast * (1 - d * 0.7)); skyLow = mixRGB(skyLow, SKY.grey, overcast * 0.6 * (1 - d * 0.7));
    const sky = sctx.createLinearGradient(0, 0, 0, skyH - H * 0.02);
    sky.addColorStop(0, rgba(skyTop)); sky.addColorStop(1, rgba(skyLow));
    sctx.fillStyle = sky; sctx.fillRect(0, 0, W, skyH);
    drawSwirls(skyH, d, overcast);
    if (d > 0.05) {
      sctx.fillStyle = '#ffffff';
      for (const [x, y, r, ph] of stars) { sctx.globalAlpha = d * (1 - overcast) * (0.5 + 0.5 * Math.sin(G.time * 2 + ph)); sctx.fillRect(x * W, y * yTop * 1.1, r, r); }
      // a few big sparkles, like the starry night drawing
      for (let i = 0; i < 6; i++) { const [x, y, , ph] = stars[i * 7]; sparkle(sctx, x * W, y * yTop, 5 + (i % 3) * 2, d * (1 - overcast) * (0.55 + 0.45 * Math.sin(G.time * 1.6 + ph))); }
      sctx.globalAlpha = Math.min(1, d * 1.4) * (1 - overcast * 0.8);
      const mr = clamp(yTop * 0.4, 14, 40);
      // the moon hangs in the north-west, clear of the night banner, and slides along the horizon as you turn
      const ma = moonA, mx = W / 2 + Math.sin(ma) * W * 0.4;
      if (Math.cos(ma) > -0.2) SW.drawMoon(sctx, mx, yTop * 0.55 + mr * 0.3, mr, moon.phase, moon.ink);
      sctx.globalAlpha = 1;
    }
    drawClouds(yTop, d, overcast);
    return skyLow;
  }
  function sparkle(g, x, y, r, a) {
    if (a < 0.03) return;
    g.save(); g.globalAlpha = a; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
    g.globalAlpha = a * 0.35; g.beginPath(); g.arc(x, y, r * 0.9, 0, TAU); g.fill();
    g.restore();
  }
  // the hand-drawn swirl pattern from the drawings, tiled faintly over the sky
  let swirlPat = null;
  function drawSwirls(skyH, d, overcast) {
    if (!swirlPat) {
      const c = document.createElement('canvas'); c.width = 120; c.height = 64;
      const g = c.getContext('2d');
      g.lineWidth = 2.4; g.lineCap = 'round'; g.strokeStyle = '#ffffff';
      for (const [ox, oy] of [[10, 18], [70, 50]]) {
        g.beginPath();
        for (let t = 0; t < 4.2 * Math.PI; t += 0.15) { const r = 2 + t * 1.1; const x = ox + 22 + Math.cos(t) * r, y = oy + Math.sin(t) * r * 0.8; t === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.lineTo(ox + 52, oy + 8); g.stroke();
      }
      swirlPat = sctx.createPattern(c, 'repeat');
    }
    sctx.save();
    sctx.globalAlpha = (0.32 - d * 0.2) * (1 - overcast * 0.6);
    sctx.fillStyle = swirlPat;
    sctx.translate(-((G.time * 6) % 120), 0);
    sctx.fillRect(0, 0, W + 120, skyH);
    sctx.restore();
  }
  function presentCurved() {
    const c = curve;
    sctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    const skyLow = paintSky(c.yTop, c.yTop + c.drop + H * 0.14, -camA - 0.75);
    let planet = null;
    if (c.globe) {
      planet = globe.draw(buf, { w: W, h: H, sdpr: SDPR, dpr: DPR, yA: c.yA, yTop: c.yTop, R: c.R, K: c.K, a: c.a, Rs: c.Rs, Dk: c.Dk, hazeH: H * 0.26, vcx: VCX, vcy: VCY, sky: skyLow });
      if (!planet) { globe.canvas.hidden = fxCv.hidden = true; buildCurve(); sizeBuffers(); }   // WebGL went away: strips from the next frame
    }
    if (planet) {
      fxctx.setTransform(SDPR, 0, 0, SDPR, 0, 0);
      fxctx.clearRect(0, 0, W, H);
      WX.overlay(fxctx, W, H);
      if (grain) { fxctx.fillStyle = grain; fxctx.fillRect(0, 0, W, H); }
      drawFirstPersonHand(fxctx);
      return;
    }
    if (!c.globe) {
      for (const [v0, v1, f0, f1, s] of c.bands) {
        sctx.drawImage(buf, 0, f0 * DPR, buf.width, Math.max(0.5, (f1 - f0) * DPR), W / 2 - VCX * s, v0, VW * s, v1 - v0 + 0.6);
      }
      const haze = sctx.createLinearGradient(0, c.yTop, 0, c.yTop + H * 0.26);
      haze.addColorStop(0, rgba(skyLow, 1)); haze.addColorStop(0.2, rgba(skyLow, 0.55)); haze.addColorStop(1, rgba(skyLow, 0));
      sctx.fillStyle = haze; sctx.fillRect(0, c.yTop - 1, W, H * 0.26 + 1);
      sctx.fillStyle = 'rgba(255,255,255,0.35)'; sctx.fillRect(0, c.yTop - 1, W, 2);
    }
    WX.overlay(sctx, W, H);
    if (grain) { sctx.fillStyle = grain; sctx.fillRect(0, 0, W, H); }
    drawFirstPersonHand(sctx);
  }
  // first person: your tool, held low on the right, bobbing with your steps and swinging when you act
  function drawFirstPersonHand(g) {
    if (view !== 'first' || G.mode === 'title' || G.inCave) return;
    const p = G.player;
    const w = bestWeapon();
    const name = G.fishing ? 'toolRod' : p.swingT > 0 && p.swingTool ? { axe: 'toolAxe', pick: 'toolPick', sword: 'toolSword', gemSword: 'toolGemSword', inkBlade: 'toolInkBlade' }[p.swingTool] || 'toolHand'
      : w ? { sword: 'toolSword', gemSword: 'toolGemSword', inkBlade: 'toolInkBlade' }[w] : G.tools.axe ? 'toolAxe' : 'toolHand';
    const hPx = Math.min(W, H) * 0.34;
    const S = Math.max(1, Math.round((hPx / 34) * SDPR * 2) / 2);
    const spr = SW.bigSprite(name, S);
    if (!spr) return;
    const step = p.moving ? Math.sin(p.walkT * 9 * Math.PI / 2) : 0;
    const swing = p.swingT > 0 ? Math.sin((1 - p.swingT / 0.24) * Math.PI) : 0;
    const x = W * (touchMode() ? 0.44 : 0.8) + step * W * 0.012 - swing * W * 0.12, y = H + 6 + Math.abs(step) * H * 0.02 - swing * H * 0.05;
    g.save();
    g.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    g.translate(x, y); g.rotate(-0.35 - swing * 1.1 + step * 0.04);
    const sc = hPx / spr.h;
    g.drawImage(spr.img, -spr.ax * sc, -spr.ay * sc, spr.w * sc, spr.h * sc);
    g.restore();
  }
  function setView(v) {
    if (!VIEWS[v] || G.inCave) return;
    const was = view;
    view = v; TILT = VIEWS[v].tilt;
    if (globe) globe.canvas.hidden = fxCv.hidden = !!VIEWS[v].parallax || !curve.globe;
    if (VIEWS[v].parallax) { setAngle(0); px.cb = null; }
    SW.store.set('view', v);
    if (v === 'classic' && was !== 'classic') setAngle(SW.store.get('camA', 0));
    if (G && G.player) { const p = G.player; p.hd = Math.atan2(p.fy, p.fx); }
    Z = Zb * zoomMul * VIEWS[v].zoom;
    buildCurve(); rescale(); layoutHUD();
    toast(VIEWS[v].name + (v === 'classic' ? '.' : VIEWS[v].parallax ? '. Left and right walk along the hill, up and down climb it. Walk over the top to reach the next hill.' : '. Left and right turn, up and down walk. Press V to switch views.'), 4200);
  }
  const nextView = () => setView(VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length]);

  const clouds = [];
  for (let i = 0; i < 8; i++) clouds.push({ x: Math.random(), y: 0.15 + Math.random() * 0.6, s: 0.6 + Math.random() * 0.8, v: 0.004 + Math.random() * 0.006 });
  function drawClouds(yTop, d, overcast) {
    sctx.save();
    const dir = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle)) >= 0 ? 1 : -1;
    for (const cl of clouds) {
      cl.x = (cl.x + dir * cl.v * (0.3 + WX.wind) * 0.016 + 1.2) % 1.2;
      const x = (cl.x - 0.1) * W, y = cl.y * yTop, s = cl.s * Math.max(0.6, H / 900) * (1 + overcast * 0.6);
      sctx.globalAlpha = (1 - d * 0.75) * (0.85 + overcast * 0.15);
      sctx.beginPath();
      for (const [ox, oy, r] of [[-22, 4, 13], [0, -4, 18], [22, 3, 14], [8, 8, 12]]) { sctx.moveTo(x + (ox + r) * s, y + oy * s); sctx.arc(x + ox * s, y + oy * s, r * s, 0, TAU); }
      sctx.lineWidth = 6 * s; sctx.strokeStyle = 'rgba(59,47,79,0.18)'; sctx.stroke();
      sctx.fillStyle = overcast > 0.4 ? '#d7dde6' : '#ffffff'; sctx.fill();
    }
    sctx.restore();
  }

  // ---------------- hover ----------------
  function updateHover() {
    const fm = input.mouseX >= 0 ? screenToFlat(input.mouseX, input.mouseY) : null;
    if (G.mode !== 'play' || !fm || document.body.classList.contains('touch') || input.rotating) { G.hover = null; canvas.style.cursor = input.rotating ? 'grabbing' : ''; return; }
    const d = pick(fm.x, fm.y);
    if (!d) {
      const w = screenToWorld(fm.x, fm.y);
      const water = G.world.isWater(w.x, w.y);
      G.hover = water ? { label: canSail() && dist(G.player.x, G.player.y, w.x, w.y) > 170 ? 'Sail here' : G.tools.rod ? 'Fish here' : 'Water (needs a rod or raft)', lx: fm.x, ly: fm.y - 22 } : null;
      canvas.style.cursor = water && (G.tools.rod || G.tools.raft) ? 'pointer' : 'crosshair';
      return;
    }
    const spr = SW.sprites[d.spr];
    const top = d.sy - (spr.ay - 4) * Z * (d.sc || 1) - 10;
    let label = '';
    if (d.k === 7) label = 'Talk to ' + d.npc.name;
    else if (d.k === 6) label = 'Enter ' + d.cave.name;
    else if (d.k === 0) label = SW.objVerb(d.o.type) + ' ' + SW.OBJ_NAME[d.o.type];
    else if (d.k === 1) label = d.s.type === 'campfire' ? ((G.inv.wood || 0) > 0 && d.s.fuel < 150 ? 'Add wood to fire' : 'Campfire') : 'Stake Wall';
    else if (ENEMIES[d.m.type].passive) label = (d.m.type === 'snail' ? 'Catch ' : 'Hunt ') + ENEMIES[d.m.type].name;
    G.hover = { o: d.o, s: d.s, m: d.m, npc: d.npc, cave: d.cave, label, lx: d.sx, ly: d.k >= 6 ? d.sy - (spr.ay - 4) * Z * (d.ky || 1) - 10 : top };
    canvas.style.cursor = 'pointer';
  }

  // ---------------- HUD ----------------
  let hotbarDirty = true, craftDirty = true, questDirty = true;
  const hud = { hp: -1, food: -1, day: -1, xp: -1, region: '', weather: '', moon: '', energy: -1, raft: -1, windA: 999, windG: -1, cry: -1 };
  let craftCat = 'all';

  function bump(item) {
    const el = document.querySelector(`#hotbar [data-item="${item}"]`);
    if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function renderHotbar() {
    hotbarDirty = false;
    const bar = $('hotbar');
    const items = ORDER.filter((k) => G.inv[k] > 0);
    bar.innerHTML = items.map((k, i) => {
      const it = ITEMS[k];
      const usable = it.food || it.place;
      return `<button class="slot${usable ? ' usable' : ''}" data-item="${k}" title="${it.name}${usable ? (it.food ? ' (tap to eat)' : ' (tap to place)') : ''}">` +
        `<img src="${SW.spriteURL(it.icon)}" alt="${it.name}"><span class="count">${G.inv[k]}</span>` + (i < 9 ? `<kbd>${i + 1}</kbd>` : '') + `</button>`;
    }).join('');
    bar.hidden = items.length === 0;
  }
  function renderToolbelt() {
    const owned = Object.keys(TOOLS).filter((t) => G.tools[t]);
    const slotOf = (t) => (TOOLS[t].kind === 'weapon' ? (t === bestWeapon() ? 'weapon' : null) : TOOLS[t].kind === 'armor' ? 'armor' : t);
    $('toolbelt').innerHTML = owned.map((t) => {
      const sl = slotOf(t), n = sl ? modsOn(sl) : 0;
      return `<span class="tool" title="${TOOLS[t].name}${n ? ` (${n} mod${n > 1 ? 's' : ''})` : ''}"><img src="${SW.spriteURL(TOOLS[t].icon)}" alt="${TOOLS[t].name}">${n ? `<b>${n}</b>` : ''}</span>`;
    }).join('') + SW.RELICS.filter((r) => G.inv[r] > 0).map((r) => `<span class="tool relic" title="${ITEMS[r].name}: ${ITEMS[r].desc}"><img src="${SW.spriteURL(ITEMS[r].icon)}" alt="${ITEMS[r].name}"></span>`).join('');
    $('tFly').hidden = !G.tools.glider;
    $('energyRow').hidden = !G.tools.glider;
    $('raftRow').hidden = !G.tools.raft;
  }
  // why a recipe can't be made yet (know-how, relic, pages), or '' if it can
  function recipeLock(r) {
    if (r.learn && !G.known.has(r.id) && !G.known.has(r.learn)) return `Learn ${SW.KNOW[r.learn].name} from the elder of ${SW.KNOW[r.learn].from}.`;
    if (r.relic && !(G.inv[r.relic] > 0)) return `Needs the ${ITEMS[r.relic].name} from ${SW.CAVES.find((c) => c.relic === r.relic).name}.`;
    if (r.pages && (G.adv ? G.adv.next : 0) < r.pages) return `Needs all ${r.pages} Lost Pages.`;
    return '';
  }
  function winGame() {
    G.won = true;
    G.mobs = G.mobs.filter((m) => m.type !== 'scribble');
    setTimeout(() => banner('The Book is bound!', 'The Ink is gone. Every page, every sticker, home again.', '#8a63e8'), 600);
    SW.audio.play('dawn'); setTimeout(() => SW.audio.play('sting'), 900);
    gainXP(2000);
  }
  function renderMods() {
    const held = Object.keys(SW.MODS).filter((m) => G.inv[m] > 0);
    let html = '<div class="mods"><h3>Fit mods</h3>';
    if (!G.known.has('runecraft')) html += '<p class="talk-small">Learn Runecraft in Stonebrook to fit mods. Until then you can still collect and sell them.</p>';
    else if (!held.length) html += '<p class="talk-small">You have no mods. Find them in caves and chests, buy them from traders, or craft some below.</p>';
    for (const id of held) {
      const btns = SW.MODS[id].slots.map((slot) => {
        const ok = G.known.has('runecraft') && slotOwned(slot) && modsOn(slot) < SW.MOD_MAX;
        return `<button class="chip-btn" data-mod="${id}:${slot}" ${ok ? '' : 'disabled'}>${SW.MOD_SLOTS[slot]} ${modsOn(slot)}/${SW.MOD_MAX}</button>`;
      }).join('');
      html += `<div class="trow"><img src="${SW.spriteURL(ITEMS[id].icon)}" alt=""><span>${ITEMS[id].name} ×${G.inv[id]}<small>${SW.MODS[id].desc}</small></span><span class="modbtns">${btns}</span></div>`;
    }
    const fitted = Object.entries(G.mods).filter(([, v]) => v.length);
    if (fitted.length) html += '<p class="talk-small">Fitted: ' + fitted.map(([slot, v]) => `${SW.MOD_SLOTS[slot]} (${v.map((m) => ITEMS[m].name).join(', ')})`).join('; ') + '</p>';
    return html + '</div>';
  }
  function renderCraft() {
    craftDirty = false;
    const fire = nearFire(G.player.x, G.player.y);
    $('craftTabs').innerHTML = SW.RECIPE_CATS.map(([id, label]) => `<button data-cat="${id}" class="${id === craftCat ? 'on' : ''}">${label}</button>`).join('');
    $('craftList').innerHTML = (craftCat === 'mods' ? renderMods() : '') + RECIPES.filter((r) => craftCat === 'all' || r.cat === craftCat).map((r) => {
      const name = r.tool ? TOOLS[r.tool].name : ITEMS[r.gives].name;
      const icon = r.tool ? TOOLS[r.tool].icon : ITEMS[r.gives].icon;
      const owned = r.tool && G.tools[r.tool];
      const lock = recipeLock(r);
      const locked = (r.requires && !G.tools[r.requires]) || !!lock;
      const afford = hasCost(r.cost) && (!r.fire || fire) && !locked;
      const cost = Object.entries(r.cost).map(([k, n]) => {
        const ok = (G.inv[k] || 0) >= n;
        return `<span class="cost${ok ? '' : ' short'}"><img src="${SW.spriteURL(ITEMS[k].icon)}" alt="${ITEMS[k].name}">${G.inv[k] || 0}/${n}</span>`;
      }).join('');
      const note = owned ? '<span class="tag">Owned</span>' : lock ? `<span class="tag lock">${lock}</span>` : locked ? `<span class="tag">Needs ${TOOLS[r.requires].name}</span>` : r.fire && !fire ? '<span class="tag">Needs a lit fire nearby</span>' : '';
      return `<div class="recipe${owned ? ' owned' : ''}${afford && !owned ? ' ready' : ''}${lock ? ' locked' : ''}">` +
        `<img class="ricon" src="${SW.spriteURL(icon)}" alt="">` +
        `<div class="rbody"><h3>${name}</h3><p>${r.desc}</p><div class="costs">${cost}${note}</div></div>` +
        `<button class="craft-go" data-recipe="${r.id}" ${afford && !owned ? '' : 'disabled'}>${owned ? 'Done' : 'Craft'}</button></div>`;
    }).join('');
  }
  function toggleCraft(force) {
    const panel = $('craftPanel');
    const open = force !== undefined ? force : panel.hidden;
    if (open && G.mode !== 'play') return;
    panel.hidden = !open;
    if (open) renderCraft();
  }
  function compass(dx, dy) {
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    return dirs[((Math.round(a / 45) % 8) + 8) % 8];
  }
  let questT = 0;
  // the quest you picked for the sunflower radar gets a sunflower in the list
  const pickCls = (k) => (G.radarPick === k ? ' picked' : '');
  const pickIcon = (k) => (G.radarPick === k ? `<img class="qsun" src="${SW.spriteURL('sunflower')}" alt="Radar">` : '');
  function pickQuest(k) {
    G.radarPick = G.radarPick === k ? null : k;
    questDirty = true; radar.scanT = 0;
    toast(G.radarPick ? 'The sunflower petals now point there.' : 'The petals follow Star again.', 1800);
  }
  function renderQuests(dt) {
    questT -= dt;
    if (!questDirty && questT > 0) return;
    questDirty = false; questT = 0.5;
    const p = G.player, rows = [];
    const adv = G.adv;
    if (adv) {
      const page = adv.pages[adv.next];
      if (page) {
        const d = dist(p.x, p.y, page.x, page.y);
        rows.push(`<li class="adv${pickCls('page')}" data-pick="page"><span class="qt">${pickIcon('page')}Lost Page ${adv.next + 1}/6</span><span class="qp">${(d / 1000).toFixed(1)} km ${compass(page.x - p.x, page.y - p.y)}</span><i style="width:${(adv.next / 6) * 100}%"></i></li>`);
      } else rows.push('<li class="adv done"><span class="qt">The Book is whole</span><span class="qp">6/6</span><i style="width:100%"></i></li>');
      adv.treasures.forEach((t, i) => { if (t.dug) return; const d = dist(p.x, p.y, t.x, t.y); rows.push(`<li class="adv${pickCls('tr:' + i)}" data-pick="tr:${i}"><span class="qt">${pickIcon('tr:' + i)}Treasure map</span><span class="qp">${(d / 1000).toFixed(1)} km ${compass(t.x - p.x, t.y - p.y)}</span><i style="width:0"></i></li>`); });
    }
    for (const t of SW.TRIBES) for (const q of t.quests) {
      const st = G.tq[q.id];
      if (!st || st.state === 'done') continue;
      const ready = questReady(q);
      rows.push(`<li class="tribe${ready ? ' done' : ''}${pickCls('tq:' + q.id)}" data-pick="tq:${q.id}"><span class="qt">${pickIcon('tq:' + q.id)}${t.name}: ${q.title}</span><span class="qp">${ready ? 'hand in' : questProgress(q)}</span><i style="width:${ready ? 100 : 0}%"></i></li>`);
    }
    for (const q of G.quests) {
      let prog = `${q.have}/${q.need}`;
      if (q.kind === 'explore') { const d = dist(p.x, p.y, q.tx, q.ty); prog = q.done ? 'Found!' : `${(d / 1000).toFixed(1)} km ${compass(q.tx - p.x, q.ty - p.y)}`; }
      const pct = q.kind === 'explore' ? (q.done ? 100 : 0) : Math.round((q.have / q.need) * 100);
      const pk = q.done ? '' : ` data-pick="q:${q.id}"`;
      rows.push(`<li class="${q.done ? 'done' : ''}${q.done ? '' : pickCls('q:' + q.id)}"${pk}><span class="qt">${q.done ? '' : pickIcon('q:' + q.id)}${q.title}</span><span class="qp">${prog}</span><i style="width:${pct}%"></i></li>`);
    }
    $('quests').innerHTML = rows.join('');
    $('questCount').textContent = rows.length;
  }

  let miniT = 0, miniX = 1e9, miniY = 1e9, miniImg = null;
  function renderMinimap(dt) {
    miniT -= dt;
    if (miniT > 0) return;
    miniT = 0.2;
    const cv = $('minimap');
    const g = cv.getContext('2d');
    const N = 64, S = 16;
    const p = G.player;
    if (!miniImg || dist(p.x, p.y, miniX, miniY) > 32) {
      miniX = p.x; miniY = p.y;
      miniImg = g.createImageData(N, N);
      const d = miniImg.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const col = SW.MAP_COLOR[G.world.biomeAt(p.x + (i - N / 2) * S, p.y + (j - N / 2) * S)];
        const o = (j * N + i) * 4;
        d[o] = parseInt(col.substr(1, 2), 16); d[o + 1] = parseInt(col.substr(3, 2), 16); d[o + 2] = parseInt(col.substr(5, 2), 16); d[o + 3] = 255;
      }
    }
    g.putImageData(miniImg, 0, 0);
    const toM = (x, y) => [N / 2 + (x - miniX) / S, N / 2 + (y - miniY) / S];
    for (const s of G.world.structures) {
      if (s.type !== 'campfire') continue;
      const [mx, my] = toM(s.x, s.y);
      g.fillStyle = s.fuel > 0 ? '#ff7a2a' : '#5b4840'; g.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    for (const m of G.mobs) {
      if (m.dying || ENEMIES[m.type].passive) continue;
      const [mx, my] = toM(m.x, m.y);
      g.fillStyle = m.type === 'scribble' ? '#2b2340' : '#d6304f'; g.fillRect(mx - 1, my - 1, 2.5, 2.5);
    }
    if (G.adv) { const page = G.adv.pages[G.adv.next]; if (page) { const [mx, my] = toM(page.x, page.y); if (mx > 0 && mx < N && my > 0 && my < N) { g.fillStyle = '#e0a400'; g.fillRect(mx - 2, my - 2, 4, 4); } } }
    const [px, py] = toM(p.x, p.y);
    // the direction you are looking
    const up = -Math.PI / 2 + camA;
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.moveTo(px, py); g.arc(px, py, 14, up - 0.5, up + 0.5); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(px - 2.5, py - 2.5, 5, 5);
    g.fillStyle = '#ff4d6d'; g.fillRect(px - 1.5, py - 1.5, 3, 3);
  }

  function renderDial() {
    const cv = $('dial');
    const g = cv.getContext('2d');
    const s = cv.width, r = s / 2 - 3;
    g.clearRect(0, 0, s, s);
    g.save(); g.translate(s / 2, s / 2);
    const start = -Math.PI / 2;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, start, start + TAU * 0.62); g.closePath(); g.fillStyle = '#8fd3ff'; g.fill();
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, start + TAU * 0.62, start + TAU); g.closePath(); g.fillStyle = '#2d2a6e'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#3b2f4f'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    const a = start + TAU * phaseOf(G.time);
    g.lineCap = 'round'; g.lineWidth = 3.4; g.strokeStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); g.stroke();
    g.lineWidth = 1.6; g.strokeStyle = '#3b2f4f';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); g.stroke();
    g.restore();
    const m = moonNow();
    SW.drawMoon(g, s / 2, s / 2, s * 0.17, m.phase, m.ink);
  }

  function updateHUD(dt) {
    const p = G.player;
    const hp = Math.max(0, Math.round(p.hp)), food = Math.round(p.hunger);
    if (hp !== hud.hp) { hud.hp = hp; $('hpBar').style.width = (hp / p.maxHp) * 100 + '%'; $('hpNum').textContent = hp; $('hpStat').classList.toggle('low', hp < p.maxHp * 0.3); }
    if (food !== hud.food) { hud.food = food; $('foodBar').style.width = food + '%'; $('foodNum').textContent = food; $('foodStat').classList.toggle('low', food < 25); }
    const xpk = p.level * 100000 + p.xp;
    if (xpk !== hud.xp) { hud.xp = xpk; $('lvlNum').textContent = p.level; $('xpBar').style.width = Math.min(100, (p.xp / SW.xpToNext(p.level)) * 100) + '%'; $('xpNum').textContent = `${Math.floor(p.xp)}/${SW.xpToNext(p.level)}`; }
    const en = Math.round((p.flying ? p.alt / ALT_MAX : 1 - p.leafWet) * 100) + (p.flying ? 1000 : 0);
    if (en !== hud.energy) {
      hud.energy = en; $('energyBar').style.width = (en % 1000) + '%';
      $('energyRow').classList.toggle('air', p.flying); $('energyRow').classList.toggle('soggy', !p.flying && p.leafWet > LEAF_SOGGY);
    }
    const cr = G.ene ? Math.round(G.ene.cry * 100) : 0;
    if (cr !== hud.cry) {
      hud.cry = cr; $('cryBar').style.width = cr + '%';
      const ready = cr >= 100;
      $('cryRow').classList.toggle('ready', ready); $('tCry').classList.toggle('ready', ready);
      $('tCry').hidden = !ready && !touchMode() ? true : !ready;
    }
    const rw = Math.round((1 - p.raftWet) * 100);
    if (rw !== hud.raft) { hud.raft = rw; $('raftBar').style.width = rw + '%'; $('raftRow').classList.toggle('soggy', p.raftWet > 0.75 || (!p.boat && p.raftWet >= RAFT_SOGGY)); }
    // wind arrow: which way the air is going on screen, and how hard here
    const wsx = screenDX(Math.cos(WX.windAngle), Math.sin(WX.windAngle)), wsy = (-Math.cos(WX.windAngle) * sinA + Math.sin(WX.windAngle) * cosA) * TILT;
    const wa = Math.round(Math.atan2(wsy, wsx) * 180 / Math.PI), wg = Math.round(WX.here.gust * 10);
    if (wa !== hud.windA || wg !== hud.windG) {
      hud.windA = wa; hud.windG = wg;
      const el = $('windArrow');
      el.style.transform = `rotate(${wa}deg) scale(${0.75 + Math.min(1, WX.here.gust) * 0.45})`;
      el.style.opacity = String(0.45 + Math.min(1, WX.here.gust) * 0.55);
      el.parentElement.title = `Wind ${WX.here.gust > 0.9 ? 'gusting hard' : WX.here.gust > 0.45 ? 'gusty' : WX.here.gust > 0.15 ? 'light' : 'calm'}`;
    }
    const day = dayOf(G.time);
    if (day !== hud.day) { hud.day = day; $('dayNum').textContent = day; }
    const night = isNight(phaseOf(G.time)), moon = moonNow();
    const ml = night ? moon.name : 'Day';
    if (hud.moon !== ml) { hud.moon = ml; $('dayLabel').textContent = ml; }
    const wn = WX.name();
    if (hud.weather !== wn) { hud.weather = wn; $('weatherName').textContent = wn; $('weatherIcon').dataset.kind = WX.current(); }
    if (G.region && hud.region !== G.region.id) {
      hud.region = G.region.id;
      $('regionName').textContent = G.region.name;
      const dg = $('regionDanger');
      dg.textContent = 'Danger ' + G.region.danger;
      dg.className = G.region.danger > p.level + 2 ? 'hot' : G.region.danger > p.level ? 'warm' : '';
    }
    $('compassNeedle').style.transform = `rotate(${-camA}rad)`;
    if (hotbarDirty) renderHotbar();
    if (!$('craftPanel').hidden) {
      const nf = !!nearFire(p.x, p.y);
      if (nf !== renderCraft.nf) { renderCraft.nf = nf; craftDirty = true; }
      if (craftDirty) renderCraft();
    }
    renderQuests(dt);
    renderDial();
    renderMinimap(dt);
    const useLbl = G.inCave ? caves.hint() || 'Use' : G.fishing ? (G.fishing.phase === 'bite' ? 'Reel!' : 'Reel') : 'Use';
    $('tFly').hidden = !(G.inCave || G.tools.glider);
    const flyLbl = G.inCave ? 'Jump' : 'Glide';
    if ($('tFlyLbl') && $('tFlyLbl').textContent !== flyLbl) $('tFlyLbl').textContent = flyLbl;
    if ($('tActLbl').textContent !== useLbl) $('tActLbl').textContent = useLbl;
    $('tAct').classList.toggle('bite', !!(G.fishing && G.fishing.phase === 'bite'));
    $('tFly').classList.toggle('on', p.flying);
  }

  // Keep tips and banners off the character: use the gap between the top
  // HUD clusters if it is wide enough, else the band just below them, else
  // the strip above the hotbar. Never the character's box.
  function layoutHUD() {
    const tl = $('hudTL'), tr = $('hudTR');
    if (!tl || !tr || $('hud').hidden) return;
    const a = tl.getBoundingClientRect(), b = tr.getBoundingClientRect();
    const charTop = curve.yA - 130 * Z, charBottom = curve.yA + 12;
    const gapL = a.right + 10, gapR = b.left - 10;
    const hot = $('hotbarWrap').getBoundingClientRect();
    let top, left, width, mode;
    const bn = $('banner'), bh = (banner.until || 0) > performance.now() ? bn.offsetHeight + 6 : 0;
    const below = Math.max(a.bottom, b.bottom) + 8;
    if (gapR - gapL >= 230) { top = 10; left = gapL; width = gapR - gapL; mode = 'gap'; }
    else if (below + 50 + bh < charTop) { top = below; left = 12; width = W - 24; mode = 'below'; }
    else { top = Math.max(charBottom + 6, (hot.top || H) - 56); left = 12; width = W - 24; mode = 'bottom'; }
    // the cave's rune pill: between the top corners if there's room, else above the hotbar on the left
    if (gapR - gapL >= 200) { caveHud.x = (gapL + gapR) / 2; caveHud.y = mode === 'gap' ? 18 : 18; }
    else { caveHud.x = Math.max(70, (hot.left || 12) + 70); caveHud.y = (hot.top || H) - 44; }
    // while a banner is up, the tip sits just under it (or just over it at the bottom)
    const tops = mode === 'bottom' ? { banner: top - bh, toast: top } : { banner: top, toast: top + bh };
    for (const id of ['toast', 'banner']) {
      const el = $(id);
      el.style.top = tops[id] + 'px'; el.style.left = left + 'px'; el.style.width = width + 'px';
      el.dataset.place = mode;
    }
  }

  // ---------------- world map ----------------
  const MAP_N = 240;
  function mapExtent() { return SW.ISLAND_R * 1.25; }
  function renderWorldMap() {
    const cv = $('worldMap');
    const g = cv.getContext('2d');
    if (!G.worldMap) G.worldMap = { img: g.createImageData(MAP_N, MAP_N), row: 0 };
    const wm = G.worldMap, E = mapExtent(), S = (E * 2) / MAP_N;
    const until = Math.min(MAP_N, wm.row + 16);
    for (; wm.row < until; wm.row++) {
      const j = wm.row;
      for (let i = 0; i < MAP_N; i++) {
        const col = SW.MAP_COLOR[G.world.biomeAt(-E + (i + 0.5) * S, -E + (j + 0.5) * S)];
        const o = (j * MAP_N + i) * 4, d = wm.img.data;
        d[o] = parseInt(col.substr(1, 2), 16); d[o + 1] = parseInt(col.substr(3, 2), 16); d[o + 2] = parseInt(col.substr(5, 2), 16); d[o + 3] = 255;
      }
    }
    const off = renderWorldMap.off || (renderWorldMap.off = document.createElement('canvas'));
    off.width = off.height = MAP_N;
    off.getContext('2d').putImageData(wm.img, 0, 0);
    const size = cv.width;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, size, size);
    g.drawImage(off, 0, 0, size, size);
    const toM = (x, y) => [((x + E) / (E * 2)) * size, ((y + E) / (E * 2)) * size];
    const [sx0, sy0] = toM(G.world.spawn.x, G.world.spawn.y);
    g.font = '800 12px Sniglet, system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    // zone rings: open ones dashed, locked ones in red with the level you need
    const mz = maxZone();
    SW.ZONE_R.forEach((R0, i) => {
      const r = (R0 / (E * 2)) * size, z = ZONES[i + 1], locked = i + 1 > mz;
      g.setLineDash([]); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(sx0, sy0, r, 0, TAU); g.stroke();
      g.setLineDash(locked ? [] : [6, 6]); g.lineWidth = locked ? 3 : 2; g.strokeStyle = locked ? 'rgba(91,79,120,0.95)' : 'rgba(59,47,79,0.6)'; g.stroke();
      const label = z.name + (locked ? ' · Lv ' + z.level : '');
      g.setLineDash([]); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(label, sx0, sy0 - r - 4);
      g.fillStyle = locked ? '#5b4f78' : '#3b2f4f'; g.fillText(label, sx0, sy0 - r - 4);
    });
    if (G.realm) {
      for (const t of G.realm.tribes) {
        const [x, y] = toM(t.x, t.y), met = (G.metTribes || []).includes(t.id);
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x - 9, y + 6); g.lineTo(x - 9, y - 2); g.lineTo(x, y - 10); g.lineTo(x + 9, y - 2); g.lineTo(x + 9, y + 6); g.closePath(); g.fill();
        g.fillStyle = t.color; g.beginPath(); g.moveTo(x - 6, y + 4); g.lineTo(x - 6, y - 1); g.lineTo(x, y - 7); g.lineTo(x + 6, y - 1); g.lineTo(x + 6, y + 4); g.closePath(); g.fill();
        if (met || t.zone <= mz) { g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(t.name, x, y + 18); g.fillStyle = '#3b2f4f'; g.fillText(t.name, x, y + 18); }
      }
      for (const c of G.realm.caves) {
        const [x, y] = toM(c.x, c.y), done = caveSave(c.id).taken;
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x - 10, y + 6); g.lineTo(x, y - 9); g.lineTo(x + 10, y + 6); g.closePath(); g.fill();
        g.fillStyle = done ? '#6bbf4a' : '#5a5e70'; g.beginPath(); g.moveTo(x - 7, y + 4); g.lineTo(x, y - 6); g.lineTo(x + 7, y + 4); g.closePath(); g.fill();
        g.fillStyle = '#16121f'; g.beginPath(); g.arc(x, y + 4, 2.5, Math.PI, 0); g.fill();
      }
    }
    for (const s of G.world.structures) {
      if (s.type !== 'campfire') continue;
      const [x, y] = toM(s.x, s.y);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
      g.fillStyle = s.fuel > 0 ? '#ff7a2a' : '#8a6a50'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
    }
    for (const q of G.quests) {
      if (q.kind !== 'explore' || q.done) continue;
      const [x, y] = toM(q.tx, q.ty);
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#3b2f4f'; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 4 : 9; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
    }
    if (G.adv) {
      const page = G.adv.pages[G.adv.next];
      if (page) {
        const [x, y] = toM(page.x, page.y);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fill();
        g.fillStyle = '#e0a400'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText('?', x, y + 1); g.textBaseline = 'alphabetic';
      }
      for (const t of G.adv.treasures) {
        if (t.dug) continue;
        const [x, y] = toM(t.x, t.y);
        g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke();
        g.lineWidth = 3; g.strokeStyle = '#ff4d6d'; g.stroke();
      }
    }
    const p = G.player, [px, py] = toM(p.x, p.y);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 7, 0, TAU); g.fill();
    g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(px, py, 4.5, 0, TAU); g.fill();
    if (wm.row < MAP_N) { g.fillStyle = 'rgba(255,250,240,0.85)'; g.fillRect(0, (wm.row / MAP_N) * size, size, size); }
  }
  function toggleMap(force) {
    if (G.mode !== 'play' && G.mode !== 'paused') return;
    const open = force !== undefined ? force : $('mapScreen').hidden;
    $('mapScreen').hidden = !open;
    if (open) {
      const r = G.region;
      $('mapInfo').textContent = `${G.regionsSeen.size} regions discovered${r ? ' · You are in ' + r.name + ', danger ' + r.danger : ''} · ${G.adv ? G.adv.next : 0}/6 Lost Pages`;
    }
  }
  function mapClick(e) {
    const cv = $('worldMap');
    const rect = cv.getBoundingClientRect();
    const E = mapExtent();
    const wx = ((e.clientX - rect.left) / rect.width) * E * 2 - E, wy = ((e.clientY - rect.top) / rect.height) * E * 2 - E;
    let best = null, bd = ((E * 2) / rect.width) * 14;
    for (const s of G.world.structures) if (s.type === 'campfire') { const d = dist(s.x, s.y, wx, wy); if (d < bd) { bd = d; best = s; } }
    if (!best) { toast('Tap one of your campfires on the map to travel there.'); return; }
    if (G.mode !== 'play') { toast('Resume the game to travel.'); return; }
    const p = G.player;
    if (G.mobs.some((m) => !m.dying && !ENEMIES[m.type].passive && m.state === 'chase' && dist(m.x, m.y, p.x, p.y) < 300)) { toast('You cannot travel while something is chasing you.'); SW.audio.play('deny'); return; }
    if (p.hunger < 10) { toast('Too hungry to travel. Eat something first.'); return; }
    spawnPoof(p.x, p.y, p.lvlOff, '#ffd23f');
    p.x = best.x; p.y = best.y + 34; p.vx = p.vy = 0; p.hunger -= 8; p.flying = false; p.alt = 0;
    G.order = null; G.fishing = null;
    G.mobs = G.mobs.filter((m) => dist(m.x, m.y, p.x, p.y) < 1500);
    G.cam.x = p.x; G.cam.y = p.y;
    prebuild();
    toggleMap(false);
    spawnPoof(p.x, p.y, p.lvlOff, '#ffd23f');
    SW.audio.play('craft');
    toast('Travelled to your campfire. (-8 food)');
  }

  // ---------------- save / load ----------------
  const typeCache = new Map();
  function idType(id) {
    if (typeCache.has(id)) return typeCache.get(id);
    const [gx, gy] = id.split(',').map(Number);
    const n = CHUNK / 32;
    const ch = G.world.getChunk(Math.floor(gx / n), Math.floor(gy / n));
    const o = ch.objs.find((o) => o.id === id);
    const t = o ? o.type : null;
    typeCache.set(id, t);
    return t;
  }
  function serialize() {
    const p = G.player, now = G.time;
    const removed = [];
    for (const [id, t] of G.world.removed) {
      const type = idType(id);
      const def = type && OBJ[type];
      if (def && def.regrow && now - t > def.regrow) continue;
      removed.push([id, Math.round(t)]);
    }
    return {
      v: 4, game: 'stickerwild', seed: G.seed, seedText: G.seedText, density: G.density, time: Math.round(now * 10) / 10, savedAt: Date.now(),
      player: { x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), maxHp: p.maxHp, hunger: Math.round(p.hunger), level: p.level, xp: p.xp, energy: p.energy, leafWet: +p.leafWet.toFixed(3), raftWet: +p.raftWet.toFixed(3) },
      inv: G.inv, tools: G.tools, stats: G.stats, tips: G.tips,
      quests: G.quests.filter((q) => !q.done), questSeq: G.questSeq, regionsSeen: [...G.regionsSeen],
      adv: G.adv, removed, damage: [...G.world.damage],
      structures: G.world.structures.map((s) => ({ ...s, fuel: Math.round(s.fuel) })), nextId: G.world.nextId,
      eneCry: G.ene ? +G.ene.cry.toFixed(2) : 0,
      known: [...G.known], mods: G.mods, caves: G.caves, tq: G.tq, zonesSeen: G.zonesSeen, metTribes: G.metTribes || [], won: G.won,
      radarPick: G.radarPick || null,
    };
  }
  function validSave(s) { return !!(s && typeof s === 'object' && typeof s.seed === 'number' && s.player && typeof s.player.x === 'number'); }
  function restore(s) {
    if (!validSave(s)) { toast('That is not a Stickerwild save.'); return false; }
    typeCache.clear();
    newGame(s.seed, 'play', s.seedText, s.density || 1);
    G.time = s.time || 0;
    Object.assign(G.player, s.player);
    G.player.maxHp = s.player.maxHp || 100; G.player.level = s.player.level || 1; G.player.xp = s.player.xp || 0; G.player.energy = s.player.energy ?? 1; G.player.leafWet = s.player.leafWet || 0; G.player.raftWet = s.player.raftWet || 0;
    G.inv = s.inv || {}; G.tools = s.tools || {}; G.stats = Object.assign(G.stats, s.stats || {}); G.tips = s.tips || {};
    G.world.removed = new Map(s.removed || []); G.world.damage = new Map(s.damage || []);
    G.world.structures = s.structures || []; G.world.nextId = s.nextId || 1;
    G.regionsSeen = new Set(s.regionsSeen || []);
    G.questSeq = s.questSeq || G.questSeq;
    if (s.quests && s.quests.length) { G.quests = s.quests; while (G.quests.length < 3) addQuest(); }
    if (s.adv && s.adv.pages) G.adv = s.adv;
    G.radarPick = s.radarPick || null;
    // v4: know-how, mods, caves, tribe quests. Older saves keep what they already made.
    G.known = new Set([...STARTER_KNOWN(), ...(s.known || [])]);
    if (!s.known) for (const r of RECIPES) if (r.tool && G.tools[r.tool]) { G.known.add(r.id); if (r.learn) G.known.add(r.learn); }
    if (G.ene) G.ene.cry = s.eneCry ?? 0.35;
    if (G.star) { G.star.x = G.player.x + 30; G.star.y = G.player.y; }
    G.mods = s.mods || {}; G.caves = s.caves || {}; G.tq = s.tq || {}; G.zonesSeen = s.zonesSeen || [0]; G.metTribes = s.metTribes || []; G.won = !!s.won;
    // a save made in a zone you can't reach yet (older, smaller islands) puts you back at the line
    if (zoneOf(G.player.x, G.player.y) > maxZone()) { const sp = G.world.spawn; G.player.x = sp.x; G.player.y = sp.y; }
    lastZone = zoneOf(G.player.x, G.player.y);
    G.cam.x = G.player.x; G.cam.y = G.player.y;
    G.lastPhaseNight = isNight(phaseOf(G.time));
    hotbarDirty = craftDirty = questDirty = true;
    hud.hp = hud.food = hud.day = hud.xp = hud.energy = hud.raft = hud.windG = hud.cry = -1; hud.region = '';
    setAngle(SW.store.get('camA', 0));
    renderToolbelt();
    prebuild();
    showScreen(null);
    return true;
  }
  function saveName() { return `stickerwild-${String(G.seedText || G.seed).replace(/[^a-z0-9-]+/gi, '-')}-lv${G.player.level}-day${dayOf(G.time)}.json`; }

  // ---------------- screens ----------------
  function showScreen(id) {
    for (const s of ['titleScreen', 'deathScreen', 'pauseScreen', 'savePanel']) $(s).hidden = s !== id;
    $('hud').hidden = id === 'titleScreen' || (id === 'savePanel' && G.mode === 'title');
    if (id) { toggleCraft(false); $('mapScreen').hidden = true; }
    requestAnimationFrame(layoutHUD);
  }
  function startGame(seed, seedText, density) {
    SW.audio.unlock();
    newGame(seed, 'play', seedText, density);
    setAngle(SW.store.get('camA', 0));
    renderToolbelt();
    showScreen(null);
    hud.hp = hud.food = hud.day = hud.xp = hud.energy = hud.raft = hud.windG = hud.cry = -1; hud.region = '';
    const touch = document.body.classList.contains('touch');
    toast(touch ? 'Tap to walk or act. Two fingers: twist to turn the view, pinch to zoom.' : 'Click to walk or act. Q/E or right-drag turns the view.', 5600);
    setTimeout(() => G && G.mode === 'play' && banner('Day 1', 'Find the six Lost Pages.'), 300);
    wakeLock();
  }
  function goTitle() {
    newGame(Math.floor(Math.random() * 999999), 'title');
    showScreen('titleScreen');
    $('seedInput').value = randomSeedWord();
    const save = SW.store.get('save', null);
    $('continueBtn').hidden = !validSave(save);
    if (validSave(save)) $('continueBtn').querySelector('span').textContent = `Continue · Lv ${save.player.level || 1} · Day ${dayOf(save.time)}`;
    SW.saves && SW.saves.refreshTitle();
  }
  const WORDS_A = ['mossy', 'tangy', 'sunny', 'fizzy', 'sleepy', 'brave', 'lucky', 'crispy', 'foggy', 'jolly', 'misty', 'peachy'];
  const WORDS_B = ['cove', 'atoll', 'reef', 'isle', 'bay', 'grove', 'dune', 'peak', 'lagoon', 'key', 'shoal', 'bluff'];
  function randomSeedWord() { return WORDS_A[Math.floor(Math.random() * WORDS_A.length)] + '-' + WORDS_B[Math.floor(Math.random() * WORDS_B.length)] + '-' + Math.floor(Math.random() * 90 + 10); }
  function pause(on) {
    if (on && G.mode === 'play') {
      G.mode = 'paused'; showScreen('pauseScreen');
      SW.store.set('save', serialize());
      $('pauseInfo').textContent = `Level ${G.player.level} · Day ${dayOf(G.time)} · ${G.adv ? G.adv.next : 0}/6 Lost Pages · Seed ${G.seedText}`;
    } else if (!on && G.mode === 'paused') { G.mode = 'play'; showScreen(null); last = performance.now(); }
  }

  // ---------------- extra tech: wake lock, fullscreen, gamepad, adaptive resolution ----------------
  let lock = null;
  async function wakeLock() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { lock = null; } }
  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is not available here.'));
    } catch (e) { toast('Fullscreen is not available here.'); }
  }
  const pad = { prev: [], was: false };
  function pollGamepad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!gp) { if (pad.was) { input.x = input.y = 0; input.spin = 0; pad.was = false; } return; }
    pad.was = true;
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i) => btn(i) && !pad.prev[i];
    input.x = dz(gp.axes[0] || 0); input.y = dz(gp.axes[1] || 0);
    input.spin = dz(gp.axes[2] || 0) + (btn(5) ? 1 : 0) - (btn(4) ? 1 : 0);
    input.act = btn(0) || input.actTouch;
    if (G.inCave) { if (edge(0)) input.jumpEdge = true; if (edge(2) || edge(5)) input.useEdge = true; }
    if (edge(0) && G.fishing) reel();
    if (edge(1)) eatBest();
    if (edge(2)) toggleCraft();
    if (edge(3)) toggleMap();
    if (edge(9)) pause(G.mode === 'play');
    if (edge(7)) toggleFly();
    pad.prev = gp.buttons.map((b) => b.pressed);
  }
  // adaptive resolution: render the world at lower resolution when frames run slow,
  // and back up when there is headroom
  const perf = { acc: 0, n: 0, cool: 3 };
  function adaptRes(dt) {
    perf.acc += dt; perf.n++; perf.cool -= dt;
    if (perf.acc < 2) return;
    const fps = perf.n / perf.acc; perf.acc = 0; perf.n = 0;
    if (perf.cool > 0) return;
    let next = DPR;
    if (fps < 40 && DPR > 0.75) next = Math.max(0.75, DPR - 0.2);
    else if (fps > 57 && DPR < maxDPR) next = Math.min(maxDPR, DPR + 0.1);
    if (next !== DPR) { DPR = next; perf.cool = 6; rescale(); }
  }

  // ---------------- input ----------------
  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) { if (e.code === 'Enter' && e.target.id === 'seedInput') $('startBtn').click(); return; }
      SW.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (G.talking && e.code === 'Escape') { closeTalk(); return; }
      if (G.inCave && G.mode === 'play') {
        if (e.code === 'Space' || e.code === 'KeyK') input.jumpEdge = true;
        if (e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'Enter') input.useEdge = true;
        if (e.code === 'KeyF') eatBest();
        if (e.code === 'KeyR') rainbowCry();
        if (e.code === 'KeyC' || e.code === 'Tab') toggleCraft();
        if (e.code === 'KeyL') toggleQuests();
        if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
        return;
      }
      if (G.mode === 'play') {
        if (e.code === 'Space' && G.fishing) reel();
        if (e.code === 'KeyC' || e.code === 'Tab') toggleCraft();
        else if (e.code === 'KeyF') eatBest();
        else if (e.code === 'KeyM') toggleMap();
        else if (e.code === 'KeyL') toggleQuests();
        else if (e.code === 'KeyG') toggleFly();
        else if (e.code === 'KeyN') camGoal = 0;
        else if (e.code === 'KeyV') nextView();
        else if (e.code === 'KeyR') rainbowCry();
        else if (/^Digit[1-9]$/.test(e.code)) {
          const items = ORDER.filter((k) => G.inv[k] > 0);
          const it = items[+e.code.slice(5) - 1];
          if (it) useItem(it);
        }
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(zoomMul * 1.12);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(zoomMul / 1.12);
      if (e.code === 'Escape') {
        if (!$('mapScreen').hidden) toggleMap(false);
        else if (!$('craftPanel').hidden) toggleCraft(false);
        else if (!$('savePanel').hidden) closeSavePanel();
        else if (G.mode === 'play') pause(true);
        else if (G.mode === 'paused') pause(false);
      }
      if (e.code === 'KeyP') { if (G.mode === 'play') pause(true); else if (G.mode === 'paused') pause(false); }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); input.act = false; input.holdMove = false; input.rotating = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G && G.mode === 'play') pause(true);
      if (!document.hidden && G && G.mode !== 'title') wakeLock();
    });

    // a pointer's position in the game's own screen units, measured against where the
    // canvas really is on screen (so a stale size or a shifted page can't offset it)
    const toGame = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return [r.width ? (cx - r.left) * W / r.width : cx, r.height ? (cy - r.top) * H / r.height : cy];
    };
    canvas.addEventListener('mousedown', (e) => {
      if (G.mode !== 'play') return;
      SW.audio.unlock();
      if (G.inCave) { if (e.button === 0) input.useEdge = true; return; }
      if (e.button === 2 || e.button === 1) { input.rotating = true; input.rotX = e.clientX; e.preventDefault(); return; }
      if (e.button !== 0) return;
      [input.mouseX, input.mouseY] = toGame(e.clientX, e.clientY);
      const o = pointerOrder(input.mouseX, input.mouseY);
      input.holdMove = !!(o && o.kind === 'move');
    });
    canvas.addEventListener('mousemove', (e) => {
      [input.mouseX, input.mouseY] = toGame(e.clientX, e.clientY);
      if (input.rotating) { setAngle(camA + (e.clientX - input.rotX) * 0.008); input.rotX = e.clientX; camGoal = null; saveAngle(); }
    });
    canvas.addEventListener('mouseleave', () => { input.mouseX = -1; input.holdMove = false; });
    window.addEventListener('mouseup', () => {
      if (input.holdMove && G.order && G.order.kind === 'move') G.marker = { x: G.order.x, y: G.order.y, t: 0, lvl: G.world.levelAt(G.order.x, G.order.y) };
      input.holdMove = false; input.act = false; input.rotating = false;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomMul * (e.deltaY > 0 ? 0.92 : 1.08)); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    $('hotbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      const it = b.dataset.item;
      if (ITEMS[it].food || ITEMS[it].place) useItem(it);
      else toast(ITEMS[it].name + ' is a crafting material. Open Craft to use it.');
    });
    $('craftList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-recipe]');
      if (b) craft(RECIPES.find((r) => r.id === b.dataset.recipe));
      const m = e.target.closest('[data-mod]');
      if (m) { const [id, slot] = m.dataset.mod.split(':'); fitMod(id, slot); renderCraft(); }
    });
    $('talkActions').addEventListener('click', (e) => { const b = e.target.closest('[data-talk]'); if (b) talkAction(b.dataset.talk); });
    $('talkBody').addEventListener('click', (e) => { const b = e.target.closest('[data-talk]'); if (b) talkAction(b.dataset.talk); });
    $('talkClose').addEventListener('click', closeTalk);
    $('craftTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { craftCat = b.dataset.cat; renderCraft(); } });
    $('craftBtn').addEventListener('click', () => toggleCraft());
    $('craftClose').addEventListener('click', () => toggleCraft(false));
    $('mapBtn').addEventListener('click', () => toggleMap());
    $('mapClose').addEventListener('click', () => toggleMap(false));
    $('worldMap').addEventListener('click', mapClick);
    $('menuBtn').addEventListener('click', () => pause(true));
    $('questsToggle').addEventListener('click', toggleQuests);
    $('quests').addEventListener('click', (e) => { const li = e.target.closest('li[data-pick]'); if (li && G) pickQuest(li.dataset.pick); });
    $('compassBtn').addEventListener('click', () => { camGoal = 0; });
    const holdSpin = (el, dir) => {
      // tap: turn 45 degrees; hold: spin freely
      let downAt = 0, a0 = 0;
      const on = (e) => { e.preventDefault(); downAt = performance.now(); a0 = camA; input.spin = dir; camGoal = null; };
      const off = () => {
        if (!downAt) return;
        const tap = performance.now() - downAt < 260;
        downAt = 0; input.spin = 0;
        if (tap) camGoal = (((a0 + dir * Math.PI / 4) % TAU) + TAU) % TAU;
        saveAngle();
      };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
    };
    holdSpin($('rotL'), -1); holdSpin($('rotR'), 1);
    $('startBtn').addEventListener('click', () => { const txt = $('seedInput').value.trim() || randomSeedWord(); startGame(SW.seedFromString(txt), txt, SW.DENSITY[$('densitySel').value] || 1); });
    $('diceBtn').addEventListener('click', () => { $('seedInput').value = randomSeedWord(); });
    $('storyBtn').addEventListener('click', () => { SW.audio.unlock(); SW.intro.play(() => SW.store.set('introSeen', true)); });
    $('continueBtn').addEventListener('click', () => { const s = SW.store.get('save', null); if (s) { SW.audio.unlock(); if (restore(s)) { toast('Welcome back.'); wakeLock(); } } });
    $('retryBtn').addEventListener('click', () => respawn());
    $('newBtn').addEventListener('click', () => goTitle());
    $('resumeBtn').addEventListener('click', () => pause(false));
    $('quitBtn').addEventListener('click', () => { const s = serialize(); SW.store.set('save', s); SW.saves && SW.saves.cloudSave(s, true); goTitle(); });
    $('pauseMapBtn').addEventListener('click', () => { pause(false); toggleMap(true); });
    $('muteBtn').addEventListener('click', () => setMute(!SW.audio.muted));
    $('fullBtn').addEventListener('click', toggleFullscreen);
    $('zoomIn').addEventListener('click', () => setZoom(zoomMul * 1.15));
    $('zoomOut').addEventListener('click', () => setZoom(zoomMul / 1.15));
    $('viewBtn').addEventListener('click', nextView);

    // touch: tap to act, drag to steer, two fingers to twist (turn the view) and pinch (zoom)
    const stick = $('stick'), knob = $('knob');
    let stickId = null, sx0 = 0, sy0 = 0, dragging = false, t0 = 0;
    const touches = new Map();
    let twist = null;
    try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) document.body.classList.add('touch'); } catch (e) { /* old browser */ }
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true, once: true });
    canvas.addEventListener('touchstart', (e) => {
      SW.audio.unlock();
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (touches.size >= 2) {
        const [a, b] = [...touches.values()];
        twist = { ang: Math.atan2(b.y - a.y, b.x - a.x), d: Math.hypot(b.x - a.x, b.y - a.y), camA, zoom: zoomMul };
        stickId = null; dragging = false; input.x = input.y = 0; stick.classList.remove('on');
      } else if (stickId === null) {
        const t = e.changedTouches[0];
        stickId = t.identifier; sx0 = t.clientX; sy0 = t.clientY; dragging = false; t0 = performance.now();
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (twist && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const ang = Math.atan2(b.y - a.y, b.x - a.x), d = Math.hypot(b.x - a.x, b.y - a.y);
        setAngle(twist.camA - (ang - twist.ang)); camGoal = null; saveAngle();
        setZoom(twist.zoom * (d / Math.max(20, twist.d)));
        e.preventDefault();
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - sx0, dy = t.clientY - sy0;
        const d = Math.hypot(dx, dy), max = 46;
        if (!dragging && d > 14) { dragging = true; stick.style.left = sx0 + 'px'; stick.style.top = sy0 + 'px'; stick.classList.add('on'); }
        if (!dragging) continue;
        if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
        input.x = dx / max; input.y = dy / max;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      e.preventDefault();
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        touches.delete(t.identifier);
        if (t.identifier === stickId) {
          if (!dragging && !twist && performance.now() - t0 < 500) { if (G.inCave) input.useEdge = true; else pointerOrder(...toGame(t.clientX, t.clientY)); }
          stickId = null; dragging = false; input.x = input.y = 0; stick.classList.remove('on');
          knob.style.transform = 'translate(-50%, -50%)';
        }
      }
      if (touches.size < 2) twist = null;
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); SW.audio.unlock(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); });
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', () => off && off());
    };
    hold($('tAct'), () => { if (G.inCave) { input.useEdge = true; return; } if (G.fishing) reel(); else { input.act = true; input.actTouch = true; } }, () => { input.act = false; input.actTouch = false; });
    hold($('tEat'), () => G.mode === 'play' && eatBest());
    hold($('tCry'), () => rainbowCry());
    $('cryRow').addEventListener('click', () => rainbowCry());
    hold($('tFly'), () => { if (G.inCave) input.jumpEdge = true; else toggleFly(); });
    window.addEventListener('orientationchange', () => setTimeout(() => { resize(); rescale(); prebuild(); }, 250));
  }

  function toggleQuests() { const box = $('questBox'); box.classList.toggle('open'); SW.store.set('questsOpen', box.classList.contains('open')); requestAnimationFrame(layoutHUD); }
  function setMute(m) {
    SW.audio.setMuted(m);
    $('muteBtn').classList.toggle('off', m);
    $('muteBtn').querySelector('span').textContent = m ? 'Sound: off' : 'Sound: on';
  }
  function closeSavePanel() {
    $('savePanel').hidden = true;
    if (G.mode === 'paused') $('pauseScreen').hidden = false;
    else if (G.mode === 'title') { $('titleScreen').hidden = false; $('hud').hidden = true; }
  }


  // ---------------- the sunflower radar ----------------
  // A ring of sunflower petals around the whole screen (inside the safe area), under the
  // HUD. The petals that point toward the goal glow and grow; the rest stay a quiet amber.
  // Pick any quest in the list and the petals point at it; with nothing picked they follow
  // Star's goal (the next tribe or cave, the next Lost Page, then your quests in order).
  const radar = { cv: null, g: null, base: null, w: 0, h: 0, dpr: 0, pts: [], ring: null, scanT: 0, found: null, caveGoal: null, pulse: 0 };
  const RADAR_INK = '#1c1424';
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // the ring: a rounded rectangle inset from the safe area, walked clockwise at equal steps
  function radarLayout(w, h, dpr) {
    radar.w = w; radar.h = h; radar.dpr = dpr;
    // room outside the ring for a fully lit petal (almost twice the quiet length)
    const inset = clamp(Math.min(w, h) * 0.074, 28, 58);
    const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
    const rc = Math.min(64, Math.min(x1 - x0, y1 - y0) * 0.16);
    const sw = x1 - x0 - 2 * rc, sh = y1 - y0 - 2 * rc, arc = (Math.PI / 2) * rc;
    const per = 2 * sw + 2 * sh + 4 * arc;
    const corner = (cx, cy, a0) => (t) => { const a = a0 + t / rc; return [cx + Math.cos(a) * rc, cy + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; };
    const segs = [
      [sw, (t) => [x0 + rc + t, y0, 0, -1]], [arc, corner(x1 - rc, y0 + rc, -Math.PI / 2)],
      [sh, (t) => [x1, y0 + rc + t, 1, 0]], [arc, corner(x1 - rc, y1 - rc, 0)],
      [sw, (t) => [x1 - rc - t, y1, 0, 1]], [arc, corner(x0 + rc, y1 - rc, Math.PI / 2)],
      [sh, (t) => [x0, y1 - rc - t, -1, 0]], [arc, corner(x0 + rc, y0 + rc, Math.PI)],
    ];
    const at = (s) => { s = ((s % per) + per) % per; for (const [L, f] of segs) { if (s <= L) return f(s); s -= L; } return segs[0][1](0); };
    const n = Math.max(22, Math.round(per / 38)), step = per / n;
    const pts = [];
    for (let i = 0; i < n; i++) { const [x, y, nx, ny] = at(i * step + step * 0.5); pts.push({ x, y, nx, ny, i }); }
    radar.pts = pts;
    radar.ring = { x0, y0, x1, y1, rc, per, inset, step, plen: inset * 0.5, pwid: Math.min(step * 0.3, 8.5) };
    // the quiet frame, drawn once
    const b = radar.base || (radar.base = document.createElement('canvas'));
    b.width = Math.round(w * dpr); b.height = Math.round(h * dpr);
    const g = b.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const p of pts) radarPetal(g, p, 0, 0);
    radarRing(g);
  }
  function radarRing(g) {
    const r = radar.ring, w = r.x1 - r.x0, h = r.y1 - r.y0;
    rrect(g, r.x0, r.y0, w, h, r.rc); g.lineWidth = 7.5; g.strokeStyle = RADAR_INK; g.stroke();
    rrect(g, r.x0, r.y0, w, h, r.rc); g.lineWidth = 4.2; g.strokeStyle = '#5bb04f'; g.stroke();
    rrect(g, r.x0, r.y0, w, h, r.rc); g.lineWidth = 1.1; g.strokeStyle = 'rgba(255,255,255,0.42)'; g.stroke();
  }
  // one petal, its base on the ring at p and its tip pointing out. lit (0..1) brightens
  // and grows it; grow adds the heartbeat of the brightest ones.
  function radarPetal(g, p, lit, grow) {
    const r = radar.ring, len = r.plen * (1 + 0.55 * lit * lit + 0.25 * lit + grow), w = r.pwid * (0.92 + 0.55 * lit);
    const tx = -p.ny, ty = p.nx, c = 0.5;
    const bx = p.x + p.nx * 1.5, by = p.y + p.ny * 1.5, tipx = bx + p.nx * len, tipy = by + p.ny * len;
    const path = () => {
      g.beginPath();
      g.moveTo(bx - tx * w * 0.5, by - ty * w * 0.5);
      g.quadraticCurveTo(bx + p.nx * len * c - tx * w * 1.4, by + p.ny * len * c - ty * w * 1.4, tipx, tipy);
      g.quadraticCurveTo(bx + p.nx * len * c + tx * w * 1.4, by + p.ny * len * c + ty * w * 1.4, bx + tx * w * 0.5, by + ty * w * 0.5);
      g.closePath();
    };
    path();
    if (lit > 0) { g.shadowColor = `rgba(255, 220, 50, ${0.95 * lit})`; g.shadowBlur = 10 + 18 * lit; }
    g.fillStyle = lit > 0 ? `hsl(${44 + 8 * lit}, 100%, ${54 + 20 * lit}%)` : '#d98f2a';
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 1.5; g.strokeStyle = RADAR_INK; g.stroke();
    // the vein, and a soft shine on the lit ones
    g.beginPath(); g.moveTo(bx + p.nx * 2, by + p.ny * 2); g.lineTo(bx + p.nx * len * 0.62, by + p.ny * len * 0.62);
    g.lineWidth = 1; g.strokeStyle = lit > 0 ? 'rgba(160, 90, 10, 0.55)' : 'rgba(110, 60, 10, 0.45)'; g.stroke();
    if (lit > 0.35) {
      g.beginPath(); g.moveTo(bx + p.nx * len * 0.2 - tx * w * 0.55, by + p.ny * len * 0.2 - ty * w * 0.55);
      g.quadraticCurveTo(bx + p.nx * len * 0.5 - tx * w * 0.95, by + p.ny * len * 0.5 - ty * w * 0.95, bx + p.nx * len * 0.78 - tx * w * 0.3, by + p.ny * len * 0.78 - ty * w * 0.3);
      g.lineWidth = 1.6; g.strokeStyle = `rgba(255,255,255,${0.55 * lit})`; g.stroke();
    }
  }
  const radarInside = (x, y) => {
    const r = radar.ring;
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return false;
    const cx = clamp(x, r.x0 + r.rc, r.x1 - r.rc), cy = clamp(y, r.y0 + r.rc, r.y1 - r.rc);
    return Math.hypot(x - cx, y - cy) <= r.rc;
  };
  // where a ray from the anchor leaves the ring
  function radarExit(ax, ay, th) {
    const dx = Math.cos(th), dy = Math.sin(th), r = radar.ring;
    let t = 0; const tmax = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
    while (t < tmax && radarInside(ax + dx * t, ay + dy * t)) t += 3;
    return [ax + dx * t, ay + dy * t];
  }
  // ---- what the petals point at ----
  const radarDist = (d) => (d < 950 ? `${Math.max(10, Math.round(d / 10) * 10)} m` : `${(d / 1000).toFixed(1)} km`);
  function nearestObj(key) {
    const p = G.player; let best = null, bd = 1e9;
    for (const ch of nearChunks(p.x, p.y, 2)) for (const o of ch.objs) {
      const def = OBJ[o.type];
      if (!def || !def.drops || !def.drops[key] || (def.needs && !G.tools[def.needs])) continue;
      const d = dist(o.x, o.y, p.x, p.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { x: best.x, y: best.y, what: SW.OBJ_NAME[best.type] || 'it', near: 40 } : null;
  }
  function nearestMob(type) {
    const p = G.player; let best = null, bd = 1e9;
    for (const m of G.mobs) { if (m.type !== type || m.dying) continue; const d = dist(m.x, m.y, p.x, p.y); if (d < bd) { bd = d; best = m; } }
    return best ? { ref: best, x: best.x, y: best.y, what: ENEMIES[type].name, near: 50 } : null;
  }
  function nearestWater() {
    const p = G.player;
    for (let r = 90; r <= 1500; r += 90) for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + r * 0.01, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (G.world.isWater(x, y)) return { x, y, what: 'water', near: 70 };
    }
    return null;
  }
  function questGoal(q, label) {
    const t = q.kind === 'explore' ? { x: q.tx, y: q.ty, near: 120 }
      : q.kind === 'hunt' ? nearestMob(q.key)
      : q.kind === 'fish' ? nearestWater()
      : q.kind === 'gather' ? nearestObj(q.key) : null;
    if (!t) return { none: true, label: `Look around: ${label}` };
    t.label = t.what ? `${label} · ${t.what}` : label;
    return t;
  }
  function tribeGoal(tr, q) {
    const st = G.tq[q.id] || {};
    const here = (t, why) => ({ x: t.x, y: t.y, label: `${why}: ${t.name}`, near: 140 });
    if (questReady(q)) return here(tr, 'Hand in');
    if (q.kind === 'relic') { const c = G.realm.caves[tr.zone]; return c ? here(c, q.title) : null; }
    if (q.kind === 'deliver') { const to = st.state === 'relay' ? tr : G.realm.tribes.find((x) => x.id === q.key); return to ? here(to, 'Deliver') : null; }
    if (q.kind === 'bring') return { none: true, label: `Gather for ${tr.name}: ${q.title}` };
    return questGoal(q, q.title);
  }
  function resolvePick(k) {
    const [kind, id] = k.split(':');
    if (kind === 'page') { const pg = G.adv && G.adv.pages[G.adv.next]; return pg ? { x: pg.x, y: pg.y, label: `Lost Page ${G.adv.next + 1}`, near: 60 } : null; }
    if (kind === 'tr') { const t = G.adv && G.adv.treasures[+id]; return t && !t.dug ? { x: t.x, y: t.y, label: 'Treasure map', near: 60 } : null; }
    if (kind === 'tq') {
      for (const tr of SW.TRIBES) for (const q of tr.quests) if (q.id === id) {
        const st = G.tq[q.id]; if (!st || st.state === 'done' || !G.realm) return null;
        const rt = G.realm.tribes.find((x) => x.id === tr.id) || tr;
        return tribeGoal(rt, q);
      }
      return null;
    }
    const q = G.quests.find((q) => String(q.id) === id && !q.done);
    return q ? questGoal(q, q.title) : null;
  }
  function autoGoal() {
    const g = realmGoal();
    if (g) return { x: g.x, y: g.y, label: g.name || 'Onward', near: 140 };
    const page = G.adv && G.adv.pages[G.adv.next];
    if (page) return { x: page.x, y: page.y, label: `Lost Page ${G.adv.next + 1}`, near: 60 };
    for (const q of G.quests) if (!q.done && q.kind === 'explore') return questGoal(q, q.title);
    for (const q of G.quests) if (!q.done) { const t = questGoal(q, q.title); if (t && !t.none) return t; }
    return null;
  }
  function caveRadarGoal() {
    const C = caves.state;
    if (!C) return null;
    const want = C.save.taken ? 'D' : 'T';
    if (!radar.caveGoal || radar.caveGoal.id !== G.inCave || radar.caveGoal.ch !== want) {
      let pos = null;
      for (let r = 0; r < C.H && !pos; r++) { const c = C.rows[r].indexOf(want); if (c >= 0) pos = [c * 32 + 16, r * 32 + 16]; }
      radar.caveGoal = { id: G.inCave, ch: want, pos };
    }
    const pos = radar.caveGoal.pos;
    if (!pos) return null;
    const h = C.hero, dx = pos[0] - h.x, dy = pos[1] - h.y;
    return { cave: true, dx, dy, d: Math.hypot(dx, dy), label: want === 'T' ? 'The relic chest' : 'The cave door', near: 44 };
  }
  function radarTarget() {
    if (G.inCave) return caveRadarGoal();
    let t = null;
    if (G.radarPick) { t = resolvePick(G.radarPick); if (!t) { G.radarPick = null; questDirty = true; } }
    return t || autoGoal();
  }
  // the goal's direction on screen, from where Ene stands
  function radarAngle(t) {
    if (t.cave) return Math.atan2(t.dy, t.dx);
    const p = G.player, dx = t.x - p.x, dy = t.y - p.y;
    if (VIEWS[view].parallax) return Math.atan2(dy, dx);
    return Math.atan2(depthOf(dx, dy) * TILT, screenDX(dx, dy));
  }
  function radarLabel(g, text, x, y, bright, ix, iy) {
    g.font = '800 12px Sniglet, "Trebuchet MS", system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const tw = g.measureText(text).width, pw = tw + 34, ph = 22, r = radar.ring;
    const fit = () => { x = clamp(x, r.x0 + 6 + pw / 2, r.x1 - 6 - pw / 2); y = clamp(y, r.y0 + 6 + ph / 2, r.y1 - 6 - ph / 2); };
    fit();
    // slide inward until the pill is clear of the HUD's boxes
    const hits = () => (radar.avoid || []).some(([l, t, rr, bb]) => x + pw / 2 > l - 4 && x - pw / 2 < rr + 4 && y + ph / 2 > t - 4 && y - ph / 2 < bb + 4);
    for (let i = 0; i < 12 && ix != null && hits(); i++) { x += ix * 22; y += iy * 22; fit(); }
    rrect(g, x - pw / 2, y - ph / 2, pw, ph, 11);
    g.fillStyle = bright ? '#fff3b0' : '#f6f1e6'; g.fill(); g.lineWidth = 2; g.strokeStyle = RADAR_INK; g.stroke();
    // a tiny sunflower on the left
    const sx = x - pw / 2 + 12;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.ellipse(sx + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6, 2.6, 1.3, a, 0, TAU); g.fillStyle = '#ffd83a'; g.fill(); }
    g.beginPath(); g.arc(sx, y, 3, 0, TAU); g.fillStyle = '#8a5a2e'; g.fill();
    g.fillStyle = RADAR_INK; g.fillText(text, x - pw / 2 + 24, y + 0.5);
  }
  function drawRadar(dt) {
    if (!radar.cv) { radar.cv = $('radar'); radar.g = radar.cv.getContext('2d'); }
    const cv = radar.cv;
    const show = !!G && G.mode !== 'title' && !$('hud').hidden;
    if (cv.hidden === show) cv.hidden = !show;
    if (!show) return;
    const rect = cv.getBoundingClientRect(), w = Math.round(rect.width), h = Math.round(rect.height);
    if (w < 120 || h < 120) return;
    if (w !== radar.w || h !== radar.h || SDPR !== radar.dpr) { cv.width = Math.round(w * SDPR); cv.height = Math.round(h * SDPR); radarLayout(w, h, SDPR); }
    radar.scanT -= dt; radar.pulse += dt * 4.5;
    if (radar.scanT <= 0) {
      radar.scanT = 0.4; radar.found = radarTarget();
      // the HUD boxes the label should stay out of
      radar.avoid = ['hudTL', 'hudTR', 'hotbarWrap', 'touchUI'].map((id) => $(id)).filter((el) => el && !el.hidden && el.offsetParent !== null).map((el) => { const q = el.getBoundingClientRect(); return [q.left - rect.left, q.top - rect.top, q.right - rect.left, q.bottom - rect.top]; });
    }
    const t = radar.found, g = radar.g, r = radar.ring;
    g.setTransform(SDPR, 0, 0, SDPR, 0, 0);
    g.clearRect(0, 0, w, h);
    g.drawImage(radar.base, 0, 0, w, h);
    if (!t) return;
    if (t.ref) { t.x = t.ref.x; t.y = t.ref.y; }
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (t.none) { radar.lastLit = { none: true, label: t.label }; radarLabel(g, t.label, w / 2, r.y1 - 58, false); return; }
    const p = G.player, d = t.cave ? t.d : dist(p.x, p.y, t.x, t.y), here = d < (t.near || 60);
    // from where Ene stands on screen (kept inside the ring: first-person puts her below it)
    const ax = clamp(W / 2 - rect.left, r.x0 + 20, r.x1 - 20), ay = clamp((t.cave ? H * 0.55 : VIEWS[view].parallax ? H * 0.72 : curve.yA) - rect.top, r.y0 + 20, r.y1 - 20);
    const th = radarAngle(t), [ex, ey] = radarExit(ax, ay, th);
    radar.lastLit = { ax, ay, ex, ey, th, d, here, label: t.label };
    const beat = 0.5 + 0.5 * Math.sin(radar.pulse);
    const lits = [];
    for (const q of radar.pts) {
      const lit = here ? 0.75 + 0.25 * Math.sin(radar.pulse + q.i * 0.7) : Math.pow(clamp(1 - Math.hypot(q.x - ex, q.y - ey) / (2.7 * r.step), 0, 1), 1.4);
      if (lit > 0.03) lits.push([q, lit]);
    }
    lits.sort((a, b) => a[1] - b[1]);
    // a warm glow on the ring where the goal is, then the petals that point there
    if (!here) {
      const gx = ex + (ax - ex) / Math.hypot(ax - ex, ay - ey) * r.step * 0.5, gy = ey + (ay - ey) / Math.hypot(ax - ex, ay - ey) * r.step * 0.5;
      const gl = g.createRadialGradient(gx, gy, 0, gx, gy, 3.4 * r.step);
      gl.addColorStop(0, `rgba(255, 225, 90, ${0.55 + 0.15 * beat})`); gl.addColorStop(1, 'rgba(255, 225, 90, 0)');
      g.fillStyle = gl; g.beginPath(); g.arc(gx, gy, 3.4 * r.step, 0, TAU); g.fill();
    }
    for (const [q, lit] of lits) radarPetal(g, q, lit, here ? 0.12 * beat : 0.2 * beat * lit * lit);
    const inx = ax - ex, iny = ay - ey, il = Math.hypot(inx, iny) || 1;
    radarLabel(g, here ? `${t.label} · here!` : `${t.label} · ${radarDist(d)}`, ex + (inx / il) * 30, ey + (iny / il) * 30, here, inx / il, iny / il);
  }

  // ---------------- boot ----------------
  let layoutT = 0;
  function onResize() { resize(); clearTimeout(setZoom.t); setZoom.t = setTimeout(() => { rescale(); prebuild(); }, 200); }
  // re-measure whenever the window's size (or pixel density) no longer matches what the
  // game last laid out for: every layer and the mouse mapping are rebuilt together
  function syncSize() {
    if (window.innerWidth !== W || window.innerHeight !== H || Math.min(2, window.devicePixelRatio || 1) !== SDPR) onResize();
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    syncSize();
    pollGamepad();
    if (G.inCave) {
      if (G.mode === 'play' && !G.talking) { G.time += dt; caveSurvival(dt); if (G.inCave) caves.update(dt, caveInput()); }
      if (G.inCave) caves.render(sctx, W, H, SDPR);
    } else if (VIEWS[view].parallax && G.mode !== 'title') {
      if (G.mode !== 'paused' && !G.talking) update(dt);
      G.hover = null;
      renderParallax(dt);
    } else {
      if (G.mode !== 'paused' && !G.talking) update(dt);
      updateHover();
      render(dt);
    }
    if (G.mode !== 'title') updateHUD(dt);
    drawRadar(dt);
    if (!$('mapScreen').hidden) renderWorldMap();
    adaptRes(dt);
    layoutT -= dt;
    if (layoutT <= 0) { layoutT = 1; layoutHUD(); }
    frame.dropT = (frame.dropT || 0) - dt;
    if (frame.dropT <= 0) {
      frame.dropT = 2;
      const keep = Math.ceil(Math.max(VW, VH) / Z / CHUNK / TILT) + 2;
      G.world.dropFarTextures(Math.floor(G.cam.x / CHUNK), Math.floor(G.cam.y / CHUNK), keep);
    }
    requestAnimationFrame(frame);
  }

  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const r = SW.rng(42);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,40,90,0.05)' : 'rgba(255,255,255,0.06)';
      g.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    grain = sctx.createPattern(c, 'repeat');
  }

  function boot(data) {
    resize();
    SW.buildSprites(clamp(Z * DPR, 0.6, 3));
    makeGrain();
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = SW.spriteURL(img.dataset.icon); });
    bindInput();
    setMute(SW.audio.muted);
    if (SW.store.get('questsOpen', window.innerWidth > 700 && window.innerHeight > 520)) $('questBox').classList.add('open');
    window.addEventListener('resize', onResize);
    // The window can change size without a resize event arriving when it should (leaving
    // fullscreen, switching apps and back, a phone's address bar, the page inside a frame):
    // check again on each of these, and every frame (syncSize), so the mouse never drifts.
    document.addEventListener('fullscreenchange', onResize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onResize(); });
    window.addEventListener('focus', onResize);
    window.addEventListener('pageshow', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    if (data && validSave(data.save)) restore(data.save);
    else {
      goTitle();
      if (!SW.store.get('introSeen', false) && SW.intro) SW.intro.play(() => SW.store.set('introSeen', true));
    }
    last = performance.now();
    requestAnimationFrame(frame);
    document.body.classList.add('ready');
    SW.saves && SW.saves.init();
  }

  SW.game = {
    get G() { return G; }, newGame, startGame, act, useItem, craft, restore, serialize, toast, saveName, validSave,
    radar: () => ({ pick: G && G.radarPick, target: radar.found, ring: radar.ring, lit: radar.lastLit }), pickQuest,
    pause, goTitle, showScreen, closeSavePanel, dayOf, gainXP, pointerOrder, setOrder, startFishing, reel, toggleFly,
    setPhase(ph) { G.time = (dayOf(G.time) - 1) * DAY_LEN + ph * DAY_LEN; },
    setAngle(a) { setAngle(a); }, get angle() { return camA; },
    toScreen: (x, y, lv = 0) => { const pt = proj(x, y, lv); return flatToScreen(pt.x, pt.y); },
    toWorld: (sx, sy) => { const f = screenToFlat(sx, sy); return f && screenToWorld(f.x, f.y); },
    get caves() { return caves; }, setView: (v) => setView(v), get view() { return view; }, enterCave: (i) => enterCave(G.realm.caves[i]), exitCave: () => exitCave(), openTalk: (t) => openTalk(t),
    get dpr() { return DPR; },
  };
  try { window.claude?.hot?.snapshot?.(() => ({ save: G && (G.mode === 'play' || G.mode === 'paused') ? serialize() : null })); } catch (e) { /* not in a viewer */ }
  const startFn = (data) => boot(data || {});
  if (window.claude?.hot?.ready) window.claude.hot.ready(startFn); else startFn(window.claude?.hot?.data ?? {});
})();
