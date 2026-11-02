// Stickerwild — caves.
// Stepping through a cave mountain's door turns the game into a 2D side view:
// walk and jump, climb ladders, ride one-way slides down, break walls with the
// right tool, fight the things that live underground, and solve the rune
// puzzle: strike the rune switches in the order the mural shows to open the
// vault and take the cave's relic. You can walk back out of the door at any
// time; the cave remembers what you broke, picked up and solved.
//
// Tiles:  # rock   . air   H ladder   = plank (stand on it, drop through with down)
//         \ / slide (one-way down)   ^ spikes   D door   S start   M mural
//         1-5 rune switches   G vault gate   T relic chest
//         V vines  R rubble  I ice  X living ink  (breakable, each needs something)
//         * rare gem   m mod   $ shells   b g o p s creature spawns
'use strict';
(function () {
  const T = 32;                                    // tile size in cave pixels
  const TAU = Math.PI * 2;
  const RUNE = ['#ff4d6d', '#ffd23f', '#4fb3e8', '#a78bfa', '#6bbf4a'];
  const RUNE_NAME = ['red', 'gold', 'blue', 'violet', 'green'];
  const FOES = {
    bat: { hp: 3, dmg: 6, xp: 6, spd: 120, fly: true, sprite: 'bat', h: 26 },
    grub: { hp: 4, dmg: 5, xp: 5, spd: 46, sprite: 'grub', h: 22 },
    gloop: { hp: 7, dmg: 7, xp: 9, spd: 70, hop: true, sprite: 'gloop', h: 30 },
    pebblor: { hp: 14, dmg: 12, xp: 15, spd: 34, sprite: 'pebblor', h: 40 },
    scribble: { hp: 5, dmg: 9, xp: 8, spd: 60, fly: true, ghost: true, sprite: 'scribble', h: 34 },
  };
  const SPAWN = { b: 'bat', g: 'grub', o: 'gloop', p: 'pebblor', s: 'scribble' };
  const isSolidCh = (ch) => ch === '#' || ch === 'G' || ch === 'V' || ch === 'R' || ch === 'I' || ch === 'X';

  SW.makeCaves = function (api) {
    let C = null;                                  // the cave you are in, or null

    function tile(c, r) { return r < 0 || c < 0 || r >= C.H || c >= C.W ? '#' : C.rows[r][c]; }
    function setTile(c, r, ch) { const row = C.rows[r]; C.rows[r] = row.slice(0, c) + ch + row.slice(c + 1); }
    function solid(c, r) { return isSolidCh(tile(c, r)); }
    function oneWay(c, r) { const ch = tile(c, r); return ch === '=' || (ch === 'H' && tile(c, r - 1) !== 'H'); }

    // ---------------- entering and leaving ----------------
    function enter(def, save) {
      const map = SW.CAVE_MAPS[def.id];
      C = {
        def, save, rows: map.slice(), W: map[0].length, H: map.length, t: 0,
        hero: { x: 0, y: 0, vx: 0, vy: 0, ground: false, ladder: false, slide: 0, face: 1, atkCd: 0, swingT: 0, iframes: 1, hurtT: 0, walkT: 0, drop: 0 },
        foes: [], parts: [], cam: { x: 0, y: 0 }, progress: 0, lit: new Set(), msgT: 0,
      };
      const lvl = 1 + def.zone * 2;
      for (let r = 0; r < C.H; r++) for (let c = 0; c < C.W; c++) {
        const ch = C.rows[r][c], key = c + ',' + r;
        if (ch === 'S') { C.hero.x = c * T + T / 2; C.hero.y = (r + 1) * T; setTile(c, r, '.'); }
        else if (SPAWN[ch]) { setTile(c, r, '.'); spawnFoe(SPAWN[ch], c, r, lvl); }
        else if ('VRIX'.includes(ch) && save.broken.includes(key)) setTile(c, r, '.');
        else if ('*m$'.includes(ch) && save.picked.includes(key)) setTile(c, r, '.');
        else if (ch === 'G' && save.solved) setTile(c, r, '.');
        else if (ch === 'T' && save.taken) setTile(c, r, 't');
      }
      if (save.solved) for (let i = 1; i <= def.order.length; i++) C.lit.add(i);
      if (save.solved) C.progress = def.order.length;
      snapCam(true);
    }
    function spawnFoe(type, c, r, lvl) {
      const f = FOES[type];
      const hp = Math.round(f.hp * (1 + 0.45 * (lvl - 1)));
      C.foes.push({ type, x: c * T + T / 2, y: (r + 1) * T, hx: c * T + T / 2, hy: (r + 1) * T, vx: (Math.random() < 0.5 ? -1 : 1) * f.spd, vy: 0,
        hp, maxHp: hp, dmg: Math.round(f.dmg * (1 + 0.3 * (lvl - 1))), lvl, t: Math.random() * 9, awake: !f.fly, hurtT: 0, dying: 0, face: 1, hopT: 1 });
    }
    function leave() { C = null; }

    // ---------------- update ----------------
    function update(dt, inp) {
      if (!C) return;
      C.t += dt;
      const h = C.hero, p = api.player();
      h.atkCd -= dt; h.swingT -= dt; h.iframes -= dt; h.hurtT -= dt; C.msgT -= dt;
      const icy = !!C.def.icy;
      // ladders: up or down grabs one; jumping (or walking off) lets go
      const cc = Math.floor(h.x / T), rc = Math.floor((h.y - 14) / T);
      const onLadderTile = tile(cc, rc) === 'H' || tile(cc, Math.floor((h.y - 2) / T)) === 'H';
      inp = Object.assign({}, inp, { jump: inp.jumpKey || (inp.upEdge && !onLadderTile && !h.ladder) });
      if (!h.ladder && onLadderTile && Math.abs(inp.y) > 0.5 && !h.slide) {
        if (inp.y < 0 || tile(cc, Math.floor((h.y + 2) / T)) === 'H') { h.ladder = true; h.x = cc * T + T / 2; h.vx = 0; }
      }
      if (h.ladder && (!onLadderTile && tile(cc, Math.floor((h.y + 2) / T)) !== 'H')) h.ladder = false;
      // slides take you down and away
      const slideCh = tile(Math.floor(h.x / T), Math.floor((h.y - 6) / T));
      if (!h.ladder && (slideCh === '\\' || slideCh === '/')) {
        const d = slideCh === '\\' ? 1 : -1;
        if (!h.slide) api.sound('whoosh');
        h.slide = d; h.face = d;
        h.x += d * 300 * dt; h.y += 300 * dt; h.vx = d * 220; h.vy = 160;
        if (Math.random() < dt * 30) puff(h.x - d * 10, h.y, '#ffffff', 1);
      } else {
        h.slide = 0;
        if (h.ladder) {
          h.vy = inp.y * 150; h.vx = 0;
          if (inp.jump) { h.ladder = false; h.vy = -420; h.vx = inp.x * 170; }
        } else {
          const want = inp.x * 175;
          const k = icy ? (h.ground ? 2.2 : 1.5) : h.ground ? 18 : 7;
          h.vx += (want - h.vx) * Math.min(1, dt * k);
          h.vy = Math.min(900, h.vy + 1900 * dt);
          if (inp.jump && h.ground) { h.vy = -640; h.ground = false; api.sound('swing'); }
          if (inp.y > 0.5 && h.ground) h.drop = 0.25;            // drop through a plank
        }
        if (Math.abs(inp.x) > 0.2) h.face = inp.x > 0 ? 1 : -1;
        moveHero(dt);
      }
      h.drop -= dt;
      h.walkT += Math.abs(h.vx) > 20 && h.ground ? dt : 0;
      // spikes
      const below = tile(Math.floor(h.x / T), Math.floor((h.y - 4) / T));
      if (below === '^') hurt(8 + C.def.zone * 4, h.x, h.y + 20, -520);
      // pickups
      const pc = Math.floor(h.x / T), pr = Math.floor((h.y - 12) / T);
      for (const [c, r] of [[pc, pr], [pc, pr - 1]]) {
        const ch = tile(c, r);
        if (ch === '*' || ch === 'm' || ch === '$') pickup(c, r, ch);
      }
      updateFoes(dt);
      updateParts(dt);
      if (inp.use) use();
      if (!C) return;                  // walked out of the door
      snapCam(false);
      if (p.hp <= 0) api.died();
    }
    function moveHero(dt) {
      const h = C.hero, hw = 9, hh = 26;
      // horizontal
      let nx = h.x + h.vx * dt;
      const top = Math.floor((h.y - hh) / T), bot = Math.floor((h.y - 1) / T);
      const side = Math.floor((nx + (h.vx > 0 ? hw : -hw)) / T);
      let blocked = false;
      for (let r = top; r <= bot; r++) if (solid(side, r)) blocked = true;
      if (blocked) { nx = h.vx > 0 ? side * T - hw - 0.01 : (side + 1) * T + hw + 0.01; h.vx = 0; }
      h.x = nx;
      // vertical
      let ny = h.y + h.vy * dt;
      h.ground = false;
      const c0 = Math.floor((h.x - hw + 1) / T), c1 = Math.floor((h.x + hw - 1) / T);
      if (h.vy >= 0) {
        const r = Math.floor(ny / T), wasAbove = h.y <= r * T + 0.5;
        for (let c = c0; c <= c1; c++) {
          if (solid(c, r) || (wasAbove && h.drop <= 0 && oneWay(c, r))) { ny = r * T; h.vy = 0; h.ground = true; break; }
        }
      } else {
        const r = Math.floor((ny - hh) / T);
        for (let c = c0; c <= c1; c++) if (solid(c, r)) { ny = (r + 1) * T + hh; h.vy = 0; break; }
      }
      h.y = ny;
      h.x = Math.max(T + hw, Math.min((C.W - 1) * T - hw, h.x));
    }
    function snapCam(now) {
      const h = C.hero, v = api.view();
      const k = v.k;
      const tx = h.x - v.w / k / 2, ty = h.y - 20 - v.h / k / 2;
      // the camera may look a little past the map's edge (solid rock), so the
      // hero is never pinned into a corner under the HUD
      const mx = C.W * T - v.w / k, my = C.H * T - v.h / k;
      const ex = (v.w / k) * 0.32, ey = (v.h / k) * 0.3;
      const cx = Math.max(Math.min(0, mx / 2) - ex, Math.min(Math.max(mx, mx / 2) + ex, tx));
      const cy = Math.max(Math.min(0, my / 2) - ey, Math.min(Math.max(my, my / 2) + ey, ty));
      if (now) { C.cam.x = cx; C.cam.y = cy; } else { C.cam.x += (cx - C.cam.x) * 0.14; C.cam.y += (cy - C.cam.y) * 0.14; }
    }

    // ---------------- interacting ----------------
    function near(ch, rad = 1) {
      const h = C.hero, c0 = Math.floor(h.x / T), r0 = Math.floor((h.y - 12) / T);
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (ch.includes(tile(c0 + dc, r0 + dr))) return [c0 + dc, r0 + dr, tile(c0 + dc, r0 + dr)];
      return null;
    }
    function use() {
      const h = C.hero, def = C.def;
      if (h.atkCd > 0) return;
      if (near('D', 0)) { api.exitCave(); return; }
      const sw = near('12345');
      if (sw) { strike(+sw[2], sw[0], sw[1]); h.atkCd = 0.35; h.swingT = 0.22; return; }
      const chest = near('T');
      if (chest) { openChest(chest[0], chest[1]); h.atkCd = 0.4; return; }
      // break a wall in front of you
      const fc = Math.floor((h.x + h.face * 20) / T);
      for (const r of [Math.floor((h.y - 6) / T), Math.floor((h.y - 26) / T)]) {
        const ch = tile(fc, r);
        if ('VRIX'.includes(ch)) {
          const b = SW.CAVE_BREAK[ch];
          h.atkCd = 0.35; h.swingT = 0.22;
          if (api.has(b.needs)) breakWall(ch);
          else { api.sound('deny'); say(`${b.name} ${b.name === 'Vines' ? 'block' : 'blocks'} the way. ${b.how}`); }
          return;
        }
      }
      if (near('M')) { say('The mural shows the runes in order: ' + def.order.map((i) => RUNE_NAME[i - 1]).join(', ') + '.'); h.atkCd = 0.5; return; }
      // otherwise, swing at whatever is in front of you
      h.atkCd = 0.4; h.swingT = 0.24;
      api.sound('swing');
      let hit = false;
      for (const f of C.foes) {
        if (f.dying) continue;
        const dx = f.x - h.x, dy = (f.y - FOES[f.type].h / 2) - (h.y - 14);
        if (Math.abs(dy) < 34 && dx * h.face > -8 && Math.abs(dx) < 48) { hitFoe(f); hit = true; }
      }
      if (!hit) puff(h.x + h.face * 26, h.y - 16, '#ffffff', 2);
    }
    function breakWall(ch) {
      // clear the whole connected column of that wall
      const h = C.hero, fc = Math.floor((h.x + h.face * 20) / T);
      const done = [];
      for (let r = 0; r < C.H; r++) if (tile(fc, r) === ch && Math.abs(r * T + T / 2 - (h.y - 16)) < T * 3) { setTile(fc, r, '.'); done.push(fc + ',' + r); }
      C.save.broken.push(...done);
      const col = { V: '#6bbf4a', R: '#a3a1b5', I: '#c8f0ff', X: '#5b4f78' }[ch];
      for (let i = 0; i < 14; i++) puff(fc * T + T / 2, h.y - 10 - Math.random() * 60, col, 1);
      api.sound(ch === 'V' ? 'chop' : ch === 'R' ? 'mine' : 'poof');
      say({ V: 'You cut through the vines.', R: 'The rubble crumbles.', I: 'The Sunstone glows and the ice melts away.', X: 'The Tide Pearl washes the ink away.' }[ch]);
    }
    function strike(id, c, r) {
      const def = C.def;
      if (C.save.solved) { say('The vault is already open.'); return; }
      if (C.lit.has(id)) return;
      if (def.order[C.progress] === id) {
        C.lit.add(id); C.progress++;
        api.sound('pickup');
        for (let i = 0; i < 10; i++) puff(c * T + T / 2, r * T + 8, RUNE[id - 1], 1);
        if (C.progress === def.order.length) solve();
        else say(`The ${RUNE_NAME[id - 1]} rune lights up. (${C.progress}/${def.order.length})`);
      } else {
        C.lit.clear(); C.progress = 0;
        api.sound('deny'); api.shake(6);
        say('Wrong order! The runes go dark. Look at the mural again.');
      }
    }
    function solve() {
      C.save.solved = true;
      for (let r = 0; r < C.H; r++) for (let c = 0; c < C.W; c++) if (tile(c, r) === 'G') { setTile(c, r, '.'); for (let i = 0; i < 5; i++) puff(c * T + T / 2, r * T + T / 2, '#ffd23f', 1); }
      api.sound('dawn');
      api.banner('The vault opens!', 'Find the relic chest.', '#ffd23f');
      api.xp(30 + C.def.zone * 30);
    }
    function openChest(c, r) {
      const def = C.def;
      if (C.save.taken) { say('The chest is empty. You already took the ' + SW.ITEMS[def.relic].name + '.'); return; }
      if (!C.save.solved) { say('The chest is sealed by the runes.'); return; }
      C.save.taken = true;
      setTile(c, r, 't');
      api.give(def.relic, 1);
      api.give(def.gem, 1 + def.zone);
      api.give('shell', 30 + def.zone * 25);
      api.xp(80 + def.zone * 90);
      api.sound('sting');
      for (let i = 0; i < 24; i++) puff(c * T + T / 2, r * T + T / 2, '#ffd23f', 1.5);
      api.banner(SW.ITEMS[def.relic].name, def.name + ' is finished. ' + SW.ITEMS[def.relic].desc, '#ffd23f');
      api.caveDone(def);
    }
    function pickup(c, r, ch) {
      const def = C.def;
      setTile(c, r, '.');
      C.save.picked.push(c + ',' + r);
      if (ch === '*') { api.give(def.gem, 1); say('A ' + SW.ITEMS[def.gem].name + '! Traders pay well for those.'); }
      else if (ch === 'm') { api.give(def.mod, 1); say('You found a ' + SW.ITEMS[def.mod].name + '. Fit it to your gear from the Mods tab.'); }
      else { const n = 15 + def.zone * 15; api.give('shell', n); say('A bag of ' + n + ' shells.'); }
      api.sound('pickup');
      for (let i = 0; i < 8; i++) puff(c * T + T / 2, r * T + T / 2, '#fff27a', 1);
    }
    function say(msg) { api.toast(msg); }

    // ---------------- creatures ----------------
    function updateFoes(dt) {
      const h = C.hero;
      for (let i = C.foes.length - 1; i >= 0; i--) {
        const f = C.foes[i], d = FOES[f.type];
        f.t += dt; f.hurtT -= dt;
        if (f.dying) { f.dying += dt; if (f.dying > 0.5) C.foes.splice(i, 1); continue; }
        const dx = h.x - f.x, dy = (h.y - 14) - (f.y - d.h / 2), dd = Math.hypot(dx, dy);
        if (d.fly) {
          if (!f.awake && dd < 240) f.awake = true;
          if (f.awake) {
            const sp = d.spd * (dd > 30 ? 1 : 0.4);
            f.vx += ((dx / dd) * sp - f.vx) * Math.min(1, dt * 2.2);
            f.vy += ((dy / dd) * sp + Math.sin(f.t * 5) * 60 - f.vy) * Math.min(1, dt * 2.2);
            const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt;
            if (d.ghost || !solid(Math.floor(nx / T), Math.floor((ny - d.h / 2) / T))) { f.x = nx; f.y = ny; } else { f.vx *= -0.5; f.vy *= -0.5; }
          } else f.y = f.hy + Math.sin(f.t * 2) * 3;
        } else {
          // walkers turn at walls and ledges; hoppers jump at you
          if (d.hop) {
            f.hopT -= dt;
            if (f.hopT <= 0 && Math.abs(dx) < 260) { f.hopT = 1.1 + Math.random(); f.vy = -430; f.vx = Math.sign(dx) * 120; }
          } else if (Math.abs(dx) < 200 && Math.abs(dy) < 40) f.vx = Math.sign(dx) * d.spd * 1.5;
          f.vy = Math.min(800, f.vy + 1900 * dt);
          const ahead = Math.floor((f.x + Math.sign(f.vx) * 14) / T), row = Math.floor((f.y - 8) / T);
          if (solid(ahead, row) || (!solid(ahead, row + 1) && !oneWay(ahead, row + 1) && f.vy === 0)) f.vx = -f.vx;
          f.x += f.vx * dt;
          let ny = f.y + f.vy * dt;
          const r = Math.floor(ny / T), c = Math.floor(f.x / T);
          if (f.vy >= 0 && (solid(c, r) || oneWay(c, r))) { ny = r * T; f.vy = 0; if (d.hop) f.vx *= 0.3; }
          f.y = ny;
        }
        f.face = f.vx >= 0 ? 1 : -1;
        if (dd < 26 && f.hurtT < 0.2) hurt(f.dmg, f.x, f.y, -300);
      }
    }
    function hitFoe(f) {
      const d = FOES[f.type];
      const dmg = api.attack();
      f.hp -= dmg; f.hurtT = 0.3;
      f.vx = C.hero.face * 220; if (!d.fly) f.vy = -220; else f.vy = -80;
      f.awake = true;
      api.sound('hit'); api.shake(3);
      floatText(f.x, f.y - d.h, '-' + dmg, '#ffffff');
      for (let i = 0; i < 6; i++) puff(f.x, f.y - d.h / 2, '#ffffff', 1);
      if (f.hp <= 0) {
        f.dying = 0.001;
        api.sound('poof');
        api.xp(Math.round(d.xp * f.lvl));
        if (Math.random() < 0.5) api.give('shell', 2 + f.lvl);
        for (let i = 0; i < 10; i++) puff(f.x, f.y - d.h / 2, '#c98fd9', 1.2);
      }
    }
    function hurt(dmg, fx, fy, kickY) {
      const h = C.hero;
      if (h.iframes > 0) return;
      const n = api.hurt(dmg);
      h.iframes = 0.9; h.hurtT = 0.35;
      h.vx = Math.sign(h.x - fx || 1) * 260; h.vy = kickY; h.ladder = false;
      floatText(h.x, h.y - 46, '-' + n, '#ff3b5c');
    }

    // ---------------- particles ----------------
    function floatText(x, y, text, color) { C.parts.push({ x, y, vx: 0, vy: -60, t: 0, life: 0.9, color, text, r: 0, noGrav: true }); }
    function puff(x, y, color, s) { C.parts.push({ x, y, vx: (Math.random() - 0.5) * 220 * s, vy: -Math.random() * 200 * s, t: 0, life: 0.5 + Math.random() * 0.3, color, r: 2 + Math.random() * 3 }); }
    function updateParts(dt) {
      for (let i = C.parts.length - 1; i >= 0; i--) {
        const q = C.parts[i];
        q.t += dt; if (!q.noGrav) q.vy += 600 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.t > q.life) C.parts.splice(i, 1);
      }
    }

    // ---------------- drawing ----------------
    function render(g, W, H, dpr) {
      if (!C) return;
      const v = api.view(), k = v.k, def = C.def;
      const ox = -C.cam.x * k, oy = -C.cam.y * k;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // back wall
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, shade(def.tint, -0.25)); bg.addColorStop(1, shade(def.tint, -0.55));
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // far parallax rocks
      g.fillStyle = shade(def.tint, -0.4);
      for (let i = 0; i < 18; i++) {
        const x = ((i * 173 - C.cam.x * 0.4 * k) % (W + 200) + W + 200) % (W + 200) - 100, y = H * (0.2 + ((i * 37) % 60) / 100);
        g.beginPath(); g.ellipse(x, y, 60 * k, 40 * k, 0, 0, TAU); g.fill();
      }
      const c0 = Math.floor(C.cam.x / T) - 1, c1 = Math.ceil((C.cam.x + W / k) / T) + 1;
      const r0 = Math.floor(C.cam.y / T) - 1, r1 = Math.ceil((C.cam.y + H / k) / T) + 1;
      const rock = def.tint, rockHi = shade(def.tint, 0.25), rockLo = shade(def.tint, -0.15);
      const s = T * k;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const ch = tile(c, r), x = ox + c * s, y = oy + r * s;
        if (ch === '#') {
          g.fillStyle = rock; g.fillRect(x - 0.5, y - 0.5, s + 1, s + 1);
          const hsh = ((c * 73856093) ^ (r * 19349663)) >>> 0;
          if (hsh % 3 === 0) { g.fillStyle = rockLo; g.beginPath(); g.ellipse(x + s * (0.3 + (hsh % 7) / 16), y + s * (0.35 + (hsh % 5) / 14), s * 0.2, s * 0.13, 0, 0, TAU); g.fill(); }
          // sticker edges where rock meets air
          if (!solid(c, r - 1)) { g.fillStyle = rockHi; g.fillRect(x, y, s + 0.5, s * 0.22); g.fillStyle = '#ffffff'; g.fillRect(x, y - 2 * k, s + 0.5, 2.4 * k); }
          if (!solid(c, r + 1)) { g.fillStyle = '#ffffff'; g.fillRect(x, y + s - 1 * k, s + 0.5, 2 * k); }
          if (!solid(c - 1, r)) { g.fillStyle = '#ffffff'; g.fillRect(x - 1.5 * k, y, 2.4 * k, s + 0.5); }
          if (!solid(c + 1, r)) { g.fillStyle = '#ffffff'; g.fillRect(x + s - 1 * k, y, 2.4 * k, s + 0.5); }
        } else drawTile(g, ch, c, r, x, y, s, k);
      }
      // creatures, hero, particles
      for (const f of C.foes) drawFoe(g, f, ox, oy, k);
      drawHero(g, ox, oy, k);
      for (const q of C.parts) {
        g.globalAlpha = Math.max(0, 1 - q.t / q.life);
        if (q.text) { g.font = `800 ${Math.round(14 * Math.max(1, k * 0.8))}px Sniglet, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#3b2f4f'; g.strokeText(q.text, ox + q.x * k, oy + q.y * k); g.fillStyle = q.color; g.fillText(q.text, ox + q.x * k, oy + q.y * k); continue; }
        g.fillStyle = q.color; g.beginPath(); g.arc(ox + q.x * k, oy + q.y * k, q.r * k, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      drawLight(g, W, H, ox, oy, k);
      drawPuzzleHud(g, W, H);
    }
    function drawTile(g, ch, c, r, x, y, s, k) {
      if (ch === 'H') {
        g.strokeStyle = '#8a5a2e'; g.lineWidth = 4 * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + s * 0.22, y); g.lineTo(x + s * 0.22, y + s); g.moveTo(x + s * 0.78, y); g.lineTo(x + s * 0.78, y + s); g.stroke();
        g.strokeStyle = '#c98f4a'; g.lineWidth = 3 * k;
        g.beginPath(); for (const f of [0.25, 0.75]) { g.moveTo(x + s * 0.22, y + s * f); g.lineTo(x + s * 0.78, y + s * f); } g.stroke();
      } else if (ch === '=') {
        roundRect(g, x, y + 1, s + 1, s * 0.28, 3 * k, '#c98f4a', '#ffffff', k);
      } else if (ch === '\\' || ch === '/') {
        g.lineCap = 'round';
        const a = ch === '\\' ? [x, y, x + s, y + s] : [x + s, y, x, y + s];
        g.strokeStyle = '#ffffff'; g.lineWidth = 11 * k; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.stroke();
        g.strokeStyle = '#ffb13b'; g.lineWidth = 7 * k; g.stroke();
      } else if (ch === '^') {
        g.fillStyle = '#e8e4f0'; g.strokeStyle = '#3b2f4f'; g.lineWidth = 1.5 * k;
        g.beginPath(); for (let i = 0; i < 3; i++) { const bx = x + (i / 3) * s; g.moveTo(bx, y + s); g.lineTo(bx + s / 6, y + s * 0.45); g.lineTo(bx + s / 3, y + s); } g.fill(); g.stroke();
      } else if (ch === 'D') {
        g.fillStyle = '#ffe9a8'; g.beginPath(); g.moveTo(x - s * 0.2, y + s); g.lineTo(x - s * 0.2, y - s * 0.6); g.arc(x + s / 2, y - s * 0.6, s * 0.7, Math.PI, 0); g.lineTo(x + s * 1.2, y + s); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,240,190,0.6)'; g.fill();
        pillAt(g, 'Exit', x + s / 2, y - s * 1.5, k);
      } else if (ch === 'M') {
        roundRect(g, x - s, y - s * 0.6, s * 3, s * 1.4, 6 * k, '#e8dcc0', '#ffffff', k);
        C.def.order.forEach((id, i) => { const cx = x - s + s * 3 * ((i + 0.5) / C.def.order.length); g.fillStyle = RUNE[id - 1]; g.beginPath(); g.arc(cx, y + s * 0.1, s * 0.22, 0, TAU); g.fill(); g.fillStyle = '#3b2f4f'; g.font = `700 ${Math.round(9 * k)}px Sniglet, sans-serif`; g.textAlign = 'center'; g.fillText(String(i + 1), cx, y + s * 0.62); });
      } else if ('12345'.includes(ch)) {
        const id = +ch, on = C.lit.has(id);
        roundRect(g, x + s * 0.3, y + s * 0.35, s * 0.4, s * 0.65, 3 * k, '#8a8fa3', '#ffffff', k);
        g.fillStyle = on ? RUNE[id - 1] : shade(RUNE[id - 1], -0.55);
        g.beginPath(); g.arc(x + s / 2, y + s * 0.3, s * 0.26, 0, TAU); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 2.4 * k; g.stroke();
      } else if (ch === 'G') {
        g.fillStyle = '#5a5e70'; g.fillRect(x + s * 0.1, y, s * 0.8, s);
        g.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) g.fillRect(x + s * (0.18 + i * 0.26), y, s * 0.1, s);
      } else if (ch === 'T' || ch === 't') {
        const spr = SW.sprites.chest;
        if (spr) drawSpr(g, 'chest', x + s / 2, y + s, s * 1.2, 1, ch === 't' ? 0.5 : 1);
      } else if (ch === 'V') {
        g.strokeStyle = '#4fa64a'; g.lineWidth = 4 * k;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + s * (0.2 + i * 0.3), y); g.bezierCurveTo(x + s * (0.4 + i * 0.3), y + s * 0.3, x + s * (0.0 + i * 0.3), y + s * 0.6, x + s * (0.2 + i * 0.3), y + s); g.stroke(); }
        g.fillStyle = '#6bbf4a'; g.beginPath(); g.arc(x + s * 0.5, y + s * 0.5, s * 0.12, 0, TAU); g.fill();
      } else if (ch === 'R') {
        for (const [a, b, rr] of [[0.3, 0.7, 0.28], [0.7, 0.72, 0.25], [0.5, 0.35, 0.26]]) { g.fillStyle = '#a3a1b5'; g.strokeStyle = '#ffffff'; g.lineWidth = 2 * k; g.beginPath(); g.arc(x + s * a, y + s * b, s * rr, 0, TAU); g.fill(); g.stroke(); }
      } else if (ch === 'I') {
        g.fillStyle = 'rgba(200,240,255,0.85)'; g.fillRect(x, y, s + 0.5, s + 0.5);
        g.strokeStyle = '#ffffff'; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(x + s * 0.2, y + s * 0.7); g.lineTo(x + s * 0.5, y + s * 0.2); g.stroke();
      } else if (ch === 'X') {
        g.fillStyle = '#2b2340'; g.fillRect(x, y, s + 0.5, s + 0.5);
        g.fillStyle = '#5b4f78'; g.beginPath(); g.arc(x + s * 0.5 + Math.sin(C.t * 3 + r) * 4 * k, y + s * 0.5, s * 0.2, 0, TAU); g.fill();
      } else if (ch === '*') drawSpr(g, SW.ITEMS[C.def.gem].icon, x + s / 2, y + s * 0.85 + Math.sin(C.t * 3 + c) * 2 * k, s * 0.75, 1, 1);
      else if (ch === 'm') drawSpr(g, SW.ITEMS[C.def.mod].icon, x + s / 2, y + s * 0.85 + Math.sin(C.t * 3 + c) * 2 * k, s * 0.75, 1, 1);
      else if (ch === '$') drawSpr(g, 'itemShell', x + s / 2, y + s * 0.85, s * 0.7, 1, 1);
    }
    function drawSpr(g, name, x, y, hPx, face, alpha) {
      const spr = SW.sprites[name];
      if (!spr) return;
      const sc = hPx / spr.h;
      g.save();
      g.globalAlpha = alpha === undefined ? 1 : alpha;
      g.translate(x, y); if (face < 0) g.scale(-1, 1);
      g.drawImage(spr.img, -spr.ax * sc, -spr.ay * sc, spr.w * sc, spr.h * sc);
      g.restore();
    }
    function drawFoe(g, f, ox, oy, k) {
      const d = FOES[f.type];
      const fr = Math.floor(f.t * (d.fly ? 8 : 4)) % 2;
      const name = d.sprite + fr + (f.face < 0 ? 'L' : '');
      const x = ox + f.x * k, y = oy + f.y * k;
      const sq = f.dying ? 1 - f.dying / 0.5 : 1;
      g.save(); g.globalAlpha = sq;
      drawSpr(g, SW.sprites[name] ? name : d.sprite + fr, x, y, d.h * 1.5 * k * (0.6 + 0.4 * sq), 1, sq);
      g.restore();
      if (f.hurtT > 0) { g.globalAlpha = 0.5; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y - d.h * 0.7 * k, d.h * 0.6 * k, 0, TAU); g.fill(); g.globalAlpha = 1; }
      if (f.hp < f.maxHp && !f.dying) {
        g.fillStyle = '#3b2f4f'; g.fillRect(x - 14 * k, y - d.h * 1.6 * k, 28 * k, 4 * k);
        g.fillStyle = '#ff4d6d'; g.fillRect(x - 14 * k, y - d.h * 1.6 * k, 28 * k * (f.hp / f.maxHp), 4 * k);
      }
    }
    function drawHero(g, ox, oy, k) {
      const h = C.hero;
      const moving = Math.abs(h.vx) > 20 && h.ground;
      const fr = moving ? Math.floor(h.walkT * 9) % 2 : h.ladder ? Math.floor(C.t * 6 * (Math.abs(h.vy) > 10 ? 1 : 0)) % 2 : 0;
      const x = ox + h.x * k, y = oy + h.y * k;
      const flick = h.iframes > 0 && Math.floor(h.iframes * 20) % 2 === 0;
      const tool = api.toolSprite();
      if (h.swingT > 0 && tool) {
        const t = 1 - h.swingT / 0.24, a = (-1.9 + 3.2 * Math.sin(t * Math.PI / 2)) * h.face;
        const spr = SW.sprites[tool];
        if (spr) { g.save(); g.translate(x + h.face * 14 * k, y - 22 * k); g.rotate(a); const sc = 26 * k / spr.h; g.drawImage(spr.img, -spr.ax * sc, -spr.ay * sc, spr.w * sc, spr.h * sc); g.restore(); }
      }
      drawSpr(g, 'player' + fr, x, y, 46 * k, h.face, flick ? 0.5 : 1);
      if (h.slide) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x - h.slide * 18 * k, y - 4 * k, 12 * k, 4 * k, 0, 0, TAU); g.fill(); }
    }
    // darkness with a pool of light around the hero; lit runes and treasure glow
    function drawLight(g, W, H, ox, oy, k) {
      const def = C.def, h = C.hero;
      const lantern = api.has('lantern');
      const R = (def.dark ? (lantern ? 240 : 95) : 330) * k;
      const amb = def.dark ? 0.94 : 0.72;
      const x = ox + h.x * k, y = oy + (h.y - 20) * k;
      const gr = g.createRadialGradient(x, y, R * 0.25, x, y, R);
      gr.addColorStop(0, 'rgba(10,8,20,0)'); gr.addColorStop(1, `rgba(10,8,20,${amb})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const s = T * k;
      const glow = (cx, cy, rad, col, a) => { const q = g.createRadialGradient(cx, cy, 0, cx, cy, rad); q.addColorStop(0, col.replace('A', a)); q.addColorStop(1, col.replace('A', 0)); g.fillStyle = q; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); };
      for (let r = 0; r < C.H; r++) for (let c = 0; c < C.W; c++) {
        const ch = C.rows[r][c];
        const cx = ox + c * s + s / 2, cy = oy + r * s + s / 2;
        if (cx < -80 || cx > W + 80 || cy < -80 || cy > H + 80) continue;
        if ('12345'.includes(ch)) glow(cx, cy - s * 0.2, s * (C.lit.has(+ch) ? 1.6 : 0.8), hexA(RUNE[+ch - 1]), C.lit.has(+ch) ? 0.55 : 0.18);
        else if (ch === 'T') glow(cx, cy, s * 1.8, 'rgba(255,210,63,A)', C.save.solved ? 0.5 : 0.2);
        else if (ch === 'D') glow(cx, cy - s * 0.4, s * 2.2, 'rgba(255,240,190,A)', 0.45);
        else if (ch === '*' || ch === 'm') glow(cx, cy, s, 'rgba(255,255,200,A)', 0.3);
        else if (ch === 'M') glow(cx + s / 2, cy, s * 1.6, 'rgba(255,250,230,A)', 0.2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    function drawPuzzleHud(g, W, H) {
      // the rune order you have struck so far, as dots; the game says where there is room
      const def = C.def, n = def.order.length, w = n * 22, v = api.view();
      const cx = v.hudX || W / 2, y = v.hudY || 18;
      roundRect(g, cx - w / 2 - 10, y - 12, w + 20, 24, 12, 'rgba(255,250,240,0.92)', '#ffffff', 1);
      def.order.forEach((id, i) => {
        const done = C.save.solved || i < C.progress;
        g.fillStyle = done ? RUNE[id - 1] : '#d8d0c4';
        g.beginPath(); g.arc(cx - w / 2 + 11 + i * 22, y, 7, 0, TAU); g.fill();
      });
      const label = def.name + (C.save.taken ? ' · finished' : '');
      g.font = '700 12px Sniglet, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,250,240,0.9)'; g.strokeText(label, cx, y + 28);
      g.fillStyle = '#3b2f4f'; g.fillText(label, cx, y + 28);
    }
    function pillAt(g, text, x, y, k) {
      g.font = `700 ${Math.round(11 * Math.max(1, k * 0.8))}px Sniglet, sans-serif`;
      const w = g.measureText(text).width + 14;
      roundRect(g, x - w / 2, y - 10, w, 20, 10, '#fffaf0', '#ffffff', 1);
      g.fillStyle = '#3b2f4f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y); g.textBaseline = 'alphabetic';
    }
    function roundRect(g, x, y, w, h, r, fill, stroke, k) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2 * k; g.stroke(); }
    }
    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
      return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
    function hexA(hex) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},A)`; }

    return {
      enter, leave, update, render,
      get active() { return !!C; },
      get cave() { return C && C.def; },
      get state() { return C; },
      hint() {
        if (!C) return null;
        if (near('D', 0)) return 'Exit';
        if (near('12345')) return 'Strike';
        if (near('T')) return 'Open';
        if (near('M')) return 'Read';
        return 'Swing';
      },
    };
  };

  SW.CAVE_MAPS = {
    mossmouth: [
      "############################################",
      "#...........V.........b....................#",
      "#.....M.....V..............................#",
      "#D.S........V.................1............#",
      "##################\\#####################H###",
      "#....$.............\\....................H..#",
      "#...===.............\\...................H..#",
      "#..*....2.....g......\\..................H..#",
      "##########################H###\\#############",
      "#...............G.........H....\\...........#",
      "#...............G.........H.....\\..........#",
      "#...m....T......G....#....H...g..\\......3..#",
      "############################################",
    ],
    echomine: [
      "################################################",
      "#...............b..............................#",
      "#......M.......................................#",
      "#D.S........#...........3......................#",
      "####H#######################\\###################",
      "#...H........................\\......R..........#",
      "#...H........===#.............\\.....R..........#",
      "#...H.....4.....#...p..........\\....R.....2....#",
      "######H#########################################",
      "#.....H.......................*................#",
      "#.....H.....................=====..............#",
      "#.....H.................g...............1......#",
      "##############\\###################H#############",
      "#.............G\\..........b.......H.....R......#",
      "#.............G.\\.................H.....R......#",
      "#.....T.......G..\\....#...........H.....R....m.#",
      "################################################",
    ],
    grotto: [
      "####################################################",
      "#.........................V........................#",
      "#.......M.................V........................#",
      "#D.S..............o.......V.......4................#",
      "####################H#################\\#########H###",
      "#...............b...H...............V..\\........H..#",
      "#...................H........======.V...\\.......H..#",
      "#...................H...3.....^^^^..V....\\...*..H..#",
      "##########/###H#####################################",
      "#......../....H.....................R..............#",
      "#......./.....H.....................R..............#",
      "#...2../......H...^^^.....g.........R.......1......#",
      "##############################\\###H#################",
      "#...............b.....G........\\..H................#",
      "#.....................G.........\\.H................#",
      "#...m.....T...........G.......o..\\H.............$..#",
      "####################################################",
    ],
    frostfang: [
      "####################################################",
      "#.............I....................................#",
      "#.......M.....I....................................#",
      "#D.S..........I.......p.......2....................#",
      "####################################\\###########H###",
      "#.................R.....*....b.......\\..........H..#",
      "#.................R...====............\\.........H..#",
      "#...........4.....R....................\\........H..#",
      "########H#######################\\#######H###########",
      "#.......H.....................I..\\......H..........#",
      "#.......H.....................I...\\.....H..........#",
      "#.......H...............p.....I....\\....H.^^^.1....#",
      "################\\###########H#######################",
      "#...........G....\\..........H.......b.........I....#",
      "#...........G.....\\.........H.................I....#",
      "#....T......G......\\m.......H...............3.I..$.#",
      "####################################################",
    ],
    inkwell: [
      "########################################################",
      "#...............X...s..................................#",
      "#.......M.......X......................................#",
      "#D.S............X...........5..........................#",
      "##################################\\#################H###",
      "#..................................\\................H..#",
      "#......................======.......\\...............H..#",
      "#.......4.......p.......^^^^.........\\........2.....H..#",
      "####H#######\\#############H#############################",
      "#...H........\\............H...s.....X..................#",
      "#...H.........\\...........H.........X..................#",
      "#...H..........\\......*...H.........X.............1....#",
      "##########################################\\#########H###",
      "#.................R........................\\........H..#",
      "#.................R.........................\\.......H..#",
      "#.........3.......R.......o.............^^^..\\......H..#",
      "##################################/###########H#########",
      "#...................G.........s../....b.......H........#",
      "#...................G.........../.............H........#",
      "#...$...T...........G........../..............H...m....#",
      "########################################################",
    ],
  };
})();
