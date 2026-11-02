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
  W.sway = function (t, seed, screenWindX) {
    const s = W.wind;
    return screenWindX * s * 0.16 + Math.sin(t * (1.6 + s * 2.2) + seed * 40) * (0.02 + s * 0.05);
  };

  // gameplay modifiers
  W.fireBurn = () => 1 + W.rain() * 1.4;
  W.hungerMul = (nearFire) => (nearFire ? 1 : 1 + W.snowing() * 0.6) + W.sanding() * 0.35;
  W.speedMul = () => 1 - W.sanding() * 0.25 - W.snowing() * 0.08;
  W.grip = () => 1 - Math.min(0.8, W.snow * 0.85);       // 1 = normal footing, low = slippery
  W.biteMul = () => 1 - Math.min(0.5, W.rain() * 0.4);
  W.aggroMul = () => 1 - W.fogAmt * 0.45 - Math.min(0.2, W.rain() * 0.1);
  W.inkWash = () => W.rain() * 0.7;                        // Scribble hp lost per second

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
  W.draw = function (g, vw, vh, z, dt, camShiftX, camShiftY, screenWindX) {
    const rain = W.rain(), snow = W.snowing(), sand = W.sanding(), wind = W.wind;
    const want = Math.round(rain * 260 + snow * 220 + sand * 260 + (wind > 0.6 ? 26 : 0));
    const P = W.parts;
    while (P.length < want) P.push(spawn(vw, vh, true));
    if (P.length > want) P.length = want;
    const total = Math.max(1, rain + snow + sand);
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.kind) { const r = Math.random() * total; p.kind = r < rain ? 'rain' : r < rain + snow ? 'snow' : sand ? 'sand' : 'swoosh'; }
      p.x -= camShiftX; p.y -= camShiftY;
      const wx = screenWindX * wind;
      if (p.kind === 'rain') {
        p.x += (wx * 260 + 30) * dt * z; p.y += 900 * dt * z;
        g.strokeStyle = 'rgba(210,230,255,0.75)'; g.lineWidth = 1.3 * z;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - (wx * 260 + 30) * 0.02 * z, p.y - 18 * z); g.stroke();
        if (p.y > p.land) { if (Math.random() < 0.3) W.splashes.push([p.x, p.land, 0]); Object.assign(p, spawn(vw, vh, false)); p.kind = 'rain'; }
      } else if (p.kind === 'snow') {
        p.t += dt;
        p.x += (wx * 120 + Math.sin(p.t * 2 + p.s * 9) * 25) * dt * z; p.y += (55 + p.s * 40) * dt * z;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(p.x, p.y, (1.4 + p.s * 2) * z, 0, TAU); g.fill();
        if (p.y > p.land) { Object.assign(p, spawn(vw, vh, false)); p.kind = 'snow'; }
      } else if (p.kind === 'sand') {
        p.x += (wx * 520 + 160) * dt * z; p.y += (Math.sin(p.x * 0.01 + p.s * 6) * 40) * dt * z;
        g.fillStyle = 'rgba(214,170,100,0.7)'; g.fillRect(p.x, p.y, 3 * z, 1.6 * z);
      } else {
        // wind swooshes: a white sticker curl drifting downwind
        p.t += dt;
        p.x += (screenWindX >= 0 ? 1 : -1) * 260 * dt * z;
        const a = Math.min(1, p.t * 2) * Math.max(0, 1 - p.t / 1.6);
        g.strokeStyle = `rgba(255,255,255,${0.8 * a})`; g.lineWidth = 2.2 * z;
        g.beginPath(); g.moveTo(p.x - 40 * z, p.y); g.quadraticCurveTo(p.x - 10 * z, p.y - 8 * z, p.x, p.y); g.quadraticCurveTo(p.x + 8 * z, p.y + 5 * z, p.x + 3 * z, p.y + 9 * z); g.stroke();
        if (p.t > 1.6) { Object.assign(p, spawn(vw, vh, true)); p.kind = 'swoosh'; }
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
  W.splashes = [];
  function spawn(vw, vh, anywhere) {
    return { x: Math.random() * vw, y: anywhere ? Math.random() * vh : -20 - Math.random() * 80, land: vh * (0.15 + Math.random() * 0.85), s: Math.random(), t: 0, kind: null };
  }

  // screen-space overlays after the world is drawn (fog, storm gloom, lightning)
  W.overlay = function (g, w, h) {
    const rain = W.rain();
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
