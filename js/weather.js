// Stickerwild — weather and the moon.
// Weather follows the local climate (temperate, cold, hot) and changes every
// minute or two. It is more than looks: rain soaks fires and Scribbles, snow
// freezes the shallows and makes the ground slippery, fog hides you from
// creatures, wind pushes rafts and gliders.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const KINDS = {
    clear: { name: 'Clear', wind: 0.15 },
    windy: { name: 'Windy', wind: 0.85 },
    rain: { name: 'Rain', wind: 0.35, rain: 1 },
    storm: { name: 'Thunderstorm', wind: 1, rain: 1.6, lightning: true },
    snow: { name: 'Snow', wind: 0.3, snow: 1 },
    blizzard: { name: 'Blizzard', wind: 0.95, snow: 1.8 },
    fog: { name: 'Fog', wind: 0.05, fog: 1 },
    sandstorm: { name: 'Sandstorm', wind: 1, sand: 1 },
  };
  const CLIMATE = {
    temperate: [['clear', 5], ['windy', 2], ['rain', 3], ['storm', 1], ['fog', 1.5]],
    cold: [['clear', 3], ['snow', 4], ['blizzard', 1], ['fog', 1.5], ['windy', 1]],
    hot: [['clear', 6], ['windy', 2], ['sandstorm', 2]],
  };
  // what each weather does to you, shown when it starts
  const NOTES = {
    windy: 'Plants bend and your raft or glider rides the wind.',
    rain: 'Fires burn out faster, fish bite sooner, and the rain washes Scribbles away.',
    storm: 'Fires drown quickly. Lightning lights up the dark. Scribbles melt in the downpour.',
    snow: 'The ground gets slippery, you get hungry faster away from fire, and shallow water freezes over.',
    blizzard: 'Very slippery, very cold. Stay near a fire.',
    fog: 'You can barely see, but creatures can barely see you either.',
    sandstorm: 'Sand slows you down and makes you thirsty (hungrier).',
  };

  const W = (SW.weather = {
    kind: 'clear', next: 'clear', mix: 1, timer: 40, climate: 'temperate',
    windAngle: Math.random() * TAU, windTarget: 0, wind: 0.15, gust: 0,
    wet: 0, snow: 0, fogAmt: 0, sandAmt: 0, flash: 0, boltT: 8,
    parts: [], lastCam: null,
  });

  function pick(climate) {
    const list = CLIMATE[climate];
    let tot = 0; for (const [, w] of list) tot += w;
    let r = Math.random() * tot;
    for (const [k, w] of list) if ((r -= w) <= 0) return k;
    return 'clear';
  }

  // current blend of the old and new weather
  function val(key) {
    const a = KINDS[W.kind][key] || 0, b = KINDS[W.next][key] || 0;
    return a + (b - a) * W.mix;
  }
  W.rain = () => val('rain');
  W.snowing = () => val('snow');
  W.fogging = () => val('fog');
  W.sanding = () => val('sand');
  W.name = () => KINDS[W.mix > 0.5 ? W.next : W.kind].name;
  W.current = () => (W.mix > 0.5 ? W.next : W.kind);

  // Called every frame by the game.
  W.update = function (dt, climate, onChange) {
    if (climate !== W.climate) {
      W.climate = climate;
      // a weather that cannot happen here (snow in the desert) fades out fast
      if (!CLIMATE[climate].some(([k]) => k === W.next)) { W.timer = Math.min(W.timer, 2); }
    }
    W.timer -= dt;
    if (W.mix < 1) W.mix = Math.min(1, W.mix + dt / 8);
    if (W.timer <= 0 && W.mix >= 1) {
      W.kind = W.next;
      W.next = pick(W.climate);
      W.mix = W.next === W.kind ? 1 : 0;
      W.timer = 60 + Math.random() * 90;
      if (W.next !== W.kind && onChange) onChange(KINDS[W.next].name, NOTES[W.next] || '');
    }
    // wind wanders, with gusts
    W.windTarget += (Math.random() - 0.5) * dt * 0.4;
    W.windAngle += (W.windTarget - W.windAngle) * dt * 0.1;
    // the air and the clouds travel downwind; gusts and showers ride along with them
    const ux = Math.cos(W.windAngle), uy = Math.sin(W.windAngle);
    W.gx += ux * W.airSpeed() * dt; W.gy += uy * W.airSpeed() * dt;
    W.rx += ux * W.cloudSpeed() * dt; W.ry += uy * W.cloudSpeed() * dt;
    W.gust = Math.max(0, W.gust - dt * 0.6);
    if (Math.random() < dt * 0.12) W.gust = 0.3 + Math.random() * 0.5;
    W.wind = Math.min(1.4, val('wind') + W.gust * (0.3 + val('wind')));
    // the world slowly soaks, dries, fills with snow and melts
    const r = W.rain(), sn = W.snowing();
    W.wet = Math.max(0, Math.min(1, W.wet + (r > 0.2 ? dt / 25 : -dt / 60)));
    W.snow = Math.max(0, Math.min(1, W.snow + (sn > 0.2 ? dt / 40 * sn : -dt / 90)));
    W.fogAmt += (W.fogging() - W.fogAmt) * Math.min(1, dt / 4);
    W.sandAmt += (W.sanding() - W.sandAmt) * Math.min(1, dt / 4);
    W.flash = Math.max(0, W.flash - dt * 3);
    if (val('lightning') > 0.5) {
      W.boltT -= dt;
      if (W.boltT <= 0) { W.boltT = 5 + Math.random() * 9; W.flash = 1; W.thunder = 0.4 + Math.random() * 1.2; }
    }
    if (W.thunder !== undefined) { W.thunder -= dt; if (W.thunder <= 0) { W.thunder = undefined; SW.audio.play('boom'); } }
  };

  // how much a plant leans this instant (radians, before its own stiffness)
  // `gust` is the wind strength where the plant stands (W.gustAt), so plants
  // bend one patch at a time as a gust front crosses them.
  W.sway = function (t, seed, screenWindX, gust) {
    const s = gust === undefined ? W.wind : gust;
    return screenWindX * s * 0.2 + Math.sin(t * (1.6 + s * 2.6) + seed * 40) * (0.015 + s * 0.06);
  };

  // ---------- the air ----------
  // Wind is a field, not one number. Gusts are blobs of fast air (two octaves
  // of noise) carried across the island at the wind's speed, so a gust front
  // reaches one meadow, then the next. Rain and snow fall from cells (a
  // larger, slower noise) that drift downwind too, so showers pass over.
  const nG = SW.makeNoise(9173), nR = SW.makeNoise(4421);
  W.gx = 0; W.gy = 0;   // how far the air has travelled, in world units
  W.rx = 0; W.ry = 0;   // how far the clouds have travelled
  W.airSpeed = () => 120 + 460 * W.wind;
  W.cloudSpeed = () => 60 + 180 * W.wind;
  const smooth = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
  // 0..1: how strong the gust is here, before scaling by the overall wind
  W.gustShape = function (x, y) {
    const px = (x - W.gx) / 620, py = (y - W.gy) / 620;
    const n = nG(px, py) * 0.7 + nG(px * 3.1 + 7.7, py * 3.1 - 3.3) * 0.3;
    return smooth((n - 0.4) / 0.32);
  };
  // local wind strength: calm air between gusts, up to 1.5x the wind inside one
  W.gustAt = (x, y) => W.wind * (0.3 + 1.2 * W.gustShape(x, y));
  // 0..1: how much of a rain or snow cell is overhead
  W.cellAt = function (x, y) {
    const px = (x - W.rx) / 1500, py = (y - W.ry) / 1500;
    const n = nR(px, py) * 0.75 + nR(px * 3.3 + 3.1, py * 3.3 - 5.2) * 0.25;
    return smooth((n - 0.36) / 0.22);
  };
  W.rainAt = (x, y) => { const r = W.rain(); return r > 0.01 ? r * W.cellAt(x, y) : 0; };
  W.snowAt = (x, y) => { const r = W.snowing(); return r > 0.01 ? r * W.cellAt(x, y) : 0; };

  // ---------- the soak map ----------
  // A grid around the player remembers where rain and snow have fallen.
  // Cells soak under a passing shower and dry afterwards (faster in wind).
  const GN = 56, GS = 128;
  let soak = new Float32Array(GN * GN), cover = new Float32Array(GN * GN);
  let gox = 0, goy = 0, gReady = false, gT = 0;
  W.updateSoak = function (px, py, dt) {
    const ox = Math.floor(px / GS) - GN / 2, oy = Math.floor(py / GS) - GN / 2;
    if (!gReady || ox !== gox || oy !== goy) {
      // re-centre: keep the overlap, fill new cells with the island-wide average
      const ns = new Float32Array(GN * GN).fill(W.wet), nc = new Float32Array(GN * GN).fill(W.snow);
      if (gReady) {
        for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
          const si = i + ox - gox, sj = j + oy - goy;
          if (si < 0 || sj < 0 || si >= GN || sj >= GN) continue;
          ns[j * GN + i] = soak[sj * GN + si]; nc[j * GN + i] = cover[sj * GN + si];
        }
      }
      soak = ns; cover = nc; gox = ox; goy = oy; gReady = true;
    }
    gT += dt;
    if (gT < 0.25) return;
    const step = gT; gT = 0;
    const r = W.rain(), sn = W.snowing();
    const dry = step * (1 + W.wind * 0.8) / 70, melt = step / 110;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const k = j * GN + i, x = (gox + i + 0.5) * GS, y = (goy + j + 0.5) * GS;
      const c = r > 0.01 || sn > 0.01 ? W.cellAt(x, y) : 0;
      soak[k] = c * r > 0.05 ? Math.min(1, soak[k] + step * c * r / 14) : Math.max(0, soak[k] - dry);
      cover[k] = c * sn > 0.05 ? Math.min(1, cover[k] + step * c * sn / 30) : Math.max(0, cover[k] - melt);
    }
  };
  function sample(arr, fallback, x, y) {
    if (!gReady) return fallback;
    const i = Math.floor(x / GS) - gox, j = Math.floor(y / GS) - goy;
    if (i < 0 || j < 0 || i >= GN || j >= GN) return fallback;
    return arr[j * GN + i];
  }
  W.wetAt = (x, y) => sample(soak, W.wet, x, y);       // 0 dry .. 1 soaked
  W.coverAt = (x, y) => sample(cover, W.snow, x, y);   // 0 bare .. 1 snowed under
  W.resetSoak = () => { gReady = false; };

  // what the weather is doing where the player stands (set by the game each frame)
  W.here = { rain: 0, snow: 0, gust: 0, wet: 0, cover: 0 };
  W.sense = function (x, y) {
    const h = W.here;
    h.rain = W.rainAt(x, y); h.snow = W.snowAt(x, y); h.gust = W.gustAt(x, y);
    h.wet = W.wetAt(x, y); h.cover = W.coverAt(x, y);
    return h;
  };

  // gameplay modifiers
  // gameplay modifiers: they read the weather where it matters, not island-wide
  W.fireBurn = (x, y) => 1 + W.rainAt(x, y) * 1.4;
  W.hungerMul = (nearFire) => (nearFire ? 1 : 1 + W.here.snow * 0.6) + W.sanding() * 0.35;
  W.speedMul = () => 1 - W.sanding() * 0.25 - W.here.snow * 0.08;
  W.grip = () => 1 - Math.min(0.8, W.here.cover * 0.85);  // 1 = normal footing, low = slippery
  W.biteMul = () => 1 - Math.min(0.5, W.here.rain * 0.4);
  W.aggroMul = (x, y) => 1 - W.fogAmt * 0.45 - Math.min(0.2, W.rainAt(x, y) * 0.1);
  W.inkWash = (x, y) => W.rainAt(x, y) * 0.7;              // Scribble hp lost per second

  // ---------- moon ----------
  const MOON_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  SW.moon = function (day) {
    const index = (day - 1) % 8;
    const phase = index / 8;
    const bright = 1 - Math.abs(phase - 0.5) * 2; // 0 new .. 1 full
    const ink = index === 0 && day >= 8;          // the Ink Moon: a new moon after the first week
    return { index, phase, bright, ink, name: ink ? 'Ink Moon' : MOON_NAMES[index] };
  };
  // draw the moon as a sticker with its phase shadow
  SW.drawMoon = function (g, x, y, r, phase, ink) {
    const light = ink ? '#d08bff' : '#fdf6d8', dark = 'rgba(28,30,72,0.92)';
    g.save();
    if (ink) { g.beginPath(); g.arc(x, y, r * 1.9, 0, TAU); g.fillStyle = 'rgba(196,107,255,0.18)'; g.fill(); }
    g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    g.fillStyle = dark; g.fillRect(x - r, y - r, r * 2, r * 2);
    const waxing = phase < 0.5, k = Math.cos(phase * TAU); // 1 new .. -1 full
    g.fillStyle = light;
    g.beginPath(); if (waxing) g.arc(x, y, r, -Math.PI / 2, Math.PI / 2); else g.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill();
    g.fillStyle = k > 0 ? dark : light;
    g.beginPath(); g.ellipse(x, y, Math.max(0.01, r * Math.abs(k)), r, 0, 0, TAU); g.fill();
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 2; g.strokeStyle = '#3b2f4f'; g.stroke();
  };

  // ---------- particles (drawn into the flat world buffer) ----------
  // Positions are in buffer pixels; the camera's movement shifts them so the
  // rain feels anchored to the world rather than glued to the screen.
  // `toWorld(fx, fy)` maps a buffer point to the ground under it, so rain only
  // shows inside the drifting cells and wind curls appear on gust fronts.
  W.draw = function (g, vw, vh, z, dt, camShiftX, camShiftY, screenWindX, toWorld) {
    const rain = W.rain(), snow = W.snowing(), sand = W.sanding(), wind = W.wind;
    const swooshes = wind > 0.35 ? Math.round(8 + wind * 26) : 0;
    const want = Math.round(rain * 300 + snow * 240 + sand * 260) + swooshes;
    const P = W.parts;
    while (P.length < want) P.push(spawn(vw, vh, true));
    if (P.length > want) P.length = want;
    const total = Math.max(1, rain + snow + sand);
    let nSwoosh = 0;
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.kind) {
        if (nSwoosh < swooshes) p.kind = 'swoosh';
        else { const r = Math.random() * total; p.kind = r < rain ? 'rain' : r < rain + snow ? 'snow' : 'sand'; }
        if (p.kind === 'swoosh') placeOnGust(p, vw, vh, toWorld);
      }
      if (p.kind === 'swoosh') nSwoosh++;
      p.x -= camShiftX; p.y -= camShiftY;
      // how much shower is over this particle (re-checked a few times a second)
      p.ct -= dt;
      if (p.ct <= 0 && toWorld && (p.kind === 'rain' || p.kind === 'snow')) { const w = toWorld(p.x, p.land); p.cell = W.cellAt(w[0], w[1]); p.ct = 0.2 + Math.random() * 0.2; }
      const wx = screenWindX * wind;
      if (p.kind === 'rain') {
        p.x += (wx * 260 + 30) * dt * z; p.y += 900 * dt * z;
        if (p.cell > 0.05) {
          g.strokeStyle = `rgba(210,230,255,${0.75 * p.cell})`; g.lineWidth = 1.3 * z;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - (wx * 260 + 30) * 0.02 * z, p.y - 18 * z); g.stroke();
        }
        if (p.y > p.land) { if (p.cell > 0.3 && Math.random() < 0.3) W.splashes.push([p.x, p.land, 0]); Object.assign(p, spawn(vw, vh, false)); p.kind = 'rain'; }
      } else if (p.kind === 'snow') {
        p.t += dt;
        p.x += (wx * 120 + Math.sin(p.t * 2 + p.s * 9) * 25) * dt * z; p.y += (55 + p.s * 40) * dt * z;
        if (p.cell > 0.05) {
          g.fillStyle = `rgba(255,255,255,${Math.min(1, p.cell * 1.2)})`;
          g.beginPath(); g.arc(p.x, p.y, (1.4 + p.s * 2) * z, 0, TAU); g.fill();
        }
        if (p.y > p.land) { Object.assign(p, spawn(vw, vh, false)); p.kind = 'snow'; }
      } else if (p.kind === 'sand') {
        p.x += (wx * 520 + 160) * dt * z; p.y += (Math.sin(p.x * 0.01 + p.s * 6) * 40) * dt * z;
        g.fillStyle = 'rgba(214,170,100,0.7)'; g.fillRect(p.x, p.y, 3 * z, 1.6 * z);
      } else {
        // wind curls: white sticker swirls riding a gust front downwind
        p.t += dt;
        p.x += screenWindX * (W.airSpeed() * 0.55) * dt * z;
        const a = Math.min(1, p.t * 2) * Math.max(0, 1 - p.t / 1.8) * p.cell;
        const dir = screenWindX >= 0 ? 1 : -1;
        g.strokeStyle = `rgba(255,255,255,${0.85 * a})`; g.lineWidth = 2.2 * z;
        g.beginPath(); g.moveTo(p.x - 40 * z * dir, p.y); g.quadraticCurveTo(p.x - 10 * z * dir, p.y - 8 * z, p.x, p.y); g.quadraticCurveTo(p.x + 8 * z * dir, p.y + 5 * z, p.x + 3 * z * dir, p.y + 9 * z); g.stroke();
        if (p.t > 1.8) { Object.assign(p, spawn(vw, vh, true)); p.kind = 'swoosh'; placeOnGust(p, vw, vh, toWorld); }
      }
      // wrap around the buffer
      if (p.x < -40) p.x += vw + 80; else if (p.x > vw + 40) p.x -= vw + 80;
      if (p.y < -60) p.y += vh + 80; else if (p.y > vh + 60) p.y -= vh + 80;
    }
    // rain splashes
    g.strokeStyle = 'rgba(220,235,255,0.7)'; g.lineWidth = 1.2 * z;
    for (let i = W.splashes.length - 1; i >= 0; i--) {
      const s = W.splashes[i];
      s[0] -= camShiftX; s[1] -= camShiftY; s[2] += dt;
      if (s[2] > 0.3) { W.splashes.splice(i, 1); continue; }
      const r = (2 + s[2] * 30) * z;
      g.globalAlpha = 1 - s[2] / 0.3;
      g.beginPath(); g.ellipse(s[0], s[1], r, r * 0.4, 0, 0, TAU); g.stroke();
    }
    g.restore();
  };
  // put a wind curl where the gust is strongest among a few tries
  function placeOnGust(p, vw, vh, toWorld) {
    p.cell = 1;
    if (!toWorld) return;
    let best = -1;
    for (let k = 0; k < 5; k++) {
      const x = Math.random() * vw, y = vh * (0.1 + Math.random() * 0.85);
      const w = toWorld(x, y), gs = W.gustShape(w[0], w[1]);
      if (gs > best) { best = gs; p.x = x; p.y = y; }
    }
    p.cell = Math.min(1, best * 1.3);
  }
  W.splashes = [];
  function spawn(vw, vh, anywhere) {
    return { x: Math.random() * vw, y: anywhere ? Math.random() * vh : -20 - Math.random() * 80, land: vh * (0.15 + Math.random() * 0.85), s: Math.random(), t: 0, kind: null, cell: 0, ct: 0 };
  }

  // Shadows of the passing rain and snow clouds, drawn over the world. The
  // cloud field is sampled on a small grid and stretched smoothly.
  const shade = document.createElement('canvas');
  shade.width = 48; shade.height = 32;
  const sctx = shade.getContext('2d');
  const simg = sctx.createImageData(48, 32);
  W.drawShadows = function (g, vw, vh, toWorld) {
    const amt = Math.min(1, W.rain() * 0.8 + W.snowing() * 0.5);
    if (amt < 0.03 || !toWorld) return;
    const d = simg.data;
    for (let j = 0; j < 32; j++) for (let i = 0; i < 48; i++) {
      const w = toWorld((i + 0.5) / 48 * vw, (j + 0.5) / 32 * vh);
      const c = W.cellAt(w[0], w[1]), o = (j * 48 + i) * 4;
      d[o] = 38; d[o + 1] = 48; d[o + 2] = 84; d[o + 3] = Math.round(255 * 0.26 * amt * c);
    }
    sctx.putImageData(simg, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(shade, 0, 0, g.canvas.width, g.canvas.height);
    g.restore();
  };

  // screen-space overlays after the world is drawn (fog, storm gloom, lightning)
  W.overlay = function (g, w, h) {
    const rain = W.here.rain;
    if (rain > 0.05) { g.fillStyle = `rgba(40,55,90,${Math.min(0.22, rain * 0.14)})`; g.fillRect(0, 0, w, h); }
    if (W.fogAmt > 0.02) {
      const gr = g.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.15, w / 2, h * 0.6, Math.max(w, h) * 0.75);
      gr.addColorStop(0, `rgba(235,240,245,${W.fogAmt * 0.15})`);
      gr.addColorStop(1, `rgba(235,240,245,${W.fogAmt * 0.85})`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    if (W.sandAmt > 0.02) { g.fillStyle = `rgba(214,170,100,${W.sandAmt * 0.32})`; g.fillRect(0, 0, w, h); }
    if (W.flash > 0.02) { g.fillStyle = `rgba(255,255,255,${W.flash * 0.75})`; g.fillRect(0, 0, w, h); }
  };
})();
