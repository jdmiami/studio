// Stickerwild — game loop, player, creatures, crafting, day/night, HUD.
'use strict';
(function () {
  const { clamp, lerp, TAU, dist } = SW;
  const TILT = SW.TILT, LH = SW.LEVEL_H, CHUNK = SW.CHUNK, OBJ = SW.OBJ;
  const DAY_LEN = 180;           // seconds per full day
  const PR = 11;                 // player radius
  const $ = (id) => document.getElementById(id);

  // ---------------- items, tools, recipes ----------------
  const ITEMS = {
    berry: { name: 'Berries', icon: 'itemBerry', food: { hunger: 14, hp: 0 } },
    cooked: { name: 'Grilled Meat', icon: 'itemCooked', food: { hunger: 40, hp: 10 } },
    meat: { name: 'Raw Meat', icon: 'itemMeat', food: { hunger: 16, hp: -6 } },
    salve: { name: 'Petal Salve', icon: 'itemSalve', food: { hunger: 0, hp: 40 } },
    campfire: { name: 'Campfire', icon: 'campfire', place: true },
    wall: { name: 'Stake Wall', icon: 'wall', place: true },
    wood: { name: 'Wood', icon: 'itemWood' },
    stone: { name: 'Stone', icon: 'itemStone' },
    petal: { name: 'Petals', icon: 'itemPetal' },
    gem: { name: 'Crystal', icon: 'itemGem' },
  };
  const ORDER = ['berry', 'cooked', 'meat', 'salve', 'campfire', 'wall', 'wood', 'stone', 'petal', 'gem'];
  const TOOLS = {
    axe: { name: 'Stone Axe', icon: 'toolAxe' },
    pick: { name: 'Pickaxe', icon: 'toolPick' },
    sword: { name: 'Stone Sword', icon: 'toolSword' },
    gemSword: { name: 'Crystal Blade', icon: 'toolGemSword' },
    lantern: { name: 'Lantern', icon: 'itemLantern' },
  };
  const RECIPES = [
    { id: 'campfire', gives: 'campfire', cost: { wood: 4, stone: 2 }, desc: 'Scribbles will not step into its light. Burns about one night; hit it while holding wood to refuel.' },
    { id: 'axe', tool: 'axe', cost: { wood: 3, stone: 2 }, desc: 'Chops trees twice as fast.' },
    { id: 'pick', tool: 'pick', cost: { wood: 3, stone: 3 }, desc: 'Breaks rock faster and can mine crystals.' },
    { id: 'sword', tool: 'sword', cost: { wood: 2, stone: 4 }, desc: 'Hits creatures for 3 instead of 1.' },
    { id: 'wall', gives: 'wall', cost: { wood: 3 }, desc: 'Blocks Scribbles. Ring your fire with a few.' },
    { id: 'cooked', gives: 'cooked', fire: true, cost: { meat: 1 }, desc: '+40 food, +10 health. Craft next to a lit campfire.' },
    { id: 'salve', gives: 'salve', cost: { petal: 3, berry: 1 }, desc: 'Restores 40 health.' },
    { id: 'lantern', tool: 'lantern', cost: { wood: 2, stone: 1, gem: 1 }, desc: 'Wider light around you. Scribbles slow down inside it.' },
    { id: 'gemSword', tool: 'gemSword', requires: 'sword', cost: { wood: 2, gem: 3 }, desc: 'Hits creatures for 6.' },
  ];

  // ---------------- canvas & sizing ----------------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const lightCv = document.createElement('canvas');
  const lctx = lightCv.getContext('2d');
  let W = 0, H = 0, DPR = 1, Z = 1, RS = 1;
  let grain = null;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    Z = clamp(Math.min(W, H * 1.7) / 960, 0.75, 1.6);
    RS = clamp(Math.round(Z * DPR * 2) / 2, 1, 2.5);
    lightCv.width = Math.ceil(W / 2); lightCv.height = Math.ceil(H / 2);
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
  const input = { x: 0, y: 0, act: false, touchX: 0, touchY: 0 };
  const scratch = [];

  function newGame(seed, mode) {
    const world = new SW.World(seed);
    const sp = world.findSpawn();
    G = {
      seed, world, mode,
      time: DAY_LEN * 0.03,
      player: { x: sp.x, y: sp.y, vx: 0, vy: 0, fx: 1, fy: 0, face: 1, hp: 100, hunger: 100, atkCd: 0, swingT: 0, swingTool: null, hurtT: 0, iframes: 0, walkT: 0, moving: false, lvlOff: LH, dustT: 0 },
      inv: { berry: 2 }, tools: {},
      mobs: [], parts: [], floaters: [],
      spawnT: 1, hitT: new Map(),
      cam: { x: sp.x, y: sp.y, shake: 0 },
      stats: { harvested: 0, kills: 0, crafted: 0 },
      tips: {}, lastPhaseNight: false, dayShown: 1, deadT: 0, saveT: 0,
      drift: Math.random() * TAU,
    };
    G.cam.y = sp.y - LH / TILT;
    // clear a little patch around the spawn point so you never start inside a tree
    for (const ch of nearChunks(sp.x, sp.y, 1)) ch.objs = ch.objs.filter((o) => !(OBJ[o.type].r && dist(o.x, o.y, sp.x, sp.y) < 64));
    hotbarDirty = true; craftDirty = true;
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

  // ---------------- helpers ----------------
  function toast(msg, ms = 3600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function banner(big, small) {
    const b = $('banner');
    b.querySelector('.big').textContent = big;
    b.querySelector('.small').textContent = small;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function tipOnce(key, msg) { if (!G.tips[key]) { G.tips[key] = 1; toast(msg); } }

  function addItem(item, n) {
    G.inv[item] = (G.inv[item] || 0) + n;
    hotbarDirty = true; craftDirty = true;
    bump(item);
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
  function spawnText(x, y, lvl, text, color) { G.parts.push({ k: 'text', x, y, lvl, t: 0, life: 0.9, text, color }); }
  function spawnPoof(x, y, lvl, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      G.parts.push({ k: 'dot', x, y, lvl, vx: Math.cos(a) * 90, vy: Math.sin(a) * 55, z: 14, t: 0, life: 0.55, r: 4 + Math.random() * 4, color: i % 2 ? '#ffffff' : color });
    }
  }
  function dropItems(drops, x, y, lvl) {
    for (const item in drops) {
      for (let i = 0; i < drops[item]; i++) {
        const a = Math.random() * TAU, s = 50 + Math.random() * 60;
        G.floaters.push({ item, x, y, lvl, z: 18, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 220 + Math.random() * 80, t: -i * 0.05 });
      }
    }
  }

  // ---------------- player actions ----------------
  function bestWeapon() { return G.tools.gemSword ? 'gemSword' : G.tools.sword ? 'sword' : null; }
  function weaponDamage() { return G.tools.gemSword ? 6 : G.tools.sword ? 3 : 1; }

  function act() {
    const p = G.player;
    if (p.atkCd > 0 || G.mode !== 'play') return;
    p.atkCd = 0.36; p.swingT = 0.24;
    const hx = p.x + p.fx * 20, hy = p.y + p.fy * 20;

    // creatures first
    let best = null, bd = 1e9;
    for (const m of G.mobs) {
      if (m.dying) continue;
      const d = dist(hx, hy, m.x, m.y);
      if (d < 30 + m.r && d < bd) { bd = d; best = m; }
    }
    if (best) {
      p.swingTool = bestWeapon() || (G.tools.axe ? 'axe' : null);
      hitMob(best, weaponDamage());
      return;
    }

    // structures
    for (const s of G.world.structures) {
      if (dist(hx, hy, s.x, s.y) < 30 + s.r) {
        p.swingTool = null;
        if (s.type === 'campfire' && (G.inv.wood || 0) > 0 && s.fuel < 150) {
          G.inv.wood--; if (!G.inv.wood) delete G.inv.wood; hotbarDirty = craftDirty = true;
          s.fuel = Math.min(170, Math.max(0, s.fuel) + 45);
          spawnText(s.x, s.y, s.lvl * LH + 40, 'fuel +45s', '#ffb13b');
          SW.audio.play('place');
          return;
        }
        s.hp -= 1; s.hitT = G.time; SW.audio.play('chop');
        spawnChips(s.x, s.y, s.lvl * LH, '#b07a46', 4);
        if (s.hp <= 0) {
          G.world.structures.splice(G.world.structures.indexOf(s), 1);
          spawnPeel(s.type === 'campfire' ? (s.fuel > 0 ? 'campfire' : 'campfireOut') : 'wall', s.x, s.y, s.lvl);
          dropItems({ wood: 1 }, s.x, s.y, s.lvl);
          SW.audio.play('peel');
        }
        return;
      }
    }

    // natural objects
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
    if (!target) { p.swingTool = bestWeapon(); SW.audio.play('swing'); return; }
    const def = OBJ[target.type];
    p.swingTool = def.tool === 'axe' && G.tools.axe ? 'axe' : def.tool === 'pick' && G.tools.pick ? 'pick' : null;
    if (def.needs && !G.tools[def.needs]) {
      G.hitT.set(target.id, G.time);
      SW.audio.play('deny');
      toast('Crystals are too hard by hand. Craft a Pickaxe first.');
      return;
    }
    let dmg = 1;
    if (def.tool === 'axe' && G.tools.axe) dmg = 2;
    if (def.tool === 'pick' && G.tools.pick) dmg = 2.5;
    let hp = G.world.damage.has(target.id) ? G.world.damage.get(target.id) : def.hp;
    hp -= dmg;
    G.hitT.set(target.id, G.time);
    const chipColor = def.tool === 'pick' ? (target.type === 'crystal' ? '#8fe8f6' : '#a3a1b5') : target.type.startsWith('flower') ? '#ff7aa8' : '#6bbf4a';
    spawnChips(target.x, target.y, target.lvl * LH + 20, chipColor, 5);
    SW.audio.play(def.sound || 'chop');
    if (hp <= 0) {
      G.world.removed.set(target.id, G.time);
      G.world.damage.delete(target.id);
      spawnPeel(target.type, target.x, target.y, target.lvl);
      dropItems(def.drops, target.x, target.y, target.lvl);
      G.stats.harvested++;
      setTimeout(() => SW.audio.play('peel'), 40);
    } else G.world.damage.set(target.id, hp);
  }

  function hitMob(m, dmg) {
    m.hp -= dmg; m.hurtT = 0.25;
    const p = G.player;
    const d = Math.max(1, dist(m.x, m.y, p.x, p.y));
    m.kx = ((m.x - p.x) / d) * 260; m.ky = ((m.y - p.y) / d) * 260;
    spawnText(m.x, m.y, m.lvlOff + 46, '-' + dmg, '#ff3b5c');
    SW.audio.play('hit');
    G.cam.shake = Math.max(G.cam.shake, 3);
    if (m.hp <= 0) {
      m.dying = 0.001;
      spawnPoof(m.x, m.y, m.lvlOff, m.type === 'scribble' ? '#2b2340' : '#f4ecff');
      SW.audio.play('poof');
      if (m.type === 'puff') dropItems({ meat: Math.random() < 0.5 ? 2 : 1 }, m.x, m.y, m.lvlOff / LH);
      else { G.stats.kills++; if (Math.random() < 0.35) dropItems({ stone: 1 }, m.x, m.y, m.lvlOff / LH); }
    }
  }

  function hurtPlayer(dmg, fromX, fromY) {
    const p = G.player;
    if (p.iframes > 0 || G.mode !== 'play') return;
    p.hp -= dmg; p.iframes = 0.7; p.hurtT = 0.35;
    const d = Math.max(1, dist(p.x, p.y, fromX, fromY));
    p.vx += ((p.x - fromX) / d) * 320; p.vy += ((p.y - fromY) / d) * 320;
    G.cam.shake = 9;
    SW.audio.play('hurt');
    $('hud').classList.remove('ouch'); void $('hud').offsetWidth; $('hud').classList.add('ouch');
    if (p.hp <= 0) die();
  }

  function useItem(item) {
    if (G.mode !== 'play' || !(G.inv[item] > 0)) return;
    const def = ITEMS[item], p = G.player;
    if (def.food) {
      if (def.food.hp > 0 && def.food.hunger === 0 && p.hp >= 100) { toast('You are already at full health.'); return; }
      G.inv[item]--; if (!G.inv[item]) delete G.inv[item];
      p.hunger = clamp(p.hunger + def.food.hunger, 0, 100);
      p.hp = clamp(p.hp + def.food.hp, 0, 100);
      if (def.food.hunger) spawnText(p.x, p.y, p.lvlOff + 56, '+' + def.food.hunger + ' food', '#ff9a3c');
      if (def.food.hp) spawnText(p.x + 10, p.y, p.lvlOff + 40, (def.food.hp > 0 ? '+' : '') + def.food.hp + ' hp', def.food.hp > 0 ? '#2fb36f' : '#ff3b5c');
      if (item === 'meat') tipOnce('rawmeat', 'Raw meat hurts a little. Grill it at a campfire (Craft menu).');
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
      if (item === 'campfire') tipOnce('placedfire', 'Fire lit. Scribbles will not enter the light.');
    }
  }

  function eatBest() {
    const p = G.player;
    const order = p.hp < 45 && G.inv.salve ? ['salve', 'cooked', 'berry', 'meat'] : ['cooked', 'berry', 'meat', 'salve'];
    for (const it of order) if (G.inv[it] > 0) { useItem(it); return; }
    toast('Nothing to eat. Pick berries from bushes or hunt Puffs.');
    SW.audio.play('deny');
  }

  function craft(r) {
    if (G.mode !== 'play') return;
    if (r.tool && G.tools[r.tool]) return;
    if (r.requires && !G.tools[r.requires]) { toast('Craft a ' + TOOLS[r.requires].name + ' first.'); return; }
    if (r.fire && !nearFire(G.player.x, G.player.y)) { toast('Stand next to a lit campfire to grill meat.'); SW.audio.play('deny'); return; }
    if (!hasCost(r.cost)) { SW.audio.play('deny'); return; }
    payCost(r.cost);
    if (r.tool) { G.tools[r.tool] = true; toast(TOOLS[r.tool].name + ' crafted.'); }
    else addItem(r.gives, 1);
    G.stats.crafted++;
    SW.audio.play('craft');
    spawnPoof(G.player.x, G.player.y, G.player.lvlOff + 20, '#ffd23f');
    craftDirty = hotbarDirty = true;
    renderToolbelt();
  }

  function die() {
    const p = G.player;
    p.hp = 0;
    G.mode = 'dead'; G.deadT = 0;
    spawnPeel(p.face < 0 ? 'player0L' : 'player0', p.x, p.y, p.lvlOff / LH);
    SW.audio.play('death');
    SW.store.set('save', null);
    const days = dayOf(G.time) - 1 + phaseOf(G.time);
    const best = SW.store.get('best', 0);
    const isBest = days > best;
    if (isBest) SW.store.set('best', days);
    setTimeout(() => {
      $('deathDays').textContent = days.toFixed(1);
      $('deathStats').innerHTML =
        `<li><b>${G.stats.harvested}</b> stickers peeled</li><li><b>${G.stats.kills}</b> Scribbles erased</li><li><b>${G.stats.crafted}</b> things crafted</li>`;
      $('deathBest').textContent = isBest ? 'New best!' : 'Best: ' + best.toFixed(1) + ' days';
      $('deathSeed').textContent = G.seed;
      showScreen('deathScreen');
    }, 1300);
  }

  // ---------------- update ----------------
  function update(dt) {
    const p = G.player, world = G.world;
    G.time += dt;
    const phase = phaseOf(G.time), day = dayOf(G.time);

    if (G.mode === 'play') {
      // day / night transitions
      const night = isNight(phase);
      if (night && !G.lastPhaseNight) { banner('Night ' + day, 'Scribbles are out. Stay in the light.'); SW.audio.play('night'); }
      if (!night && G.lastPhaseNight) { banner('Day ' + day, 'You made it through the night.'); SW.audio.play('dawn'); }
      G.lastPhaseNight = night;
      if (phase > 0.5 && phase < 0.6 && !G.tips['dusk' + day]) {
        G.tips['dusk' + day] = 1;
        toast(G.world.structures.some((s) => s.type === 'campfire' && s.fuel > 30) ? 'Dusk. Head back to your fire.' : 'Dusk is coming. Craft a Campfire (4 wood, 2 stone) before dark.');
      }

      // movement input
      let ix = input.x, iy = input.y;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
      const il = Math.hypot(ix, iy);
      if (il > 1) { ix /= il; iy /= il; }
      const spd = 150 * (p.hunger <= 0 ? 0.75 : 1);
      const k = 1 - Math.exp(-dt * 14);
      p.vx = lerp(p.vx, ix * spd, k); p.vy = lerp(p.vy, iy * spd, k);
      p.moving = il > 0.15;
      if (p.moving) {
        const l = Math.hypot(ix, iy);
        p.fx = ix / l; p.fy = iy / l;
        if (Math.abs(ix) > 0.2) p.face = ix > 0 ? 1 : -1;
        p.walkT += dt;
        p.dustT -= dt;
        if (p.dustT <= 0) { p.dustT = 0.2; G.parts.push({ k: 'dust', x: p.x - p.fx * 8, y: p.y + 2, lvl: p.lvlOff, t: 0, life: 0.45 }); }
      }
      moveBody(p, PR, dt);

      // timers
      p.atkCd -= dt; p.swingT -= dt; p.hurtT -= dt; p.iframes -= dt;
      if (input.act || keys.has('Space') || keys.has('KeyJ')) act();

      // hunger & health
      p.hunger = Math.max(0, p.hunger - dt * 0.42);
      if (p.hunger <= 0) { p.hp -= dt * 1.6; if (p.hp <= 0) die(); }
      else if (p.hunger > 50 && p.hp < 100) p.hp = Math.min(100, p.hp + dt * 0.8);
      if (p.hunger < 30 && !G.tips.hungry) { G.tips.hungry = 1; toast('Your tummy is rumbling. Press E to eat.'); }
      if (p.hunger > 60) G.tips.hungry = 0;
      if ((G.inv.wood || 0) >= 3 && !G.tips.craft) { G.tips.craft = 1; toast('Nice haul. Press C to open crafting.'); }

      // autosave
      G.saveT -= dt;
      if (G.saveT <= 0) { G.saveT = 8; SW.store.set('save', serialize()); }
    } else if (G.mode === 'title') {
      // slow drifting camera over the island
      G.drift += dt * 0.05;
      p.x += Math.cos(G.drift) * 40 * dt; p.y += Math.sin(G.drift * 0.7) * 30 * dt;
    } else if (G.mode === 'dead') {
      G.deadT += dt;
    }

    // level smoothing (walking up onto a plateau)
    p.lvlOff = lerp(p.lvlOff, world.levelAt(p.x, p.y) * LH, 1 - Math.exp(-dt * 12));

    // camera
    const ck = 1 - Math.exp(-dt * 6);
    G.cam.x = lerp(G.cam.x, p.x, ck);
    G.cam.y = lerp(G.cam.y, p.y - p.lvlOff / TILT, ck);
    G.cam.shake = Math.max(0, G.cam.shake - dt * 30);

    // campfires
    for (const s of world.structures) {
      if (s.type !== 'campfire' || s.fuel <= 0) continue;
      s.fuel -= dt;
      if (Math.random() < dt * 6) G.parts.push({ k: 'ember', x: s.x + (Math.random() - 0.5) * 14, y: s.y, lvl: s.lvl * LH + 24, t: 0, life: 1 + Math.random(), vx: (Math.random() - 0.5) * 20 });
      if (s.fuel <= 0) spawnPoof(s.x, s.y, s.lvl * LH + 10, '#5b4840');
    }

    if (G.mode !== 'title') { updateMobs(dt, phase, day); spawnMobs(dt, phase, day); }
    updateParticles(dt);

    // clean hit timers
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
    G.spawnT = 2.2;
    const p = G.player, world = G.world;
    const night = isNight(phase);
    const scribbles = G.mobs.filter((m) => m.type === 'scribble' && !m.dying).length;
    const puffs = G.mobs.filter((m) => m.type === 'puff').length;
    if (night && phase < 0.93 && scribbles < Math.min(16, 2 + day * 2)) {
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * TAU, d = 480 + Math.random() * 200;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (world.isWater(x, y) || inFireLight(x, y)) continue;
        const lv = world.levelAt(x, y) * LH;
        G.mobs.push({ type: 'scribble', x, y, vx: 0, vy: 0, kx: 0, ky: 0, r: 15, hp: 3 + Math.floor(day * 0.8), maxHp: 3 + Math.floor(day * 0.8), spd: 86 + Math.min(54, day * 5), t: Math.random() * 10, hurtT: 0, atkCd: 0, dying: 0, lvlOff: lv, face: 1 });
        break;
      }
    } else if (!night && puffs < 4 && Math.random() < 0.6) {
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * TAU, d = 420 + Math.random() * 240;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        const b = world.biomeAt(x, y);
        if (b !== SW.BIOME.GRASS && b !== SW.BIOME.MEADOW && b !== SW.BIOME.FOREST) continue;
        G.mobs.push({ type: 'puff', x, y, vx: 0, vy: 0, kx: 0, ky: 0, r: 12, hp: 2, maxHp: 2, spd: 70, t: Math.random() * 10, hurtT: 0, dying: 0, wander: Math.random() * TAU, wanderT: 0, hop: 0, lvlOff: world.levelAt(x, y) * LH, face: 1 });
        break;
      }
    }
  }

  function updateMobs(dt, phase, day) {
    const p = G.player, world = G.world;
    const night = isNight(phase);
    const lanternR = G.tools.lantern ? 190 : 0;
    for (let i = G.mobs.length - 1; i >= 0; i--) {
      const m = G.mobs[i];
      m.t += dt; m.hurtT -= dt;
      const dp = dist(m.x, m.y, p.x, p.y);
      if (m.dying) {
        m.dying += dt;
        if (m.dying > 0.6) G.mobs.splice(i, 1);
        continue;
      }
      if (dp > 1300) { G.mobs.splice(i, 1); continue; }
      let tx = 0, ty = 0, spd = m.spd;
      if (m.type === 'scribble') {
        if (!night) { m.dying = 0.001; spawnPoof(m.x, m.y, m.lvlOff, '#2b2340'); continue; }
        const fire = inFireLight(m.x, m.y);
        if (fire) {
          const d = Math.max(1, dist(m.x, m.y, fire.x, fire.y));
          tx = (m.x - fire.x) / d; ty = (m.y - fire.y) / d; spd *= 1.3;
        } else if (G.mode === 'play') {
          tx = (p.x - m.x) / Math.max(1, dp); ty = (p.y - m.y) / Math.max(1, dp);
          // don't walk into firelight while chasing
          const ax = m.x + tx * 30, ay = m.y + ty * 30;
          const f2 = inFireLight(ax, ay);
          if (f2) { const d = Math.max(1, dist(ax, ay, f2.x, f2.y)); const ox = (ax - f2.x) / d, oy = (ay - f2.y) / d; tx = -oy * Math.sign(tx * -oy + ty * ox || 1); ty = ox * Math.sign(tx * -oy + ty * ox || 1); spd *= 0.6; }
          if (lanternR && dp < lanternR * 0.7) spd *= 0.6;
          // wobble so they feel hand-drawn and indecisive
          const w = Math.sin(m.t * 3 + i) * 0.35;
          const c = Math.cos(w), s = Math.sin(w);
          [tx, ty] = [tx * c - ty * s, tx * s + ty * c];
        }
        m.atkCd -= dt;
        if (G.mode === 'play' && dp < m.r + PR + 5 && m.atkCd <= 0) { m.atkCd = 1; hurtPlayer(8 + Math.floor(day * 1.5), m.x, m.y); }
      } else {
        // Puffs wander and flee
        m.wanderT -= dt;
        if (m.wanderT <= 0) { m.wanderT = 1.5 + Math.random() * 2; m.wander = Math.random() * TAU; m.idle = Math.random() < 0.35; }
        if (dp < 150 && G.mode === 'play') { tx = (m.x - p.x) / dp; ty = (m.y - p.y) / dp; spd = 135; m.idle = false; }
        else if (!m.idle) { tx = Math.cos(m.wander); ty = Math.sin(m.wander); }
        m.hop = (m.hop + dt * (m.idle ? 0 : spd > 100 ? 5 : 3)) % 1;
        if (m.idle) m.hop = 0;
        spd *= 0.4 + Math.sin(m.hop * Math.PI) * 1.1;
      }
      const k = 1 - Math.exp(-dt * 6);
      m.vx = lerp(m.vx, tx * spd, k) + m.kx * dt * 8;
      m.vy = lerp(m.vy, ty * spd, k) + m.ky * dt * 8;
      m.kx *= Math.exp(-dt * 10); m.ky *= Math.exp(-dt * 10);
      if (Math.abs(m.vx) > 8) m.face = m.vx > 0 ? 1 : -1;
      const ox = m.x, oy = m.y;
      moveBody(m, m.r * 0.8, dt);
      if (m.type === 'puff' && ox === m.x && oy === m.y) m.wanderT = 0;
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
        if (d < 14) { G.floaters.splice(i, 1); addItem(f.item, 1); SW.audio.play('pickup'); continue; }
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
    setSpriteTransform(sx, sy, rot, kx, ky);
    ctx.drawImage(spr[which], -spr.ax, -spr.ay, spr.w, spr.h);
  }

  const drawList = [];
  function render() {
    const world = G.world, p = G.player, t = G.time;
    const shx = (Math.random() - 0.5) * G.cam.shake, shy = (Math.random() - 0.5) * G.cam.shake;
    const camX = G.cam.x, camY = G.cam.y;
    G.cam.x += shx / Z; G.cam.y += shy / Z;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#3b86c9';
    ctx.fillRect(0, 0, W, H);

    // ground
    const v = viewChunks();
    let budget = 3;
    for (let cy = v.cy0; cy <= v.cy1; cy++) {
      for (let cx = v.cx0; cx <= v.cx1; cx++) {
        const ch = world.getChunk(cx, cy);
        if (!ch.canvas || ch.canvasRS !== RS) { if (budget-- > 0) world.buildCanvas(ch, RS); else continue; }
        const x0 = Math.round(sxOf(cx * CHUNK)), x1 = Math.round(sxOf((cx + 1) * CHUNK));
        const y0 = Math.round(syOf(cy * CHUNK, 0)), y1 = Math.round(syOf((cy + 1) * CHUNK, 0));
        ctx.drawImage(ch.canvas, x0, y0, x1 - x0, y1 - y0);
      }
    }

    // water sparkles
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

    // gather everything that stands up
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
    for (const s of world.structures) drawList.push({ y: s.y, k: 1, s });
    for (const m of G.mobs) drawList.push({ y: m.y, k: 2, m });
    if (G.mode === 'play') drawList.push({ y: p.y, k: 3 });
    drawList.sort((a, b) => a.y - b.y);

    // contact shadows
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgba(46, 34, 82, 0.2)';
    ctx.beginPath();
    for (const d of drawList) {
      let x, y, lv, rx;
      if (d.k === 0) { const def = OBJ[d.o.type]; if (def.decor) continue; x = d.o.x; y = d.o.y; lv = d.o.lvl * LH; rx = (def.r || 6) + 6; if (SW.sprites[d.spr].w < 40) rx *= 0.7; }
      else if (d.k === 1) { x = d.s.x; y = d.s.y; lv = d.s.lvl * LH; rx = d.s.r + 6; }
      else if (d.k === 2) { if (d.m.dying) continue; x = d.m.x; y = d.m.y; lv = d.m.lvlOff; rx = d.m.r; }
      else { x = p.x; y = p.y; lv = p.lvlOff; rx = 13; }
      const sx = sxOf(x), sy = syOf(y, lv);
      ctx.moveTo(sx + rx * Z, sy); ctx.ellipse(sx, sy, rx * Z, rx * 0.42 * Z, 0, 0, TAU);
    }
    ctx.fill();

    // sprites, back to front
    for (const d of drawList) {
      if (d.k === 0) drawObject(d.o, d.spr);
      else if (d.k === 1) drawStructure(d.s);
      else if (d.k === 2) drawMob(d.m);
      else drawPlayer();
    }

    drawParticles();
    drawFloaters();
    drawLighting();

    // paper grain over everything
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (grain) { ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H); }

    G.cam.x = camX; G.cam.y = camY;
  }

  function drawObject(o, sprName) {
    const def = OBJ[o.type];
    const sx = sxOf(o.x), sy = syOf(o.y, o.lvl * LH);
    let rot = def.sway ? Math.sin(G.time * 1.7 + o.seed * 40 + o.x * 0.01) * 0.028 * def.sway : 0;
    let kx = 1, ky = 1, ox = 0;
    const ht = G.hitT.get(o.id);
    if (ht !== undefined && G.time - ht < 0.25) {
      const k = 1 - (G.time - ht) / 0.25;
      kx = 1 + 0.1 * k; ky = 1 - 0.1 * k; ox = Math.sin((G.time - ht) * 60) * 3 * k * Z;
    }
    drawSprite(sprName, sx + ox, sy, rot, kx, ky);
  }

  function drawStructure(s) {
    const sx = sxOf(s.x), sy = syOf(s.y, s.lvl * LH);
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

  function drawMob(m) {
    const sx = sxOf(m.x), sy = syOf(m.y, m.lvlOff);
    let name, kx = 1, ky = 1, rot = 0, alpha = 1;
    if (m.type === 'scribble') {
      name = 'scribble' + (Math.floor(m.t * 7) % 2);
      ky = 1 + Math.sin(m.t * 9) * 0.05; kx = 2 - ky;
      rot = Math.sin(m.t * 5) * 0.05;
    } else {
      name = 'puff' + (m.hop > 0.15 && m.hop < 0.85 ? 1 : 0);
      ky = 1 + Math.sin(m.hop * Math.PI) * 0.1;
    }
    if (m.face < 0) name += 'L';
    let lift = m.type === 'puff' ? Math.sin(m.hop * Math.PI) * 10 * Z : 0;
    if (m.dying) { const k = clamp(m.dying / 0.6, 0, 1); ky *= 1 - k * 0.8; kx *= 1 + k * 0.6; alpha = 1 - k; }
    ctx.globalAlpha = alpha;
    drawSprite(name, sx, sy - lift, rot, kx, ky);
    if (m.hurtT > 0) { ctx.globalAlpha = 0.8 * alpha; drawSprite(name, sx, sy - lift, rot, kx, ky, 'flash'); }
    ctx.globalAlpha = 1;
    if (m.hp < m.maxHp && !m.dying) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const w = 30 * Z, x = sx - w / 2, y = sy - 58 * Z;
      ctx.fillStyle = '#ffffff'; roundRect(x - 2, y - 2, w + 4, 8 * Z + 4, 5); ctx.fill();
      ctx.fillStyle = '#3b2f4f'; roundRect(x, y, w, 8 * Z, 4); ctx.fill();
      ctx.fillStyle = '#ff4d6d'; roundRect(x, y, w * Math.max(0, m.hp / m.maxHp), 8 * Z, 4); ctx.fill();
    }
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
    let ky = p.moving ? 1 + Math.sin(p.walkT * 18) * 0.04 : 1 + Math.sin(G.time * 3) * 0.025;
    let kx = 2 - ky;
    const rot = p.moving ? p.face * 0.06 : 0;
    // tool in hand
    const toolName = p.swingT > 0 ? p.swingTool : bestWeapon() || (G.tools.axe ? 'axe' : G.tools.pick ? 'pick' : null);
    const toolSpr = toolName ? { axe: 'toolAxe', pick: 'toolPick', sword: 'toolSword', gemSword: 'toolGemSword' }[toolName] : 'toolHand';
    let tRot;
    if (p.swingT > 0) { const k = 1 - p.swingT / 0.24; tRot = lerp(-1.9, 1.3, Math.sin(k * Math.PI / 2)); }
    else tRot = toolSpr === 'toolHand' ? 0.2 : -0.35;
    const hx = sx + p.face * 15 * Z, hy = sy - 16 * Z - bob;
    const drawTool = () => { if (toolSpr === 'toolHand' && p.swingT <= 0) return; drawSprite(toolSpr, hx, hy + (toolSpr === 'toolHand' ? 4 * Z : 8 * Z), tRot * p.face, toolSpr === 'toolHand' ? 1 : 0.85 * p.face, toolSpr === 'toolHand' ? 1 : 0.85); };
    if (p.fy < -0.5) drawTool();
    const flick = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    drawSprite(name, sx, sy - bob, rot, kx, ky);
    if (p.hurtT > 0 || flick) { ctx.globalAlpha = 0.75; drawSprite(name, sx, sy - bob, rot, kx, ky, 'flash'); ctx.globalAlpha = 1; }
    if (p.fy >= -0.5) drawTool();
  }

  function drawParticles() {
    for (const q of G.parts) {
      const k = q.t / q.life;
      if (q.k === 'peel') {
        // the sticker peels up, flips to its white back and drifts off
        const sx = sxOf(q.x) + q.dir * k * 40 * Z, sy = syOf(q.y, q.lvl * LH) - (Math.sin(k * Math.PI * 0.8) * 60 + k * 30) * Z;
        const flip = Math.cos(k * Math.PI * 2.2);
        const sc = 1 - k * 0.55;
        ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        drawSprite(q.spr, sx, sy, q.dir * k * 1.4, Math.abs(flip) * sc + 0.02, sc, flip < 0 ? 'back' : 'img');
        ctx.globalAlpha = 1;
      } else if (q.k === 'chip') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const sx = sxOf(q.x), sy = syOf(q.y, q.lvl) - q.z * Z;
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - q.size * Z / 2 - 1.2, sy - q.size * Z / 2 - 1.2, q.size * Z + 2.4, q.size * Z + 2.4);
        ctx.fillStyle = q.color; ctx.fillRect(sx - q.size * Z / 2, sy - q.size * Z / 2, q.size * Z, q.size * Z);
      } else if (q.k === 'dot') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(sxOf(q.x), syOf(q.y, q.lvl) - q.z * Z, q.r * Z * (1 - k * 0.5), 0, TAU); ctx.fill();
      } else if (q.k === 'dust') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sxOf(q.x), syOf(q.y, q.lvl) - k * 6 * Z, (3 + k * 5) * Z, 0, TAU); ctx.fill();
      } else if (q.k === 'ember') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = k < 0.5 ? '#ffd23f' : '#ff7a2a';
        ctx.fillRect(sxOf(q.x) - 1.5 * Z, syOf(q.y, q.lvl) - 1.5 * Z, 3 * Z, 3 * Z);
      } else if (q.k === 'text') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const sx = sxOf(q.x), sy = syOf(q.y, q.lvl) - k * 30 * Z;
        ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        ctx.font = `${Math.round(17 * Z)}px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
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
    const phase = phaseOf(G.time);
    const d = darkness(phase);
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
    const pr = (G.tools.lantern ? 200 : 105) * Z / 2;
    if (G.mode !== 'title') hole(sxOf(p.x) / 2, (syOf(p.y, p.lvlOff) - 20 * Z) / 2, pr, G.tools.lantern ? 0.95 : 0.8);
    const fires = burningFires();
    for (const s of fires) hole(sxOf(s.x) / 2, (syOf(s.y, s.lvl * LH) - 14 * Z) / 2, fireRadius(s) * Z / 2 * Math.min(1, s.fuel / 20 + 0.3), 1);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(lightCv, 0, 0, W, H);
    // dusk/dawn warmth
    const warm = Math.sin(clamp(d, 0, 1) * Math.PI) * 0.16;
    if (warm > 0.01) { ctx.fillStyle = `rgba(255, 120, 70, ${warm})`; ctx.fillRect(0, 0, W, H); }
    // firelight glow
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

  // ---------------- HUD ----------------
  let hotbarDirty = true, craftDirty = true;
  const hud = { hp: -1, food: -1, day: -1 };

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
        `<img src="${SW.spriteURL(it.icon)}" alt="">` +
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
    $('craftList').innerHTML = RECIPES.map((r) => {
      const name = r.tool ? TOOLS[r.tool].name : ITEMS[r.gives].name;
      const icon = r.tool ? TOOLS[r.tool].icon : ITEMS[r.gives].icon;
      const owned = r.tool && G.tools[r.tool];
      const locked = r.requires && !G.tools[r.requires];
      const afford = hasCost(r.cost) && (!r.fire || fire) && !locked;
      const cost = Object.entries(r.cost).map(([k, n]) => {
        const ok = (G.inv[k] || 0) >= n;
        return `<span class="cost${ok ? '' : ' short'}"><img src="${SW.spriteURL(ITEMS[k].icon)}" alt="">${G.inv[k] || 0}/${n}</span>`;
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

  let miniT = 0, miniX = 1e9, miniY = 1e9, miniImg = null;
  function renderMinimap(dt) {
    miniT -= dt;
    if (miniT > 0) return;
    miniT = 0.2;
    const cv = $('minimap');
    const g = cv.getContext('2d');
    const N = 64, S = 14;
    const p = G.player;
    if (!miniImg || dist(p.x, p.y, miniX, miniY) > 28) {
      miniX = p.x; miniY = p.y;
      miniImg = g.createImageData(N, N);
      const d = miniImg.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = p.x + (i - N / 2) * S, y = p.y + (j - N / 2) * S;
        const col = SW.MAP_COLOR[G.world.biomeAt(x, y)];
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
      if (m.type !== 'scribble' || m.dying) continue;
      const [mx, my] = toM(m.x, m.y);
      g.fillStyle = '#2b2340'; g.fillRect(mx - 1, my - 1, 2.5, 2.5);
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
    // day arc (sky) and night arc
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
    if (hp !== hud.hp) { hud.hp = hp; $('hpBar').style.width = hp + '%'; $('hpNum').textContent = hp; $('hpStat').classList.toggle('low', hp < 30); }
    if (food !== hud.food) { hud.food = food; $('foodBar').style.width = food + '%'; $('foodNum').textContent = food; $('foodStat').classList.toggle('low', food < 25); }
    const day = dayOf(G.time);
    if (day !== hud.day) { hud.day = day; $('dayNum').textContent = day; }
    const night = isNight(phaseOf(G.time));
    $('dayLabel').textContent = night ? 'Night' : 'Day';
    if (hotbarDirty) renderHotbar();
    if (!$('craftPanel').hidden) {
      const nf = !!nearFire(p.x, p.y);
      if (nf !== renderCraft.nf) { renderCraft.nf = nf; craftDirty = true; }
      if (craftDirty) renderCraft();
    }
    renderDial();
    renderMinimap(dt);
    $('biome').textContent = SW.BIOME_NAME[G.world.biomeAt(p.x, p.y)];
  }

  // ---------------- save / load ----------------
  function serialize() {
    const p = G.player;
    return {
      v: 1, seed: G.seed, time: G.time,
      player: { x: p.x, y: p.y, hp: p.hp, hunger: p.hunger },
      inv: G.inv, tools: G.tools, stats: G.stats, tips: G.tips,
      removed: [...G.world.removed], damage: [...G.world.damage],
      structures: G.world.structures, nextId: G.world.nextId,
    };
  }
  function restore(s) {
    newGame(s.seed, 'play');
    G.time = s.time;
    Object.assign(G.player, s.player);
    G.inv = s.inv || {}; G.tools = s.tools || {}; G.stats = s.stats || G.stats; G.tips = s.tips || {};
    G.world.removed = new Map(s.removed || []); G.world.damage = new Map(s.damage || []);
    G.world.structures = s.structures || []; G.world.nextId = s.nextId || 1;
    G.cam.x = G.player.x; G.cam.y = G.player.y - LH / TILT;
    G.lastPhaseNight = isNight(phaseOf(G.time));
    hotbarDirty = craftDirty = true;
    renderToolbelt();
    prebuild();
  }

  // ---------------- screens ----------------
  function showScreen(id) {
    for (const s of ['titleScreen', 'deathScreen', 'pauseScreen']) $(s).hidden = s !== id;
    $('hud').hidden = id === 'titleScreen';
    if (id) toggleCraft(false);
  }

  function startGame(seed) {
    SW.audio.unlock();
    newGame(seed, 'play');
    renderToolbelt();
    showScreen(null);
    hud.hp = hud.food = hud.day = -1;
    toast('WASD or arrows to move. Space or click to gather. Berries are in bushes.', 5200);
    setTimeout(() => G && G.mode === 'play' && banner('Day 1', 'Gather, craft, and survive the night.'), 300);
  }

  function goTitle() {
    newGame(Math.floor(Math.random() * 999999), 'title');
    showScreen('titleScreen');
    $('seedInput').value = randomSeedWord();
    const best = SW.store.get('best', 0);
    $('bestLine').textContent = best > 0 ? `Your best: ${best.toFixed(1)} days` : 'Each island is generated from its seed.';
    const save = SW.store.get('save', null);
    $('continueBtn').hidden = !save;
    if (save) $('continueBtn').querySelector('span').textContent = `Continue · Day ${dayOf(save.time)}`;
  }

  const WORDS_A = ['mossy', 'tangy', 'sunny', 'fizzy', 'sleepy', 'brave', 'lucky', 'crispy', 'foggy', 'jolly', 'misty', 'peachy'];
  const WORDS_B = ['cove', 'atoll', 'reef', 'isle', 'bay', 'grove', 'dune', 'peak', 'lagoon', 'key', 'shoal', 'bluff'];
  function randomSeedWord() { return WORDS_A[Math.floor(Math.random() * WORDS_A.length)] + '-' + WORDS_B[Math.floor(Math.random() * WORDS_B.length)] + '-' + Math.floor(Math.random() * 90 + 10); }

  function pause(on) {
    if (on && G.mode === 'play') { G.mode = 'paused'; showScreen('pauseScreen'); }
    else if (!on && G.mode === 'paused') { G.mode = 'play'; showScreen(null); last = performance.now(); }
  }

  // ---------------- input ----------------
  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter') $('startBtn').click(); return; }
      SW.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      if (G.mode === 'play') {
        if (e.code === 'KeyC' || e.code === 'Tab') { e.preventDefault(); toggleCraft(); }
        else if (e.code === 'KeyE') eatBest();
        else if (/^Digit[1-9]$/.test(e.code)) {
          const items = ORDER.filter((k) => G.inv[k] > 0);
          const it = items[+e.code.slice(5) - 1];
          if (it) useItem(it);
        }
      }
      if (e.code === 'Escape') {
        if (!$('craftPanel').hidden) toggleCraft(false);
        else if (G.mode === 'play') pause(true);
        else if (G.mode === 'paused') pause(false);
      }
      if (e.code === 'KeyP') { if (G.mode === 'play') pause(true); else if (G.mode === 'paused') pause(false); }
      if (e.code === 'KeyM') setMute(!SW.audio.muted);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); input.act = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.mode === 'play') pause(true); });

    // mouse: click to gather/attack toward the cursor
    canvas.addEventListener('mousedown', (e) => {
      if (G.mode !== 'play') return;
      SW.audio.unlock();
      const p = G.player;
      const wx = (e.clientX - W / 2) / Z + G.cam.x;
      const wy = (e.clientY - H / 2) / Z / TILT + G.cam.y + (p.lvlOff - 18) / TILT;
      const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy);
      if (d > 4) { p.fx = dx / d; p.fy = dy / d; if (Math.abs(dx) > 4) p.face = dx > 0 ? 1 : -1; }
      input.act = true;
    });
    window.addEventListener('mouseup', () => { input.act = false; });
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
    $('craftBtn').addEventListener('click', () => toggleCraft());
    $('craftClose').addEventListener('click', () => toggleCraft(false));
    $('startBtn').addEventListener('click', () => startGame(SW.seedFromString($('seedInput').value || randomSeedWord())));
    $('diceBtn').addEventListener('click', () => { $('seedInput').value = randomSeedWord(); });
    $('continueBtn').addEventListener('click', () => { const s = SW.store.get('save', null); if (s) { SW.audio.unlock(); restore(s); showScreen(null); hud.hp = hud.food = hud.day = -1; toast('Welcome back.'); } });
    $('retryBtn').addEventListener('click', () => startGame(G.seed));
    $('newBtn').addEventListener('click', () => goTitle());
    $('resumeBtn').addEventListener('click', () => pause(false));
    $('quitBtn').addEventListener('click', () => { SW.store.set('save', serialize()); goTitle(); });
    $('muteBtn').addEventListener('click', () => setMute(!SW.audio.muted));

    // touch: virtual stick on the left, buttons on the right
    const stick = $('stick'), knob = $('knob');
    let stickId = null, sx0 = 0, sy0 = 0;
    const showTouch = () => { document.body.classList.add('touch'); };
    window.addEventListener('touchstart', showTouch, { passive: true, once: true });
    canvas.addEventListener('touchstart', (e) => {
      SW.audio.unlock();
      for (const t of e.changedTouches) {
        if (stickId === null && t.clientX < W * 0.55) {
          stickId = t.identifier; sx0 = t.clientX; sy0 = t.clientY;
          stick.style.left = sx0 + 'px'; stick.style.top = sy0 + 'px'; stick.classList.add('on');
          knob.style.transform = 'translate(-50%, -50%)';
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - sx0, dy = t.clientY - sy0;
        const d = Math.hypot(dx, dy), max = 46;
        if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
        input.x = dx / max; input.y = dy / max;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      e.preventDefault();
    }, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; input.x = input.y = 0; stick.classList.remove('on'); }
    };
    canvas.addEventListener('touchend', endStick);
    canvas.addEventListener('touchcancel', endStick);
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); SW.audio.unlock(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); });
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', () => off && off());
    };
    hold($('tAct'), () => { input.act = true; }, () => { input.act = false; });
    hold($('tEat'), () => G.mode === 'play' && eatBest());
  }

  function setMute(m) {
    SW.audio.setMuted(m);
    $('muteBtn').classList.toggle('off', m);
    $('muteBtn').title = m ? 'Sound off (M)' : 'Sound on (M)';
    $('muteBtn').setAttribute('aria-pressed', String(m));
  }

  // ---------------- boot ----------------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.mode !== 'paused') update(dt);
    render();
    if (G.mode !== 'title') updateHUD(dt);
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
    SW.SPR = clamp(Math.ceil(Z * DPR), 2, 3);
    SW.buildSprites();
    makeGrain();
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = SW.spriteURL(img.dataset.icon); });
    bindInput();
    setMute(SW.audio.muted);
    window.addEventListener('resize', () => { resize(); prebuild(); });
    if (data && data.save) { restore(data.save); showScreen(null); }
    else goTitle();
    last = performance.now();
    requestAnimationFrame(frame);
    document.body.classList.add('ready');
  }

  // hooks for automated checks and for the artifact viewer's live updates
  SW.game = {
    get G() { return G; }, newGame, startGame, act, useItem, craft, RECIPES, ITEMS,
    setPhase(ph) { G.time = (dayOf(G.time) - 1) * DAY_LEN + ph * DAY_LEN; },
  };
  try { window.claude?.hot?.snapshot?.(() => ({ save: G && G.mode === 'play' ? serialize() : null })); } catch (e) { /* not in a viewer */ }
  const startFn = (data) => boot(data || {});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => 0);
  if (window.claude?.hot?.ready) window.claude.hot.ready(startFn); else startFn(window.claude?.hot?.data ?? {});
})();
