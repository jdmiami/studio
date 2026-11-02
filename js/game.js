// Stickerwild — game loop, player, creatures, fishing, quests, day/night, HUD.
'use strict';
(function () {
  const { clamp, lerp, TAU, dist } = SW;
  const TILT = SW.TILT, LH = SW.LEVEL_H, CHUNK = SW.CHUNK, OBJ = SW.OBJ;
  const ITEMS = SW.ITEMS, ORDER = SW.ITEM_ORDER, TOOLS = SW.TOOLS, RECIPES = SW.RECIPES, ENEMIES = SW.ENEMIES;
  const DAY_LEN = 180;           // seconds per full day
  const PR = 11;                 // player radius
  const $ = (id) => document.getElementById(id);

  // ---------------- canvas & sizing ----------------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const lightCv = document.createElement('canvas');
  const lctx = lightCv.getContext('2d');
  let W = 0, H = 0, DPR = 1, Zb = 1, Z = 1, RS = 1;
  let zoomMul = clamp(SW.store.get('zoom', 1), 0.55, 1.6);
  let grain = null;
  const canFilter = 'filter' in ctx;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    Zb = clamp(Math.min(W, H * 1.7) / 960, 0.75, 1.6);
    Z = Zb * zoomMul;
    RS = clamp(Z * DPR, 0.6, 3);
    lightCv.width = Math.ceil(W / 2); lightCv.height = Math.ceil(H / 2);
  }
  function setZoom(z) {
    zoomMul = clamp(z, 0.55, 1.6);
    Z = Zb * zoomMul;
    SW.store.set('zoom', zoomMul);
    clearTimeout(setZoom.t);
    setZoom.t = setTimeout(rescale, 280);
  }
  // Re-render stickers and ground at the new on-screen scale.
  function rescale() {
    RS = clamp(Z * DPR, 0.6, 3);
    const S = clamp(Z * DPR, 0.6, 3);
    if (!SW.SPR || Math.abs(SW.SPR - S) > 0.01) SW.buildSprites(S);
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
    grain = ctx.createPattern(c, 'repeat');
  }

  // ---------------- state ----------------
  let G = null;
  let last = performance.now();
  const keys = new Set();
  const input = { x: 0, y: 0, act: false, mouseX: -1, mouseY: -1, holdMove: false };
  const scratch = [];

  function newGame(seed, mode, seedText) {
    const world = new SW.World(seed);
    const sp = world.findSpawn();
    G = {
      seed, seedText: seedText || String(seed), world, mode,
      time: DAY_LEN * 0.03,
      player: {
        x: sp.x, y: sp.y, vx: 0, vy: 0, fx: 1, fy: 0, face: 1, hp: 100, maxHp: 100, hunger: 100, level: 1, xp: 0,
        atkCd: 0, swingT: 0, swingTool: null, hurtT: 0, iframes: 0, walkT: 0, moving: false, running: false, lvlOff: LH, dustT: 0,
      },
      inv: { berry: 2 }, tools: {},
      mobs: [], parts: [], floaters: [],
      spawnT: 1, hitT: new Map(),
      cam: { x: sp.x, y: sp.y - LH / TILT, shake: 0 },
      stats: { harvested: 0, kills: 0, crafted: 0, fish: 0, chests: 0, deaths: 0, best: null },
      tips: {}, lastPhaseNight: false, deadT: 0, saveT: 8, cloudT: 45,
      quests: [], questSeq: 0, regionsSeen: new Set(), region: null, regionT: 0,
      order: null, fishing: null, hover: null, marker: null,
      drift: Math.random() * TAU, worldMap: null,
    };
    // clear a little patch around the spawn point so you never start inside a tree
    for (const ch of nearChunks(sp.x, sp.y, 1)) ch.objs = ch.objs.filter((o) => !(OBJ[o.type].r && dist(o.x, o.y, sp.x, sp.y) < 64));
    if (mode === 'play') for (let i = 0; i < 3; i++) addQuest();
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
      if (!ch.canvas || ch.canvasRS !== RS) G.world.buildCanvas(ch, RS);
    }
  }

  // ---------------- clock ----------------
  const phaseOf = (t) => (t % DAY_LEN) / DAY_LEN;
  const dayOf = (t) => Math.floor(t / DAY_LEN) + 1;
  function darkness(p) {
    if (p < 0.58) return 0;
    if (p < 0.68) return (p - 0.58) / 0.1;
    if (p < 0.93) return 1;
    return 1 - (p - 0.93) / 0.07;
  }
  const isNight = (p) => p >= 0.64 && p < 0.955;

  // ---------------- projection ----------------
  const sxOf = (x) => (x - G.cam.x) * Z + W / 2;
  const syOf = (y, lv) => ((y - G.cam.y) * TILT - lv) * Z + H / 2;
  function viewChunks() {
    const hw = W / 2 / Z, hh = H / 2 / Z / TILT;
    return {
      cx0: Math.floor((G.cam.x - hw) / CHUNK), cx1: Math.floor((G.cam.x + hw) / CHUNK),
      cy0: Math.floor((G.cam.y - hh) / CHUNK), cy1: Math.floor((G.cam.y + hh) / CHUNK),
    };
  }
  // Screen point -> world point on whichever ground layer is drawn there.
  function screenToWorld(mx, my) {
    const wx = (mx - W / 2) / Z + G.cam.x;
    for (let L = 2; L >= 0; L--) {
      const wy = (my - H / 2) / Z / TILT + G.cam.y + (L * LH) / TILT;
      if (G.world.levelAt(wx, wy) === L) return { x: wx, y: wy };
    }
    return { x: wx, y: (my - H / 2) / Z / TILT + G.cam.y };
  }

  // ---------------- helpers ----------------
  function toast(msg, ms = 3600) {
    const t = $('toast');
    t.textContent = msg;
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
  }
  function tipOnce(key, msg) { if (!G.tips[key]) { G.tips[key] = 1; toast(msg); } }

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
  function nearFire(x, y, pad = 0) {
    for (const s of burningFires()) if (dist(x, y, s.x, s.y) < 130 + pad) return s;
    return null;
  }
  function inFireLight(x, y) {
    for (const s of burningFires()) if (dist(x, y, s.x, s.y) < fireRadius(s) * 0.82) return s;
    return null;
  }

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
      banner('Level ' + p.level, `+10 max health. You hit harder.`, '#8a63e8');
      SW.audio.play('craft');
      spawnPoof(p.x, p.y, p.lvlOff + 20, '#a78bfa');
      craftDirty = true;
    }
    hud.xp = -1;
  }
  function attackPower() {
    let w = 1;
    for (const k of ['inkBlade', 'gemSword', 'sword']) if (G.tools[k]) { w = TOOLS[k].dmg; break; }
    return w + Math.floor((G.player.level - 1) * 0.5);
  }
  function bestWeapon() { for (const k of ['inkBlade', 'gemSword', 'sword']) if (G.tools[k]) return k; return null; }
  function armorDef() { for (const k of ['crystalPlate', 'stoneMail', 'barkVest']) if (G.tools[k]) return TOOLS[k].def; return 0; }

  function addQuest() {
    const p = G.player;
    const q = SW.makeQuest(G.world, G.questSeq++, { level: p.level, x: p.x, y: p.y, hasRod: !!G.tools.rod });
    G.quests.push(q);
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

  // ---------------- particles ----------------
  function spawnPeel(sprName, x, y, lvl) {
    G.parts.push({ k: 'peel', spr: sprName, x, y, lvl, t: 0, life: 0.9, dir: Math.random() < 0.5 ? -1 : 1 });
  }
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
    if (def.tool === 'axe' && G.tools.axe) dmg *= 2;
    if (def.tool === 'pick' && G.tools.pick) dmg *= 2.5;
    let hp = G.world.damage.has(o.id) ? G.world.damage.get(o.id) : def.hp;
    hp -= dmg;
    G.hitT.set(o.id, G.time);
    const chip = def.tool === 'pick' ? (o.type === 'crystal' ? '#8fe8f6' : '#a3a1b5') : o.type.startsWith('flower') ? '#ff7aa8' : def.chest ? '#ffc93c' : '#6bbf4a';
    spawnChips(o.x, o.y, o.lvl * LH + 20, chip, 5);
    SW.audio.play(def.sound || 'chop');
    if (hp > 0) { G.world.damage.set(o.id, hp); return; }
    G.world.removed.set(o.id, G.time);
    G.world.damage.delete(o.id);
    spawnPeel(o.type, o.x, o.y, o.lvl);
    G.stats.harvested++;
    setTimeout(() => SW.audio.play('peel'), 40);
    if (def.chest) {
      const danger = G.world.dangerAt(o.x, o.y);
      dropItems(SW.chestLoot(SW.rng((G.seed + o.x * 7 + o.y * 13) >>> 0), danger), o.x, o.y, o.lvl);
      gainXP(10 * danger, o.x, o.y, o.lvl * LH);
      G.stats.chests++;
      toast('Treasure! The chest held some loot.');
    } else {
      dropItems(def.drops, o.x, o.y, o.lvl, true);
      gainXP(def.tool ? 2 : 1, o.x, o.y, o.lvl * LH);
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
    if (G.mode !== 'play') return;
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
    // water ahead? cast a line
    const wx = p.x + p.fx * 70, wy = p.y + p.fy * 70;
    if (G.world.isWater(wx, wy) && G.tools.rod) { startFishing(wx, wy); return; }
    p.atkCd = 0.36; p.swingT = 0.24; p.swingTool = bestWeapon();
    SW.audio.play('swing');
  }

  function swingAt(m) {
    const p = G.player;
    p.atkCd = 0.4; p.swingT = 0.24;
    p.swingTool = bestWeapon() || (G.tools.axe ? 'axe' : null);
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
    SW.audio.play('hit');
    G.cam.shake = Math.max(G.cam.shake, crit ? 6 : 3);
    if (m.hp > 0) return;
    m.dying = 0.001;
    const def = ENEMIES[m.type];
    spawnPoof(m.x, m.y, m.lvlOff, m.type === 'scribble' ? '#2b2340' : m.type === 'gloop' ? '#5fd3a0' : '#f4ecff');
    SW.audio.play('poof');
    const drops = {};
    for (const [item, n, chance] of def.drops) if (Math.random() < chance * (m.small ? 0.5 : 1)) drops[item] = (drops[item] || 0) + n;
    if (m.elite) { drops.gem = (drops.gem || 0) + 1 + Math.floor(m.lvl / 4); drops.salve = 1; }
    dropItems(drops, m.x, m.y, m.lvlOff / LH);
    gainXP(Math.round(SW.xpForKill(m) * (m.small ? 0.4 : 1)), m.x, m.y, m.lvlOff);
    if (!def.passive) { G.stats.kills++; questEvent('hunt', m.type, 1); }
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
    if (p.iframes > 0 || G.mode !== 'play') return;
    dmg = Math.max(1, Math.round(dmg * (1 - armorDef())));
    p.hp -= dmg; p.iframes = 0.7; p.hurtT = 0.35;
    const d = Math.max(1, dist(p.x, p.y, fromX, fromY));
    p.vx += ((p.x - fromX) / d) * 320; p.vy += ((p.y - fromY) / d) * 320;
    G.cam.shake = 9;
    spawnText(p.x, p.y, p.lvlOff + 60, '-' + dmg, '#ff3b5c');
    SW.audio.play('hurt');
    if (G.fishing) { G.fishing = null; }
    $('hud').classList.remove('ouch'); void $('hud').offsetWidth; $('hud').classList.add('ouch');
    if (p.hp <= 0) die();
  }

  function useItem(item) {
    if (G.mode !== 'play' || !(G.inv[item] > 0)) return;
    const def = ITEMS[item], p = G.player;
    if (def.food) {
      if (def.food.hp > 0 && def.food.hunger === 0 && p.hp >= p.maxHp) { toast('You are already at full health.'); return; }
      G.inv[item]--; if (!G.inv[item]) delete G.inv[item];
      p.hunger = clamp(p.hunger + def.food.hunger, 0, 100);
      p.hp = clamp(p.hp + def.food.hp, 0, p.maxHp);
      if (def.food.hunger) spawnText(p.x, p.y, p.lvlOff + 56, '+' + def.food.hunger + ' food', '#ff9a3c');
      if (def.food.hp) spawnText(p.x + 10, p.y, p.lvlOff + 40, (def.food.hp > 0 ? '+' : '') + def.food.hp + ' hp', def.food.hp > 0 ? '#2fb36f' : '#ff3b5c');
      if (item === 'meat' || item === 'fish') tipOnce('raw', 'Raw food hurts a little. Grill it at a campfire (Craft menu, Food).');
      SW.audio.play('eat');
      hotbarDirty = craftDirty = true;
      if (p.hp <= 0) die();
      return;
    }
    if (def.place) {
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
      if (item === 'campfire') tipOnce('placedfire', 'Fire lit. Scribbles stay out of the light, and you can fast-travel here from the map (M).');
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
    if (r.fire && !nearFire(G.player.x, G.player.y)) { toast('Stand next to a lit campfire to cook.'); SW.audio.play('deny'); return; }
    if (!hasCost(r.cost)) { SW.audio.play('deny'); return; }
    payCost(r.cost);
    if (r.tool) { G.tools[r.tool] = true; toast(TOOLS[r.tool].name + ' crafted.'); if (r.tool === 'rod') tipOnce('rod', 'Click or tap any water to fish. Reel in when the "!" appears.'); }
    else addItem(r.gives, 1);
    G.stats.crafted++;
    gainXP(3);
    SW.audio.play('craft');
    spawnPoof(G.player.x, G.player.y, G.player.lvlOff + 20, '#ffd23f');
    craftDirty = hotbarDirty = true;
    renderToolbelt();
  }

  // ---------------- fishing ----------------
  function startFishing(x, y) {
    const p = G.player;
    if (!G.tools.rod) { toast('Craft a Fishing Rod (3 wood, 3 fiber) to fish here.'); SW.audio.play('deny'); return; }
    const d = Math.max(1, dist(p.x, p.y, x, y));
    if (d > 150) { x = p.x + ((x - p.x) / d) * 150; y = p.y + ((y - p.y) / d) * 150; }
    if (!G.world.isWater(x, y)) return;
    p.fx = (x - p.x) / d; p.fy = (y - p.y) / d;
    if (Math.abs(p.fx) > 0.1) p.face = p.fx > 0 ? 1 : -1;
    G.fishing = { phase: 'cast', t: 0, x, y, biteAt: 1.6 + Math.random() * 3.2, nibbles: 0 };
    G.order = null;
    SW.audio.play('swing');
  }
  function reel() {
    const f = G.fishing;
    if (!f) return;
    const p = G.player;
    if (f.phase === 'bite') {
      const deep = G.world.elev(f.x, f.y) < 0.37;
      const fish = SW.rollFish(Math.random, deep, G.world.dangerAt(p.x, p.y));
      const cm = Math.round(fish.min + Math.random() * (fish.max - fish.min));
      f.phase = 'reel'; f.t = 0; f.fish = fish;
      SW.audio.play('pickup');
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
      f.t = 0; f.biteAt = 1.5 + Math.random() * 3;
      SW.audio.play('deny');
    }
  }
  function updateFishing(dt) {
    const f = G.fishing;
    if (!f) return;
    f.t += dt;
    if (f.phase === 'cast' && f.t > 0.45) { f.phase = 'wait'; f.t = 0; spawnRing(f.x, f.y, 0); SW.audio.play('rustle'); }
    else if (f.phase === 'wait' && f.t > f.biteAt) { f.phase = 'bite'; f.t = 0; spawnRing(f.x, f.y, 0); SW.audio.play('mine'); }
    else if (f.phase === 'bite' && f.t > 1.0) {
      f.nibbles++;
      spawnText(G.player.x, G.player.y, G.player.lvlOff + 70, 'It got away...', '#7a6f8f');
      f.phase = 'wait'; f.t = 0; f.biteAt = 1.5 + Math.random() * 3;
    } else if (f.phase === 'reel' && f.t > 1.1) { f.phase = 'cast'; f.t = 0; f.biteAt = 1.6 + Math.random() * 3.2; }
  }

  function die() {
    const p = G.player;
    p.hp = 0;
    G.mode = 'dead'; G.deadT = 0; G.order = null; G.fishing = null;
    G.stats.deaths++;
    spawnPeel(p.face < 0 ? 'player0L' : 'player0', p.x, p.y, p.lvlOff / LH);
    SW.audio.play('death');
    const days = dayOf(G.time) - 1 + phaseOf(G.time);
    const best = SW.store.get('best', 0);
    if (days > best) SW.store.set('best', days);
    setTimeout(() => {
      $('deathDays').textContent = 'Level ' + p.level;
      $('deathSub').textContent = `Day ${dayOf(G.time)} · ${G.stats.deaths} ${G.stats.deaths === 1 ? 'fall' : 'falls'}`;
      $('deathStats').innerHTML =
        `<li><b>${G.stats.harvested}</b> stickers peeled</li><li><b>${G.stats.kills}</b> creatures beaten</li><li><b>${G.stats.fish}</b> fish caught</li><li><b>${G.stats.chests}</b> chests opened</li>`;
      $('deathSeed').textContent = G.seedText;
      showScreen('deathScreen');
    }, 1300);
  }

  function respawn() {
    const p = G.player;
    let home = G.world.spawn, bd = 1e9;
    for (const s of G.world.structures) if (s.type === 'campfire') { const d = dist(s.x, s.y, p.x, p.y); if (d < bd) { bd = d; home = { x: s.x, y: s.y + 30 }; } }
    // you drop half your materials where you fell
    const lost = {};
    for (const k of ['wood', 'stone', 'fiber', 'petal', 'gem', 'ink', 'meat', 'fish']) {
      const n = Math.floor((G.inv[k] || 0) / 2);
      if (n > 0) { G.inv[k] -= n; lost[k] = n; if (!G.inv[k]) delete G.inv[k]; }
    }
    p.x = home.x; p.y = home.y; p.vx = p.vy = 0;
    p.hp = p.maxHp; p.hunger = Math.max(p.hunger, 70); p.iframes = 3;
    G.mobs = G.mobs.filter((m) => dist(m.x, m.y, p.x, p.y) > 600);
    G.cam.x = p.x; G.cam.y = p.y - LH / TILT;
    G.mode = 'play';
    showScreen(null);
    hotbarDirty = craftDirty = true;
    prebuild();
    toast(Object.keys(lost).length ? 'Back on your feet. You dropped half your materials.' : 'Back on your feet.');
  }

  // ---------------- orders (click / tap to act) ----------------
  function setOrder(o) {
    G.order = o;
    G.fishing = null;
    if (o) { o.t = 0; o.lx = G.player.x; o.ly = G.player.y; o.progT = 0; o.detourT = 0; o.detour = 1; }
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
    return null;
  }
  function runOrder(dt) {
    const o = G.order, p = G.player;
    const t = orderTarget(o);
    o.t += dt;
    if (!t || o.t > (o.kind === 'move' || o.kind === 'fish' ? 30 : 14)) { G.order = null; return [0, 0]; }
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (o.kind === 'fish') {
      // walk to the shore, then cast toward the clicked water
      const ax = p.x + (dx / d) * 34, ay = p.y + (dy / d) * 34;
      if (G.world.isWater(ax, ay) || d < 60) {
        G.order = null;
        if (G.tools.rod) startFishing(t.x, t.y); else { toast('Craft a Fishing Rod (3 wood, 3 fiber) to fish.'); SW.audio.play('deny'); }
        return [0, 0];
      }
    } else if (d <= t.reach) {
      p.fx = dx / d; p.fy = dy / d;
      if (Math.abs(dx) > 3) p.face = dx > 0 ? 1 : -1;
      if (o.kind === 'move') { G.order = null; return [0, 0]; }
      if (p.atkCd <= 0) {
        if (o.kind === 'gather') harvestObject(o.o);
        else if (o.kind === 'attack') swingAt(o.m);
        else if (o.kind === 'use') useStructure(o.s);
      }
      return [0, 0];
    }
    let ux = dx / d, uy = dy / d;
    // unstick: if we barely moved, slide sideways for a moment
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
    // steer around water
    if (G.world.isWater(p.x + ux * 26, p.y + uy * 26)) {
      for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const c = Math.cos(a), s = Math.sin(a);
        const vx = ux * c - uy * s, vy = ux * s + uy * c;
        if (!G.world.isWater(p.x + vx * 26, p.y + vy * 26)) { ux = vx; uy = vy; break; }
      }
    }
    p.running = d > 320 && o.kind === 'move';
    return [ux, uy];
  }

  // What's under the cursor? Front-most sticker wins.
  // Creatures win over structures, structures over scenery.
  function pick(mx, my) {
    for (const want of [2, 1, 0]) {
      const hit = pickKind(mx, my, want);
      if (hit) return hit;
    }
    return null;
  }
  function pickKind(mx, my, want) {
    for (let i = drawList.length - 1; i >= 0; i--) {
      const d = drawList[i];
      if (d.k !== want || d.sx === undefined) continue;
      if (d.k === 0) { if (OBJ[d.o.type].decor || d.spr !== d.o.type) continue; }
      if (d.k === 2 && d.m.dying) continue;
      const spr = SW.sprites[d.spr];
      if (!spr) continue;
      const sc = Z * (d.sc || 1);
      const pad = want === 2 ? 0 : 6;
      let x0 = d.sx - (spr.ax - pad) * sc, x1 = d.sx + (spr.w - spr.ax - pad) * sc;
      let y0 = d.sy - (spr.ay - pad) * sc, y1 = d.sy + 4 * sc;
      if (x1 - x0 < 30) { const c = (x0 + x1) / 2; x0 = c - 15; x1 = c + 15; }
      if (y1 - y0 < 30) y0 = y1 - 30;
      if (mx < x0 || mx > x1 || my < y0 || my > y1) continue;
      if (want === 2 || solidAt(spr, (mx - d.sx) / sc + spr.ax, (my - d.sy) / sc + spr.ay)) return d;
    }
    return null;
  }
  // Is the sticker (its white border included) opaque at this art-space point?
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
      if (hit.k === 2) return { kind: 'attack', m: hit.m };
      if (hit.k === 1) return { kind: 'use', s: hit.s };
      return { kind: 'gather', o: hit.o };
    }
    const w = screenToWorld(mx, my);
    if (G.world.isWater(w.x, w.y)) return { kind: 'fish', x: w.x, y: w.y };
    return { kind: 'move', x: w.x, y: w.y };
  }
  function pointerOrder(mx, my) {
    if (G.mode !== 'play') return null;
    if (G.fishing) {
      const w = screenToWorld(mx, my);
      if (G.fishing.phase === 'bite' || G.world.isWater(w.x, w.y)) { reel(); return null; }
    }
    const o = orderFromPoint(mx, my);
    setOrder(o);
    if (o.kind === 'move' || o.kind === 'fish') G.marker = { x: o.x, y: o.y, t: 0, lvl: G.world.levelAt(o.x, o.y) };
    else G.marker = null;
    return o;
  }

  // ---------------- update ----------------
  function update(dt) {
    const p = G.player, world = G.world;
    G.time += dt;
    const phase = phaseOf(G.time), day = dayOf(G.time);

    if (G.mode === 'play') {
      const night = isNight(phase);
      if (night && !G.lastPhaseNight) { banner('Night ' + day, 'Scribbles are out. Stay in the light.'); SW.audio.play('night'); }
      if (!night && G.lastPhaseNight) {
        banner('Day ' + day, 'You made it through the night.'); SW.audio.play('dawn');
        gainXP(5 + day * 3, p.x, p.y, p.lvlOff);
      }
      G.lastPhaseNight = night;
      if (phase > 0.5 && phase < 0.6 && !G.tips['dusk' + day]) {
        G.tips['dusk' + day] = 1;
        toast(world.structures.some((s) => s.type === 'campfire' && s.fuel > 30) ? 'Dusk. Head back to a fire, or build a new one.' : 'Dusk is coming. Craft a Campfire (4 wood, 2 stone) before dark.');
      }

      // movement: keyboard / stick overrides click orders
      let ix = input.x, iy = input.y;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
      let il = Math.hypot(ix, iy);
      p.running = keys.has('ShiftLeft') || keys.has('ShiftRight') || (il > 0.97 && !!(input.x || input.y));
      if (il > 0.15) { G.order = null; G.fishing = null; G.marker = null; }
      else if (input.holdMove && input.mouseX >= 0) {
        const w = screenToWorld(input.mouseX, input.mouseY);
        if (!G.order || G.order.kind !== 'move') setOrder({ kind: 'move', x: w.x, y: w.y });
        else { G.order.x = w.x; G.order.y = w.y; }
        G.marker = null;
      }
      if (il <= 0.15 && G.order) { [ix, iy] = runOrder(dt); il = Math.hypot(ix, iy); }
      // standing still with no orders? fight back against whatever is biting you
      if (il <= 0.15 && !G.order && !G.fishing && p.atkCd <= 0) {
        let foe = null, fd = 1e9;
        for (const m of G.mobs) {
          if (m.dying || ENEMIES[m.type].passive || m.state === 'idle') continue;
          const d = dist(m.x, m.y, p.x, p.y);
          if (d < m.r + PR + 16 && d < fd) { fd = d; foe = m; }
        }
        if (foe) { p.fx = (foe.x - p.x) / fd; p.fy = (foe.y - p.y) / fd; if (Math.abs(p.fx) > 0.1) p.face = p.fx > 0 ? 1 : -1; swingAt(foe); }
      }
      if (il > 1) { ix /= il; iy /= il; }
      let spd = 160 * (p.running ? 1.5 : 1) * (p.hunger <= 0 ? 0.7 : 1);
      if (G.fishing) spd = 0;
      const k = 1 - Math.exp(-dt * 14);
      p.vx = lerp(p.vx, ix * spd, k); p.vy = lerp(p.vy, iy * spd, k);
      p.moving = il > 0.15 && spd > 0;
      if (p.moving) {
        p.fx = ix / il; p.fy = iy / il;
        if (Math.abs(ix) > 0.2) p.face = ix > 0 ? 1 : -1;
        p.walkT += dt * (p.running ? 1.4 : 1);
        p.dustT -= dt * (p.running ? 1.8 : 1);
        if (p.dustT <= 0) { p.dustT = 0.2; G.parts.push({ k: 'dust', x: p.x - p.fx * 8, y: p.y + 2, lvl: p.lvlOff, t: 0, life: 0.45 }); }
      } else p.running = false;
      moveBody(p, PR, dt);

      p.atkCd -= dt; p.swingT -= dt; p.hurtT -= dt; p.iframes -= dt;
      if (input.act || keys.has('Space') || keys.has('KeyJ')) { if (!G.fishing) act(); }
      updateFishing(dt);
      if (G.marker) { G.marker.t += dt; if (G.marker.t > 1.2 || !G.order) G.marker = null; }

      // hunger & health
      p.hunger = Math.max(0, p.hunger - dt * 0.4 * (p.running && p.moving ? 1.8 : 1));
      if (p.hunger <= 0) { p.hp -= dt * 1.6; if (p.hp <= 0) die(); }
      else if (p.hunger > 50 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * (0.8 + p.level * 0.1));
      if (p.hunger < 30 && !G.tips.hungry) { G.tips.hungry = 1; toast('Your tummy is rumbling. Press E to eat.'); }
      if (p.hunger > 60) G.tips.hungry = 0;
      if ((G.inv.wood || 0) >= 3 && !G.tips.craft) { G.tips.craft = 1; toast('Nice haul. Press C (or the Craft button) to make tools.'); }

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

      G.saveT -= dt;
      if (G.saveT <= 0) { G.saveT = 8; SW.store.set('save', serialize()); }
      G.cloudT -= dt;
      if (G.cloudT <= 0) { G.cloudT = 60; SW.saves && SW.saves.cloudSave(serialize(), true); }
    } else if (G.mode === 'title') {
      G.drift += dt * 0.05;
      p.x += Math.cos(G.drift) * 40 * dt; p.y += Math.sin(G.drift * 0.7) * 30 * dt;
    } else if (G.mode === 'dead') {
      G.deadT += dt;
    }

    p.lvlOff = lerp(p.lvlOff, world.levelAt(p.x, p.y) * LH, 1 - Math.exp(-dt * 12));
    const ck = 1 - Math.exp(-dt * 6);
    G.cam.x = lerp(G.cam.x, p.x, ck);
    G.cam.y = lerp(G.cam.y, p.y - p.lvlOff / TILT, ck);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 30);

    for (const s of world.structures) {
      if (s.type !== 'campfire' || s.fuel <= 0) continue;
      s.fuel -= dt;
      if (Math.random() < dt * 6) G.parts.push({ k: 'ember', x: s.x + (Math.random() - 0.5) * 14, y: s.y, lvl: s.lvl * LH + 24, t: 0, life: 1 + Math.random(), vx: (Math.random() - 0.5) * 20 });
      if (s.fuel <= 0) spawnPoof(s.x, s.y, s.lvl * LH + 10, '#5b4840');
    }

    if (G.mode !== 'title') { updateMobs(dt, phase, day); spawnMobs(dt, phase, day); }
    updateParticles(dt);
    if (G.hitT.size > 40) for (const [id, t] of G.hitT) if (G.time - t > 0.5) G.hitT.delete(id);
  }

  function moveBody(b, r, dt) {
    const world = G.world;
    const nx = b.x + b.vx * dt;
    if (!world.isWater(nx + Math.sign(b.vx) * 5, b.y)) b.x = nx; else b.vx = 0;
    const ny = b.y + b.vy * dt;
    if (!world.isWater(b.x, ny + Math.sign(b.vy) * 4)) b.y = ny; else b.vy = 0;
    for (const s of world.solidsNear(b.x, b.y, 50, G.time, scratch)) {
      const dx = b.x - s.x, dy = b.y - s.y;
      const d = Math.hypot(dx, dy), min = s.r + r;
      if (d < min && d > 0.001) { b.x = s.x + (dx / d) * min; b.y = s.y + (dy / d) * min; }
    }
  }

  function spawnMobs(dt, phase, day) {
    G.spawnT -= dt;
    if (G.spawnT > 0) return;
    G.spawnT = 1.6;
    const p = G.player, world = G.world;
    const night = isNight(phase);
    let scribbles = 0, hostiles = 0, puffs = 0;
    for (const m of G.mobs) { if (m.dying) continue; if (m.type === 'scribble') scribbles++; else if (m.type === 'puff') puffs++; else hostiles++; }
    const danger = world.dangerAt(p.x, p.y);
    const ring = () => { const a = Math.random() * TAU, d = 480 + Math.random() * 240; return [p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]; };
    if (night && phase < 0.93 && scribbles < Math.min(14, 1 + day + danger)) {
      for (let tries = 0; tries < 8; tries++) {
        const [x, y] = ring();
        if (world.isWater(x, y) || inFireLight(x, y)) continue;
        const m = SW.makeEnemy('scribble', x, y, world.dangerAt(x, y) + Math.floor(day / 4), false);
        m.state = 'chase'; m.lvlOff = world.levelAt(x, y) * LH;
        G.mobs.push(m);
        break;
      }
    }
    const cap = 3 + Math.min(5, danger);
    if (hostiles < cap || puffs < 3) {
      for (let tries = 0; tries < 6; tries++) {
        const [x, y] = ring();
        if (world.isWater(x, y) || inFireLight(x, y)) continue;
        const list = SW.biomeEnemies(world.biomeAt(x, y));
        if (!list.length) continue;
        const type = list[Math.floor(Math.random() * list.length)];
        if (type === 'puff' ? puffs >= 3 || night : hostiles >= cap) continue;
        const lvl = world.dangerAt(x, y);
        const m = SW.makeEnemy(type, x, y, lvl, type !== 'puff' && lvl >= 2 && Math.random() < 0.06);
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
    for (let i = G.mobs.length - 1; i >= 0; i--) {
      const m = G.mobs[i];
      const def = ENEMIES[m.type];
      m.t += dt; m.hurtT -= dt; m.atkCd -= dt; m.stateT -= dt;
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
        const aggro = def.aggro * (m.lvl <= 1 && !def.night ? 0.55 : 1);
        if (m.state === 'idle') {
          m.wanderT -= dt;
          if (m.wanderT <= 0) { m.wanderT = 2 + Math.random() * 2.5; m.wander = Math.random() * TAU; m.idle = Math.random() < 0.4; }
          if (!m.idle) { tx = Math.cos(m.wander) * 0.5; ty = Math.sin(m.wander) * 0.5; }
          if (dist(m.x, m.y, m.homeX, m.homeY) > 260) { tx = (m.homeX - m.x) / 260; ty = (m.homeY - m.y) / 260; }
          if (playing && dp < aggro) { m.state = 'chase'; spawnText(m.x, m.y, m.lvlOff + 54 * m.scale, '!', '#ff4d6d'); }
        } else if (m.state === 'chase') {
          if (!playing || (dp > aggro * 2.4 && !def.night) || dist(m.x, m.y, m.homeX, m.homeY) > 1000) m.state = def.night ? 'chase' : 'return';
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
          if (playing && dp < aggro * 0.6) m.state = 'chase';
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
      if (Math.abs(m.vx) > 8) m.face = m.vx > 0 ? 1 : -1;
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
        f.z = lerp(f.z, 22, 1 - Math.exp(-dt * 8));
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
  function drawSprite(name, sx, sy, rot = 0, kx = 1, ky = 1, which = 'img') {
    const spr = SW.sprites[name];
    if (!spr) return;
    if (rot === 0 && kx === 1 && ky === 1 && Math.abs(spr.S - DPR * Z) < 0.01) {
      // fast path: pixel-aligned copy, no resampling
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(spr[which], Math.round(sx * DPR - spr.ax * spr.S), Math.round(sy * DPR - spr.ay * spr.S));
      return;
    }
    setSpriteTransform(sx, sy, rot, kx, ky);
    ctx.drawImage(spr[which], -spr.ax, -spr.ay, spr.w, spr.h);
  }
  function glowOn(on) { if (canFilter) ctx.filter = on ? 'drop-shadow(0 0 3px #ffd23f) drop-shadow(0 0 3px #ffd23f)' : 'none'; }

  const drawList = [];
  function render() {
    const world = G.world, p = G.player, t = G.time;
    const shx = (Math.random() - 0.5) * G.cam.shake, shy = (Math.random() - 0.5) * G.cam.shake;
    const camX = G.cam.x, camY = G.cam.y;
    G.cam.x += shx / Z; G.cam.y += shy / Z;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#3b86c9';
    ctx.fillRect(0, 0, W, H);

    const v = viewChunks();
    let budget = 3;
    for (let cy = v.cy0; cy <= v.cy1; cy++) {
      for (let cx = v.cx0; cx <= v.cx1; cx++) {
        const ch = world.getChunk(cx, cy);
        if (!ch.canvas || ch.canvasRS !== RS) { if (budget-- > 0) world.buildCanvas(ch, RS); else if (!ch.canvas) continue; }
        const x0 = Math.round(sxOf(cx * CHUNK)), x1 = Math.round(sxOf((cx + 1) * CHUNK));
        const y0 = Math.round(syOf(cy * CHUNK, 0)), y1 = Math.round(syOf((cy + 1) * CHUNK, 0));
        ctx.drawImage(ch.canvas, x0, y0, x1 - x0, y1 - y0);
      }
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6 * Z;
    for (let cy = v.cy0; cy <= v.cy1; cy++) for (let cx = v.cx0; cx <= v.cx1; cx++) {
      for (const w of world.getChunk(cx, cy).waves) {
        const a = Math.sin(t * 1.3 + w[2]);
        if (a < 0.1) continue;
        const sx = sxOf(w[0]), sy = syOf(w[1], 0) + Math.sin(t * 2 + w[2]) * 1.5 * Z;
        ctx.globalAlpha = a * 0.6;
        const L = 5 * Z;
        ctx.beginPath(); ctx.moveTo(sx - L, sy); ctx.quadraticCurveTo(sx - L / 2, sy - 3 * Z, sx, sy); ctx.quadraticCurveTo(sx + L / 2, sy - 3 * Z, sx + L, sy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    drawGroundMarkers();

    drawList.length = 0;
    const marginX = 90 * Z;
    for (let cy = v.cy0; cy <= v.cy1 + 1; cy++) for (let cx = v.cx0; cx <= v.cx1; cx++) {
      for (const o of world.getChunk(cx, cy).objs) {
        const sx = sxOf(o.x);
        if (sx < -marginX || sx > W + marginX) continue;
        const st = world.objState(o, t);
        if (st === 'gone') continue;
        drawList.push({ y: o.y, k: 0, o, spr: st === 'after' ? OBJ[o.type].after : o.type });
      }
    }
    for (const s of world.structures) drawList.push({ y: s.y, k: 1, s, spr: s.type === 'campfire' ? 'campfire' : 'wall' });
    for (const m of G.mobs) drawList.push({ y: m.y, k: 2, m, spr: mobSprite(m), sc: m.scale });
    if (G.mode === 'play') drawList.push({ y: p.y, k: 3 });
    drawList.sort((a, b) => a.y - b.y);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgba(46, 34, 82, 0.2)';
    ctx.beginPath();
    for (const d of drawList) {
      let x, y, lv, rx;
      if (d.k === 0) { const def = OBJ[d.o.type]; if (def.decor || (!def.r && SW.sprites[d.spr].w < 40)) continue; x = d.o.x; y = d.o.y; lv = d.o.lvl * LH; rx = (def.r || 6) + 6; }
      else if (d.k === 1) { x = d.s.x; y = d.s.y; lv = d.s.lvl * LH; rx = d.s.r + 6; }
      else if (d.k === 2) { if (d.m.dying) continue; x = d.m.x; y = d.m.y; lv = d.m.lvlOff; rx = d.m.r; }
      else { x = p.x; y = p.y; lv = p.lvlOff; rx = 13; }
      const sx = sxOf(x), sy = syOf(y, lv);
      ctx.moveTo(sx + rx * Z, sy); ctx.ellipse(sx, sy, rx * Z, rx * 0.42 * Z, 0, 0, TAU);
    }
    ctx.fill();

    const hov = G.hover;
    for (const d of drawList) {
      const lit = hov && ((d.k === 0 && hov.o === d.o) || (d.k === 1 && hov.s === d.s) || (d.k === 2 && hov.m === d.m));
      const tgt = G.order && ((d.k === 0 && G.order.o === d.o) || (d.k === 2 && G.order.m === d.m) || (d.k === 1 && G.order.s === d.s));
      if (lit || tgt) glowOn(true);
      if (d.k === 0) drawObject(d);
      else if (d.k === 1) drawStructure(d);
      else if (d.k === 2) drawMob(d);
      else drawPlayer();
      if (lit || tgt) glowOn(false);
    }

    drawFishing();
    drawParticles();
    drawFloaters();
    drawTags();
    drawLighting();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (grain) { ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H); }
    G.cam.x = camX; G.cam.y = camY;
  }

  function drawGroundMarkers() {
    const mk = G.marker;
    if (mk) {
      const k = mk.t / 1.2, sx = sxOf(mk.x), sy = syOf(mk.y, mk.lvl * LH);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 4 * Z; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(sx, sy, (10 + k * 14) * Z, (4 + k * 6) * Z, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2 * Z; ctx.strokeStyle = '#ffb13b'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // explore-quest compass around the player
    if (G.mode === 'play') {
      const q = G.quests.find((q) => q.kind === 'explore' && !q.done);
      if (q) {
        const p = G.player, a = Math.atan2((q.ty - p.y) * TILT, q.tx - p.x);
        const sx = sxOf(p.x) + Math.cos(a) * 46 * Z, sy = syOf(p.y, p.lvlOff) + Math.sin(a) * 28 * Z;
        ctx.globalAlpha = 0.85;
        drawSprite('uiArrow', sx, sy + 8 * Z, a, 0.7, 0.7);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawObject(d) {
    const o = d.o, def = OBJ[o.type];
    const sx = sxOf(o.x), sy = syOf(o.y, o.lvl * LH);
    d.sx = sx; d.sy = sy;
    const dx = Math.abs(o.x - G.player.x), dy = Math.abs(o.y - G.player.y);
    const near = def.r === 0 ? dx < 480 && dy < 340 : dx < 260 && dy < 200;
    const rot = def.sway && near ? Math.sin(G.time * 1.7 + o.seed * 40 + o.x * 0.01) * 0.028 * def.sway : 0;
    let kx = 1, ky = 1, ox = 0;
    const ht = G.hitT.get(o.id);
    if (ht !== undefined && G.time - ht < 0.25) {
      const k = 1 - (G.time - ht) / 0.25;
      kx = 1 + 0.1 * k; ky = 1 - 0.1 * k; ox = Math.sin((G.time - ht) * 60) * 3 * k * Z;
    }
    drawSprite(d.spr, sx + ox, sy, rot, kx, ky);
  }

  function drawStructure(d) {
    const s = d.s;
    const sx = sxOf(s.x), sy = syOf(s.y, s.lvl * LH);
    d.sx = sx; d.sy = sy;
    let kx = 1, ky = 1;
    if (G.time - s.hitT < 0.2) { kx = 1.08; ky = 0.92; }
    if (s.type === 'campfire') {
      const lit = s.fuel > 0;
      drawSprite(lit ? 'campfire' : 'campfireOut', sx, sy, 0, kx, ky);
      if (lit) {
        const f = Math.floor(G.time * 8 + s.id) % 3;
        const fk = s.fuel < 25 ? 0.55 + (s.fuel / 25) * 0.45 : 1;
        drawSprite('flame' + f, sx, sy - 10 * Z, Math.sin(G.time * 5) * 0.06, fk * (1 + Math.sin(G.time * 13) * 0.04), fk * (1 + Math.sin(G.time * 11) * 0.06));
      }
    } else drawSprite('wall', sx, sy, 0, kx, ky);
  }

  function mobSprite(m) {
    let f = 0;
    if (m.type === 'scribble') f = Math.floor(m.t * 7) % 2;
    else if (m.type === 'puff' || m.type === 'gloop') f = m.hop > 0.15 && m.hop < 0.85 ? 1 : 0;
    else if (m.type === 'pebblor') f = m.atkCd > 1.2 ? 1 : Math.floor(m.t * 2.5) % 2;
    else f = Math.hypot(m.vx, m.vy) > 20 ? Math.floor(m.t * 8) % 2 : 0;
    return m.type + f + (m.face < 0 ? 'L' : '');
  }

  function drawMob(d) {
    const m = d.m, sc = m.scale;
    const sx = sxOf(m.x), sy = syOf(m.y, m.lvlOff);
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
    drawSprite(d.spr, sx + ox, sy - lift, rot, kx, ky);
    if (m.hurtT > 0) { ctx.globalAlpha = 0.8 * alpha; drawSprite(d.spr, sx + ox, sy - lift, rot, kx, ky, 'flash'); }
    ctx.globalAlpha = 1;
  }

  // Name tags and health bars over creatures, plus the hover label.
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), h, r); else ctx.rect(x, y, w, h);
  }

  function drawPlayer() {
    const p = G.player;
    const sx = sxOf(p.x), sy = syOf(p.y, p.lvlOff);
    const frame = p.moving ? Math.floor(p.walkT * 9) % 2 : 0;
    const name = 'player' + frame + (p.face < 0 ? 'L' : '');
    const bob = p.moving ? Math.abs(Math.sin(p.walkT * 9 * Math.PI / 2)) * 3 * Z : 0;
    const ky = p.moving ? 1 + Math.sin(p.walkT * 18) * 0.04 : 1 + Math.sin(G.time * 3) * 0.025;
    const kx = 2 - ky;
    const rot = p.moving ? p.face * (p.running ? 0.12 : 0.06) : 0;
    const fishing = !!G.fishing;
    const toolName = fishing ? 'rod' : p.swingT > 0 ? p.swingTool : bestWeapon() || (G.tools.axe ? 'axe' : G.tools.pick ? 'pick' : null);
    const toolSpr = toolName ? { axe: 'toolAxe', pick: 'toolPick', sword: 'toolSword', gemSword: 'toolGemSword', inkBlade: 'toolInkBlade', rod: 'toolRod' }[toolName] : 'toolHand';
    let tRot;
    if (fishing) tRot = G.fishing.phase === 'cast' ? lerp(-1.2, 0.5, Math.min(1, G.fishing.t / 0.3)) : G.fishing.phase === 'bite' ? 0.2 + Math.sin(G.time * 30) * 0.15 : 0.35;
    else if (p.swingT > 0) { const k = 1 - p.swingT / 0.24; tRot = lerp(-1.9, 1.3, Math.sin(k * Math.PI / 2)); }
    else tRot = toolSpr === 'toolHand' ? 0.2 : -0.35;
    const hx = sx + p.face * 15 * Z, hy = sy - 16 * Z - bob;
    const drawTool = () => {
      if (toolSpr === 'toolHand' && p.swingT <= 0) return;
      const hand = toolSpr === 'toolHand';
      drawSprite(toolSpr, hx, hy + (hand ? 4 : 8) * Z, tRot * p.face, hand ? 1 : 0.85 * p.face, hand ? 1 : 0.85);
    };
    if (p.fy < -0.5 && !fishing) drawTool();
    const flick = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    drawSprite(name, sx, sy - bob, rot, kx, ky);
    if (p.hurtT > 0 || flick) { ctx.globalAlpha = 0.75; drawSprite(name, sx, sy - bob, rot, kx, ky, 'flash'); ctx.globalAlpha = 1; }
    if (p.fy >= -0.5 || fishing) drawTool();
    if (fishing && G.fishing.phase === 'bite') {
      const s = 1 + Math.sin(G.time * 20) * 0.12;
      drawSprite('uiBang', sx, sy - 62 * Z, 0, s, s);
    }
  }

  function drawFishing() {
    const f = G.fishing;
    if (!f) return;
    const p = G.player;
    const tipX = sxOf(p.x) + p.face * 30 * Z, tipY = syOf(p.y, p.lvlOff) - 40 * Z;
    let bx = sxOf(f.x), by = syOf(f.y, 0);
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
      if (q.k === 'peel') {
        const sx = sxOf(q.x) + q.dir * k * 40 * Z, sy = syOf(q.y, q.lvl * LH) - (Math.sin(k * Math.PI * 0.8) * 60 + k * 30) * Z;
        const flip = Math.cos(k * Math.PI * 2.2), sc = 1 - k * 0.55;
        ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        drawSprite(q.spr, sx, sy, q.dir * k * 1.4, Math.abs(flip) * sc + 0.02, sc, flip < 0 ? 'back' : 'img');
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (q.k === 'chip') {
        const sx = sxOf(q.x), sy = syOf(q.y, q.lvl) - q.z * Z;
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - q.size * Z / 2 - 1.2, sy - q.size * Z / 2 - 1.2, q.size * Z + 2.4, q.size * Z + 2.4);
        ctx.fillStyle = q.color; ctx.fillRect(sx - q.size * Z / 2, sy - q.size * Z / 2, q.size * Z, q.size * Z);
      } else if (q.k === 'dot') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(sxOf(q.x), syOf(q.y, q.lvl) - q.z * Z, q.r * Z * (1 - k * 0.5), 0, TAU); ctx.fill();
      } else if (q.k === 'dust') {
        ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sxOf(q.x), syOf(q.y, q.lvl) - k * 6 * Z, (3 + k * 5) * Z, 0, TAU); ctx.fill();
      } else if (q.k === 'ring') {
        ctx.globalAlpha = 0.8 * (1 - k); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * Z;
        ctx.beginPath(); ctx.ellipse(sxOf(q.x), syOf(q.y, q.lvl), (6 + k * 26) * Z, (2.5 + k * 10) * Z, 0, 0, TAU); ctx.stroke();
      } else if (q.k === 'ember') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.5 ? '#ffd23f' : '#ff7a2a';
        ctx.fillRect(sxOf(q.x) - 1.5 * Z, syOf(q.y, q.lvl) - 1.5 * Z, 3 * Z, 3 * Z);
      } else if (q.k === 'text') {
        const sx = sxOf(q.x), sy = syOf(q.y, q.lvl) - k * 30 * Z;
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
      const sx = sxOf(f.x), sy = syOf(f.y, f.lvl * LH);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = 'rgba(46,34,82,0.18)';
      ctx.beginPath(); ctx.ellipse(sx, sy, 7 * Z, 3 * Z, 0, 0, TAU); ctx.fill();
      drawSprite(ITEMS[f.item].icon, sx, sy - f.z * Z + 10 * Z, Math.sin(f.t * 12) * 0.2, 0.75, 0.75);
    }
  }

  function drawLighting() {
    const d = darkness(phaseOf(G.time));
    if (d <= 0.01) return;
    const p = G.player;
    const lw = lightCv.width, lh = lightCv.height;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle = `rgba(16, 18, 54, ${0.84 * d})`;
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
    const pr = (G.tools.lantern ? 200 : 115) * Z / 2;
    if (G.mode !== 'title') hole(sxOf(p.x) / 2, (syOf(p.y, p.lvlOff) - 20 * Z) / 2, pr, G.tools.lantern ? 0.95 : 0.8);
    const fires = burningFires();
    for (const s of fires) hole(sxOf(s.x) / 2, (syOf(s.y, s.lvl * LH) - 14 * Z) / 2, fireRadius(s) * Z / 2 * Math.min(1, s.fuel / 20 + 0.3), 1);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(lightCv, 0, 0, W, H);
    const warm = Math.sin(clamp(d, 0, 1) * Math.PI) * 0.16;
    if (warm > 0.01) { ctx.fillStyle = `rgba(255, 120, 70, ${warm})`; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of fires) {
      const x = sxOf(s.x), y = syOf(s.y, s.lvl * LH) - 14 * Z, r = fireRadius(s) * Z * 0.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 150, 60, ${0.28 * d})`);
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------- hover ----------------
  function updateHover() {
    if (G.mode !== 'play' || input.mouseX < 0 || document.body.classList.contains('touch')) { G.hover = null; canvas.style.cursor = ''; return; }
    const d = pick(input.mouseX, input.mouseY);
    if (!d) {
      const w = screenToWorld(input.mouseX, input.mouseY);
      const water = G.world.isWater(w.x, w.y);
      G.hover = water ? { label: G.tools.rod ? 'Fish here' : 'Water (needs a rod to fish)', lx: input.mouseX, ly: input.mouseY - 22 } : null;
      canvas.style.cursor = water && G.tools.rod ? 'pointer' : 'crosshair';
      return;
    }
    const spr = SW.sprites[d.spr];
    const top = d.sy - (spr.ay - 4) * Z * (d.sc || 1) - 10;
    let label = '';
    if (d.k === 0) label = SW.objVerb(d.o.type) + ' ' + SW.OBJ_NAME[d.o.type];
    else if (d.k === 1) label = d.s.type === 'campfire' ? ((G.inv.wood || 0) > 0 && d.s.fuel < 150 ? 'Add wood to fire' : 'Campfire') : 'Stake Wall';
    else if (ENEMIES[d.m.type].passive) label = 'Hunt Puff';
    G.hover = { o: d.o, s: d.s, m: d.m, label, lx: d.sx, ly: top };
    canvas.style.cursor = 'pointer';
  }

  // ---------------- HUD ----------------
  let hotbarDirty = true, craftDirty = true, questDirty = true;
  const hud = { hp: -1, food: -1, day: -1, xp: -1, region: '' };
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
      return `<button class="slot${usable ? ' usable' : ''}" data-item="${k}" title="${it.name}${usable ? (it.food ? ' (click to eat)' : ' (click to place)') : ''}" style="--tilt:${((i * 37) % 7) - 3}deg">` +
        `<img src="${SW.spriteURL(it.icon)}" alt="${it.name}">` +
        `<span class="count">${G.inv[k]}</span>` + (i < 9 ? `<kbd>${i + 1}</kbd>` : '') + `</button>`;
    }).join('');
    bar.hidden = items.length === 0;
  }

  function renderToolbelt() {
    const owned = Object.keys(TOOLS).filter((t) => G.tools[t]);
    $('toolbelt').innerHTML = owned.map((t) => `<span class="tool" title="${TOOLS[t].name}"><img src="${SW.spriteURL(TOOLS[t].icon)}" alt="${TOOLS[t].name}"></span>`).join('');
  }

  function renderCraft() {
    craftDirty = false;
    const fire = nearFire(G.player.x, G.player.y);
    $('craftTabs').innerHTML = SW.RECIPE_CATS.map(([id, label]) => `<button data-cat="${id}" class="${id === craftCat ? 'on' : ''}">${label}</button>`).join('');
    $('craftList').innerHTML = RECIPES.filter((r) => craftCat === 'all' || r.cat === craftCat).map((r) => {
      const name = r.tool ? TOOLS[r.tool].name : ITEMS[r.gives].name;
      const icon = r.tool ? TOOLS[r.tool].icon : ITEMS[r.gives].icon;
      const owned = r.tool && G.tools[r.tool];
      const locked = r.requires && !G.tools[r.requires];
      const afford = hasCost(r.cost) && (!r.fire || fire) && !locked;
      const cost = Object.entries(r.cost).map(([k, n]) => {
        const ok = (G.inv[k] || 0) >= n;
        return `<span class="cost${ok ? '' : ' short'}"><img src="${SW.spriteURL(ITEMS[k].icon)}" alt="${ITEMS[k].name}">${G.inv[k] || 0}/${n}</span>`;
      }).join('');
      const note = owned ? '<span class="tag">Owned</span>' : locked ? `<span class="tag">Needs ${TOOLS[r.requires].name}</span>` : r.fire && !fire ? '<span class="tag">Needs a lit fire nearby</span>' : '';
      return `<div class="recipe${owned ? ' owned' : ''}${afford && !owned ? ' ready' : ''}">` +
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
  function renderQuests(dt) {
    questT -= dt;
    if (!questDirty && questT > 0) return;
    questDirty = false; questT = 0.5;
    const p = G.player;
    $('quests').innerHTML = G.quests.map((q) => {
      let prog = `${q.have}/${q.need}`;
      if (q.kind === 'explore') { const d = dist(p.x, p.y, q.tx, q.ty); prog = q.done ? 'Found!' : `${(d / 1000).toFixed(1)} km ${compass(q.tx - p.x, q.ty - p.y)}`; }
      const pct = q.kind === 'explore' ? (q.done ? 100 : 0) : Math.round((q.have / q.need) * 100);
      return `<li class="${q.done ? 'done' : ''}"><span class="qt">${q.title}</span><span class="qp">${prog}</span><i style="width:${pct}%"></i></li>`;
    }).join('');
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
    const [px, py] = toM(p.x, p.y);
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
    g.fillStyle = '#3b2f4f'; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
    g.restore();
  }

  function updateHUD(dt) {
    const p = G.player;
    const hp = Math.max(0, Math.round(p.hp)), food = Math.round(p.hunger);
    if (hp !== hud.hp) { hud.hp = hp; $('hpBar').style.width = (hp / p.maxHp) * 100 + '%'; $('hpNum').textContent = hp; $('hpStat').classList.toggle('low', hp < p.maxHp * 0.3); }
    if (food !== hud.food) { hud.food = food; $('foodBar').style.width = food + '%'; $('foodNum').textContent = food; $('foodStat').classList.toggle('low', food < 25); }
    const xpk = p.level * 100000 + p.xp;
    if (xpk !== hud.xp) { hud.xp = xpk; $('lvlNum').textContent = p.level; $('xpBar').style.width = Math.min(100, (p.xp / SW.xpToNext(p.level)) * 100) + '%'; $('xpNum').textContent = `${Math.floor(p.xp)}/${SW.xpToNext(p.level)}`; }
    const day = dayOf(G.time);
    if (day !== hud.day) { hud.day = day; $('dayNum').textContent = day; }
    $('dayLabel').textContent = isNight(phaseOf(G.time)) ? 'Night' : 'Day';
    if (G.region && hud.region !== G.region.id) {
      hud.region = G.region.id;
      $('regionName').textContent = G.region.name;
      const dg = $('regionDanger');
      dg.textContent = 'Danger ' + G.region.danger;
      dg.className = G.region.danger > p.level + 2 ? 'hot' : G.region.danger > p.level ? 'warm' : '';
    }
    if (hotbarDirty) renderHotbar();
    if (!$('craftPanel').hidden) {
      const nf = !!nearFire(p.x, p.y);
      if (nf !== renderCraft.nf) { renderCraft.nf = nf; craftDirty = true; }
      if (craftDirty) renderCraft();
    }
    renderQuests(dt);
    renderDial();
    renderMinimap(dt);
    const useLbl = G.fishing ? (G.fishing.phase === 'bite' ? 'Reel!' : 'Reel') : 'Use';
    if ($('tActLbl').textContent !== useLbl) $('tActLbl').textContent = useLbl;
    $('tAct').classList.toggle('bite', !!(G.fishing && G.fishing.phase === 'bite'));
  }

  // ---------------- world map ----------------
  const MAP_N = 240;
  function mapExtent() { return SW.ISLAND_R * 1.25; }
  function renderWorldMap() {
    const cv = $('worldMap');
    const g = cv.getContext('2d');
    if (!G.worldMap) G.worldMap = { img: g.createImageData(MAP_N, MAP_N), row: 0 };
    const wm = G.worldMap, E = mapExtent(), S = (E * 2) / MAP_N;
    // fill a few rows per frame so opening the map never stalls the game
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
    // danger rings around where you started
    const [sx0, sy0] = toM(G.world.spawn.x, G.world.spawn.y);
    g.font = '800 12px Sniglet, system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    for (const dgr of [3, 6, 9, 12]) {
      const r = ((1100 + (dgr - 1) * 1500) / (E * 2)) * size;
      g.setLineDash([]); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(sx0, sy0, r, 0, TAU); g.stroke();
      g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeStyle = dgr >= 9 ? 'rgba(214,48,79,0.85)' : 'rgba(59,47,79,0.7)'; g.stroke();
      g.setLineDash([]); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText('Danger ' + dgr, sx0, sy0 - r - 4);
      g.fillStyle = dgr >= 9 ? '#d6304f' : '#3b2f4f'; g.fillText('Danger ' + dgr, sx0, sy0 - r - 4);
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
      $('mapInfo').textContent = `${G.regionsSeen.size} regions discovered${r ? ' · You are in ' + r.name + ', danger ' + r.danger : ''}`;
    }
  }
  function mapClick(e) {
    const cv = $('worldMap');
    const rect = cv.getBoundingClientRect();
    const E = mapExtent();
    const wx = ((e.clientX - rect.left) / rect.width) * E * 2 - E, wy = ((e.clientY - rect.top) / rect.height) * E * 2 - E;
    let best = null, bd = ((E * 2) / rect.width) * 14;
    for (const s of G.world.structures) if (s.type === 'campfire') { const d = dist(s.x, s.y, wx, wy); if (d < bd) { bd = d; best = s; } }
    if (!best) { toast('Click one of your campfires on the map to travel there.'); return; }
    if (G.mode !== 'play') { toast('Resume the game to travel.'); return; }
    const p = G.player;
    if (G.mobs.some((m) => !m.dying && !ENEMIES[m.type].passive && m.state === 'chase' && dist(m.x, m.y, p.x, p.y) < 300)) { toast('You cannot travel while something is chasing you.'); SW.audio.play('deny'); return; }
    if (p.hunger < 10) { toast('Too hungry to travel. Eat something first.'); return; }
    spawnPoof(p.x, p.y, p.lvlOff, '#ffd23f');
    p.x = best.x; p.y = best.y + 34; p.vx = p.vy = 0; p.hunger -= 8;
    G.order = null; G.fishing = null;
    G.mobs = G.mobs.filter((m) => dist(m.x, m.y, p.x, p.y) < 1500);
    G.cam.x = p.x; G.cam.y = p.y - LH / TILT;
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
    // only keep harvest records that still matter (regrowing ones expire)
    const removed = [];
    for (const [id, t] of G.world.removed) {
      const type = idType(id);
      const def = type && OBJ[type];
      if (def && def.regrow && now - t > def.regrow) continue;
      removed.push([id, Math.round(t)]);
    }
    return {
      v: 2, game: 'stickerwild', seed: G.seed, seedText: G.seedText, time: Math.round(now * 10) / 10, savedAt: Date.now(),
      player: { x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), maxHp: p.maxHp, hunger: Math.round(p.hunger), level: p.level, xp: p.xp },
      inv: G.inv, tools: G.tools, stats: G.stats, tips: G.tips,
      quests: G.quests.filter((q) => !q.done), questSeq: G.questSeq, regionsSeen: [...G.regionsSeen],
      removed, damage: [...G.world.damage],
      structures: G.world.structures.map((s) => ({ ...s, fuel: Math.round(s.fuel) })), nextId: G.world.nextId,
    };
  }
  function validSave(s) { return !!(s && typeof s === 'object' && typeof s.seed === 'number' && s.player && typeof s.player.x === 'number'); }
  function restore(s) {
    if (!validSave(s)) { toast('That is not a Stickerwild save.'); return false; }
    typeCache.clear();
    newGame(s.seed, 'play', s.seedText);
    G.time = s.time || 0;
    Object.assign(G.player, s.player);
    G.player.maxHp = s.player.maxHp || 100; G.player.level = s.player.level || 1; G.player.xp = s.player.xp || 0;
    G.inv = s.inv || {}; G.tools = s.tools || {}; G.stats = Object.assign(G.stats, s.stats || {}); G.tips = s.tips || {};
    G.world.removed = new Map(s.removed || []); G.world.damage = new Map(s.damage || []);
    G.world.structures = s.structures || []; G.world.nextId = s.nextId || 1;
    G.regionsSeen = new Set(s.regionsSeen || []);
    G.questSeq = s.questSeq || G.questSeq;
    if (s.quests && s.quests.length) { G.quests = s.quests; while (G.quests.length < 3) addQuest(); }
    G.cam.x = G.player.x; G.cam.y = G.player.y - LH / TILT;
    G.lastPhaseNight = isNight(phaseOf(G.time));
    hotbarDirty = craftDirty = questDirty = true;
    hud.hp = hud.food = hud.day = hud.xp = -1; hud.region = '';
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
  }

  function startGame(seed, seedText) {
    SW.audio.unlock();
    newGame(seed, 'play', seedText);
    renderToolbelt();
    showScreen(null);
    hud.hp = hud.food = hud.day = hud.xp = -1; hud.region = '';
    const touch = document.body.classList.contains('touch');
    toast(touch ? 'Tap anywhere to walk there. Tap a tree, rock or creature to act on it.' : 'Click to walk. Click a tree, rock or creature to act on it. WASD works too.', 5600);
    setTimeout(() => G && G.mode === 'play' && banner('Day 1', 'The island is huge. Follow your quests.'), 300);
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
      $('pauseInfo').textContent = `Level ${G.player.level} · Day ${dayOf(G.time)} · ${G.regionsSeen.size} regions found · Seed ${G.seedText}`;
    } else if (!on && G.mode === 'paused') { G.mode = 'play'; showScreen(null); last = performance.now(); }
  }

  // ---------------- input ----------------
  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { if (e.code === 'Enter' && e.target.id === 'seedInput') $('startBtn').click(); return; }
      SW.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (G.mode === 'play') {
        if (e.code === 'Space' && G.fishing) reel();
        if (e.code === 'KeyC' || e.code === 'Tab') toggleCraft();
        else if (e.code === 'KeyE') eatBest();
        else if (e.code === 'KeyM') toggleMap();
        else if (e.code === 'KeyQ') $('quests').classList.toggle('collapsed');
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
    window.addEventListener('blur', () => { keys.clear(); input.act = false; input.holdMove = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.mode === 'play') pause(true); });

    canvas.addEventListener('mousedown', (e) => {
      if (G.mode !== 'play' || e.button !== 0) return;
      SW.audio.unlock();
      input.mouseX = e.clientX; input.mouseY = e.clientY;
      const o = pointerOrder(e.clientX, e.clientY);
      input.holdMove = !!(o && o.kind === 'move');
    });
    canvas.addEventListener('mousemove', (e) => { input.mouseX = e.clientX; input.mouseY = e.clientY; });
    canvas.addEventListener('mouseleave', () => { input.mouseX = -1; input.holdMove = false; });
    window.addEventListener('mouseup', () => {
      if (input.holdMove && G.order && G.order.kind === 'move') G.marker = { x: G.order.x, y: G.order.y, t: 0, lvl: G.world.levelAt(G.order.x, G.order.y) };
      input.holdMove = false; input.act = false;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomMul * (e.deltaY > 0 ? 0.92 : 1.08)); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    $('hotbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      const it = b.dataset.item;
      if (ITEMS[it].food || ITEMS[it].place) useItem(it);
      else toast(ITEMS[it].name + ' is a crafting material. Open crafting with C.');
    });
    $('craftList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-recipe]');
      if (b) craft(RECIPES.find((r) => r.id === b.dataset.recipe));
    });
    $('craftTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { craftCat = b.dataset.cat; renderCraft(); } });
    $('craftBtn').addEventListener('click', () => toggleCraft());
    $('craftClose').addEventListener('click', () => toggleCraft(false));
    $('mapBtn').addEventListener('click', () => toggleMap());
    $('mapClose').addEventListener('click', () => toggleMap(false));
    $('worldMap').addEventListener('click', mapClick);
    $('menuBtn').addEventListener('click', () => pause(true));
    $('questsToggle').addEventListener('click', () => $('quests').classList.toggle('collapsed'));
    $('startBtn').addEventListener('click', () => { const txt = $('seedInput').value.trim() || randomSeedWord(); startGame(SW.seedFromString(txt), txt); });
    $('diceBtn').addEventListener('click', () => { $('seedInput').value = randomSeedWord(); });
    $('continueBtn').addEventListener('click', () => { const s = SW.store.get('save', null); if (s) { SW.audio.unlock(); if (restore(s)) toast('Welcome back.'); } });
    $('retryBtn').addEventListener('click', () => respawn());
    $('newBtn').addEventListener('click', () => goTitle());
    $('resumeBtn').addEventListener('click', () => pause(false));
    $('quitBtn').addEventListener('click', () => { const s = serialize(); SW.store.set('save', s); SW.saves && SW.saves.cloudSave(s, true); goTitle(); });
    $('pauseMapBtn').addEventListener('click', () => { pause(false); toggleMap(true); });
    $('muteBtn').addEventListener('click', () => setMute(!SW.audio.muted));
    $('zoomIn').addEventListener('click', () => setZoom(zoomMul * 1.15));
    $('zoomOut').addEventListener('click', () => setZoom(zoomMul / 1.15));

    // touch: tap to act, drag to steer with a stick
    const stick = $('stick'), knob = $('knob');
    let stickId = null, sx0 = 0, sy0 = 0, dragging = false, t0 = 0;
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true, once: true });
    canvas.addEventListener('touchstart', (e) => {
      SW.audio.unlock();
      for (const t of e.changedTouches) {
        if (stickId === null) { stickId = t.identifier; sx0 = t.clientX; sy0 = t.clientY; dragging = false; t0 = performance.now(); }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - sx0, dy = t.clientY - sy0;
        const d = Math.hypot(dx, dy), max = 46;
        if (!dragging && d > 14) {
          dragging = true;
          stick.style.left = sx0 + 'px'; stick.style.top = sy0 + 'px'; stick.classList.add('on');
        }
        if (!dragging) continue;
        if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
        input.x = dx / max; input.y = dy / max;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      e.preventDefault();
    }, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        if (!dragging && performance.now() - t0 < 500) pointerOrder(t.clientX, t.clientY);
        stickId = null; dragging = false; input.x = input.y = 0; stick.classList.remove('on');
        knob.style.transform = 'translate(-50%, -50%)';
      }
    };
    canvas.addEventListener('touchend', endStick);
    canvas.addEventListener('touchcancel', endStick);
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); SW.audio.unlock(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); });
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', () => off && off());
    };
    hold($('tAct'), () => { if (G.fishing) reel(); else input.act = true; }, () => { input.act = false; });
    hold($('tEat'), () => G.mode === 'play' && eatBest());
  }

  function setMute(m) {
    SW.audio.setMuted(m);
    $('muteBtn').classList.toggle('off', m);
    $('muteBtn').title = m ? 'Sound off' : 'Sound on';
    $('muteBtn').setAttribute('aria-pressed', String(m));
  }
  function closeSavePanel() {
    $('savePanel').hidden = true;
    if (G.mode === 'paused') $('pauseScreen').hidden = false;
    else if (G.mode === 'title') { $('titleScreen').hidden = false; $('hud').hidden = true; }
  }

  // ---------------- boot ----------------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.mode !== 'paused') update(dt);
    updateHover();
    render();
    if (G.mode !== 'title') updateHUD(dt);
    if (!$('mapScreen').hidden) renderWorldMap();
    frame.dropT = (frame.dropT || 0) - dt;
    if (frame.dropT <= 0) {
      frame.dropT = 2;
      const keep = Math.ceil(Math.max(W, H) / Z / CHUNK / TILT) + 2;
      G.world.dropFarCanvases(Math.floor(G.cam.x / CHUNK), Math.floor(G.cam.y / CHUNK), keep);
    }
    requestAnimationFrame(frame);
  }

  function boot(data) {
    resize();
    SW.buildSprites(clamp(Z * DPR, 0.6, 3));
    makeGrain();
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = SW.spriteURL(img.dataset.icon); });
    bindInput();
    setMute(SW.audio.muted);
    window.addEventListener('resize', () => { resize(); clearTimeout(setZoom.t); setZoom.t = setTimeout(() => { rescale(); prebuild(); }, 200); });
    if (data && validSave(data.save)) restore(data.save);
    else goTitle();
    last = performance.now();
    requestAnimationFrame(frame);
    document.body.classList.add('ready');
    SW.saves && SW.saves.init();
  }

  // hooks shared with save.js, automated checks and the artifact viewer's live updates
  SW.game = {
    get G() { return G; }, newGame, startGame, act, useItem, craft, restore, serialize, toast, saveName, validSave,
    pause, goTitle, showScreen, closeSavePanel, dayOf, gainXP, pointerOrder, setOrder, startFishing, reel,
    setPhase(ph) { G.time = (dayOf(G.time) - 1) * DAY_LEN + ph * DAY_LEN; },
    sxOf: (x) => sxOf(x), syOf: (y, l) => syOf(y, l),
  };
  try { window.claude?.hot?.snapshot?.(() => ({ save: G && (G.mode === 'play' || G.mode === 'paused') ? serialize() : null })); } catch (e) { /* not in a viewer */ }
  const startFn = (data) => boot(data || {});
  if (window.claude?.hot?.ready) window.claude.hot.ready(startFn); else startFn(window.claude?.hot?.data ?? {});
})();
