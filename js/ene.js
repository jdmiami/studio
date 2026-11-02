// Stickerwild — Ene's puppet rig.
// Her head, hair, streaks and dress are the original drawing (one piece per
// view: front, three-quarter, side, back). Arms and legs are jointed limbs
// drawn in the same style: the same pink, the same ink, thin with big bare
// feet. Every frame the pose is worked out from what she is doing (idle,
// walking, running, swinging, hurt, joy, crying, fishing, gliding, climbing,
// jumping, sailing), then the whole puppet is drawn to a small canvas and
// given a white sticker border, like every other sticker in the game.
//
// Coordinates are the character sheet's pixels: y grows downward, the feet
// stand on `ground`. Angles are in radians: 0 points straight down, positive
// swings toward the way she faces.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const INK = '#141016';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  const SHOULDERS = { front: [[82, 283], [130, 291]], threeQ: [[62, 276], [109, 283]], side: [[62.5, 281], [57, 280]], back: [[75, 281], [111, 285]] };
  // per-view skeleton, measured from the drawings
  function build() {
    const R = SW.ENE_RIG, out = {};
    const mid = (r) => (r[0] + r[1]) / 2;
    for (const v of ['front', 'threeQ', 'side', 'back']) {
      const d = R[v];
      // hips, knees and ankles where the drawing has them (traced with the limbs)
      const T = SW.ENE_LIMBS && SW.ENE_LIMBS.views[v];
      const hipY = T ? T.hipY : d.hem - 24;
      const legs = T ? (T.legs.length > 1 ? [T.legs[0].top, T.legs[1].top] : [T.legs[0].top - 1.5, T.legs[0].top + 1.5])
        : d.legsTop.length >= 2 ? [mid(d.legsTop[0]), mid(d.legsTop[1])] : [mid(d.legsTop[0]) - 3, mid(d.legsTop[0]) + 3];
      const ankleY = T ? T.ankleY : d.ground - 11;
      const legLen = ankleY - hipY, kneeK = T ? (T.kneeY - hipY) / legLen : 0.53;
      out[v] = {
        w: d.w, h: d.h, ground: d.ground, hem: d.hem,
        hips: legs.map((x) => [x, hipY]), thigh: legLen * kneeK, shin: legLen * (1 - kneeK), footH: d.ground - ankleY,
        // her shoulders: at the edges of her chest where the drawing is widest, just above the dress
        shoulders: SHOULDERS[v], upper: 53, fore: 58,
        skin: `rgb(${d.skin.join(',')})`, shade: `rgb(${d.shade.join(',')})`, eyes: d.eyes,
        anchor: (legs[0] + legs[1]) / 2,
        // which way the drawing faces: the side and 3/4 views look to the viewer's left
        face: v === 'side' ? -1 : v === 'threeQ' ? -0.45 : 0,
        // which arm is in front of the body (index into shoulders), or -1 if both behind
        frontArm: v === 'front' ? 0 : v === 'threeQ' ? 0 : v === 'side' ? 0 : -1,
      };
    }
    return out;
  }
  let RIG = null;

  // ---------------- the pose ----------------
  // st: { view, flip, t, phase, speed (0 idle .. 1 walk .. 1.6 run), action, actionT,
  //       face, air, climb, boat, glide, fish, lean, sway }
  function pose(st) {
    if (!RIG) RIG = build();
    let view = st.view || 'front';
    // a big reaction turns her to the camera
    if (st.face && view !== 'front' && st.faceT > 0) view = 'front';
    const V = RIG[view], P = { view, V, flip: !!st.flip, legs: [], arms: [], body: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }, fingers: [0.3, 0.3], fist: [false, false], tool: null };
    const t = st.t || 0, sp = clamp(st.speed || 0, 0, 1.8), ph = (st.phase || 0) * TAU;
    const act = st.action, aT = st.actionT || 0;
    const fw = V.face || 1;                         // forward direction on screen (before flip)
    const isSide = view === 'side', isFront = view === 'front' || view === 'threeQ', isBack = view === 'back';
    const run = clamp((sp - 1) / 0.6, 0, 1), walk = clamp(sp, 0, 1);
    // the hand that holds the tool: the near one side-on, the viewer's left from behind, else her left
    const toolArm = isSide || isBack ? 0 : 1;
    P.toolArmI = toolArm;

    // ---- legs ----
    for (let i = 0; i < 2; i++) {
      const p2 = ph + i * Math.PI;
      let thigh = 0, knee = 0.06, foot = 0, lift = 0;
      if (walk > 0.02) {
        const A = lerp(0.34, 0.62, run) * walk, B = lerp(0.85, 1.65, run) * walk;
        thigh = A * Math.sin(p2);
        knee = 0.06 + B * Math.pow(Math.max(0, Math.cos(p2 - 0.35)), 2);
        foot = -0.45 * Math.max(0, -Math.sin(p2 + 0.5)) * walk;
        lift = Math.max(0, Math.cos(p2 - 0.35));
      } else {
        // idle: weight shifts slowly from foot to foot
        const ws = Math.sin(t * 1.3 + i * Math.PI) * 0.5 + 0.5;
        knee = 0.05 + 0.12 * ws;
      }
      if (st.air) { thigh = 0.75 + (i ? 0.25 : -0.1); knee = 1.5 + (i ? 0.2 : 0); foot = 0.5; }
      if (st.glide) { const sw = Math.sin(t * 2.2 + i * 1.3); thigh = 0.18 * sw + (i ? 0.1 : -0.06); knee = 0.35 + 0.25 * Math.max(0, sw); foot = 0.45; }
      if (st.climb) { const c = Math.sin(t * 7 + i * Math.PI) * (st.climbMove ? 1 : 0.15); thigh = 0.5 + 0.45 * c; knee = 0.9 + 0.7 * Math.max(0, c); }
      if (st.slide) { thigh = 1.35; knee = 1.25; foot = 0.3; }
      if (act === 'joy') { const k = Math.sin(clamp(aT / 0.9, 0, 1) * Math.PI); knee += 0.55 * k; thigh += (i ? 0.25 : -0.25) * k * (isSide ? 0 : 1); }
      if (act === 'hurt') { const k = Math.sin(clamp(aT / 0.5, 0, 1) * Math.PI); knee += 0.45 * k; thigh -= 0.15 * k; }
      if (act === 'cry') { knee = 0.02; thigh = (i ? 0.08 : -0.08) * (isSide ? 0 : 1); }
      if (st.boat) { knee = 0.2 + 0.1 * Math.sin(t * 2 + i); }
      P.legs.push({ thigh, knee, foot, lift, i });
    }
    // ---- arms ----
    // arm 0 is the viewer's left in front/back views and the near arm in the side view
    for (let i = 0; i < 2; i++) {
      const p2 = ph + (i ? 0 : Math.PI);           // opposite to the leg on the same side
      let sh = 0.12, el = 0.25, out = i ? 0.16 : -0.16, fingers = 0.35 + 0.2 * Math.sin(t * 1.7 + i), fist = false, target = null, handAbs = null;
      if (view === 'threeQ' && i === 1) out = 0.42;
      if (walk > 0.02) {
        const A = lerp(0.42, 0.95, run) * walk;
        sh = A * Math.sin(p2);
        el = lerp(0.3, 1.25, run) * walk + 0.25 * Math.max(0, Math.sin(p2));
        fist = run > 0.4;
      } else if (isFront && i === 0 && !st.fish) {
        // the sheet's pose: her right hand pressed to her chest
        target = [V.anchor - 16 + Math.sin(t * 1.4) * 1.5, V.shoulders[0][1] + 26, 1]; fingers = 0.15; handAbs = -0.25 + Math.sin(t * 1.4) * 0.05;
      } else if (isFront && i === 1) {
        // the other hand hangs, fingers curling and uncurling a little
        sh = 0.05 + 0.04 * Math.sin(t * 0.9); el = 0.45; out = 0.3; fingers = 0.55 + 0.3 * Math.sin(t * 2.3);
      }
      if (act === 'swing' && i === toolArm) {
        // the tool arm: wind up over the shoulder, then slash forward and down
        const k = clamp(aT / 0.26, 0, 1);
        const a = k < 0.35 ? lerp(0.2, -2.7, ease(k / 0.35)) : lerp(-2.7, 1.25, ease((k - 0.35) / 0.65));
        sh = a; el = k < 0.35 ? lerp(0.4, 1.4, k / 0.35) : lerp(1.4, 0.15, (k - 0.35) / 0.65); out = 0.15; fist = true;
      }
      if (act === 'hurt') {
        // AY!! one hand clutches her chest, the other flies out, fingers spread
        const k = Math.sin(clamp(aT / 0.5, 0, 1) * Math.PI);
        if (i === 0 && !isSide) { target = [V.anchor - 14, V.shoulders[0][1] + 24, 1]; fingers = 0.2; handAbs = -0.4; }
        else { sh = lerp(sh, -1.9, k); el = lerp(el, 1.3, k); out = (i ? 1.1 : -1.1) * k + out * (1 - k); fingers = 0.05; }
      }
      if (act === 'joy' || act === 'cry' || (act === 'swing' && i === toolArm)) { target = null; handAbs = null; }
      if (act === 'joy') { const k = Math.sin(clamp(aT / 1.2, 0, 1) * Math.PI * 0.5 + 0.25) ; sh = lerp(sh, -2.75, k); el = lerp(el, 0.35, k); out = (i ? 1.15 : -1.15) * k + out * (1 - k); fingers = 1; fist = false; }
      if (act === 'cry') { sh = 0.08 + Math.sin(t * 40 + i) * 0.025; el = 0.12; out = i ? 0.32 : -0.32; fist = true; }
      const sy0 = V.shoulders[0][1];
      if (st.fish) { target = isSide ? [V.anchor + V.face * (62 + i * 6), sy0 + 26 + i * 4, 1] : [V.anchor + (i ? 10 : -6), sy0 + 34, i ? 1 : -1]; fist = true; }
      if (st.glide) { target = [V.anchor + (i ? 84 : -84) * (isSide ? 0.3 : 1) + (isSide ? V.face * 20 : 0), sy0 - 78 + Math.sin(t * 2 + i) * 3, i ? 1 : -1]; fist = true; }
      if (st.climb) { const c = Math.sin(t * 7 + i * Math.PI) * (st.climbMove ? 1 : 0.15); target = [V.anchor + (i ? 22 : -22), sy0 - 70 - 34 * c, i ? 1 : -1]; fist = true; }
      if (st.air && act !== 'swing') { sh = -1.9; el = 0.7; out = i ? 0.7 : -0.7; fingers = 1; }
      if (st.slide) { sh = -2.2; el = 0.4; out = i ? 0.9 : -0.9; fingers = 1; }
      if (st.boat && walk < 0.05) { sh = 0.35 + 0.1 * Math.sin(t * 2 + i * 2); el = 0.4; out = (i ? 0.75 : -0.75) + 0.1 * Math.sin(t * 2); }
      P.arms.push({ sh, el, out, i, target, handAbs: fist ? null : handAbs });
      P.fingers[i] = clamp(fingers, 0, 1); P.fist[i] = fist;
    }
    // ---- body ----
    const breath = Math.sin(t * 2.1) * 0.008;
    P.body.sy = 1 + breath; P.body.sx = 1 - breath * 0.5;
    P.body.rot = (st.lean || 0) * (isSide ? 1 : 0.4) + (walk > 0.02 ? Math.sin(ph * 2) * 0.012 * walk + (isFront || isBack ? Math.sin(ph) * 0.03 * walk : -0.05 * run * fw) : 0);
    if (act === 'hurt') P.body.rot += -0.12 * Math.sin(clamp(aT / 0.5, 0, 1) * Math.PI) * (isSide ? fw : 1);
    if (act === 'cry') P.body.x += Math.sin(t * 46) * 1.2;
    if (act === 'joy') P.body.y -= 28 * Math.max(0, Math.sin(clamp((aT - 0.15) / 0.5, 0, 1) * Math.PI));
    P.sway = st.sway || 0;
    P.face = st.face && st.faceT > 0 ? st.face : null;
    P.blink = !!st.blink;
    P.climb = !!st.climb;
    // ---- solve the joints ----
    solve(P, st);
    return P;
  }

  function solve(P, st) {
    const V = P.V, view = P.view, fw = V.face < 0 ? -1 : 1;
    const isSide = view === 'side', isFront = view === 'front' || view === 'threeQ', isBack = view === 'back';
    const depth = isSide ? 1 : view === 'threeQ' ? 0.55 : 0.18;   // how much of a swing shows sideways
    let lowest = -1e9;
    P.L = P.legs.map((g, i) => {
      const h = V.hips[i];
      // in front and back views the stride goes toward/away from you: show it as
      // foreshortening (shorter, raised legs) and a small sideways knee
      const tx = Math.sin(g.thigh) * depth * fw, ty = Math.cos(g.thigh * (isSide ? 1 : 0.85));
      const knee = [h[0] + V.thigh * tx + (isSide ? 0 : (i ? 1 : -1) * g.lift * 4), h[1] + V.thigh * ty];
      const sa = g.thigh - g.knee;
      const sx = Math.sin(sa) * depth * fw, sy = Math.cos(isSide ? sa : sa * 0.7);
      const ankle = [knee[0] + V.shin * sx, knee[1] + V.shin * Math.max(0.35, sy)];
      lowest = Math.max(lowest, ankle[1]);
      return { hip: h, knee, ankle, foot: g.foot, lift: g.lift, i };
    });
    // keep the lowest foot on the ground: the body bobs naturally as she walks
    const groundAnkle = V.ground - V.footH;
    const dy = st.air || st.glide || st.climb || st.slide ? 0 : groundAnkle - lowest;
    P.body.y += dy;
    for (const l of P.L) { l.hip = [l.hip[0], l.hip[1] + dy]; l.knee[1] += dy; l.ankle[1] += dy; }
    P.A = P.arms.map((a, i) => {
      const s = V.shoulders[i] || V.shoulders[0];
      const sh = [s[0], s[1] + P.body.y];
      if (a.target) {
        // two-bone reach: put the hand on the target, the elbow bent outward
        const tx = a.target[0], ty = a.target[1] + P.body.y;
        let dx = tx - sh[0], dy = ty - sh[1], d = Math.hypot(dx, dy);
        const maxd = V.upper + V.fore - 1; if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
        const a0 = Math.atan2(dy, dx);
        const cosA = clamp((V.upper * V.upper + d * d - V.fore * V.fore) / (2 * V.upper * d), -1, 1);
        const bend = (a.target[2] || 1) * Math.acos(cosA);
        const elbow = [sh[0] + Math.cos(a0 + bend) * V.upper, sh[1] + Math.sin(a0 + bend) * V.upper];
        const wrist = [sh[0] + dx, sh[1] + dy];
        return { shoulder: sh, elbow, wrist, ang: Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]), i, handAbs: a.handAbs };
      }
      // sideways reach (out) and swing (sh), foreshortened in front/back views
      const ox = Math.sin(a.out) * 1, side = isSide ? 1 : depth;
      const ux = Math.sin(a.sh) * side * fw + ox * (isSide ? 0.25 : 1), uy = Math.cos(a.sh) * (isSide ? 1 : Math.cos(Math.min(1.4, Math.abs(a.sh) * 0.9)) * (a.sh < -1.4 ? -1 : 1)) * Math.cos(a.out * 0.8);
      const elbow = [sh[0] + V.upper * ux, sh[1] + V.upper * (isSide ? Math.cos(a.sh) : Math.cos(a.sh) * Math.cos(a.out * 0.8))];
      const fa = a.sh + a.el;
      const fx = Math.sin(fa) * side * fw + ox * (isSide ? 0.15 : 0.8), fy = isSide ? Math.cos(fa) : Math.cos(fa) * Math.cos(a.out * 0.6);
      const wrist = [elbow[0] + V.fore * fx, elbow[1] + V.fore * fy];
      return { shoulder: sh, elbow, wrist, ang: Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]), i };
    });
    // the hand that holds tools: the arm behind her body
    P.toolArm = P.toolArmI;
  }

  // ---------------- drawing ----------------
  function limb(g, pts, w, skin, shade) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokeStyle = INK; g.lineWidth = w + 5.2; g.stroke();
    g.strokeStyle = skin; g.lineWidth = w; g.stroke();
    // a magenta shade down one side, like the drawing
    g.save(); g.translate(-w * 0.22, 0); g.strokeStyle = shade; g.lineWidth = w * 0.32; g.globalAlpha = 0.8; g.stroke(); g.restore();
  }
  function knee(g, p, w, skin) { g.beginPath(); g.arc(p[0], p[1], w * 0.55, 0, TAU); g.fillStyle = skin; g.fill(); }
  // a big, flat cartoon foot with five toes; dir = which way the toes point (-1 left, 1 right, 0 toward you)
  function footShape(g, a, dir, ang, V, from, behind, len = 1) {
    g.save(); g.translate(a[0], a[1] + 4); g.rotate(ang * (dir || 1)); g.scale(len, 1);
    const L = dir ? 32 : 20, Hh = 10;
    g.scale(dir < 0 ? -1 : 1, 1);
    g.beginPath();
    if (dir) {
      // heel, a long sole, and a broad, rounded front where the toes spread
      g.moveTo(-8, -5); g.quadraticCurveTo(-11, 7, -3, 8); g.lineTo(L - 6, 9); g.quadraticCurveTo(L + 3, 8, L + 1, 0); g.quadraticCurveTo(L - 3, -7, 8, -6); g.closePath();
    } else {
      g.ellipse(0, 3, 12, Hh, 0, 0, TAU);
    }
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.fillStyle = V.skin; g.fill();
    if (!behind) {
      g.lineWidth = 1.6; g.strokeStyle = V.shade;
      if (dir) for (let k = 0; k < 4; k++) { const x = L - 2 - k * 4.4; g.beginPath(); g.moveTo(x, 9); g.lineTo(x - 0.8, 4); g.stroke(); }
      else for (let k = 0; k < 4; k++) { const x = -7 + k * 4.6; g.beginPath(); g.moveTo(x, 10.5); g.lineTo(x, 7); g.stroke(); }
    }
    g.restore();
  }
  // a cartoon hand: palm and curling fingers, or a fist
  function hand(g, w, ang, curl, fist, V, big) {
    g.save(); g.translate(w[0], w[1]); g.rotate(ang - Math.PI / 2);
    const s = big ? 1.15 : 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (fist) {
      g.beginPath(); g.ellipse(0, 4 * s, 6.4 * s, 6.8 * s, 0, 0, TAU);
      g.lineWidth = 4.6; g.strokeStyle = INK; g.stroke(); g.fillStyle = V.skin; g.fill();
      g.lineWidth = 1.3; g.strokeStyle = V.shade;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-4 + k * 3.5, 8.5 * s); g.lineTo(-3.4 + k * 3.5, 6 * s); g.stroke(); }
    } else {
      // four thin fingers and a thumb, curling by `curl`
      const fingers = [[-4.2, 1], [-1.4, 1.1], [1.4, 1.05], [4, 0.9]];
      const len = 9 * s;
      g.lineWidth = 6.2; g.strokeStyle = INK;
      const tips = fingers.map(([x, k]) => { const c = curl * 1.3; return [[x * s, 4 * s], [x * s * 1.1, 4 * s + len * k * Math.cos(c * 0.6)], [x * s * 1.1 - Math.sin(c) * 3, 4 * s + len * k * (Math.cos(c * 0.6) + Math.cos(c) * 0.6)]]; });
      for (const f of tips) { g.beginPath(); g.moveTo(f[0][0], f[0][1]); g.quadraticCurveTo(f[1][0], f[1][1], f[2][0], f[2][1]); g.stroke(); }
      g.beginPath(); g.moveTo(-5 * s, 2 * s); g.quadraticCurveTo(-9 * s, 6 * s, -8.4 * s, 9 * s); g.stroke();
      g.beginPath(); g.ellipse(0, 3 * s, 5.4 * s, 4.6 * s, 0, 0, TAU); g.lineWidth = 4.4; g.stroke(); g.fillStyle = V.skin; g.fill();
      g.lineWidth = 2.6; g.strokeStyle = V.skin;
      for (const f of tips) { g.beginPath(); g.moveTo(f[0][0], f[0][1]); g.quadraticCurveTo(f[1][0], f[1][1], f[2][0], f[2][1]); g.stroke(); }
      g.beginPath(); g.moveTo(-5 * s, 2 * s); g.quadraticCurveTo(-9 * s, 6 * s, -8.4 * s, 9 * s); g.stroke();
    }
    g.restore();
  }

  // ---- the traced pieces ----
  const PIECES = () => SW.ENE_LIMBS && SW.ENE_LIMBS.pieces;
  function pieceImg(k, behind) {
    const im = SW.ENE_LIMB_IMG && SW.ENE_LIMB_IMG[k];
    if (!im || !im.complete || !im.naturalWidth) return null;
    if (!behind) return im;
    // the limb on the far side of her body, a shade darker
    const key = k + '|far';
    if (!tintCache[key]) {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(70,20,80,0.2)'; x.fillRect(0, 0, c.width, c.height);
      tintCache[key] = c;
    }
    return tintCache[key];
  }
  const tintCache = {};
  // lay piece k on the bone p -> q: its joint a on p, joint b on q (stretched along the bone only)
  function bone(g, k, p, q, behind, mirror) {
    const m = PIECES()[k], im = pieceImg(k, behind);
    if (!m || !im) return false;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), L0 = m.b[1] - m.a[1];
    g.save(); g.translate(p[0], p[1]); g.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]) - Math.PI / 2);
    if (mirror) g.scale(-1, 1);
    g.scale(1, Math.max(0.3, L / L0));
    g.drawImage(im, -m.a[0], -m.a[1], m.w, m.h);
    g.restore();
    return true;
  }
  // a hand or foot: joint a on p, its length pointing along `ang`
  function part(g, k, p, ang, behind, mirror, sx = 1) {
    const m = PIECES()[k], im = pieceImg(k, behind);
    if (!m || !im) return false;
    g.save(); g.translate(p[0], p[1]); g.rotate(ang - Math.PI / 2);
    g.scale((mirror ? -1 : 1) * sx, 1);
    g.drawImage(im, -m.a[0], -m.a[1], m.w, m.h);
    g.restore();
    return true;
  }
  // a rounded joint under the pieces, so a bent elbow or knee shows a smooth corner
  // in the drawing's pen line; `out` limits the ink to the outer side (shoulders)
  function cap(g, p, r, skin, out) {
    g.beginPath(); g.arc(p[0], p[1], r + 1.6, 0, TAU); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fillStyle = skin; g.fill();
  }
  // her shoulders: round and bare above the tube dress. Drawn behind the body, so the
  // drawing's own chest and neck cover the inside and the pen line shows only around
  // the outside, running on into the arm.
  function drawShoulders(g, P) {
    const M = PIECES();
    if (!M || !pieceImg('upperArm') || P.view === 'side') return;
    const V = P.V, r = M.upperArm.ra + 1.2;
    for (const a of P.A) {
      const s = a.shoulder, dx = s[0] < V.anchor ? -1 : 1;
      // a deltoid: the round cap, joined back toward the neck
      g.beginPath();
      g.moveTo(V.anchor + dx * 8, s[1] - r * 1.9);
      g.quadraticCurveTo(s[0] - dx * 1, s[1] - r * 1.5, s[0] + dx * r * 0.55, s[1] - r * 0.3);
      g.arc(s[0], s[1], r, dx > 0 ? -0.4 : Math.PI + 0.4, dx > 0 ? 1.4 : Math.PI - 1.4, dx < 0);
      g.lineTo(V.anchor, s[1] + 4); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke();
      g.fillStyle = V.skin; g.fill();
    }
  }
  function drawLegTraced(g, l, P, behind) {
    const V = P.V, view = P.view, i = view === 'side' ? 0 : l.i, M = PIECES();
    const th = `thigh_${view}_${i}`, sh = `shin_${view}_${i}`, ft = `foot_${view}_${i}`;
    if (!M || !M[th] || !pieceImg(th)) return false;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    cap(g, l.knee, Math.min(M[th].rb, M[sh].ra) - 2.4, skin);
    bone(g, th, l.hip, l.knee, behind);
    bone(g, sh, l.knee, l.ankle, behind);
    // the foot rolls with the step; side-on it pitches, from the front it barely turns
    const roll = l.foot * (view === 'side' ? 1 : 0.25) * (V.face < 0 ? -1 : 1);
    part(g, ft, l.ankle, Math.PI / 2 + roll, behind, false);
    return true;
  }
  function drawArmTraced(g, a, P, behind) {
    const V = P.V, M = PIECES();
    if (!M || !pieceImg('upperArm')) return false;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    cap(g, a.elbow, Math.min(M.upperArm.rb, M.foreArm.ra) - 2.4, skin);
    // mirror the left and right arms in the front and back views, so both thumbs sit the same way
    const mir = P.view !== 'side' && a.i === 1;
    bone(g, 'upperArm', a.shoulder, a.elbow, behind, mir);
    bone(g, 'foreArm', a.elbow, a.wrist, behind, mir);
    // the drawn hand, open and relaxed, or the drawn fist; it bends a little at the wrist
    const fist = P.fist[a.i];
    const bend = (fist ? 0.25 : -0.12 + 0.25 * (P.fingers[a.i] - 0.4)) * (mir ? -1 : 1) * (P.view === 'side' ? (V.face < 0 ? 1 : -1) : 1);
    // a hand laid flat (on her chest) is placed by its own angle; otherwise it follows the forearm
    part(g, fist ? 'fist' : 'hand', a.wrist, a.handAbs != null ? a.handAbs : a.ang + bend, behind, a.handAbs != null ? true : mir);
    return true;
  }

  function drawLeg(g, l, P, behind) {
    if (drawLegTraced(g, l, P, behind)) return;
    const V = P.V, view = P.view;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    const W = 9.5;
    limb(g, [l.hip, l.knee, l.ankle], W, skin, V.shade);
    knee(g, l.knee, W, skin);
    const dir = view === 'side' ? (V.face < 0 ? -1 : 1) : view === 'threeQ' ? (l.i === 0 ? -1 : 1) : view === 'front' ? (l.i === 0 ? -1 : 1) : 0;
    // front: toes turned out to the sides, like the sheet; 3/4: the far foot shorter
    const splay = view === 'front' ? 0.12 : view === 'threeQ' ? (l.i ? 0.5 : 0.1) : 0;
    footShape(g, l.ankle, dir, l.foot * (view === 'side' ? 1 : 0.3) + splay * (dir || 0), V, l.knee, view === 'back', view === 'threeQ' && l.i ? 0.6 : view === 'front' ? 0.82 : 1);
  }
  function drawArm(g, a, P, behind) {
    if (drawArmTraced(g, a, P, behind)) return;
    const V = P.V;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    limb(g, [a.shoulder, a.elbow, a.wrist], 8, skin, V.shade);
    hand(g, a.wrist, a.ang, P.fingers[a.i], P.fist[a.i], { skin, shade: V.shade }, false);
  }
  function mixRGB(c1, c2, k) {
    const p = (c) => c.startsWith('#') ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c.match(/\d+/g).map(Number);
    const a = p(c1), b = p(c2);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  }
  // the drawn body, in horizontal slices so the lower hair and dress can trail behind her
  const bodyCache = new Map();
  function bodyAt(key, src, sc) {
    const q = Math.min(1, Math.max(0.05, Math.round(sc * 40) / 40)) * 1 / SW.ENE_RIG_SCALE;
    const k = key + '|' + q;
    let c = bodyCache.get(k);
    if (!c) {
      if (bodyCache.size > 24) bodyCache.clear();
      const w = Math.max(1, Math.round(src.naturalWidth * Math.min(1, q))), h = Math.max(1, Math.round(src.naturalHeight * Math.min(1, q)));
      c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, w, h);
      bodyCache.set(k, c);
    }
    return c;
  }
  function drawBody(g, P) {
    const V = P.V, key = P.view === 'front' && P.face === 'joy' ? 'front_joy' : P.view === 'front' && P.face === 'cry' ? 'front_cry' : P.view;
    const src = SW.ENE_BODY[key];
    if (!src || !src.complete || !src.naturalWidth) return false;
    const R0 = SW.ENE_RIG_SCALE, bh = src.naturalHeight / R0, bw = src.naturalWidth / R0;
    // the drawing, resampled once to the size it is drawn at (cached), so each frame is a plain copy
    const im = bodyAt(key, src, P._s || 1), S = im.width / bw;
    const y0 = 195;
    g.save();
    g.translate(P.body.x, P.body.y);
    // lean and breathe around the hips
    const px = V.anchor, py = V.hem - 30;
    g.translate(px, py); g.rotate(P.body.rot); g.scale(P.body.sx, P.body.sy); g.translate(-px, -py);
    if (Math.abs(P.sway) < 0.04) g.drawImage(im, 0, 0, bw, bh);
    else {
      g.drawImage(im, 0, 0, im.width, (y0 + 2) * S, 0, 0, bw, y0 + 2);
      // the lower hair and dress trail in strips about 3 screen pixels tall
      const step = Math.max(4, 3 / (P._s || 1)), lap = 1.5 / (P._s || 1);
      for (let a = y0; a < bh; a += step) {
        const off = P.sway * Math.pow((a - y0) / (bh - y0) + 0.06, 1.4) * 14;
        const hh = Math.min(step + lap, bh - a);
        g.drawImage(im, 0, a * S, im.width, hh * S, off, a, bw, hh);
      }
    }
    // blink: lids drawn over the drawn eyes
    if (P.blink && !P.face && V.eyes && V.eyes.length) {
      for (const [ex, ey, rx, ry] of V.eyes) {
        g.beginPath(); g.ellipse(ex, ey, rx + 1.5, ry + 1.5, 0, 0, TAU); g.fillStyle = V.skin; g.fill();
        g.beginPath(); g.moveTo(ex - rx, ey + ry * 0.4); g.quadraticCurveTo(ex, ey + ry * 0.9, ex + rx, ey + ry * 0.4); g.lineWidth = 3; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      }
    }
    g.restore();
    return true;
  }

  // ---------------- the sticker ----------------
  const cv = document.createElement('canvas'), cg = cv.getContext('2d');
  const sk = document.createElement('canvas'), skg = sk.getContext('2d');
  // Draw Ene with her feet at (x, y) on g; `s` is screen pixels per sheet pixel.
  // opts.dpr renders the sticker at device resolution while x, y and s stay in g's units.
  function draw(g, x, y, s0, P, opts = {}) {
    const V = P.V, dpr = opts.dpr || 1, s = s0 * dpr;
    P._s = s;
    // only as big as this pose: the body plus wherever the hands and feet reach
    let x0 = Math.min(0, -Math.abs(P.sway) * 16), x1 = V.w + Math.abs(P.sway) * 16, y0 = Math.min(0, P.body.y), y1 = V.ground + 16;
    for (const j of [...P.A, ...P.L]) for (const q of [j.wrist || j.ankle, j.elbow || j.knee]) {
      x0 = Math.min(x0, q[0] - 40); x1 = Math.max(x1, q[0] + 40); y0 = Math.min(y0, q[1] - 40); y1 = Math.max(y1, q[1] + 30);
    }
    const m = ((opts.border || 3.4) * dpr + 4) / s;
    if (P.flip) { const a = V.anchor * 2 - x1, b2 = V.anchor * 2 - x0; x0 = a; x1 = b2; }
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    const w = Math.ceil((x1 - x0) * s), h = Math.ceil((y1 - y0) * s);
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); sk.width = cv.width; sk.height = cv.height; }
    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, w, h);
    cg.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    if (P.flip) { cg.translate(V.anchor * 2, 0); cg.scale(-1, 1); }
    cg.imageSmoothingEnabled = true;
    // draw order, back to front:
    //   side:  far leg, far arm, near leg, body, near arm
    //   front: legs, the tool arm (behind her), body, the chest arm
    //   back:  legs, both arms, then the body and hair over them
    let ok;
    if (P.view === 'side') {
      drawLeg(cg, P.L[1], P, true); drawArm(cg, P.A[1], P, true);
      drawLeg(cg, P.L[0], P, false);
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      drawArm(cg, P.A[0], P, false);
    } else if (P.view === 'back') {
      drawLeg(cg, P.L[0], P, false); drawLeg(cg, P.L[1], P, false);
      // on a ladder her hands reach up in front of her hair
      if (!P.climb) { drawArm(cg, P.A[0], P, false); drawArm(cg, P.A[1], P, false); }
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      if (P.climb) { drawArm(cg, P.A[0], P, false); drawArm(cg, P.A[1], P, false); }
    } else {
      drawLeg(cg, P.L[0], P, false); drawLeg(cg, P.L[1], P, false);
      drawArm(cg, P.A[1], P, false);
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      drawArm(cg, P.A[0], P, false);
    }
    if (!ok) return null;
    if (opts.raw) {
      // just the drawing, for a caller that makes its own sticker of it
      g.save(); g.drawImage(cv, 0, 0, w, h, x + (x0 - V.anchor) * s0, y + (y0 - V.ground) * s0, w / dpr, h / dpr); g.restore();
      return locate(x, y, s0, P);
    }
    // sticker border and shadow
    const b = Math.max(1.5, (opts.border || 3.4)) * dpr;
    skg.setTransform(1, 0, 0, 1, 0, 0); skg.clearRect(0, 0, w, h);
    const ns = b < 5 ? 8 : 12;      // a thin border needs fewer stamps to stay round
    for (let k = 0; k < ns; k++) { const a = (k / ns) * TAU; skg.drawImage(cv, 0, 0, w, h, Math.cos(a) * b, Math.sin(a) * b, w, h); }
    skg.globalCompositeOperation = 'source-in'; skg.fillStyle = '#ffffff'; skg.fillRect(0, 0, w, h);
    skg.globalCompositeOperation = 'source-over';
    const ox = x + (x0 - V.anchor) * s0, oy = y + (y0 - V.ground) * s0, dw = w / dpr, dh = h / dpr;
    g.save();
    if (opts.alpha !== undefined) g.globalAlpha *= opts.alpha;
    if (!opts.noShadow) { const a0 = g.globalAlpha; g.globalAlpha = a0 * 0.32; g.drawImage(sk, 0, 0, w, h, ox + 1.5, oy + 3, dw, dh); g.globalAlpha = a0; }
    g.drawImage(sk, 0, 0, w, h, ox, oy, dw, dh);
    g.drawImage(cv, 0, 0, w, h, ox, oy, dw, dh);
    if (opts.flash) { g.globalAlpha *= opts.flash; g.drawImage(sk, 0, 0, w, h, ox, oy, dw, dh); }
    g.restore();
    return locate(x, y, s0, P);
  }
  // where things are on screen, for a pose drawn with its feet at (x, y): the tool hand, the head
  function locate(x, y, s0, P) {
    const V = P.V;
    const T = (p) => { const px = P.flip ? V.anchor * 2 - p[0] : p[0]; return [x + (px - V.anchor) * s0, y + (p[1] - V.ground) * s0]; };
    const ta = P.A[P.toolArm];
    const grip = (w) => [w.wrist[0] + Math.cos(w.ang) * 12, w.wrist[1] + Math.sin(w.ang) * 12];
    return { grip: T(grip(ta)), hands: [T(P.A[0].wrist), T(P.A[1].wrist)], hand: T(ta.wrist), elbow: T(ta.elbow), head: T([V.anchor, 60 + P.body.y]), eyes: T([V.anchor, 150 + P.body.y]), top: y + (20 + P.body.y - V.ground) * s0, ang: P.flip ? Math.PI - ta.ang : ta.ang };
  }

  // ---------------- what she is doing, from a game's state ----------------
  // look(): which way she is seen, from her direction on screen (sdx right, sdy toward
  // the viewer): side-on walking across, three-quarter or front coming toward you, her
  // back going away, turned to the camera when she stands still. Keeps its memory on `p`.
  // state(): the pose request for pose(), from `p` (walkT, running, swingT, hurtT) and
  // `react` (the game's Ene reactions: face, faceT, cryT).
  const lerpE = (a, b, t) => a + (b - a) * t;
  function look(p, sdx, sdy, moving, forceBack, now, turn) {
    const dt = Math.min(0.1, Math.max(0, now - (p.eneLast === undefined ? now : p.eneLast)));
    p.eneLast = now;
    if (!p.eneView) { p.eneView = 'front'; p.eneFlip = false; p.eneIdle = 0; p.eneSpd = 0; p.eneSway = 0; p.eneHold = 0; p.eneBlink = 2; }
    const len = Math.hypot(sdx, sdy);
    let want = p.eneView, flip = p.eneFlip;
    p.eneIdle = moving ? 0 : p.eneIdle + dt;
    if (turn) { want = 'side'; flip = turn > 0; p.eneIdle = 0; p.eneView = want; p.eneFlip = flip; p.eneHold = 0; }
    else if (forceBack) { want = 'back'; flip = false; }
    else if (moving && len > 1e-3) {
      const ax = Math.abs(sdx) / len, ay = sdy / len;
      want = ay < -0.55 ? 'back' : ax > 0.8 ? 'side' : ay > 0.75 ? 'front' : 'threeQ';
      flip = sdx > 0;
    } else if (p.eneIdle > 0.7) { want = 'front'; flip = false; }
    else if (want === 'side' || want === 'threeQ') flip = p.face > 0;
    // a short hold stops her flickering between views on a diagonal
    if (want !== p.eneView || flip !== p.eneFlip) { p.eneHold += dt; if (p.eneHold > 0.08 || !moving) { p.eneView = want; p.eneFlip = flip; p.eneHold = 0; } }
    else p.eneHold = 0;
    const spdTo = moving ? (p.running ? 1.6 : 1) : 0;
    p.eneSpd = lerpE(p.eneSpd, spdTo, 1 - Math.exp(-dt * 10));
    // hair and dress trail behind her and swing back when she stops
    const across = p.eneView === 'side' || p.eneView === 'threeQ' ? 0.75 * p.eneSpd : -(len > 1e-3 ? sdx / len : 0) * 0.5 * p.eneSpd;
    p.eneSwayV = (p.eneSwayV || 0) + ((across - p.eneSway) * 60 - (p.eneSwayV || 0) * 7) * dt;
    p.eneSway += p.eneSwayV * dt;
    p.eneBlink -= dt; if (p.eneBlink < -0.12) p.eneBlink = 1.8 + Math.random() * 3;
    return dt;
  }
  function state(p, react, now, extra) {
    const e = react || {};
    const st = {
      view: p.eneView, flip: p.eneFlip, t: now, phase: p.walkT * 1.75, speed: p.eneSpd,
      sway: clamp(p.eneSway, -1.2, 1.2), blink: p.eneBlink < 0,
      lean: p.eneSpd > 1.2 ? 0.08 : 0,
    };
    if (e.cryT > 0) { st.face = 'cry'; st.faceT = 1; st.action = 'cry'; st.actionT = 0; }
    else if (e.faceT > 0 && e.face) { st.face = e.face === 'Joy' ? 'joy' : 'ay'; st.faceT = e.faceT; }
    if (!st.action && p.swingT > 0) { st.action = 'swing'; st.actionT = 0.26 * (1 - p.swingT / 0.24); }
    else if (!st.action && p.hurtT > 0) { st.action = 'hurt'; st.actionT = 0.5 * (1 - p.hurtT / 0.35); }
    else if (!st.action && e.faceT > 0 && e.face === 'Joy') { st.action = 'joy'; st.actionT = 1.6 - e.faceT; }
    return Object.assign(st, extra);
  }

  // the whole height of the character in sheet pixels (feet to hair top)
  SW.ene = {
    pose, draw, locate, look, state,
    ready: () => !!SW.ENE_BODY && [...Object.values(SW.ENE_BODY), ...Object.values(SW.ENE_LIMB_IMG || {})].every((im) => im.complete && im.naturalWidth > 0),
    get height() { if (!RIG) RIG = build(); return RIG.front.ground - 8; },
  };
  // tell the sprite sheet when her drawing has loaded, so it can remake her stickers
  if (SW.ENE_BODY) Promise.all([...Object.values(SW.ENE_BODY), ...Object.values(SW.ENE_LIMB_IMG || {})].map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())))
    .then(() => { if (SW.refreshEne) SW.refreshEne(); });
})();
