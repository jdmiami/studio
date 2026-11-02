// Stickerwild — sticker sprite factory.
// Every sprite is drawn once as flat vector art, then given a die-cut white
// border and a soft drop shadow, so the whole world reads like stickers.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const INK = '#3b2f4f';
  const LW = 2.4;

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---------- drawing helpers (art units, before sticker scaling) ----------
  function circ(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot = 0) { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function polyPath(c, pts) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // Ink outline drawn first at double width, then filled: overlapping
  // pieces merge into one outlined silhouette.
  function shape(c, build, fill, lw = LW) {
    c.beginPath(); build(c);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke();
    c.fillStyle = fill; c.fill();
  }
  function flat(c, build, fill) { c.beginPath(); build(c); c.fillStyle = fill; c.fill(); }
  function line(c, pts, color = INK, lw = LW) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = lw; c.strokeStyle = color; c.stroke();
  }
  const blobs = (circles) => (c) => circles.forEach(([x, y, r]) => circ(c, x, y, r));
  const P = (pts) => (c) => polyPath(c, pts);

  // ---------- sticker builder ----------
  function makeSticker(w, h, draw, opts = {}) {
    const S = opts.S || SW.SPR;
    const border = opts.border ?? 3.6;
    const pad = border + 5;
    const cw = (w + pad * 2) * S, ch = (h + pad * 2) * S;

    const base = mkCanvas(cw, ch);
    const b = base.getContext('2d');
    b.scale(S, S); b.translate(pad, pad);
    if (opts.flip) { b.translate(w, 0); b.scale(-1, 1); }
    draw(b);

    // die-cut silhouette: the art stamped in a ring, flooded white
    const out = mkCanvas(cw, ch);
    const o = out.getContext('2d');
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      o.drawImage(base, Math.cos(a) * border * S, Math.sin(a) * border * S);
    }
    o.drawImage(base, 0, 0);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = '#ffffff'; o.fillRect(0, 0, cw, ch);

    const shadow = mkCanvas(cw, ch);
    const sh = shadow.getContext('2d');
    sh.drawImage(out, 0, 0);
    sh.globalCompositeOperation = 'source-in';
    sh.fillStyle = 'rgba(52, 38, 84, 0.34)'; sh.fillRect(0, 0, cw, ch);

    const fin = mkCanvas(cw, ch);
    const f = fin.getContext('2d');
    f.drawImage(shadow, 1.2 * S, 2.4 * S);
    f.drawImage(out, 0, 0);
    // hairline so white borders still read on pale ground
    f.globalAlpha = 0.18; f.drawImage(shadow, 0, 0.4 * S); f.globalAlpha = 1;
    f.drawImage(out, 0, 0);
    f.drawImage(base, 0, 0);
    // a faint gloss band across the top, like a vinyl sticker
    f.globalCompositeOperation = 'source-atop';
    const g = f.createLinearGradient(0, 0, cw * 0.4, ch);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.0)');
    f.fillStyle = g; f.fillRect(0, 0, cw, ch);

    // back side (for peel flips and hurt flashes)
    const back = mkCanvas(cw, ch);
    const bk = back.getContext('2d');
    bk.drawImage(shadow, 1.2 * S, 2.4 * S);
    bk.drawImage(out, 0, 0);
    bk.globalCompositeOperation = 'source-atop';
    bk.fillStyle = 'rgba(230, 226, 240, 1)'; bk.fillRect(0, 0, cw, ch);
    bk.globalCompositeOperation = 'source-over';

    const ay = opts.anchorY ?? h;
    return { img: fin, back, flash: out, w: cw / S, h: ch / S, ax: pad + w / 2, ay: pad + ay, S };
  }

  // ---------- the art ----------
  const ART = {};

  function treeRound(canopy, light, dark) {
    return (c) => {
      shape(c, (c) => { rrect(c, 29, 50, 12, 40, 3); polyPath(c, [[26, 90], [44, 90], [41, 82], [29, 82]]); }, '#9a6a3f');
      line(c, [[34, 60], [34, 72]], '#7a4f2c', 1.6);
      shape(c, blobs([[35, 32, 25], [16, 46, 16], [54, 46, 16], [35, 54, 18]]), canopy);
      flat(c, blobs([[28, 23, 11], [13, 42, 6], [47, 36, 7]]), light);
      [[42, 48], [22, 54], [36, 40], [52, 54], [18, 38]].forEach(([x, y]) => line(c, [[x - 3, y], [x, y + 3], [x + 3, y]], dark, 1.8));
    };
  }
  ART.treeRound = [70, 92, treeRound('#5bb04f', '#83cf5f', '#3f8f3d')];
  ART.treeBlossom = [70, 92, (c) => {
    treeRound('#f7a6c4', '#ffd0e0', '#d9789d')(c);
    [[20, 30], [50, 28], [30, 58], [56, 50], [12, 50], [40, 18]].forEach(([x, y]) => flat(c, blobs([[x, y, 2.4]]), '#ffffff'));
  }];
  ART.treePine = [58, 102, (c) => {
    shape(c, (c) => rrect(c, 24, 80, 10, 20, 2), '#8a5a33');
    shape(c, (c) => {
      polyPath(c, [[29, 3], [50, 38], [8, 38]]);
      polyPath(c, [[29, 20], [54, 60], [4, 60]]);
      polyPath(c, [[29, 40], [57, 84], [1, 84]]);
    }, '#2f8f5b');
    flat(c, P([[29, 7], [20, 34], [12, 36]]), '#4fb377');
    flat(c, P([[29, 25], [16, 56], [8, 58]]), '#4fb377');
    flat(c, P([[29, 45], [13, 80], [5, 82]]), '#4fb377');
  }];
  ART.treePineSnow = [58, 102, (c) => {
    ART.treePine[2](c);
    shape(c, P([[29, 3], [38, 18], [33, 16], [29, 20], [24, 15], [20, 18]]), '#ffffff', 1.8);
  }];

  ART.rock = [50, 38, (c) => {
    shape(c, P([[6, 36], [2, 22], [12, 8], [28, 2], [42, 8], [48, 24], [44, 36]]), '#a3a1b5');
    flat(c, P([[12, 10], [28, 4], [30, 16], [16, 21]]), '#c9c7da');
    flat(c, P([[30, 16], [44, 22], [44, 34], [28, 34]]), '#8d8ba1');
    line(c, [[22, 26], [26, 30], [24, 34]], '#6f6d85', 1.6);
  }];
  ART.rock2 = [44, 30, (c) => {
    shape(c, P([[4, 28], [3, 16], [14, 4], [30, 3], [41, 14], [41, 28]]), '#b3aea1');
    flat(c, P([[14, 6], [30, 5], [24, 14], [10, 16]]), '#d3cfc3');
    flat(c, P([[26, 15], [40, 16], [39, 27], [24, 27]]), '#9b968a');
  }];

  function bushArt(fill, light, berries) {
    return (c) => {
      shape(c, blobs([[14, 24, 12], [26, 17, 14], [38, 24, 12], [26, 28, 11]]), fill);
      flat(c, blobs([[21, 12, 6], [9, 21, 4]]), light);
      if (berries) {
        [[14, 26], [26, 22], [36, 28], [22, 32], [31, 14], [40, 20]].forEach(([x, y]) => {
          shape(c, blobs([[x, y, 3.6]]), '#e8354a', 1.4);
          flat(c, blobs([[x - 1.2, y - 1.3, 1.1]]), '#ffd9de');
        });
      }
    };
  }
  ART.bush = [52, 40, bushArt('#4fa64a', '#78c65d', true)];
  ART.bushEmpty = [52, 40, bushArt('#6a9f4c', '#8dbb67', false)];

  ART.crystal = [42, 50, (c) => {
    shape(c, P([[6, 18], [12, 22], [13, 46], [7, 48], [2, 44], [2, 22]]), '#a78bfa');
    shape(c, P([[33, 14], [39, 20], [39, 46], [34, 49], [29, 46], [29, 20]]), '#5cc8e8');
    shape(c, P([[21, 2], [29, 12], [29, 44], [21, 50], [13, 44], [13, 12]]), '#8fe8f6');
    flat(c, P([[21, 4], [26, 12], [21, 30], [16, 12]]), '#e6fbff');
    flat(c, P([[4, 22], [8, 24], [6, 38]]), '#cbb9ff');
  }];

  function flowerArt(petal) {
    return (c) => {
      line(c, [[11, 30], [11, 13]], INK, 4.6); line(c, [[11, 30], [11, 13]], '#4fa64a', 2.2);
      shape(c, (c) => ell(c, 16, 23, 5, 2.6, -0.5), '#5bb04f', 1.6);
      shape(c, (c) => { for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; circ(c, 11 + Math.cos(a) * 5.2, 10 + Math.sin(a) * 5.2, 4.4); } }, petal, 1.8);
      shape(c, blobs([[11, 10, 3.3]]), '#ffd23f', 1.4);
    };
  }
  ART.flowerPink = [22, 31, flowerArt('#ff7aa8')];
  ART.flowerGold = [22, 31, flowerArt('#ffb13b')];
  ART.flowerLilac = [22, 31, flowerArt('#b69cff')];

  ART.tuft = [26, 16, (c) => {
    shape(c, (c) => {
      polyPath(c, [[4, 15], [3, 5], [9, 15]]);
      polyPath(c, [[8, 15], [11, 1], [15, 15]]);
      polyPath(c, [[14, 15], [19, 4], [20, 15]]);
      polyPath(c, [[18, 15], [24, 8], [23, 15]]);
    }, '#6bbf4a', 1.6);
  }];

  ART.stump = [32, 22, (c) => {
    shape(c, (c) => { rrect(c, 4, 7, 24, 13, 4); }, '#9a6a3f');
    shape(c, (c) => ell(c, 16, 8, 12, 5), '#e2b47a');
    c.beginPath(); ell(c, 16, 8, 6.5, 2.6); c.lineWidth = 1.3; c.strokeStyle = '#b0804a'; c.stroke();
  }];

  ART.driftwood = [48, 18, (c) => {
    shape(c, (c) => { rrect(c, 3, 5, 40, 10, 5); polyPath(c, [[30, 6], [38, 1], [40, 4], [34, 8]]); }, '#c4a684');
    shape(c, (c) => ell(c, 40, 10, 3.4, 5), '#e6cfae', 1.5);
    line(c, [[10, 9], [22, 10]], '#9b7d5c', 1.4);
  }];

  ART.campfire = [48, 30, (c) => {
    shape(c, (c) => { rrect(c, 6, 12, 36, 8, 4); }, '#8a5a33');
    shape(c, (c) => { polyPath(c, [[10, 22], [38, 8], [42, 13], [14, 27]]); }, '#a8743f');
    [[6, 24], [14, 27], [24, 28], [34, 27], [42, 24], [3, 18], [45, 18]].forEach(([x, y]) => shape(c, blobs([[x, y, 4]]), '#a3a1b5', 1.6));
  }];
  ART.campfireOut = [48, 30, (c) => {
    shape(c, (c) => { rrect(c, 6, 12, 36, 8, 4); }, '#4b3a33');
    shape(c, (c) => { polyPath(c, [[10, 22], [38, 8], [42, 13], [14, 27]]); }, '#5b4840');
    [[6, 24], [14, 27], [24, 28], [34, 27], [42, 24], [3, 18], [45, 18]].forEach(([x, y]) => shape(c, blobs([[x, y, 4]]), '#8d8ba1', 1.6));
  }];
  function flameArt(k) {
    return (c) => {
      const s = [0, 1.5, -1.5][k];
      shape(c, (c) => {
        c.moveTo(15, 40);
        c.bezierCurveTo(2, 38, 2, 22, 10 + s, 6);
        c.bezierCurveTo(12, 16, 16, 14, 17 - s, 2);
        c.bezierCurveTo(28, 14, 30, 36, 15, 40);
      }, '#ff7a2a', 2);
      flat(c, (c) => {
        c.moveTo(15, 37); c.bezierCurveTo(8, 36, 8, 26, 13 + s, 18);
        c.bezierCurveTo(15, 24, 19, 22, 19 - s, 15); c.bezierCurveTo(24, 26, 23, 36, 15, 37);
      }, '#ffd23f');
    };
  }
  ART.flame0 = [30, 42, flameArt(0)];
  ART.flame1 = [30, 42, flameArt(1)];
  ART.flame2 = [30, 42, flameArt(2)];

  ART.wall = [46, 52, (c) => {
    shape(c, (c) => {
      [[4, 14], [17, 6], [30, 12]].forEach(([x, top]) => polyPath(c, [[x, 50], [x, top + 8], [x + 6, top], [x + 12, top + 8], [x + 12, 50]]));
    }, '#b07a46');
    flat(c, (c) => { [[6, 22], [19, 14], [32, 20]].forEach(([x, y]) => rrect(c, x, y, 3, 26, 1.5)); }, '#cf9a62');
    shape(c, (c) => rrect(c, 1, 30, 44, 5, 2.5), '#e6c98d', 1.6);
  }];

  // ---- characters ----
  function playerArt(frame) {
    return (c) => {
      const st = frame === 1 ? 4 : 0;
      shape(c, (c) => { ell(c, 13 - st, 45, 6, 3.6); ell(c, 27 + st, 45, 6, 3.6); }, '#5a3f2e', 1.8);
      shape(c, (c) => rrect(c, 2, 19, 10, 19, 4), '#2fb3a1');
      flat(c, (c) => rrect(c, 4, 21, 3, 15, 1.5), '#6fd6c6');
      shape(c, blobs([[21, 29, 15]]), '#ffcf5a');
      flat(c, (c) => ell(c, 24, 35, 8, 6), '#fff0bf');
      flat(c, blobs([[15, 22, 4]]), '#ffe08f');
      shape(c, (c) => { ell(c, 24, 25, 3.2, 4.2); ell(c, 31.5, 25, 3.2, 4.2); }, '#ffffff', 1.6);
      flat(c, blobs([[25.2, 26, 1.8], [32.6, 26, 1.8]]), INK);
      flat(c, blobs([[25.8, 25, 0.7], [33.2, 25, 0.7]]), '#ffffff');
      flat(c, (c) => ell(c, 34.5, 31, 2.6, 1.6), '#ff9a8a');
      line(c, [[27, 31], [29, 32.4], [31, 31]], INK, 1.5);
      line(c, [[21, 14], [22, 7]], INK, 3.6); line(c, [[21, 14], [22, 7]], '#4fa64a', 1.6);
      shape(c, (c) => ell(c, 27, 6, 6, 3, -0.45), '#6bbf4a', 1.6);
    };
  }
  // Pip from behind, for the third-person view: backpack front and centre
  function playerBackArt(frame) {
    return (c) => {
      const st = frame === 1 ? 3 : 0;
      shape(c, (c) => { ell(c, 14, 45 - st, 6, 3.6); ell(c, 28, 45 - (3 - st), 6, 3.6); }, '#5a3f2e', 1.8);
      shape(c, blobs([[21, 29, 15]]), '#ffcf5a');
      flat(c, blobs([[14, 22, 4.5]]), '#ffe08f');
      shape(c, (c) => rrect(c, 11, 20, 20, 21, 6), '#2fb3a1');
      flat(c, (c) => rrect(c, 14, 23, 14, 6, 3), '#6fd6c6');
      shape(c, (c) => rrect(c, 15, 31, 12, 7, 3), '#249484', 1.4);
      line(c, [[21, 14], [21, 7]], INK, 3.6); line(c, [[21, 14], [21, 7]], '#4fa64a', 1.6);
      shape(c, (c) => ell(c, 26, 6, 6, 3, -0.45), '#6bbf4a', 1.6);
    };
  }
  ART.playerBack0 = [42, 49, playerBackArt(0)];
  ART.playerBack1 = [42, 49, playerBackArt(1)];
  ART.player0 = [42, 49, playerArt(0)];
  ART.player1 = [42, 49, playerArt(1)];

  function scribbleArt(seed) {
    return (c) => {
      const r = SW.rng(seed);
      const pts = [];
      const n = 15;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rad = (i % 2 ? 14 : 19) + r() * 4;
        pts.push([23 + Math.cos(a) * rad, 25 + Math.sin(a) * rad * 0.92]);
      }
      shape(c, P(pts), '#2b2340');
      const z = [];
      for (let i = 0; i < 7; i++) z.push([10 + i * 4.2, 34 + (i % 2 ? -5 : 2) + r() * 2]);
      line(c, z, '#5b4f78', 1.8);
      shape(c, (c) => { ell(c, 17, 21, 4.6, 5.4); ell(c, 29, 21, 4.6, 5.4); }, '#ffffff', 1.2);
      flat(c, blobs([[18.5, 22.5, 2.3], [30.5, 22.5, 2.3]]), '#ff3b5c');
      line(c, [[12, 14], [20, 17]], '#ffffff', 2); line(c, [[34, 14], [26, 17]], '#ffffff', 2);
    };
  }
  ART.scribble0 = [46, 48, scribbleArt(11)];
  ART.scribble1 = [46, 48, scribbleArt(29)];

  function puffArt(frame) {
    return (c) => {
      const sq = frame ? 2 : 0;
      shape(c, (c) => { ell(c, 13, 10 + sq, 3.6, 9, -0.25); ell(c, 23, 9 + sq, 3.6, 9, 0.2); }, '#f4ecff', 2);
      flat(c, (c) => { ell(c, 13, 11 + sq, 1.5, 6, -0.25); ell(c, 23, 10 + sq, 1.5, 6, 0.2); }, '#ffb3c8');
      shape(c, (c) => ell(c, 18, 25 + sq * 0.5, 13 + sq, 10 - sq * 0.5), '#f4ecff');
      flat(c, blobs([[5.5, 27, 3.2]]), '#ffffff');
      flat(c, blobs([[24, 23, 1.9]]), INK);
      flat(c, blobs([[29.5, 26, 1.6]]), '#ff8fae');
      flat(c, (c) => ell(c, 22, 29, 2.4, 1.4), '#ffc9d6');
    };
  }
  ART.puff0 = [34, 36, puffArt(0)];
  ART.puff1 = [34, 36, puffArt(1)];

  // ---- tools (handle points down; pivot is the handle end) ----
  const handle = (c) => { shape(c, (c) => rrect(c, 11, 8, 5, 22, 2), '#a8743f', 1.8); };
  ART.toolAxe = [28, 32, (c) => {
    handle(c);
    shape(c, (c) => { c.moveTo(14, 4); c.lineTo(25, 2); c.quadraticCurveTo(29, 9, 25, 16); c.lineTo(14, 13); c.closePath(); }, '#c7c9d6', 1.8);
    flat(c, P([[24, 4], [26.5, 9], [24, 14], [22, 9]]), '#eef0f7');
  }];
  ART.toolPick = [28, 32, (c) => {
    handle(c);
    shape(c, (c) => { c.moveTo(1, 12); c.quadraticCurveTo(13, -2, 27, 12); c.quadraticCurveTo(13, 4, 1, 12); c.closePath(); }, '#b8bacb', 1.8);
  }];
  ART.toolSword = [28, 34, (c) => {
    shape(c, (c) => rrect(c, 11, 22, 5, 10, 2), '#7a4f2c', 1.8);
    shape(c, (c) => rrect(c, 5, 19, 17, 4, 2), '#c9973f', 1.8);
    shape(c, P([[10.5, 19], [10.5, 5], [13.5, 0], [16.5, 5], [16.5, 19]]), '#e3e7f2', 1.8);
    flat(c, P([[12.4, 18], [12.4, 5], [13.5, 3], [13.5, 18]]), '#ffffff');
  }];
  ART.toolGemSword = [28, 34, (c) => {
    shape(c, (c) => rrect(c, 11, 22, 5, 10, 2), '#5b3f8a', 1.8);
    shape(c, (c) => rrect(c, 5, 19, 17, 4, 2), '#a78bfa', 1.8);
    shape(c, P([[10, 19], [10, 6], [13.5, 0], [17, 6], [17, 19]]), '#8fe8f6', 1.8);
    flat(c, P([[12.2, 18], [12.2, 6], [13.5, 3], [13.5, 18]]), '#e6fbff');
  }];
  ART.toolHand = [14, 14, (c) => { shape(c, blobs([[7, 8, 4.5]]), '#ffcf5a', 1.6); }];

  // ---- item icons ----
  ART.itemWood = [30, 22, (c) => {
    shape(c, (c) => rrect(c, 3, 5, 22, 13, 6), '#a8743f');
    shape(c, (c) => ell(c, 24, 11.5, 4.6, 6.5), '#e2b47a', 1.8);
    c.beginPath(); ell(c, 24, 11.5, 2, 3); c.lineWidth = 1.2; c.strokeStyle = '#b0804a'; c.stroke();
    line(c, [[8, 9], [17, 9]], '#7a4f2c', 1.4);
  }];
  ART.itemStone = [26, 22, (c) => {
    shape(c, P([[3, 18], [4, 9], [12, 3], [21, 5], [24, 14], [19, 20]]), '#a3a1b5');
    flat(c, P([[6, 9], [12, 5], [15, 9], [8, 12]]), '#c9c7da');
  }];
  ART.itemBerry = [26, 24, (c) => {
    line(c, [[13, 3], [13, 9]], '#3f8f3d', 2.4);
    shape(c, (c) => ell(c, 17, 5, 5, 2.4, -0.4), '#5bb04f', 1.6);
    [[8, 15], [18, 15], [13, 19]].forEach(([x, y]) => { shape(c, blobs([[x, y, 5]]), '#e8354a', 1.8); flat(c, blobs([[x - 1.6, y - 1.8, 1.4]]), '#ffd9de'); });
  }];
  ART.itemPetal = [22, 24, (c) => {
    shape(c, (c) => { c.moveTo(11, 22); c.bezierCurveTo(0, 16, 2, 4, 11, 2); c.bezierCurveTo(20, 4, 22, 16, 11, 22); }, '#ff7aa8');
    line(c, [[11, 19], [11, 7]], '#ffc0d6', 1.6);
  }];
  function meatArt(fill, light) {
    return (c) => {
      shape(c, (c) => { rrect(c, 17, 15, 9, 4, 2); circ(c, 26, 14.5, 3); circ(c, 26, 19.5, 3); }, '#fff6e6', 1.6);
      shape(c, (c) => ell(c, 11, 11, 10, 8.5, -0.6), fill);
      flat(c, (c) => ell(c, 8, 8, 4, 2.5, -0.6), light);
    };
  }
  ART.itemMeat = [32, 24, meatArt('#e46a5c', '#f6a49a')];
  ART.itemCooked = [32, 24, meatArt('#b4602f', '#d98c55')];
  ART.itemGem = [24, 24, (c) => {
    shape(c, P([[12, 22], [2, 9], [7, 2], [17, 2], [22, 9]]), '#8fe8f6');
    flat(c, P([[7, 3], [12, 9], [3, 9]]), '#e6fbff');
    line(c, [[2.5, 9], [21.5, 9]], '#5cc8e8', 1.2);
  }];
  ART.itemSalve = [24, 26, (c) => {
    shape(c, (c) => rrect(c, 4, 8, 16, 16, 5), '#7fd18b');
    shape(c, (c) => rrect(c, 3, 3, 18, 6, 2.5), '#ff7aa8', 1.8);
    flat(c, (c) => rrect(c, 7, 12, 4, 8, 2), '#c9f2cf');
  }];
  ART.itemLantern = [24, 30, (c) => {
    line(c, [[12, 2], [12, 6]], INK, 2);
    shape(c, (c) => rrect(c, 4, 6, 16, 5, 2), '#5b4f78', 1.8);
    shape(c, (c) => rrect(c, 5, 10, 14, 15, 4), '#ffe08f', 1.8);
    flat(c, blobs([[12, 17, 4]]), '#ffb13b');
    shape(c, (c) => rrect(c, 4, 24, 16, 4, 2), '#5b4f78', 1.8);
  }];
  ART.uiHeart = [26, 24, (c) => {
    shape(c, (c) => { c.moveTo(13, 22); c.bezierCurveTo(-4, 10, 4, -2, 13, 6); c.bezierCurveTo(22, -2, 30, 10, 13, 22); }, '#ff4d6d');
    flat(c, blobs([[8, 8, 2.4]]), '#ffc2cd');
  }];
  ART.uiSun = [28, 28, (c) => {
    shape(c, (c) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; polyPath(c, [[14 + Math.cos(a) * 13, 14 + Math.sin(a) * 13], [14 + Math.cos(a + 0.3) * 8, 14 + Math.sin(a + 0.3) * 8], [14 + Math.cos(a - 0.3) * 8, 14 + Math.sin(a - 0.3) * 8]]); } circ(c, 14, 14, 8); }, '#ffc93c');
  }];
  ART.uiMoon = [26, 26, (c) => {
    shape(c, (c) => { c.moveTo(16, 2); c.arc(13, 13, 11, -1.3, 1.9, true); c.arc(17, 11, 8.5, 1.65, -1.05); }, '#e4e1ff');
  }];
  ART.uiHammer = [28, 28, (c) => {
    shape(c, (c) => { c.moveTo(11, 26); c.lineTo(15, 26); c.lineTo(15, 11); c.lineTo(11, 11); c.closePath(); }, '#a8743f', 1.8);
    shape(c, (c) => rrect(c, 4, 3, 20, 9, 3), '#b8bacb', 1.8);
  }];


  // ---- RPG creatures ----
  function thornArt(k) {
    return (c) => {
      const st = k ? 3 : 0;
      shape(c, (c) => { ell(c, 15 - st, 35, 4.5, 3); ell(c, 33 + st, 35, 4.5, 3); }, '#5a3f2e', 1.6);
      shape(c, (c) => {
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
          const bx = 23 + Math.cos(a) * 15, by = 27 + Math.sin(a) * 12;
          const tx = 23 + Math.cos(a) * 25, ty = 27 + Math.sin(a) * 21;
          const px = -Math.sin(a) * 4.5, py = Math.cos(a) * 4.5;
          polyPath(c, [[bx + px, by + py], [tx, ty], [bx - px, by - py]]);
        }
      }, '#efd08a', 1.8);
      shape(c, (c) => ell(c, 23, 27, 18, 12), '#8a5a33');
      flat(c, (c) => ell(c, 18, 21, 8, 4), '#a8743f');
      shape(c, (c) => ell(c, 41, 29, 7, 5.5), '#f0c9a0', 1.8);
      flat(c, blobs([[47, 28, 2.4]]), INK);
      shape(c, blobs([[37, 24, 3]]), '#ffffff', 1.2);
      flat(c, blobs([[38, 24.5, 1.6]]), '#d6304f');
      line(c, [[33, 19.5], [40, 21]], INK, 1.8);
    };
  }
  ART.thornback0 = [52, 40, thornArt(0)];
  ART.thornback1 = [52, 40, thornArt(1)];

  function crabArt(k) {
    return (c) => {
      const up = k ? -3 : 0;
      [[14, 30, 6, 36], [20, 32, 15, 38], [30, 32, 35, 38], [36, 30, 44, 36]].forEach(([a, b, x, y]) => { line(c, [[a, b], [x, y]], INK, 4); line(c, [[a, b], [x, y]], '#e2553a', 2); });
      shape(c, (c) => { circ(c, 7, 17 + up, 7); circ(c, 43, 17 - up, 7); }, '#ff6b4a');
      c.save(); c.globalCompositeOperation = 'destination-out';
      c.beginPath(); polyPath(c, [[2, 9 + up], [8, 16 + up], [0, 15 + up]]); polyPath(c, [[48, 9 - up], [42, 16 - up], [50, 15 - up]]); c.fill(); c.restore();
      shape(c, (c) => ell(c, 25, 25, 15, 9.5), '#ff7a52');
      flat(c, (c) => ell(c, 21, 21, 7, 3), '#ffab8f');
      line(c, [[20, 18], [19, 9]], INK, 3.6); line(c, [[30, 18], [31, 9]], INK, 3.6);
      shape(c, blobs([[19, 8, 3.4], [31, 8, 3.4]]), '#ffffff', 1.3);
      flat(c, blobs([[19.6, 8.4, 1.7], [31.6, 8.4, 1.7]]), INK);
      line(c, [[21, 29], [25, 30.5], [29, 29]], INK, 1.5);
    };
  }
  ART.snapjaw0 = [50, 40, crabArt(0)];
  ART.snapjaw1 = [50, 40, crabArt(1)];

  function gloopArt(k) {
    return (c) => {
      const sq = k ? 3 : 0;
      shape(c, (c) => { c.moveTo(3 - sq, 32); c.bezierCurveTo(1 - sq, 13 + sq, 11, 4 + sq * 1.4, 20, 4 + sq * 1.4); c.bezierCurveTo(29, 4 + sq * 1.4, 39 + sq, 13 + sq, 37 + sq, 32); c.closePath(); }, '#5fd3a0');
      flat(c, (c) => ell(c, 13, 13 + sq, 5, 3, -0.5), '#c4f7dd');
      flat(c, (c) => ell(c, 30, 30, 6, 2), '#43b386');
      shape(c, (c) => { ell(c, 15, 20 + sq, 3.4, 4.3); ell(c, 25, 20 + sq, 3.4, 4.3); }, '#ffffff', 1.3);
      flat(c, blobs([[15.8, 21 + sq, 1.8], [25.8, 21 + sq, 1.8]]), INK);
      c.beginPath(); c.arc(20, 25 + sq, 3.5, 0.2, Math.PI - 0.2); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    };
  }
  ART.gloop0 = [40, 34, gloopArt(0)];
  ART.gloop1 = [40, 34, gloopArt(1)];

  function golemArt(k) {
    return (c) => {
      const a = k ? -4 : 0;
      shape(c, (c) => { rrect(c, 14, 50, 11, 8, 3); rrect(c, 33, 50, 11, 8, 3); }, '#7d786d');
      shape(c, P([[3, 26 + a], [11, 22 + a], [14, 38 + a], [6, 42 + a]]), '#8d887c');
      shape(c, P([[55, 26 - a], [47, 22 - a], [44, 38 - a], [52, 42 - a]]), '#8d887c');
      shape(c, P([[12, 52], [9, 30], [16, 18], [42, 18], [49, 30], [46, 52]]), '#9b968a');
      flat(c, P([[16, 20], [30, 20], [26, 32], [13, 32]]), '#b9b4a7');
      line(c, [[30, 36], [34, 42], [31, 48]], '#6f6a60', 1.6);
      shape(c, P([[18, 18], [17, 7], [27, 2], [38, 5], [41, 18]]), '#b3aea1');
      shape(c, blobs([[22, 4, 4], [28, 2, 3.5], [33, 4, 3.5]]), '#6bbf4a', 1.4);
      flat(c, (c) => { rrect(c, 22, 10, 4.5, 3.5, 1); rrect(c, 32, 10, 4.5, 3.5, 1); }, '#7fe8f6');
    };
  }
  ART.pebblor0 = [58, 60, golemArt(0)];
  ART.pebblor1 = [58, 60, golemArt(1)];

  // ---- new world objects ----
  ART.chest = [42, 34, (c) => {
    shape(c, (c) => rrect(c, 4, 13, 34, 19, 3), '#b07a46');
    shape(c, (c) => { c.moveTo(3, 15); c.lineTo(3, 9); c.quadraticCurveTo(21, -1, 39, 9); c.lineTo(39, 15); c.closePath(); }, '#c98a4b');
    flat(c, (c) => { rrect(c, 9, 6, 4, 26, 1); rrect(c, 29, 6, 4, 26, 1); }, '#ffc93c');
    shape(c, (c) => rrect(c, 17.5, 12, 7, 8, 2), '#ffc93c', 1.6);
    flat(c, blobs([[21, 16, 1.4]]), INK);
  }];
  ART.reeds = [28, 38, (c) => {
    [[7, 36, 5, 10], [13, 36, 14, 4], [19, 36, 22, 9]].forEach(([x, y, tx, ty]) => { line(c, [[x, y], [tx, ty]], INK, 4.2); line(c, [[x, y], [tx, ty]], '#6b9a43', 2); });
    shape(c, (c) => { rrect(c, 3, 9, 4.5, 11, 2.2); rrect(c, 12, 3, 4.5, 11, 2.2); rrect(c, 20, 8, 4.5, 11, 2.2); }, '#8a5a33', 1.6);
    shape(c, (c) => ell(c, 23, 30, 5, 2, -0.6), '#7fb04f', 1.4);
  }];
  ART.mushroom = [26, 26, (c) => {
    shape(c, (c) => rrect(c, 9, 12, 8, 12, 3.5), '#fff3df');
    shape(c, (c) => { c.moveTo(1, 14); c.quadraticCurveTo(2, 1, 13, 1); c.quadraticCurveTo(24, 1, 25, 14); c.closePath(); }, '#e8354a');
    flat(c, blobs([[8, 8, 2.2], [15, 5, 1.8], [19, 10, 2]]), '#ffffff');
  }];
  ART.swampTree = [70, 94, (c) => {
    shape(c, (c) => { rrect(c, 29, 48, 12, 44, 3); polyPath(c, [[24, 92], [46, 92], [41, 84], [29, 84]]); }, '#6b5a4a');
    shape(c, blobs([[35, 30, 24], [15, 42, 15], [55, 42, 15], [35, 46, 16]]), '#4f8a6f');
    flat(c, blobs([[28, 21, 10], [13, 38, 5]]), '#6aa587');
    [[10, 46, 64], [20, 50, 70], [50, 50, 68], [60, 46, 62], [30, 54, 66]].forEach(([x, y, b]) => { line(c, [[x, y], [x + 1, b]], INK, 3.6); line(c, [[x, y], [x + 1, b]], '#3f7a5f', 1.8); });
  }];

  // ---- new items & gear ----
  ART.itemFiber = [28, 24, (c) => {
    shape(c, (c) => { polyPath(c, [[4, 22], [9, 2], [12, 22]]); polyPath(c, [[10, 22], [15, 1], [18, 22]]); polyPath(c, [[16, 22], [23, 4], [24, 22]]); }, '#8cc152', 1.6);
    shape(c, (c) => rrect(c, 5, 13, 18, 4, 2), '#e6c98d', 1.4);
  }];
  function fishArt(body, fin, light) {
    return (c) => {
      shape(c, P([[26, 10], [33, 3], [33, 17]]), fin, 1.8);
      shape(c, (c) => ell(c, 15, 10, 13, 7.5), body);
      flat(c, (c) => ell(c, 13, 13, 8, 2.6), light);
      shape(c, P([[13, 4], [19, 0], [20, 5]]), fin, 1.4);
      flat(c, blobs([[7, 8.5, 1.8]]), INK);
    };
  }
  ART.itemFish = [35, 20, fishArt('#5fa8e8', '#3f7fc2', '#bfe2ff')];
  ART.itemKoi = [35, 20, fishArt('#8fe8f6', '#a78bfa', '#e6fbff')];
  ART.itemGrilledFish = [35, 20, (c) => {
    fishArt('#c98a4b', '#9b6236', '#e6b27a')(c);
    [[10, 4], [16, 4], [22, 5]].forEach(([x, y]) => line(c, [[x, y], [x - 4, y + 12]], '#7a4f2c', 1.6));
  }];
  ART.itemInk = [22, 28, (c) => {
    shape(c, (c) => { c.moveTo(11, 2); c.bezierCurveTo(16, 10, 20, 15, 20, 19); c.arc(11, 19, 9, 0, Math.PI); c.bezierCurveTo(2, 15, 6, 10, 11, 2); }, '#2b2340');
    flat(c, (c) => ell(c, 7.5, 19, 2, 3.5, 0.3), '#6b5f8a');
  }];
  ART.toolRod = [32, 36, (c) => {
    line(c, [[6, 34], [26, 3]], INK, 5); line(c, [[6, 34], [26, 3]], '#a8743f', 2.6);
    shape(c, blobs([[11, 26, 4]]), '#c7c9d6', 1.6);
    c.beginPath(); c.moveTo(26, 3); c.quadraticCurveTo(31, 16, 29, 28); c.lineWidth = 1.2; c.strokeStyle = '#ffffff'; c.stroke();
  }];
  ART.toolInkBlade = [28, 34, (c) => {
    shape(c, (c) => rrect(c, 11, 22, 5, 10, 2), '#2b2340', 1.8);
    shape(c, (c) => rrect(c, 4, 19, 19, 4, 2), '#a78bfa', 1.8);
    shape(c, P([[9.5, 19], [9.5, 6], [13.5, 0], [17.5, 6], [17.5, 19]]), '#3b2f4f', 1.8);
    flat(c, P([[15.5, 18], [15.5, 6], [13.5, 2.5], [14.2, 18]]), '#b69cff');
  }];
  function armorArt(fill, light) {
    return (c) => {
      shape(c, (c) => { c.moveTo(6, 4); c.lineTo(11, 2); c.quadraticCurveTo(15, 7, 19, 2); c.lineTo(24, 4); c.lineTo(28, 12); c.lineTo(23, 14); c.lineTo(23, 28); c.lineTo(7, 28); c.lineTo(7, 14); c.lineTo(2, 12); c.closePath(); }, fill);
      flat(c, (c) => rrect(c, 9, 9, 4, 16, 2), light);
      line(c, [[15, 8], [15, 27]], INK, 1.3);
    };
  }
  ART.armorBark = [30, 30, armorArt('#a8743f', '#c99a62')];
  ART.armorStone = [30, 30, armorArt('#a3a1b5', '#c9c7da')];
  ART.armorCrystal = [30, 30, armorArt('#8fe8f6', '#e6fbff')];
  ART.bobber = [14, 16, (c) => {
    shape(c, (c) => circ(c, 7, 9, 5.5), '#ffffff', 1.6);
    flat(c, (c) => { c.moveTo(1.5, 9); c.arc(7, 9, 5.5, Math.PI, 0); c.closePath(); }, '#ff4d6d');
    line(c, [[7, 3.5], [7, 0.5]], INK, 1.6);
  }];
  ART.uiBang = [24, 28, (c) => {
    shape(c, blobs([[12, 14, 11]]), '#ffd23f');
    flat(c, (c) => { rrect(c, 10, 5, 4, 12, 2); circ(c, 12, 21, 2.3); }, INK);
  }];
  ART.uiArrow = [30, 22, (c) => {
    shape(c, P([[2, 7], [17, 7], [17, 1], [29, 11], [17, 21], [17, 15], [2, 15]]), '#ffd23f');
  }];
  ART.uiPin = [22, 30, (c) => {
    shape(c, (c) => { c.moveTo(11, 29); c.bezierCurveTo(2, 18, 1, 13, 1, 11); c.arc(11, 11, 10, Math.PI, 0); c.bezierCurveTo(21, 13, 20, 18, 11, 29); }, '#ff4d6d');
    flat(c, blobs([[11, 11, 4]]), '#ffffff');
  }];


  // ---- biome plants & props ----
  ART.treeAutumn = [70, 92, treeRound('#f0903a', '#ffb866', '#c86a20')];
  ART.treeAutumnRed = [70, 92, treeRound('#e2553a', '#ff8a6a', '#a8361f')];
  ART.cactus = [40, 62, (c) => {
    shape(c, (c) => { rrect(c, 14, 6, 13, 54, 6.5); rrect(c, 2, 22, 9, 20, 4.5); rrect(c, 2, 34, 14, 8, 4); rrect(c, 29, 14, 9, 20, 4.5); rrect(c, 24, 26, 14, 8, 4); }, '#5bb04f');
    flat(c, (c) => { rrect(c, 17, 9, 3, 46, 1.5); rrect(c, 4, 25, 2.5, 13, 1.2); }, '#83cf5f');
    [[20, 14], [20, 30], [20, 46], [6, 30], [33, 20]].forEach(([x, y]) => line(c, [[x - 2, y], [x + 2, y - 2]], '#ffffff', 1.4));
    shape(c, blobs([[20.5, 6, 3.4]]), '#ff7aa8', 1.4);
  }];
  ART.deadBush = [36, 26, (c) => {
    [[18, 25, 6, 6], [18, 25, 30, 4], [18, 25, 12, 2], [18, 25, 26, 10], [18, 25, 18, 1], [12, 14, 4, 12], [24, 12, 32, 14]].forEach(([a, b, x, y]) => { line(c, [[a, b], [x, y]], INK, 4); line(c, [[a, b], [x, y]], '#b08a5a', 2); });
  }];
  ART.giantMushroom = [64, 76, (c) => {
    shape(c, (c) => { rrect(c, 24, 34, 16, 40, 7); }, '#f4ecdc');
    flat(c, (c) => rrect(c, 27, 38, 4, 32, 2), '#ffffff');
    shape(c, (c) => { c.moveTo(2, 38); c.quadraticCurveTo(4, 2, 32, 2); c.quadraticCurveTo(60, 2, 62, 38); c.quadraticCurveTo(32, 46, 2, 38); c.closePath(); }, '#6f7fd8');
    flat(c, (c) => ell(c, 22, 14, 10, 5, -0.3), '#9eabf0');
    flat(c, blobs([[16, 26, 4], [32, 12, 3.5], [46, 24, 4.5], [30, 30, 3], [52, 34, 2.5]]), '#d6f6ff');
  }];
  ART.snowRock = [44, 32, (c) => {
    ART.rock2[2](c);
    shape(c, (c) => { c.moveTo(6, 10); c.lineTo(14, 4); c.lineTo(30, 3); c.lineTo(39, 12); c.quadraticCurveTo(30, 15, 24, 12); c.quadraticCurveTo(16, 16, 6, 10); c.closePath(); }, '#ffffff', 1.6);
  }];
  // ---- transport & adventure ----
  ART.raft = [64, 30, (c) => {
    shape(c, (c) => { for (let i = 0; i < 5; i++) rrect(c, 4 + i * 11.5, 6, 11, 20, 5); }, '#b07a46');
    flat(c, (c) => { for (let i = 0; i < 5; i++) rrect(c, 7 + i * 11.5, 8, 3, 15, 1.5); }, '#cf9a62');
    shape(c, (c) => { rrect(c, 2, 9, 60, 4, 2); rrect(c, 2, 19, 60, 4, 2); }, '#e6c98d', 1.4);
  }];
  ART.glider = [92, 40, (c) => {
    shape(c, (c) => { c.moveTo(46, 30); c.quadraticCurveTo(14, 30, 2, 12); c.quadraticCurveTo(26, 4, 46, 14); c.quadraticCurveTo(66, 4, 90, 12); c.quadraticCurveTo(78, 30, 46, 30); c.closePath(); }, '#6bbf4a');
    line(c, [[46, 30], [46, 14]], '#3f8f3d', 2);
    [[20, 20, 10, 14], [30, 22, 22, 12], [62, 22, 70, 12], [72, 20, 82, 14]].forEach(([a, b, x, y]) => line(c, [[a, b], [x, y]], '#3f8f3d', 1.6));
    line(c, [[30, 28], [46, 38], [62, 28]], INK, 1.4);
  }];
  ART.lostPage = [34, 40, (c) => {
    shape(c, (c) => { c.moveTo(4, 4); c.lineTo(24, 4); c.lineTo(30, 10); c.lineTo(30, 36); c.lineTo(4, 36); c.closePath(); }, '#fff8e6');
    shape(c, P([[24, 4], [24, 10], [30, 10]]), '#e8dcc0', 1.6);
    [12, 18, 24].forEach((y) => line(c, [[9, y], [25, y]], '#c9bba0', 1.6));
    shape(c, (c) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 3 : 7; c.lineTo(17 + Math.cos(a) * r, 29 + Math.sin(a) * r); } c.closePath(); }, '#ffd23f', 1.4);
  }];
  ART.digX = [40, 24, (c) => {
    shape(c, (c) => { polyPath(c, [[4, 4], [10, 2], [36, 18], [30, 22]]); polyPath(c, [[30, 2], [36, 4], [10, 22], [4, 18]]); }, '#ff4d6d', 1.8);
  }];
  ART.itemRaft = ART.raft;
  ART.itemGlider = ART.glider;
  ART.itemMap = [28, 26, (c) => {
    shape(c, (c) => { c.moveTo(2, 5); c.lineTo(10, 2); c.lineTo(18, 5); c.lineTo(26, 2); c.lineTo(26, 21); c.lineTo(18, 24); c.lineTo(10, 21); c.lineTo(2, 24); c.closePath(); }, '#f6e4b8');
    line(c, [[6, 16], [11, 12], [16, 15], [20, 9]], '#a8743f', 1.4);
    shape(c, (c) => { polyPath(c, [[18, 7], [20, 7], [23, 11], [21, 11]]); polyPath(c, [[21, 7], [23, 7], [20, 11], [18, 11]]); }, '#ff4d6d', 1);
  }];

  // ---- the realm: tribe folk, buildings, cave mountains, cave creatures, treasures ----
  const STYLE = {
    reed: { robe: '#7fb069', trim: '#d9c27a', skin: '#f2c99a', hat: 'cone' },
    stone: { robe: '#8a8fa3', trim: '#c97b4a', skin: '#e8b98d', hat: 'cap' },
    city: { robe: '#4f7fd9', trim: '#ffd23f', skin: '#f5cfa8', hat: 'tall' },
    snow: { robe: '#b8c6e8', trim: '#ffffff', skin: '#f0c4a0', hat: 'hood' },
    temple: { robe: '#d9534f', trim: '#ffd23f', skin: '#f3d1b0', hat: 'quill' },
  };
  function folkArt(st, role) {
    return (c) => {
      const S = STYLE[st];
      if (role === 'elder') { line(c, [[37, 12], [37, 50]], INK, 4.4); line(c, [[37, 12], [37, 50]], '#a8743f', 2.2); shape(c, blobs([[37, 11, 4]]), S.trim, 1.6); }
      if (role === 'trader') shape(c, (c) => rrect(c, 2, 22, 11, 18, 4), '#c98f4a');
      shape(c, P([[10, 50], [14, 26], [30, 26], [34, 50]]), S.robe);
      flat(c, P([[13, 50], [16, 32], [19, 50]]), S.trim);
      shape(c, blobs([[22, 20, 10]]), S.skin);
      flat(c, blobs([[19, 21, 1.6], [26, 21, 1.6]]), INK);
      flat(c, (c) => ell(c, 28, 24, 2, 1.2), '#ff9a8a');
      if (role === 'elder') shape(c, P([[15, 24], [29, 24], [22, 38]]), '#f4f4f4', 1.6);
      if (S.hat === 'cone') shape(c, P([[8, 15], [36, 15], [22, 1]]), '#e6cf7d');
      else if (S.hat === 'cap') shape(c, (c) => { c.moveTo(11, 15); c.arc(22, 15, 11, Math.PI, 0); c.closePath(); }, S.trim);
      else if (S.hat === 'tall') { shape(c, (c) => rrect(c, 14, 0, 16, 13, 2), '#3b2f4f'); shape(c, (c) => rrect(c, 10, 11, 24, 4, 2), '#3b2f4f'); flat(c, (c) => rrect(c, 14, 7, 16, 3, 1), S.trim); }
      else if (S.hat === 'hood') shape(c, (c) => { c.moveTo(10, 22); c.arc(22, 17, 13, Math.PI * 0.9, Math.PI * 2.1); c.closePath(); }, '#f4f4f4');
      else { line(c, [[22, 10], [30, 0]], INK, 3); line(c, [[22, 10], [30, 0]], S.trim, 1.6); }
    };
  }
  for (const st in STYLE) { ART['elder_' + st] = [44, 52, folkArt(st, 'elder')]; ART['trader_' + st] = [44, 52, folkArt(st, 'trader')]; }

  ART.hutReed = [90, 86, (c) => {
    shape(c, (c) => { rrect(c, 14, 44, 62, 38, 4); }, '#c9a66b');
    [22, 34, 46, 58, 70].forEach((x) => line(c, [[x, 46], [x, 80]], '#a88752', 1.6));
    shape(c, P([[4, 50], [45, 6], [86, 50]]), '#e6cf7d');
    [[20, 40], [32, 30], [45, 20], [58, 30], [70, 40]].forEach(([x, y]) => line(c, [[x - 8, y + 8], [x, y], [x + 8, y + 8]], '#c9ae5d', 1.6));
    shape(c, (c) => rrect(c, 38, 58, 16, 24, 7), '#5a3f2e');
  }];
  ART.totem = [34, 96, (c) => {
    shape(c, (c) => rrect(c, 9, 10, 16, 84, 4), '#b07a46');
    [[17, 22, '#ff4d6d'], [17, 46, '#ffd23f'], [17, 70, '#4fb3e8']].forEach(([x, y, col]) => { shape(c, blobs([[x, y, 9]]), col, 1.8); flat(c, blobs([[x - 3, y - 1, 1.6], [x + 3, y - 1, 1.6]]), INK); });
    shape(c, P([[2, 12], [17, 0], [32, 12]]), '#6bbf4a');
  }];
  ART.houseStone = [96, 92, (c) => {
    shape(c, (c) => rrect(c, 10, 34, 76, 54, 4), '#a3a1b5');
    [[14, 40, 20], [36, 40, 24], [62, 40, 20], [20, 56, 24], [48, 56, 30], [14, 72, 26], [44, 72, 22], [68, 72, 16]].forEach(([x, y, w]) => line(c, [[x, y + 12], [x + w, y + 12]], '#8a8fa3', 1.4));
    shape(c, P([[2, 38], [48, 6], [94, 38]]), '#c97b4a');
    shape(c, (c) => rrect(c, 40, 60, 16, 28, 3), '#5a3f2e');
    shape(c, (c) => rrect(c, 64, 48, 12, 12, 2), '#ffe08f', 1.6);
  }];
  ART.forge = [96, 84, (c) => {
    shape(c, (c) => rrect(c, 8, 30, 80, 50, 6), '#8a8fa3');
    shape(c, (c) => rrect(c, 62, 4, 16, 30, 3), '#6b6f82');
    shape(c, (c) => { c.moveTo(30, 80); c.arc(48, 62, 18, Math.PI, 0); c.lineTo(66, 80); c.closePath(); }, '#3b2f4f');
    flat(c, blobs([[48, 70, 9]]), '#ff7a2a'); flat(c, blobs([[48, 72, 5]]), '#ffd23f');
    shape(c, (c) => rrect(c, 14, 54, 14, 10, 3), '#5a5e70', 1.6);
  }];
  ART.tower = [60, 130, (c) => {
    shape(c, P([[14, 126], [20, 30], [40, 30], [46, 126]]), '#e8dcc0');
    [50, 72, 94].forEach((y) => line(c, [[18, y], [42, y]], '#c9bba0', 1.6));
    shape(c, (c) => rrect(c, 12, 16, 36, 18, 4), '#4f7fd9');
    flat(c, (c) => rrect(c, 20, 20, 20, 10, 3), '#ffe08f');
    shape(c, P([[8, 18], [30, 0], [52, 18]]), '#3b2f4f');
    shape(c, (c) => rrect(c, 24, 104, 12, 22, 5), '#5a3f2e');
  }];
  ART.houseCity = [92, 100, (c) => {
    shape(c, (c) => rrect(c, 10, 26, 72, 70, 4), '#f4d6a0');
    [[18, 36], [42, 36], [64, 36], [18, 60], [64, 60]].forEach(([x, y]) => { shape(c, (c) => rrect(c, x, y, 12, 14, 2), '#ffe08f', 1.6); });
    shape(c, P([[4, 30], [46, 2], [88, 30]]), '#4f7fd9');
    shape(c, (c) => rrect(c, 38, 66, 16, 30, 7), '#5a3f2e');
    flat(c, (c) => rrect(c, 10, 26, 72, 5, 2), '#e0b870');
  }];
  ART.market = [110, 84, (c) => {
    shape(c, (c) => rrect(c, 10, 40, 90, 40, 4), '#c98f4a');
    shape(c, P([[4, 42], [20, 14], [90, 14], [106, 42]]), '#ff4d6d');
    [20, 44, 68, 92].forEach((x) => flat(c, P([[x - 6, 16], [x + 6, 16], [x + 10, 42], [x - 2, 42]]), '#ffffff'));
    [[28, 52, '#ff4d6d'], [48, 50, '#ffd23f'], [68, 52, '#6bbf4a'], [86, 50, '#4fb3e8']].forEach(([x, y, col]) => shape(c, blobs([[x, y, 6]]), col, 1.4));
  }];
  ART.igloo = [96, 64, (c) => {
    shape(c, (c) => { c.moveTo(4, 60); c.arc(48, 60, 44, Math.PI, 0); c.closePath(); }, '#eef6ff');
    [[20, 46], [48, 30], [74, 46], [34, 22], [62, 22]].forEach(([x, y]) => line(c, [[x - 10, y], [x + 10, y]], '#b8c6e8', 1.6));
    shape(c, (c) => { c.moveTo(34, 60); c.arc(48, 60, 14, Math.PI, 0); c.closePath(); }, '#3b2f4f');
  }];
  ART.hearth = [70, 70, (c) => {
    shape(c, (c) => { c.moveTo(6, 66); c.lineTo(10, 36); c.lineTo(60, 36); c.lineTo(64, 66); c.closePath(); }, '#8a8fa3');
    flat(c, blobs([[35, 30, 14]]), '#ff7a2a'); flat(c, blobs([[35, 28, 8]]), '#ffd23f');
    shape(c, P([[22, 34], [35, 4], [48, 34]]), '#ff7a2a', 1.6);
  }];
  ART.pagoda = [100, 120, (c) => {
    shape(c, (c) => rrect(c, 26, 70, 48, 46, 3), '#f4d6a0');
    shape(c, P([[6, 74], [50, 52], [94, 74]]), '#d9534f');
    shape(c, (c) => rrect(c, 32, 34, 36, 24, 3), '#f4d6a0');
    shape(c, P([[14, 40], [50, 18], [86, 40]]), '#d9534f');
    shape(c, P([[40, 20], [50, 0], [60, 20]]), '#ffd23f');
    shape(c, (c) => rrect(c, 42, 90, 16, 26, 7), '#5a3f2e');
  }];
  ART.shrine = [64, 70, (c) => {
    shape(c, (c) => { rrect(c, 8, 18, 8, 50, 2); rrect(c, 48, 18, 8, 50, 2); }, '#d9534f');
    shape(c, (c) => { rrect(c, 2, 10, 60, 8, 3); rrect(c, 8, 26, 48, 6, 2); }, '#d9534f');
    shape(c, (c) => { c.moveTo(24, 66); c.lineTo(28, 40); c.lineTo(36, 40); c.lineTo(40, 66); c.closePath(); }, '#2b2340');
  }];

  function mountainArt(rock, light, cap, door) {
    return (c) => {
      shape(c, P([[2, 150], [52, 46], [84, 70], [120, 8], [168, 64], [196, 150]]), rock);
      flat(c, P([[52, 46], [64, 64], [44, 74]]), light);
      flat(c, P([[120, 8], [136, 34], [112, 40], [100, 30]]), light);
      shape(c, P([[100, 30], [120, 8], [142, 38], [130, 34], [120, 44], [110, 34]]), cap, 1.8);
      // the cave door: a dark arch with timber posts
      shape(c, (c) => { c.moveTo(76, 150); c.lineTo(76, 112); c.arc(100, 112, 24, Math.PI, 0); c.lineTo(124, 150); c.closePath(); }, '#16121f');
      shape(c, (c) => { rrect(c, 70, 104, 8, 46, 2); rrect(c, 122, 104, 8, 46, 2); rrect(c, 68, 98, 64, 8, 3); }, '#9a6a3f', 1.8);
      flat(c, blobs([[100, 128, 5]]), door);
      [[40, 120], [160, 118], [150, 96], [56, 100]].forEach(([x, y]) => line(c, [[x - 8, y], [x + 8, y]], 'rgba(59,47,79,0.35)', 2));
    };
  }
  ART.caveMount0 = [198, 152, mountainArt('#6b8f4e', '#8fb36a', '#a6d17a', '#ffd23f')];
  ART.caveMount1 = [198, 152, mountainArt('#8a8fa3', '#a9adbd', '#d9dbe6', '#ff4d6d')];
  ART.caveMount2 = [198, 152, mountainArt('#4f7f8f', '#6fa0ae', '#9fd6e0', '#8fe8f6')];
  ART.caveMount3 = [198, 152, mountainArt('#7f93b8', '#a3b4d4', '#ffffff', '#c8f0ff')];
  ART.caveMount4 = [198, 152, mountainArt('#3e3352', '#5b4f78', '#2b2340', '#ff3b5c')];

  function batArt(f) {
    return (c) => {
      const up = f ? -8 : 6;
      shape(c, (c) => { polyPath(c, [[20, 16], [2, 10 + up], [8, 20], [14, 18]]); polyPath(c, [[24, 16], [42, 10 + up], [36, 20], [30, 18]]); }, '#5b4f78', 1.8);
      shape(c, blobs([[22, 18, 8]]), '#3e3352');
      shape(c, P([[16, 12], [18, 4], [21, 11]]), '#3e3352', 1.4); shape(c, P([[23, 11], [26, 4], [28, 12]]), '#3e3352', 1.4);
      flat(c, blobs([[19, 17, 2], [25, 17, 2]]), '#ffd23f');
    };
  }
  ART.bat0 = [44, 30, batArt(0)]; ART.bat1 = [44, 30, batArt(1)];
  function grubArt(f) {
    return (c) => {
      const sq = f ? 2 : 0;
      shape(c, blobs([[10, 18 + sq * 0.3, 8], [20, 16 - sq * 0.3, 9], [31, 17, 9.5 - sq * 0.3]]), '#c98fd9');
      [[10, 18], [20, 16]].forEach(([x, y]) => line(c, [[x + 4, y - 7], [x + 4, y + 7]], '#a06fb5', 1.4));
      flat(c, blobs([[34, 14, 2.2]]), INK); flat(c, blobs([[35, 13.4, 0.8]]), '#ffffff');
      line(c, [[34, 8], [38, 2]], INK, 1.6); line(c, [[30, 8], [30, 1]], INK, 1.6);
    };
  }
  ART.grub0 = [44, 28, grubArt(0)]; ART.grub1 = [44, 28, grubArt(1)];

  function gemArt(col, light, dark, pts) {
    return (c) => {
      shape(c, P(pts), col);
      flat(c, P([pts[0], pts[1], [14, 13]]), light);
      flat(c, P([[14, 13], pts[pts.length - 2], pts[pts.length - 1]]), dark);
    };
  }
  const GEM = [[14, 3], [24, 10], [20, 25], [8, 25], [4, 10]];
  ART.itemRuby = [28, 28, gemArt('#ff3b5c', '#ff9aac', '#b5162f', GEM)];
  ART.itemAmber = [28, 28, (c) => { shape(c, (c) => ell(c, 14, 15, 10, 11, 0.3), '#ffb13b'); flat(c, (c) => ell(c, 11, 11, 4, 3, 0.4), '#ffe08f'); flat(c, blobs([[16, 18, 2]]), '#9a5a1a'); }];
  ART.itemOpal = [28, 28, (c) => { shape(c, (c) => ell(c, 14, 14, 10, 11), '#dfe8ff'); flat(c, blobs([[10, 11, 3.5]]), '#ffc9f0'); flat(c, blobs([[17, 17, 3]]), '#a6f0e6'); flat(c, blobs([[16, 9, 2]]), '#fff6b0'); }];
  ART.itemStar = [28, 28, (c) => { shape(c, (c) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 5 : 12; c.lineTo(14 + Math.cos(a) * r, 15 + Math.sin(a) * r); } c.closePath(); }, '#fff27a'); flat(c, blobs([[12, 12, 2.5]]), '#ffffff'); }];
  ART.itemShell = [28, 26, (c) => {
    shape(c, (c) => { c.moveTo(3, 20); c.quadraticCurveTo(14, -6, 25, 20); c.lineTo(17, 24); c.lineTo(11, 24); c.closePath(); }, '#ffc9b5');
    [[8, 20], [14, 21], [20, 20]].forEach(([x, y]) => line(c, [[14, 6], [x, y]], '#e08f7a', 1.4));
  }];
  ART.relicSun = [32, 32, (c) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; line(c, [[16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9], [16 + Math.cos(a) * 15, 16 + Math.sin(a) * 15]], '#ffb13b', 3); }
    shape(c, blobs([[16, 16, 9]]), '#ffd23f'); flat(c, blobs([[13, 13, 3]]), '#fff6b0');
  }];
  ART.relicEcho = [30, 34, (c) => { shape(c, P([[15, 2], [26, 12], [22, 32], [8, 32], [4, 12]]), '#a78bfa'); flat(c, P([[15, 2], [26, 12], [15, 14]]), '#d6c8ff'); line(c, [[10, 18], [15, 24], [20, 18]], '#ffffff', 1.6); }];
  ART.relicPearl = [30, 30, (c) => { shape(c, (c) => ell(c, 15, 22, 13, 6), '#4fb3e8'); shape(c, blobs([[15, 15, 8]]), '#f6fbff'); flat(c, blobs([[12, 12, 2.6]]), '#ffffff'); flat(c, blobs([[18, 18, 2]]), '#d6e8ff'); }];
  ART.relicFrost = [30, 32, (c) => { shape(c, (c) => { c.moveTo(15, 30); c.bezierCurveTo(-2, 16, 4, 2, 15, 10); c.bezierCurveTo(26, 2, 32, 16, 15, 30); }, '#8fe8f6'); flat(c, blobs([[10, 12, 3]]), '#ffffff'); line(c, [[15, 14], [15, 24]], '#4fb3e8', 1.6); line(c, [[11, 19], [19, 19]], '#4fb3e8', 1.6); }];
  ART.relicCrown = [36, 28, (c) => { shape(c, P([[3, 24], [3, 8], [11, 16], [18, 4], [25, 16], [33, 8], [33, 24]]), '#3e3352'); [[3, 8], [18, 4], [33, 8]].forEach(([x, y]) => shape(c, blobs([[x, y, 3]]), '#ff3b5c', 1.4)); flat(c, (c) => rrect(c, 6, 19, 24, 3, 1.5), '#a78bfa'); }];
  function runeArt(col, glyph) {
    return (c) => {
      shape(c, (c) => rrect(c, 4, 3, 22, 24, 6), '#8a8fa3');
      flat(c, (c) => rrect(c, 7, 6, 16, 4, 2), '#a9adbd');
      line(c, glyph, INK, 4.2); line(c, glyph, col, 2.2);
    };
  }
  ART.runeKeen = [30, 30, runeArt('#ff4d6d', [[10, 22], [20, 10], [16, 10], [20, 10], [20, 14]])];
  ART.runeSwift = [30, 30, runeArt('#4fb3e8', [[9, 20], [14, 13], [16, 18], [21, 11]])];
  ART.runeLucky = [30, 30, runeArt('#6bbf4a', [[15, 10], [15, 22], [10, 15], [20, 15]])];
  ART.runeWard = [30, 30, runeArt('#ffd23f', [[10, 11], [15, 9], [20, 11], [19, 19], [15, 23], [11, 19], [10, 11]])];
  ART.modFeather = [30, 30, (c) => { shape(c, (c) => { c.moveTo(6, 26); c.quadraticCurveTo(6, 6, 25, 3); c.quadraticCurveTo(22, 20, 6, 26); }, '#ffffff'); line(c, [[6, 26], [22, 6]], '#c9bba0', 1.6); }];
  ART.modTar = [28, 30, (c) => { shape(c, (c) => { rrect(c, 4, 10, 20, 18, 6); rrect(c, 8, 6, 12, 6, 2); }, '#5a3f2e'); flat(c, (c) => ell(c, 14, 10, 6, 2.2), '#2b2340'); flat(c, (c) => ell(c, 10, 16, 2, 4), '#7a5a40'); }];
  ART.modPepper = [30, 30, (c) => { shape(c, (c) => { c.moveTo(9, 9); c.quadraticCurveTo(28, 10, 22, 28); c.quadraticCurveTo(8, 22, 9, 9); }, '#ff3b2a'); shape(c, (c) => rrect(c, 5, 4, 8, 7, 3), '#4fa64a', 1.6); flat(c, (c) => ell(c, 15, 14, 2, 4, -0.5), '#ff9a8a'); }];
  ART.toolCloak = [30, 30, (c) => { shape(c, P([[8, 6], [22, 6], [27, 27], [3, 27]]), '#b8c6e8'); shape(c, (c) => rrect(c, 6, 3, 18, 7, 3), '#ffffff', 1.6); flat(c, blobs([[15, 12, 2]]), '#ffd23f'); }];
  ART.greatBook = [36, 30, (c) => { shape(c, (c) => rrect(c, 3, 4, 30, 23, 3), '#8a63e8'); flat(c, (c) => rrect(c, 3, 22, 30, 4, 2), '#fff8e6'); shape(c, (c) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 3 : 7; c.lineTo(18 + Math.cos(a) * r, 13 + Math.sin(a) * r); } c.closePath(); }, '#ffd23f', 1.4); }];

  SW.sprites = {};
  const FLIP = ['bat0', 'bat1', 'grub0', 'grub1', 'player0', 'player1', 'scribble0', 'scribble1', 'puff0', 'puff1', 'thornback0', 'thornback1', 'snapjaw0', 'snapjaw1', 'gloop0', 'gloop1', 'pebblor0', 'pebblor1'];
  const ALIAS = { itemCampfire: 'campfire', itemWall: 'wall', itemAxe: 'toolAxe', itemPick: 'toolPick', itemSword: 'toolSword', itemGemSword: 'toolGemSword', itemMushroom: 'mushroom' };
  const border = (name) => (name.startsWith('item') || name.startsWith('ui') ? 3 : 3.6);
  // World stickers are rendered at the exact on-screen scale so most of them
  // can be copied 1:1 every frame; rebuilt when the zoom changes.
  SW.buildSprites = function (S) {
    SW.SPR = S;
    for (const name in ART) {
      const [w, h, fn] = ART[name];
      SW.sprites[name] = makeSticker(w, h, fn, { border: border(name), S });
      if (FLIP.includes(name)) SW.sprites[name + 'L'] = makeSticker(w, h, fn, { flip: true, S });
    }
    for (const a in ALIAS) SW.sprites[a] = SW.sprites[ALIAS[a]];
  };
  // Big stickers for the story intro. gray=true flattens them into four
  // ink tones, like a printed manga page.
  const bigCache = {};
  SW.bigSprite = function (name, S, gray) {
    const key = name + '|' + S + '|' + (gray ? 1 : 0);
    if (bigCache[key]) return bigCache[key];
    const art = ART[ALIAS[name] || name];
    if (!art) return null;
    const st = makeSticker(art[0], art[1], art[2], { border: border(name), S });
    if (gray) {
      const c = st.img, g = c.getContext('2d');
      const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        const v = l < 70 ? 22 : l < 150 ? 118 : l < 215 ? 196 : 252;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      g.putImageData(im, 0, 0);
    }
    bigCache[key] = st;
    return st;
  };
  // HUD icons get their own crisp 2x stickers, made once.
  const urls = {};
  SW.spriteURL = function (name) {
    if (urls[name]) return urls[name];
    const art = ART[ALIAS[name] || name];
    if (!art) return '';
    const [w, h, fn] = art;
    urls[name] = makeSticker(w, h, fn, { border: border(name), S: 2 }).img.toDataURL('image/png');
    return urls[name];
  };
})();
