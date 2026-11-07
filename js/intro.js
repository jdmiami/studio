// Stickerwild — the story intro, drawn as an animated action-manga sequence:
// ink panels, speed lines, halftone screentone, impact frames and katakana SFX.
// The world starts in colour; when the Ink spills the pages turn to ink and tone,
// and only Ene in Pink, and her friend Star, keep their colour.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const INK = '#141018';
  const PAPER = '#f6f1e6';
  const SFX_FONT = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
  const CAP_FONT = '"Sniglet", ui-rounded, system-ui, sans-serif';
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let el, cv, g, W = 0, H = 0, DPR = 1, raf = 0;
  let scene = 0, sceneT0 = 0, done = null, shake = 0, flash = 0, fired = new Set(), ending = false;
  let tonePat = null, toneDark = null;

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const back = (t) => { t = clamp01(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }

  // ---------- drawing kit ----------
  function patterns() {
    const mk = (size, r, col) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d'); x.fillStyle = col;
      x.beginPath(); x.arc(size / 2, size / 2, r, 0, TAU); x.fill();
      x.beginPath(); x.arc(0, 0, r, 0, TAU); x.arc(size, 0, r, 0, TAU); x.arc(0, size, r, 0, TAU); x.arc(size, size, r, 0, TAU); x.fill();
      return g.createPattern(c, 'repeat');
    };
    tonePat = mk(7, 1.5, INK);
    toneDark = mk(6, 2.3, INK);
  }
  function poly(pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // A manga panel that slams in from a direction, clipped, with a thick ink border.
  function panel(pts, t, at, from, draw) {
    if (t < at) return;
    const k = reduce ? 1 : back((t - at) / 0.38);
    g.save();
    g.translate(from[0] * (1 - k) * 90, from[1] * (1 - k) * 90);
    g.globalAlpha = clamp01((t - at) / 0.12);
    poly(pts); g.fillStyle = '#ffffff'; g.fill();
    g.save(); poly(pts); g.clip(); draw(bbox(pts), t - at); g.restore();
    poly(pts); g.lineJoin = 'miter'; g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.restore();
  }
  function tone(x, y, w, h, alpha, dark) { g.save(); g.globalAlpha *= alpha; g.fillStyle = dark ? toneDark : tonePat; g.fillRect(x, y, w, h); g.restore(); }
  function toneFade(b, fromTop, strength) {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const y = fromTop ? b.y + (b.h * i) / steps : b.y + b.h - (b.h * (i + 1)) / steps;
      tone(b.x, y, b.w, b.h / steps + 1, strength * (1 - i / steps));
    }
  }
  // speed lines that flicker like hand-drawn animation (re-seeded 12x a second)
  function radial(cx, cy, rIn, rOut, n, color, t, seed = 7) {
    const r = SW.rng(seed * 997 + Math.floor(t * 12));
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, w = 0.005 + r() * 0.022, ri = rIn * (0.65 + r() * 0.7);
      g.moveTo(cx + Math.cos(a - w) * rOut, cy + Math.sin(a - w) * rOut);
      g.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
      g.lineTo(cx + Math.cos(a + w) * rOut, cy + Math.sin(a + w) * rOut);
    }
    g.fillStyle = color; g.fill();
  }
  function parallel(b, angle, n, color, t, seed = 3, alpha = 1) {
    const r = SW.rng(seed * 991 + Math.floor(t * 12));
    const dx = Math.cos(angle), dy = Math.sin(angle), px = -dy, py = dx;
    const L = Math.hypot(b.w, b.h);
    g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const o = (r() - 0.5) * L, len = L * (0.2 + r() * 0.6), s = (r() - 0.5) * L;
      const x = b.cx + px * o + dx * s, y = b.cy + py * o + dy * s;
      g.lineWidth = 0.8 + r() * 2.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx * len, y + dy * len); g.stroke();
    }
    g.restore();
  }
  function big(name, x, y, h, o = {}) {
    const spr = SW.bigSprite(name, 4, !!o.gray);
    if (!spr) return;
    const sc = h / spr.h;
    g.save();
    g.translate(x, y); if (o.rot) g.rotate(o.rot);
    g.scale(o.flip ? -sc : sc, sc);
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    g.drawImage(spr.img, -spr.ax, -spr.ay, spr.w, spr.h);
    g.restore();
  }
  // one of the original hand-drawn pictures (Ene's faces, Star), with a white sticker border
  const artCache = {};
  function artSticker(key) {
    if (artCache[key]) return artCache[key];
    const im = SW.ART_IMG && SW.ART_IMG[key];
    if (!im || !im.complete || !im.naturalWidth) return null;
    const pad = 8, c = document.createElement('canvas');
    c.width = im.naturalWidth + pad * 2; c.height = im.naturalHeight + pad * 2;
    const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; x.drawImage(im, pad + Math.cos(a) * 5, pad + Math.sin(a) * 5); }
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over'; x.drawImage(im, pad, pad);
    return (artCache[key] = c);
  }
  function art(key, x, y, h, o = {}) {
    const c = artSticker(key);
    if (!c) return;
    const sc = h / c.height, w = c.width * sc;
    g.save();
    g.translate(x, y); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(-1, 1);
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    g.shadowColor = 'rgba(20,16,24,0.25)'; g.shadowOffsetX = 3; g.shadowOffsetY = 5;
    g.drawImage(c, -w / 2, -h, w, h);
    g.restore();
  }
  // Katakana sound effect: ink letters with a fat white outline that pop in and tremble.
  function sfx(text, x, y, px, rot, t, o = {}) {
    if (t < 0) return;
    const pop = reduce ? 1 : lerp(1.7, 1, ease(t / 0.18));
    const j = reduce ? 0 : (o.tremble ?? 1) * px * 0.03;
    g.save();
    g.translate(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j);
    g.rotate(rot); g.scale(pop, pop);
    g.font = `${px}px ${SFX_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const chars = o.vertical ? [...text] : [text];
    chars.forEach((ch, i) => {
      const yy = o.vertical ? (i - (chars.length - 1) / 2) * px * 0.95 : 0;
      const xx = o.vertical ? Math.sin(t * 9 + i) * px * 0.05 : 0;
      g.lineWidth = px * 0.26; g.strokeStyle = o.outline || '#ffffff'; g.strokeText(ch, xx, yy);
      g.lineWidth = px * 0.07; g.strokeStyle = o.edge || INK; g.strokeText(ch, xx, yy);
      g.fillStyle = o.fill || INK; g.fillText(ch, xx, yy);
    });
    g.restore();
  }
  // Narration box with a typewriter reveal.
  function caption(text, x, y, maxW, t, o = {}) {
    if (t < 0) return;
    const fs = Math.round(clamp(Math.min(W, H) * 0.034, 14, 24));
    g.save();
    g.font = `800 ${fs}px ${CAP_FONT}`;
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) { const tryL = line ? line + ' ' + w : w; if (g.measureText(tryL).width > maxW - fs && line) { lines.push(line); line = w; } else line = tryL; }
    lines.push(line);
    const lw = Math.max(...lines.map((l) => g.measureText(l).width)) + fs * 1.3, lh = fs * 1.28;
    const bh = lines.length * lh + fs * 0.8;
    let bx = x; if (o.align === 'right') bx = x - lw; if (o.align === 'center') bx = x - lw / 2;
    g.translate(bx, y); g.rotate(o.rot ?? -0.012);
    g.globalAlpha *= clamp01(t / 0.15);
    g.fillStyle = o.dark ? INK : '#ffffff'; g.fillRect(0, 0, lw, bh);
    g.lineWidth = 3; g.strokeStyle = o.dark ? '#ffffff' : INK; g.strokeRect(0, 0, lw, bh);
    let shown = reduce ? 1e9 : Math.floor(t * 48);
    g.fillStyle = o.dark ? '#ffffff' : INK; g.textBaseline = 'top';
    lines.forEach((l, i) => { const s = l.slice(0, Math.max(0, shown)); shown -= l.length + 1; g.fillText(s, fs * 0.65, fs * 0.45 + i * lh); });
    g.restore();
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function splat(cx, cy, r, seed, k) {
    if (r <= 0) return;
    const rr = SW.rng(seed);
    g.beginPath();
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rad = r * (i % 2 ? 0.72 + rr() * 0.2 : 0.95 + rr() * 0.45);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.8;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    for (let i = 0; i < 14; i++) {
      const a = rr() * TAU, d = r * (1.2 + rr() * 0.9 * k), s = r * (0.04 + rr() * 0.09);
      g.moveTo(cx + Math.cos(a) * d + s, cy + Math.sin(a) * d * 0.8); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, s, 0, TAU);
    }
    g.fillStyle = INK; g.fill();
  }
  function island(b, cx, cy, rx, ry, gray) {
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.lineWidth = Math.max(6, rx * 0.05); g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = gray ? '#cfcac0' : '#f3d58b'; g.fill();
    g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.ellipse(cx, cy - ry * 0.12, rx * 0.84, ry * 0.72, 0, 0, TAU);
    g.fillStyle = gray ? '#8f8a82' : '#7cc34f'; g.fill(); g.lineWidth = 2.5; g.stroke();
    if (gray) { g.save(); g.beginPath(); g.ellipse(cx, cy - ry * 0.12, rx * 0.84, ry * 0.72, 0, 0, TAU); g.clip(); tone(cx - rx, cy - ry, rx * 2, ry * 2, 0.5); g.restore(); }
    g.restore();
    const h = ry * 1.25;
    const spots = [[-0.55, -0.15, 'treeRound', 1], [-0.25, -0.35, 'treePine', 1.15], [0.05, -0.2, 'treeBlossom', 1], [0.38, -0.32, 'treeRound', 0.95], [0.55, 0.0, 'bush', 0.45], [-0.3, 0.12, 'flowerPink', 0.32], [0.2, 0.15, 'rock', 0.4], [-0.62, 0.15, 'bush', 0.42]];
    for (const [ox, oy, n, s] of spots) big(n, cx + ox * rx, cy + oy * ry + ry * 0.3, h * s, { gray });
  }
  function eyes(b, t) {
    const r = Math.min(b.h * 0.36, b.w * 0.11);
    const blink = t > 0.9 && t < 1.0 ? 0.15 : 1;
    for (const side of [-1, 1]) {
      const ex = b.cx + side * r * 1.45, ey = b.cy + r * 0.12;
      g.save();
      g.beginPath(); g.ellipse(ex, ey, r * 0.78, r * blink, 0, 0, TAU);
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = r * 0.14; g.strokeStyle = INK; g.stroke();
      g.clip();
      const look = Math.sin(t * 3) * r * 0.05;
      g.beginPath(); g.ellipse(ex + side * r * 0.08 + look, ey + r * 0.08, r * 0.46, r * 0.6, 0, 0, TAU); g.fillStyle = INK; g.fill();
      g.beginPath(); g.ellipse(ex + side * r * 0.08 + look, ey + r * 0.08, r * 0.26, r * 0.36, 0, 0, TAU); g.fillStyle = '#4a3a6a'; g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ex - r * 0.12 + look, ey - r * 0.22, r * 0.17, 0, TAU); g.fill();
      g.beginPath(); g.arc(ex + r * 0.2 + look, ey + r * 0.3, r * 0.08, 0, TAU); g.fill();
      g.restore();
      // determined brows
      g.save(); g.lineCap = 'round'; g.lineWidth = r * 0.24; g.strokeStyle = INK;
      g.beginPath(); g.moveTo(ex - side * r * 0.85, ey - r * 1.32); g.lineTo(ex + side * r * 0.75, ey - r * 1.02); g.stroke();
      g.restore();
    }
  }
  function dust(cx, cy, s, t, seed) {
    const r = SW.rng(seed);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + r() * Math.PI, d = s * (0.3 + ease(t / 0.6) * (0.9 + r())), rad = s * (0.12 + r() * 0.12) * (1 - clamp01(t / 1.4) * 0.6);
      const x = cx + Math.cos(a) * d * 1.6, y = cy + Math.sin(a) * d * 0.5;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    }
  }

  // ---------- the story ----------
  function page() { const m = clamp(Math.min(W, H) * 0.03, 10, 26); return { x: m, y: m, w: W - 2 * m, h: H - 2 * m, gu: m * 0.9 }; }
  function once(key, fn) { if (!fired.has(key)) { fired.add(key); fn(); } }
  function impact(power, sound) {
    if (!reduce) { shake = Math.max(shake, power); flash = Math.max(flash, 0.9); }
    if (sound) SW.audio.play(sound);
  }

  const SCENES = [
    { dur: 5.2, draw(t) { // a bright sticker-book world
      const P = page();
      const pts = [[P.x, P.y], [P.x + P.w, P.y + P.h * 0.02], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h * 0.97]];
      panel(pts, t, 0, [0, 0], (b, tt) => {
        const z = 1 + tt * 0.018;
        g.translate(b.cx, b.cy); g.scale(z, z); g.translate(-b.cx, -b.cy);
        const sky = g.createLinearGradient(0, b.y, 0, b.y + b.h); sky.addColorStop(0, '#9fdcff'); sky.addColorStop(0.55, '#e6f6ff'); sky.addColorStop(0.56, '#5fb3e0'); sky.addColorStop(1, '#3f8fd2');
        g.fillStyle = sky; g.fillRect(b.x, b.y, b.w, b.h);
        const sx = b.x + b.w * 0.8, sy = b.y + b.h * 0.2, sr = Math.min(b.w, b.h) * 0.08;
        radial(sx, sy, sr * 1.3, sr * 3.2, 26, 'rgba(255,210,63,0.75)', tt * 0.3, 11);
        g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5;
        for (let i = 0; i < 18; i++) { const wx = b.x + ((i * 97) % 100) / 100 * b.w, wy = b.y + b.h * (0.62 + ((i * 37) % 40) / 100) + Math.sin(tt * 2 + i) * 3; g.beginPath(); g.moveTo(wx - 10, wy); g.quadraticCurveTo(wx - 5, wy - 5, wx, wy); g.quadraticCurveTo(wx + 5, wy - 5, wx + 10, wy); g.stroke(); }
        island(b, b.cx, b.y + b.h * 0.7, Math.min(b.w * 0.38, b.h * 0.55), Math.min(b.h * 0.16, b.w * 0.12), false);
        big('player0', b.cx + Math.min(b.w * 0.38, b.h * 0.55) * 0.05, b.y + b.h * 0.76, Math.min(b.h, b.w) * 0.09);
      });
      caption('Long ago, every island was a page in the Great Sticker Book.', P.x + P.w * 0.04, P.y + P.h * 0.05, Math.min(P.w * 0.6, 520), t - 0.4);
      caption('Its stickers lived happily in the sun.', P.x + P.w * 0.96, P.y + P.h * 0.84, Math.min(P.w * 0.55, 420), t - 2.6, { align: 'right', rot: 0.012 });
    } },
    { dur: 5.4, draw(t) { // the Ink spills
      const P = page();
      const split1 = P.y + P.h * 0.5, split2 = P.y + P.h * 0.42;
      const top = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, split2], [P.x, split1]];
      const bot = [[P.x, split1 + P.gu], [P.x + P.w, split2 + P.gu], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]];
      panel(top, t, 0, [0, -1], (b, tt) => {
        const sky = g.createLinearGradient(0, b.y, 0, b.y + b.h); sky.addColorStop(0, '#5a6a8a'); sky.addColorStop(1, '#a9c4d8');
        g.fillStyle = sky; g.fillRect(b.x, b.y, b.w, b.h);
        island(b, b.cx, b.y + b.h * 0.92, Math.min(b.w * 0.3, b.h * 0.7), b.h * 0.14, false);
        parallel(b, Math.PI / 2, 40, INK, tt, 5, 0.45);
        const dh = b.h * 0.42, dy = lerp(b.y - dh, b.y + b.h * 0.55, ease(tt / 1.5));
        g.save(); g.translate(b.cx, dy);
        g.beginPath(); g.moveTo(0, -dh * 0.55); g.bezierCurveTo(dh * 0.32, -dh * 0.1, dh * 0.34, dh * 0.3, 0, dh * 0.38); g.bezierCurveTo(-dh * 0.34, dh * 0.3, -dh * 0.32, -dh * 0.1, 0, -dh * 0.55);
        g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.stroke(); g.fillStyle = INK; g.fill();
        g.beginPath(); g.ellipse(-dh * 0.1, dh * 0.08, dh * 0.05, dh * 0.11, 0.3, 0, TAU); g.fillStyle = '#6b5f8a'; g.fill();
        g.restore();
      });
      caption('Then, one day, the Ink spilled.', P.x + P.w * 0.04, P.y + P.h * 0.04, Math.min(P.w * 0.6, 460), t - 0.3);
      if (t > 1.6) once('splat', () => impact(16, 'boom'));
      panel(bot, t, 1.6, [0, 1], (b, tt) => {
        g.fillStyle = '#e9e4da'; g.fillRect(b.x, b.y, b.w, b.h);
        tone(b.x, b.y, b.w, b.h, 0.35);
        island(b, b.cx, b.cy + b.h * 0.18, Math.min(b.w * 0.36, b.h * 0.8), b.h * 0.2, true);
        radial(b.cx, b.cy, Math.min(b.w, b.h) * 0.25, Math.hypot(b.w, b.h), 90, INK, tt, 19);
        splat(b.cx, b.cy + b.h * 0.08, Math.min(b.w, b.h) * 0.42 * ease(tt / 0.45), 41, ease(tt / 0.8));
        sfx('ドボッ!!', b.x + b.w * 0.74, b.y + b.h * 0.34, Math.min(b.w * 0.16, b.h * 0.38), -0.12, tt - 0.05);
      });
    } },
    { dur: 5.4, draw(t) { // the Scribbles crawl out
      const P = page();
      once('sting', () => SW.audio.play('sting'));
      const pts = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]];
      panel(pts, t, 0, [1, 0], (b, tt) => {
        g.fillStyle = INK; g.fillRect(b.x, b.y, b.w, b.h);
        radial(b.cx, b.cy, Math.min(b.w, b.h) * 0.12, Math.hypot(b.w, b.h), 110, 'rgba(255,255,255,0.85)', tt, 23);
        const R = Math.min(b.w, b.h) * 0.5, list = [];
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * TAU + 0.3, k = ease(tt / 3.2 + (i % 4) * 0.05);
          const d = lerp(0.05, 0.95, k) * R * (0.8 + (i % 3) * 0.15);
          list.push({ x: b.cx + Math.cos(a) * d * 1.3, y: b.cy + Math.sin(a) * d * 0.75, s: lerp(0.06, 0.26, k) * Math.min(b.w, b.h) * (0.8 + (i % 3) * 0.2), i });
        }
        list.sort((p, q) => p.s - q.s);
        for (const s of list) big('scribble' + ((Math.floor(tt * 7) + s.i) % 2), s.x + Math.sin(tt * 13 + s.i) * 2, s.y + s.s * 0.5, s.s, { flip: s.x < b.cx });
        sfx('ゴゴゴゴ', b.x + b.w * 0.9, b.cy, Math.min(b.h * 0.12, b.w * 0.09), 0.08, tt - 0.4, { vertical: true, fill: '#ffffff', outline: '#6b4fa8', edge: INK, tremble: 0.6 });
        sfx('ゴゴ', b.x + b.w * 0.09, b.cy - b.h * 0.15, Math.min(b.h * 0.09, b.w * 0.07), -0.1, tt - 0.9, { vertical: true, fill: '#ffffff', outline: '#6b4fa8', edge: INK, tremble: 0.6 });
      });
      caption('From the smudge crawled the Scribbles, erasing everything they touched.', P.x + P.w / 2, P.y + P.h * 0.8, Math.min(P.w * 0.8, 560), t - 0.8, { align: 'center', dark: true });
    } },
    { dur: 5, draw(t) { // one small sticker refuses to fade
      const P = page();
      const y1 = P.y + P.h * 0.36, y2 = P.y + P.h * 0.64;
      const a = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, y1], [P.x, y1]];
      const m = [[P.x, y1 + P.gu], [P.x + P.w, y1 + P.gu], [P.x + P.w, y2], [P.x, y2]];
      const c = [[P.x, y2 + P.gu], [P.x + P.w, y2 + P.gu], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]];
      panel(a, t, 0, [-1, 0], (b, tt) => {
        g.fillStyle = '#ffffff'; g.fillRect(b.x, b.y, b.w, b.h);
        toneFade(b, true, 0.9);
        const s = b.h * 0.9;
        big('scribble0', b.x + b.w * 0.18, b.y + b.h * 1.05, s, { gray: true, alpha: 0.9 });
        big('scribble1', b.x + b.w * 0.82, b.y + b.h * 1.1, s * 1.1, { gray: true, flip: true, alpha: 0.9 });
        big('player0', b.cx - b.h * 0.12, b.y + b.h * 0.92, b.h * 0.5);
        big('star_sad0', b.cx + b.h * 0.22, b.y + b.h * 0.6, b.h * 0.24);
      });
      caption('The colours faded. The pages went quiet.', P.x + P.w * 0.04, P.y + P.h * 0.03, Math.min(P.w * 0.6, 440), t - 0.2);
      if (t > 1.4) once('kiri', () => impact(5, 'hit'));
      panel(m, t, 1.3, [1, 0], (b, tt) => {
        g.fillStyle = '#ffcf5a'; g.fillRect(b.x, b.y, b.w, b.h);
        tone(b.x, b.y + b.h * 0.6, b.w, b.h * 0.4, 0.35);
        parallel(b, 0, 26, INK, tt, 9, 0.35);
        eyes(b, tt);
        sfx('キッ', b.x + b.w * 0.88, b.y + b.h * 0.3, Math.min(b.h * 0.4, b.w * 0.1), 0.15, tt - 0.1);
      });
      panel(c, t, 2.5, [0, 1], (b, tt) => {
        g.fillStyle = '#ffffff'; g.fillRect(b.x, b.y, b.w, b.h);
        radial(b.cx, b.y + b.h * 0.55, b.h * 0.35, Math.hypot(b.w, b.h), 70, INK, tt, 31);
        art('eneFront', b.cx, b.y + b.h * 0.98, b.h * 0.92);
        art('starSurprised', b.cx + b.h * 0.42, b.y + b.h * 0.42, b.h * 0.34, { rot: 0.15 });
        sfx('AY!!', b.cx - b.h * 0.45, b.y + b.h * 0.3, Math.min(b.h * 0.3, b.w * 0.12), -0.15, tt - 0.3, { fill: '#ffe23a', edge: '#e0a400' });
      });
      caption('But Ene in Pink would not fade.', P.x + P.w * 0.96, y2 + P.gu + P.h * 0.03, Math.min(P.w * 0.6, 420), t - 2.8, { align: 'right' });
    } },
    { dur: 5.6, draw(t) { // PEEL!
      const P = page();
      const s1 = P.y + P.h * 0.62, s2 = P.y + P.h * 0.76;
      const a = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, s1], [P.x, s2]];
      const b2 = [[P.x, s2 + P.gu], [P.x + P.w, s1 + P.gu], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]];
      if (t > 0.45) once('peel', () => { impact(10, 'peel'); SW.audio.play('whoosh'); });
      panel(a, t, 0, [0, -1], (b, tt) => {
        g.fillStyle = '#efe9dc'; g.fillRect(b.x, b.y, b.w, b.h);
        tone(b.x, b.y, b.w, b.h, 0.45);
        const px = lerp(b.x + b.w * 0.25, b.x + b.w * 0.58, ease(tt / 0.9)), py = lerp(b.y + b.h * 0.95, b.y + b.h * 0.62, ease(tt / 0.9));
        radial(px, py - b.h * 0.15, Math.min(b.w, b.h) * 0.22, Math.hypot(b.w, b.h), 100, INK, tt, 37);
        // the sticker-shaped hole Ene left behind, with the backing paper curling up
        const k = ease(tt / 0.6), fx = b.x + b.w * 0.2, fy = b.y + b.h * 0.86, fs = Math.min(b.w, b.h) * 0.3;
        g.beginPath(); g.ellipse(fx, fy, fs * 0.55, fs * 0.42, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.setLineDash([7, 6]); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.moveTo(fx + fs * 0.5, fy + fs * 0.2); g.quadraticCurveTo(fx + fs * (0.5 + 0.6 * k), fy - fs * (0.2 + 0.9 * k), fx + fs * (0.1 + 0.3 * k), fy - fs * (0.35 + 0.5 * k)); g.lineTo(fx + fs * 0.25, fy - fs * 0.2); g.closePath();
        g.fillStyle = '#d9d3c7'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
        art('eneCry', px, py, Math.min(b.h * 0.6, b.w * 0.42), { rot: -0.12 });
        sfx('ペリッ!!', b.x + b.w * 0.8, b.y + b.h * 0.24, Math.min(b.w * 0.15, b.h * 0.24), 0.18, tt - 0.45);
      });
      caption('She cried a rainbow so bright it peeled her free from the page...', P.x + P.w * 0.04, P.y + P.h * 0.04, Math.min(P.w * 0.6, 420), t - 0.9);
      if (t > 2.4) once('land', () => impact(7, 'place'));
      panel(b2, t, 2.3, [1, 1], (b, tt) => {
        const sky = g.createLinearGradient(0, b.y, 0, b.y + b.h); sky.addColorStop(0, '#ffffff'); sky.addColorStop(1, '#f3d58b');
        g.fillStyle = sky; g.fillRect(b.x, b.y, b.w, b.h);
        parallel(b, Math.PI / 2, 22, INK, tt, 13, 0.4);
        const h = Math.min(b.h * 0.7, b.w * 0.25), land = ease(tt / 0.25);
        dust(b.cx, b.y + b.h * 0.9, h * 0.8, tt, 53);
        big('player0', b.cx, lerp(b.y - h * 0.2, b.y + b.h * 0.9, land), h, { flip: true });
        big('star_laugh' + (Math.floor(tt * 6) % 2), b.cx + h * 0.55, lerp(b.y - h * 0.4, b.y + b.h * 0.5, land) + Math.sin(tt * 4) * 6, h * 0.42);
        sfx('ザッ', b.x + b.w * 0.82, b.y + b.h * 0.42, Math.min(b.h * 0.42, b.w * 0.1), -0.1, tt - 0.05);
      });
      caption('...and Star tumbled after her, all the way to Stickerwild.', P.x + P.w * 0.04, s2 + P.gu + P.h * 0.03, Math.min(P.w * 0.5, 380), t - 2.7);
    } },
    { dur: 6, draw(t) { // title
      const P = page();
      const pts = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]];
      if (t > 0.3) once('don', () => impact(18, 'boom'));
      panel(pts, t, 0, [0, 0], (b, tt) => {
        g.fillStyle = '#ffffff'; g.fillRect(b.x, b.y, b.w, b.h);
        radial(b.cx, b.cy - b.h * 0.08, Math.min(b.w, b.h) * 0.3, Math.hypot(b.w, b.h), 120, INK, tt, 61);
        toneFade(b, false, 0.6);
        sfx('ドン!!', b.cx, b.cy - b.h * 0.12, Math.min(b.w * 0.34, b.h * 0.42), -0.06, tt - 0.3, { fill: '#e9e4da', edge: '#c9c2b6', outline: '#ffffff', tremble: 0.3 });
        // title letters slam in one at a time
        const word = 'Stickerwild', cols = ['#5bb04f', '#ffb13b', '#ff4d6d', '#4f9fdb', '#5bb04f', '#ffb13b', '#ff4d6d', '#a78bfa', '#5bb04f', '#4f9fdb', '#ff4d6d'];
        const fs = Math.min(b.w / 6.4, b.h * 0.2);
        g.font = `${fs}px "Bagel Fat One", "Arial Rounded MT Bold", system-ui, sans-serif`;
        const widths = [...word].map((ch) => g.measureText(ch).width * 0.98);
        let x = b.cx - widths.reduce((s, w) => s + w, 0) / 2;
        const y = b.cy - b.h * 0.1;
        [...word].forEach((ch, i) => {
          const lt = tt - 0.45 - i * 0.06;
          if (lt > 0) {
            const k = reduce ? 1 : back(lt / 0.3), rot = (i % 2 ? 1 : -1) * 0.08;
            g.save(); g.translate(x + widths[i] / 2, y); g.rotate(rot * (2 - k)); g.scale(lerp(2.6, 1, k), lerp(2.6, 1, k));
            g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
            g.fillStyle = 'rgba(52,38,84,0.35)'; g.fillText(ch, 4, 7);
            g.lineWidth = fs * 0.22; g.strokeStyle = '#ffffff'; g.strokeText(ch, 0, 0);
            g.lineWidth = fs * 0.05; g.strokeStyle = INK; g.strokeText(ch, 0, 0);
            g.fillStyle = cols[i]; g.fillText(ch, 0, 0);
            g.restore();
          }
          x += widths[i];
        });
        const ph = Math.min(b.h * 0.3, b.w * 0.22), py = b.y + b.h * 0.9 + Math.sin(tt * 3) * 3;
        if (tt > 1.2) {
          const k = ease((tt - 1.2) / 0.4);
          art('eneJoy', b.cx - ph * 0.3, py, ph * 1.1 * k);
          art('starLaugh', b.cx + ph * 0.55, py - ph * 0.35 + Math.sin(tt * 4) * 5, ph * 0.6 * k, { rot: 0.12 });
        }
      });
      caption('Ene and Star: find the pages, take back the colours.', P.x + P.w / 2, P.y + P.h * 0.06, Math.min(P.w * 0.8, 520), t - 1.8, { align: 'center' });
    } },
  ];

  // ---------- engine ----------
  function frame(now) {
    if (!el || el.hidden) return;
    const s = SCENES[scene];
    const t = (now - sceneT0) / 1000;
    if (t > s.dur && !ending) { next(now); raf = requestAnimationFrame(frame); return; }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    shake = Math.max(0, shake - 0.9);
    // page turn: each new page whips in from the right
    const turn = reduce ? 1 : ease(t / 0.32);
    g.save();
    g.translate(sx + (1 - turn) * W * 0.25, sy);
    g.globalAlpha = 0.25 + 0.75 * turn;
    s.draw(t);
    g.restore();
    if (flash > 0.02) { g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, W, H); flash *= 0.8; }
    // progress dots
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let i = 0; i < SCENES.length; i++) {
      g.beginPath(); g.arc(W / 2 + (i - (SCENES.length - 1) / 2) * 16, H - 14, i === scene ? 4.5 : 3, 0, TAU);
      g.fillStyle = i <= scene ? INK : 'rgba(20,16,24,0.25)'; g.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function next(now) {
    if (scene >= SCENES.length - 1) { finish(); return; }
    scene++; sceneT0 = now || performance.now(); shake = 0; flash = 0;
    SW.audio.play('whoosh');
  }
  function finish() {
    if (ending) return;
    ending = true;
    el.classList.add('out');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      el.hidden = true; el.classList.remove('out');
      ending = false;
      const cb = done; done = null;
      cb && cb();
    }, reduce ? 0 : 450);
  }

  async function play(onDone) {
    el = $('intro'); cv = $('introCv'); g = cv.getContext('2d');
    done = onDone; scene = 0; fired = new Set(); shake = 0; flash = 0; ending = false;
    resize();
    if (!tonePat) patterns();
    el.hidden = false;
    // give the manga fonts a moment to arrive so the first SFX isn't in a fallback face
    try { await Promise.race([Promise.all([document.fonts.load(`64px ${SFX_FONT}`, 'ドボッ'), document.fonts.load(`20px ${CAP_FONT}`)]), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fonts optional */ }
    sceneT0 = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    window.addEventListener('resize', () => { if (el && !el.hidden) resize(); });
    $('introCv').addEventListener('click', () => { SW.audio.unlock(); el.classList.add('tapped'); next(); });
    $('introSkip').addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    window.addEventListener('keydown', (e) => {
      if (!el || el.hidden) return;
      if (e.code === 'Escape') { e.stopImmediatePropagation(); finish(); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); SW.audio.unlock(); next(); }
    }, true);
  }

  SW.intro = {
    play(onDone) { wire(); play(onDone); },
    skip() { if (el && !el.hidden) finish(); },
    get playing() { return !!(el && !el.hidden); },
  };
})();
