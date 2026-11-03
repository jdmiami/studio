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

  // joints saved on the rig bench (Nov 3). The bench had each arm's shoulder swapped to
  // the other side to turn the hands round; the thumb rule now turns the hands, so the
  // shoulders are kept at the saved spots but each arm stays on its own side.
  const BENCH_TUNE = {
    front: { shoulders: [[79, 278.6], [151.9, 272.4]], upper: 48.8, fore: 74.6 },
    threeQ: { shoulders: [[60.3, 272], [121.9, 281.6]] },
    back: { shoulders: [[61.1, 287.3], [113.8, 286.8]] },
  };
  // her right (R) and left (L) arm, as arm 0 and arm 1 of each drawing. Front and 3/4 face
  // us, so her right is on our left; the back view shows her left on our left; side-on
  // she faces our left, so we see her left side: her left arm is the near one.
  const ARM_SIDE = { front: ['R', 'L'], threeQ: ['R', 'L'], back: ['L', 'R'], side: ['L', 'R'] };
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
    // hand-tuned joints override the measured ones: first the ones saved on the rig
    // bench, then anything set live (the bench itself)
    const TUNE = {};
    for (const src of [BENCH_TUNE, SW.ENE_TUNE || {}]) for (const v in src) TUNE[v] = Object.assign({}, TUNE[v], src[v]);
    for (const v in TUNE) if (out[v]) for (const k in TUNE[v]) out[v][k] = JSON.parse(JSON.stringify(TUNE[v][k]));
    return out;
  }
  let RIG = null;

  // the swing's three beats, shared by the arm, the body and the knees
  function swingCurve(aT) {
    const k = clamp(aT / 0.26, 0, 1);
    const outCubic = (x) => 1 - Math.pow(1 - x, 3);
    if (k < 0.38) { const q = ease(k / 0.38); return { sh: lerp(0.2, -2.8, q), el: lerp(0.4, 1.5, q), crouch: q, lean: -q }; }
    if (k < 0.62) { const q = outCubic((k - 0.38) / 0.24); return { sh: lerp(-2.8, 1.55, q), el: lerp(1.5, 0.05, q), crouch: 1 - 0.3 * q, lean: lerp(-1, 1.2, q) }; }
    const q = ease((k - 0.62) / 0.38);
    return { sh: lerp(1.55, 0.9, q), el: lerp(0.05, 0.3, q), crouch: 0.7 * (1 - q), lean: 1.2 * (1 - q) };
  }
  // How a tool sits in her hand: the blade points along beta; her fist wraps the handle, so
  // the hand turns at the wrist to lie square across it (whichever of the two square angles
  // bends the wrist least), and the handle's grip point is in the middle of the fist.
  const GRIP_FIST = 1.45;                              // how much bigger a gripping fist is drawn
  function toolHold(P, a, tool) {
    const V = P.V;
    const fx = P.view === 'side' ? (V.face < 0 ? -1 : 1) : (a.shoulder[0] < V.anchor ? -1 : 1);
    let beta;
    if (P.act === 'swing') { const th = swingBlade(P.actT || 0, P.view === 'side'); beta = Math.atan2(Math.sin(th), fx * Math.cos(th)); }
    else beta = a.ang - fx * (tool.off || 0.55);
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    const c1 = beta + Math.PI / 2, c2 = beta - Math.PI / 2;
    const hand = Math.abs(wrap(c1 - a.ang)) < Math.abs(wrap(c2 - a.ang)) ? c1 : c2;
    const fist = [a.wrist[0] + Math.cos(hand) * 11 * GRIP_FIST, a.wrist[1] + Math.sin(hand) * 11 * GRIP_FIST];
    return { beta, hand, fist, fx };
  }
  // where each tool is held: its grip on the handle, in sticker units from the art's
  // bottom middle (the sticker's anchor)
  const GRIP = { toolSword: [-0.5, -7], toolGemSword: [-0.5, -7], toolInkBlade: [-0.5, -7], toolAxe: [-0.5, -7], toolPick: [-0.5, -7], toolRod: [-7, -6] };
  const gripCache = new Map();
  function toolGrip(spr) {
    if (!gripCache.has(spr)) {
      const name = Object.keys(SW.sprites || {}).find((n) => SW.sprites[n] === spr);
      gripCache.set(spr, GRIP[name] || [0, -6]);
    }
    return gripCache.get(spr);
  }
  // the blade's angle through a swing (radians; 0 points forward, negative is up)
  // side-on: up-forward when ready; on the wind-up it drops (pointing down as her hand
  // passes her hip) and trails back behind her, low, never by her head; then it swings
  // through low and up into the slash. (3.53 = back, a touch down: going that way round
  // keeps the blade below her shoulders the whole wind-up.)
  const BLADE_SIDE = [[0, -1.0], [0.38, 3.53], [0.5, -0.4], [0.62, 0.5], [0.72, 0.8], [1, -0.6]];
  // from the front or behind (forward = out to her side): up, then out and down
  const BLADE_OUT = [[0, -1.2], [0.38, -1.45], [0.5, -0.9], [0.62, 0.55], [0.72, 0.85], [1, -0.4]];
  function swingBlade(aT, side) {
    const BLADE = side ? BLADE_SIDE : BLADE_OUT;
    const k = clamp(aT / 0.26, 0, 1);
    let j = 0; while (j < BLADE.length - 2 && k > BLADE[j + 1][0]) j++;
    const a = BLADE[j], b = BLADE[j + 1], q = ease(clamp((k - a[0]) / (b[0] - a[0]), 0, 1));
    return lerp(a[1], b[1], q);
  }
  // the hand's path through the swing, as offsets from the shoulder (x: + is forward,
  // y: + is down). Side-on it's a forehand arc: back behind her at the waist (wind-up),
  // down past the hip, forward and up (the slash), a little overshoot, then settle.
  // From behind: out and up, then down across her back.
  // Side-on: ready in front of her at the waist, swung back low behind her hip with the
  // arm nearly straight and angled back (wind-up, blade trailing behind her), then a fast slash forward and up, a little past, then back
  // to ready. Her far arm is behind her body, so the path keeps the sword clear of her
  // silhouette where it can.
  const SWING_SIDE = [[0, 44, 58], [0.38, -44, 98], [0.5, 30, 92], [0.62, 96, 30], [0.72, 82, 62], [1, 42, 66]];
  // From the front, three-quarter or behind: the arc stays on her own side: raised up and
  // out past her shoulder, then down to her outer hip, never across her chest or back.
  const SWING_OUT = [[0, 22, 78], [0.38, 60, -26], [0.5, 62, -2], [0.62, 44, 70], [0.72, 38, 88], [1, 22, 82]];
  function swingHand(aT, side) {
    const K = side ? SWING_SIDE : SWING_OUT, k = clamp(aT / 0.26, 0, 1);
    let j = 0; while (j < K.length - 2 && k > K[j + 1][0]) j++;
    const a = K[j], b = K[j + 1], q = ease(clamp((k - a[0]) / (b[0] - a[0]), 0, 1));
    return [lerp(a[1], b[1], q), lerp(a[2], b[2], q)];
  }
  // ---------------- the pose ----------------
  // st: { view, flip, t, phase, speed (0 idle .. 1 walk .. 1.6 run), action, actionT,
  //       face, air, climb, boat, glide, fish, lean, sway }
  function pose(st) {
    if (!RIG) RIG = build();
    let view = st.view || 'front';
    // a big reaction turns her to the camera
    if (st.face && view !== 'front' && st.faceT > 0) view = 'front';
    const V = RIG[view], P = { view, V, flip: !!st.flip, legs: [], arms: [], body: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }, fingers: [0.3, 0.3], fist: [false, false], role: ['relaxed', 'relaxed'], tool: null };
    const t = st.t || 0, sp = clamp(st.speed || 0, 0, 1.8), ph = (st.phase || 0) * TAU;
    const act = st.action, aT = st.actionT || 0;
    const fw = V.face || 1;                         // forward direction on screen (before flip)
    const isSide = view === 'side', isFront = view === 'front' || view === 'threeQ', isBack = view === 'back';
    const run = clamp((sp - 1) / 0.6, 0, 1), walk = clamp(sp, 0, 1);
    // the hand that holds the tool: the near one side-on, the viewer's left from behind, else her left
    // ---- her right and left ----
    // Arm 0/1 in each drawing is her right or her left (ARM_SIDE). A mirrored view (flip)
    // mirrors her whole, so on screen that arm then looks like her other one. She is
    // right-handed: pointing, the tool and the hand on her chest go to the arm that looks
    // like her right on screen.
    const sideOf = ARM_SIDE[view];
    const dom = sideOf.indexOf(P.flip ? 'L' : 'R');
    const toolArm = dom;
    P.toolArmI = toolArm; P.sideOf = sideOf; P.dom = dom;

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
      if (act === 'swing') { const W = swingCurve(aT); knee += 0.3 * W.crouch; thigh += (i ? 0.12 : -0.1) * W.lean * (isSide ? 1 : 0); }
      if (act === 'cry') { knee = 0.02; thigh = (i ? 0.08 : -0.08) * (isSide ? 0 : 1); }
      if (st.boat) { knee = 0.2 + 0.1 * Math.sin(t * 2 + i); }
      if (st.rest) { thigh = 0; knee = 0; foot = 0; lift = 0; }   // the rig bench: straight legs
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
      } else if (isFront && i === dom && !st.fish) {
        // the sheet's pose: her right hand pressed to her chest, fingers across it
        const m = i === 0 ? 1 : -1, S0 = V.shoulders[i];
        target = [V.anchor - 16 * m + Math.sin(t * 1.4) * 1.5, S0[1] + 26, 0]; fingers = 0.15;
        handAbs = i === 0 ? -0.25 + Math.sin(t * 1.4) * 0.05 : Math.PI + 0.25 - Math.sin(t * 1.4) * 0.05;
      } else if (isBack && i === dom && !st.fish) {
        // from behind (the sheet's back view): the same hand on her chest, hidden in
        // front of her; only the elbow shows, out to the side
        const S0 = V.shoulders[i], m = S0[0] < V.anchor ? 1 : -1;
        target = [V.anchor + m * 4, S0[1] + 30, m]; fingers = 0.15;
      } else if (isFront && i !== dom) {
        // the other hand hangs, fingers curling and uncurling a little
        sh = 0.05 + 0.04 * Math.sin(t * 0.9); el = 0.45; out = 0.3; fingers = 0.55 + 0.3 * Math.sin(t * 2.3);
      }
      if (act === 'swing' && i === toolArm) {
        // the tool arm: wind up over the shoulder, then slash forward and down
        // anticipation (wind up slowly), a fast slash that overshoots, then follow-through
        const W = swingCurve(aT);
        const o = swingHand(aT, isSide), S0 = V.shoulders[i] || V.shoulders[0];
        // forward on screen: the way she faces side-on, else out to this arm's own side
        const dx = isSide ? (V.face < 0 ? -1 : 1) : (S0[0] < V.anchor ? -1 : 1);
        target = [S0[0] + o[0] * dx, S0[1] + o[1], 0]; fist = true; handAbs = null;
      }
      if (act === 'hurt') {
        // AY!! her right hand clutches her chest; the other comes up beside her face, palm
        // out, elbow bent (side-on: up in front of her face)
        const k = Math.sin(clamp(aT / 0.5, 0, 1) * Math.PI), S0 = V.shoulders[i];
        if (i === dom) {
          if (isSide) { target = [V.anchor + V.face * 10, S0[1] + 24, 0]; handAbs = -Math.PI / 2 + V.face * 0.3; }
          else { const m = i === 0 ? 1 : -1; target = [V.anchor - 14 * m, S0[1] + 24, 0]; handAbs = i === 0 ? -0.4 : Math.PI + 0.4; }
          fingers = 0.2;
        } else {
          const outS = S0[0] < V.anchor ? -1 : 1;
          const up = isSide ? [V.anchor + V.face * 34, S0[1] - 34] : [S0[0] + outS * 26, S0[1] - 36];
          const rest = [S0[0] + (isSide ? V.face * 6 : outS * 8), S0[1] + V.upper + V.fore - 10];
          target = [lerp(rest[0], up[0], k), lerp(rest[1], up[1], k), 0]; fingers = 0.05; handAbs = null;
        }
      }
      if (act === 'joy' || act === 'cry') { target = null; handAbs = null; }
      if (act === 'joy') {
        // arms thrown up in a V, hands open, a little bounce at the top
        const k = Math.sin(clamp(aT / 1.2, 0, 1) * Math.PI * 0.5 + 0.25), S0 = V.shoulders[i] || V.shoulders[0];
        const side = isSide ? V.face : (S0[0] < V.anchor ? -1 : 1);
        const reach = Math.min(V.upper + V.fore - 6, 96);
        const up = [S0[0] + side * reach * 0.62, S0[1] - reach * 0.74 + Math.sin(t * 9 + i) * 3];
        const down = [S0[0] + side * 8, S0[1] + V.upper + V.fore - 6];
        target = [lerp(down[0], up[0], k), lerp(down[1], up[1], k), 0]; fingers = 1; fist = false; handAbs = null;
      }
      if (act === 'cry') { sh = 0.08 + Math.sin(t * 40 + i) * 0.025; el = 0.12; out = i ? 0.32 : -0.32; fist = true; }
      const sy0 = V.shoulders[0][1];
      if (st.fish) { target = isSide ? [V.anchor + V.face * (62 + i * 6), sy0 + 26 + i * 4, 1] : [V.anchor + (i ? 10 : -6), sy0 + 34, i ? 1 : -1]; fist = true; }
      if (st.glide) { target = [V.anchor + (i ? 84 : -84) * (isSide ? 0.3 : 1) + (isSide ? V.face * 20 : 0), sy0 - 78 + Math.sin(t * 2 + i) * 3, i ? 1 : -1]; fist = true; }
      if (st.climb) { const c = Math.sin(t * 7 + i * Math.PI) * (st.climbMove ? 1 : 0.15); target = [V.anchor + (i ? 22 : -22), sy0 - 70 - 34 * c, i ? 1 : -1]; fist = true; }
      if (st.air && act !== 'swing') { sh = -1.9; el = 0.7; out = i ? 0.7 : -0.7; fingers = 1; }
      if (st.slide) { sh = -2.2; el = 0.4; out = i ? 0.9 : -0.9; fingers = 1; }
      if (st.boat && walk < 0.05) { sh = 0.35 + 0.1 * Math.sin(t * 2 + i * 2); el = 0.4; out = (i ? 0.75 : -0.75) + 0.1 * Math.sin(t * 2); }
      // pointing the way (a tap or click to walk): the near arm out front at shoulder height
      const pointing = !!st.point && !act && !st.fish && !st.glide && !st.climb && i === dom;
      if (pointing) {
        const S0 = V.shoulders[i] || V.shoulders[0], f = isSide ? V.face : (S0[0] < V.anchor ? -1 : 1);
        const reach = Math.min(V.upper + V.fore - 4, 100);
        target = [S0[0] + f * reach * 0.95, S0[1] - reach * 0.18, 0]; fist = false; handAbs = null;
      }
      if (st.rest) { sh = 0; el = 0; out = 0; target = null; handAbs = null; fist = false; }   // straight arms
      P.arms.push({ sh, el, out, i, target, handAbs: fist ? null : handAbs });
      P.fingers[i] = clamp(fingers, 0, 1); P.fist[i] = fist;
      // the hand drawing for this moment
      // a fist that holds something (the tool, the rod, the leaf's stems) is the grip;
      // an empty fist (running, crying) is the plain fist
      // what the hand is doing (the picture is chosen when it's drawn, from which hand
      // this is and whether its palm or its back faces us)
      const holding = (act === 'swing' && i === toolArm) || st.fish || st.glide;
      P.role[i] = pointing ? 'point' : st.climb ? 'reach' : handAbs != null ? 'chest'
        : fist ? (holding ? 'grip' : 'fist')
        : act === 'hurt' || act === 'joy' || st.air || st.slide ? 'spread' : 'relaxed';
    }
    // ---- body ----
    const breath = Math.sin(t * 2.1) * 0.008;
    P.body.sy = 1 + breath; P.body.sx = 1 - breath * 0.5;
    P.body.rot = (st.lean || 0) * (isSide ? 1 : 0.4) + (walk > 0.02 ? Math.sin(ph * 2) * 0.012 * walk + (isFront || isBack ? Math.sin(ph) * 0.03 * walk : -0.05 * run * fw) : 0);
    if (act === 'hurt') P.body.rot += -0.12 * Math.sin(clamp(aT / 0.5, 0, 1) * Math.PI) * (isSide ? fw : 1);
    if (act === 'swing') { const W = swingCurve(aT); P.body.rot += 0.07 * W.lean * (isSide ? fw : 0.5); }
    if (act === 'cry') P.body.x += Math.sin(t * 46) * 1.2;
    if (act === 'joy') P.body.y -= 28 * Math.max(0, Math.sin(clamp((aT - 0.15) / 0.5, 0, 1) * Math.PI));
    P.sway = st.sway || 0;
    P.face = st.face && st.faceT > 0 ? st.face : null;
    P.blink = !!st.blink;
    P.climb = !!st.climb;
    P.act = act || null; P.actT = aT;
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
        // The elbow only bends one way. Side-on (the drawing faces left) the forearm folds
        // forward, so the elbow sits behind the shoulder-to-hand line. From the front, the
        // back and three-quarter, the elbow points out, away from her body.
        const b0 = Math.acos(cosA);
        let bend;
        if (isSide) bend = -b0;
        else {
          const out = s[0] < V.anchor ? -1 : 1;
          bend = Math.cos(a0 + b0) * out >= Math.cos(a0 - b0) * out ? b0 : -b0;
        }
        const elbow = [sh[0] + Math.cos(a0 + bend) * V.upper, sh[1] + Math.sin(a0 + bend) * V.upper];
        const wrist = [sh[0] + dx, sh[1] + dy];
        return { shoulder: sh, elbow, wrist, ang: Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]), i, handAbs: a.handAbs };
      }
      if (!isSide && Math.abs(a.sh) < 1.25) {
        // a stride from the front, back or three-quarter. A real swing goes toward and away
        // from us; drawn that way the arm just shrinks, so it is drawn as a gentle swing on
        // screen instead (toward where she walks in three-quarter; in toward her middle as it
        // comes forward from the front), the arm keeping its length.
        const outS = s[0] < V.anchor ? -1 : 1;
        const fwd = view === 'threeQ' ? (V.face < 0 ? -1 : 1) : -outS;
        const k1 = view === 'threeQ' ? 0.42 : 0.12;
        const upA = a.out * 0.9 + fwd * a.sh * k1;                 // from straight down, + toward screen right
        const elbow = [sh[0] + V.upper * Math.sin(upA), sh[1] + V.upper * Math.cos(upA) * (1 - 0.12 * Math.sin(a.sh) ** 2)];
        // the elbow bends forward: from the front the forearm comes up in toward her middle
        const foA = upA + (view === 'threeQ' ? fwd * 0.75 : -outS * 0.3) * a.el;
        // from the front a bent elbow brings the hand up toward us: the forearm looks shorter
        const wrist = [elbow[0] + V.fore * Math.sin(foA), elbow[1] + V.fore * Math.cos(foA) * (1 - (view === 'threeQ' ? 0.15 : 0.25) * Math.sin(Math.min(a.el, 1.5)) ** 2)];
        return { shoulder: sh, elbow, wrist, ang: Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]), i };
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
  // ---- mesh limbs: one traced strip, bent smoothly at the joint ----
  // The strip runs from joint a (shoulder / hip) through j (elbow / knee) to b (wrist /
  // ankle). It is cut into rows of triangles; each vertex follows the upper bone, the
  // lower bone, or a smooth blend of both near the joint (linear blend skinning), so a
  // bend keeps the drawing's own outline instead of hinging two pictures.
  function meshRows(m) {
    const y0 = m.a[1], yj = m.j[1], y1 = m.b[1], band = Math.min(yj - y0, y1 - yj) * 0.24;
    // away from the joint a row follows one bone exactly, so it needs no subdivision
    const rows = [0, yj - band, yj - band * 0.5, yj, yj + band * 0.5, yj + band, m.h];
    return { rows: rows.filter((v, i) => i === 0 || v > rows[i - 1] + 0.01), band };
  }
  function triAffine(g, im, s0, s1, s2, d0, d1, d2, grow) {
    // expand the destination triangle a hair, so neighbours overlap instead of leaving seams
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
    const ex = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * grow, p[1] + dy / l * grow]; };
    const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
    const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(den) < 1e-6) return;
    const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
    const b = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
    const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
    const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
    const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - d * s0[1];
    g.save();
    g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]); g.closePath(); g.clip();
    g.transform(a, b, c, d, e, f);
    g.drawImage(im, 0, 0);
    g.restore();
  }
  function meshLimb(g, k, p0, p1, p2, behind, mirror, P) {
    const M = PIECES(), m = M && M[k], im = pieceImg(k, behind);
    if (!m || !m.j || !im) return false;
    const ax = m.a[0], y0 = m.a[1], yj = m.j[1], y1 = m.b[1];
    const bone = (p, q, len) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1e-3;
      return { p, u: [dx / l, dy / l], n: [dy / l, -dx / l], s: l / len };
    };
    const B1 = bone(p0, p1, yj - y0), B2 = bone(p1, p2, y1 - yj);
    const { rows, band } = meshRows(m);
    const sgn = mirror ? -1 : 1;
    const map = (x, y) => {
      const side = (x - ax) * sgn;
      const a1 = (y - y0) * B1.s, a2 = (y - yj) * B2.s;
      const q1 = [B1.p[0] + B1.u[0] * a1 + B1.n[0] * side, B1.p[1] + B1.u[1] * a1 + B1.n[1] * side];
      const q2 = [B2.p[0] + B2.u[0] * a2 + B2.n[0] * side, B2.p[1] + B2.u[1] * a2 + B2.n[1] * side];
      let w = clamp((y - (yj - band)) / (2 * band), 0, 1); w = w * w * (3 - 2 * w);
      return [q1[0] + (q2[0] - q1[0]) * w, q1[1] + (q2[1] - q1[1]) * w];
    };
    // nearly straight: one plain copy, no triangles
    if (B1.u[0] * B2.u[0] + B1.u[1] * B2.u[1] > 0.9995 && Math.abs(B1.s - B2.s) < 0.02) {
      g.save(); g.transform(B1.n[0] * sgn, B1.n[1] * sgn, B1.u[0] * B1.s, B1.u[1] * B1.s, B1.p[0], B1.p[1]);
      g.drawImage(im, -ax, -y0); g.restore();
      return true;
    }
    const grow = 0.7 / (P._s || 1);
    const xs = [0, m.w];
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r], yb = rows[r + 1];
      for (let c = 0; c < xs.length - 1; c++) {
        const s00 = [xs[c], ya], s10 = [xs[c + 1], ya], s01 = [xs[c], yb], s11 = [xs[c + 1], yb];
        const d00 = map(...s00), d10 = map(...s10), d01 = map(...s01), d11 = map(...s11);
        triAffine(g, im, s00, s10, s11, d00, d10, d11, grow);
        triAffine(g, im, s00, s11, s01, d00, d11, d01, grow);
      }
    }
    return true;
  }
  // ---- her hands, drawn in code ----
  // Each hand is drawn as a real right or left hand, seen from its palm or its back, in her
  // pink with her pen line. Local frame: the wrist at (0, 0), the fingers pointing to +y.
  //  * The thumb's side: a right hand seen from the back, fingers down, has its thumb on our
  //    right; seen from the palm, on our left; a left hand the other way round.
  //  * Fingers curl toward the palm. Each finger has three bones; as it bends, a bone's
  //    on-screen length shrinks by the cosine of its angle, and past 90 degrees it folds back
  //    toward the wrist. Folding toward the palm means toward us when we see the palm (drawn
  //    over it) and away from us when we see the back (hidden behind it, so only the
  //    knuckles show).
  //  * Seen from the back: knuckles and fingernails. From the palm: creases, no nails.
  const HP = 14, HW = 15;                              // palm length (wrist to knuckles), knuckle width
  // index, middle, ring, little: across the hand from the thumb side, and length
  const FINGERS = [[0.36, 18], [0.12, 20], [-0.12, 19], [-0.36, 15]];
  const JOINT = [1.55, 1.75, 1.2];                     // a full fist: knuckle, middle and end joints
  const BONE = [0.45, 0.32, 0.23];
  // how curled each finger is (0 straight .. 1 fist), how far apart they fan, the thumb's place
  const HPOSE = {
    relaxed: { curl: [0.22, 0.26, 0.3, 0.34], fan: 0.05, thumb: 'side' },
    spread: { curl: [0, 0, 0.02, 0.05], fan: 0.2, thumb: 'out' },
    flat: { curl: [0.06, 0.05, 0.07, 0.1], fan: 0.02, thumb: 'along' },
    fist: { curl: [1, 1, 1, 1], fan: 0, thumb: 'tuck' },
    grip: { curl: [0.86, 0.88, 0.88, 0.86], fan: 0, thumb: 'tuck' },
    point: { curl: [0, 1, 1, 1], fan: 0, thumb: 'tuck' },
    reach: { curl: [0.55, 0.58, 0.6, 0.62], fan: 0.1, thumb: 'oppose' },
  };
  function tube(g, pts, w, skin) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.strokeStyle = INK; g.lineWidth = w + 2.3; g.stroke();
    g.strokeStyle = skin; g.lineWidth = w; g.stroke();
  }
  function drawHandVec(g, p, ang, side, face, pose, skin, shade) {
    const H = HPOSE[pose] || HPOSE.relaxed;
    const s = (side === 'R' ? 1 : -1) * (face === 'back' ? 1 : -1);   // which side the thumb is on (+x or -x)
    const palmUp = face === 'palm';
    g.save(); g.translate(p[0], p[1]); g.rotate(ang - Math.PI / 2);
    const front = [], behind = [];                    // things drawn over / under the palm
    // ---- fingers ----
    FINGERS.forEach(([fx, len], k) => {
      const x0 = s * fx * HW, a0 = s * H.fan * (1.5 - k);
      let x = x0, y = HP - 1, beta = 0;
      const pts = [[x, y]], back = [];
      for (let b = 0; b < 3; b++) {
        beta += JOINT[b] * H.curl[k];
        const L = len * BONE[b], c = Math.cos(beta);
        x += Math.sin(a0) * L * Math.abs(c); y += Math.cos(a0) * L * c;
        pts.push([x, y]);
      }
      const curled = H.curl[k] > 0.5;
      const w = 4.1 - k * 0.25;
      const item = { k, pts, w, curled, tipOut: Math.cos(beta) > 0.45 };
      if (curled && !palmUp) behind.push(item); else front.push(item);
    });
    // ---- thumb ----
    const tb = [s * 6.6, 4.5];
    const T = {
      side: [[s * 9, 10], [s * 9.5, 16]], out: [[s * 11.5, 8], [s * 15, 12.5]], along: [[s * 8.2, 10.5], [s * 8.4, 16.5]],
      oppose: [[s * 9.5, 11], [s * 6.5, 18]],
      tuck: palmUp ? [[s * 5.5, 13], [s * -0.5, 17.5]] : [[s * 7.4, 11.5], [s * 5.5, 16.5]],
    }[H.thumb];
    const thumb = { pts: [tb, T[0], T[1]], w: 4.6 };
    // the thumb grows from the palm side, so from the back it sits under the palm and fingers
    const thumbBehind = !palmUp;
    // ---- draw: what's behind the palm, the palm, then what's in front ----
    for (const f of behind) tube(g, f.pts, f.w, skin);
    if (thumbBehind) {
      tube(g, thumb.pts, thumb.w, skin);
      if (H.thumb !== 'tuck') {
        const [ax, ay] = thumb.pts[1], [bx, by] = thumb.pts[2], an = Math.atan2(by - ay, bx - ax);
        g.save(); g.translate(bx - Math.cos(an) * 1.7, by - Math.sin(an) * 1.7); g.rotate(an);
        g.beginPath(); g.ellipse(0, 0, 1.7, 1.4, 0, 0, TAU); g.fillStyle = '#fbd2f6'; g.fill(); g.lineWidth = 0.7; g.strokeStyle = INK; g.stroke();
        g.restore();
      }
    }
    // the palm: narrow at the wrist, widest at the knuckles, a pad of muscle below the thumb
    g.beginPath();
    g.moveTo(-5.2, -1);
    g.lineTo(5.2, -1);
    g.quadraticCurveTo(s > 0 ? 9.5 : 7.4, 6, (HW / 2 + 0.6), HP - 2);
    g.quadraticCurveTo(HW / 2 + 0.4, HP + 2.4, 0, HP + 2);
    g.quadraticCurveTo(-HW / 2 - 0.4, HP + 2.4, -(HW / 2 + 0.6), HP - 2);
    g.quadraticCurveTo(s < 0 ? -9.5 : -7.4, 6, -5.2, -1);
    g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 2.3; g.strokeStyle = INK; g.stroke(); g.fillStyle = skin; g.fill();
    // the little-finger edge in her magenta shade
    g.lineCap = 'round'; g.strokeStyle = shade; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-s * 5, 1.5); g.quadraticCurveTo(-s * 7.6, 7, -s * 7.4, HP - 1.5); g.stroke();
    if (palmUp) {
      // palm creases
      g.strokeStyle = INK; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(s * 4.5, 3.5); g.quadraticCurveTo(s * 1.5, 7.5, s * 3, 11.5); g.stroke();
      g.beginPath(); g.moveTo(-s * 6, 8.5); g.quadraticCurveTo(-s * 1, 7.5, s * 2.5, 9.5); g.stroke();
    } else {
      // tendons fanning to the knuckles
      g.strokeStyle = shade; g.lineWidth = 0.8;
      for (const [fx] of FINGERS) { g.beginPath(); g.moveTo(s * fx * 6, 3.5); g.lineTo(s * fx * HW * 0.95, HP - 3.5); g.stroke(); }
    }
    for (const f of front) {
      tube(g, f.pts, f.w, skin);
      // knuckle creases across each joint
      g.strokeStyle = INK; g.lineWidth = 0.75;
      for (let b = 1; b < 3; b++) {
        const [ax, ay] = f.pts[b], [bx, by] = f.pts[b + 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
        if (l < 1.2) continue;
        const nx = -dy / l, ny = dx / l, cx = ax + dx * 0.08, cy = ay + dy * 0.08;
        g.beginPath(); g.moveTo(cx - nx * f.w * 0.32, cy - ny * f.w * 0.32); g.lineTo(cx + nx * f.w * 0.32, cy + ny * f.w * 0.32); g.stroke();
      }
      // a fingernail at the tip, only on the back of the hand and only if the tip points out
      if (!palmUp && f.tipOut) {
        const [ax, ay] = f.pts[2], [bx, by] = f.pts[3], an = Math.atan2(by - ay, bx - ax);
        g.save(); g.translate(bx - Math.cos(an) * 1.6, by - Math.sin(an) * 1.6); g.rotate(an);
        g.beginPath(); g.ellipse(0, 0, 1.6, 1.25, 0, 0, TAU); g.fillStyle = '#fbd2f6'; g.fill(); g.lineWidth = 0.7; g.strokeStyle = INK; g.stroke();
        g.restore();
      }
    }
    if (!palmUp) {
      // the knuckles: a small bump where each curled finger turns under
      for (const f of behind) {
        const [x, y] = f.pts[0];
        g.beginPath(); g.arc(x, y + 1.2, f.w * 0.55, 0.1, Math.PI - 0.1); g.lineWidth = 2.1; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.arc(x, y + 0.2, f.w * 0.5, 0, TAU); g.fillStyle = skin; g.fill();
        g.lineWidth = 0.8; g.strokeStyle = shade; g.beginPath(); g.arc(x, y - 0.6, 1.1, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      }
    }
    if (!thumbBehind) {
      tube(g, thumb.pts, thumb.w, skin);
      if (!palmUp && H.thumb !== 'tuck') {
        const [ax, ay] = thumb.pts[1], [bx, by] = thumb.pts[2], an = Math.atan2(by - ay, bx - ax);
        g.save(); g.translate(bx - Math.cos(an) * 1.7, by - Math.sin(an) * 1.7); g.rotate(an);
        g.beginPath(); g.ellipse(0, 0, 1.7, 1.4, 0, 0, TAU); g.fillStyle = '#fbd2f6'; g.fill(); g.lineWidth = 0.7; g.strokeStyle = INK; g.stroke();
        g.restore();
      }
    }
    g.restore();
  }
  // which drawn pose each job uses
  const ROLE_POSE = { relaxed: 'relaxed', chest: 'flat', fist: 'fist', grip: 'grip', spread: 'spread', reach: 'reach', point: 'point' };
  // Which way a hand turns: arms relaxed, the backs of her hands face out and forward and
  // the palms in and back. So from the front we see backs, from behind palms, and side-on
  // the back of the near hand and the palm of the far one. Raised open hands (joy, AY!!)
  // show palms to whoever is in front of her and backs to whoever is behind; a hand on her
  // chest or reaching up a ladder shows its back.
  function handFace(view, i, role) {
    if (role === 'chest' || role === 'reach') return 'back';
    if (view === 'back') return role === 'spread' ? 'back' : 'palm';
    if (view === 'side') return role === 'spread' ? 'palm' : i === 0 ? 'back' : 'palm';
    return role === 'spread' ? 'palm' : 'back';
  }
  function drawLegTraced(g, l, P, behind) {
    const V = P.V, view = P.view, i = view === 'side' ? 0 : l.i, M = PIECES();
    const th = `thigh_${view}_${i}`, sh = `shin_${view}_${i}`, ft = `foot_${view}_${i}`;
    if (!M || !M[th] || !pieceImg(th)) return false;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    if (!meshLimb(g, `leg_${view}_${i}`, l.hip, l.knee, l.ankle, behind, false, P)) {
      cap(g, l.knee, Math.min(M[th].rb, M[sh].ra) - 2.4, skin);
      bone(g, th, l.hip, l.knee, behind);
      bone(g, sh, l.knee, l.ankle, behind);
    }
    // the foot rolls with the step; side-on it pitches, from the front it barely turns
    const roll = l.foot * (view === 'side' ? 1 : 0.25) * (V.face < 0 ? -1 : 1);
    part(g, ft, l.ankle, Math.PI / 2 + roll, behind, false);
    return true;
  }
  function drawArmTraced(g, a, P, behind) {
    const V = P.V, M = PIECES();
    if (!M || !pieceImg('upperArm')) return false;
    const skin = behind ? mixRGB(V.skin, '#7a3a80', 0.18) : V.skin;
    // mirror the left and right arms in the front and back views, so both thumbs sit the same way
    const mir = P.view !== 'side' && a.i === 1;
    if (!meshLimb(g, 'arm', a.shoulder, a.elbow, a.wrist, behind, mir, P)) {
      cap(g, a.elbow, Math.min(M.upperArm.rb, M.foreArm.ra) - 2.4, skin);
      bone(g, 'upperArm', a.shoulder, a.elbow, behind, mir);
      bone(g, 'foreArm', a.elbow, a.wrist, behind, mir);
    }
    // the drawn hand, open and relaxed, or the drawn fist; it bends a little at the wrist
    // ---- which way the hand faces: the thumb rule ----
    // Seen from the front, the back or three-quarter, a hand's thumb points in toward her
    // middle (and up, when the arm is held out sideways). Side-on it points forward, the
    // way she faces. Each hand drawing has its thumb on one side (THUMB); the hand is
    // mirrored whenever that side would come out the wrong way for where the arm is.
    const role = P.role[a.i] || 'relaxed', face = handFace(P.view, a.i, role);
    const fist = P.fist[a.i];
    const inward = P.view === 'side' ? (V.face < 0 ? -1 : 1) : (a.shoulder[0] < V.anchor ? 1 : -1);
    const bendSign = P.view === 'side' ? -inward : inward;
    const bend = (fist ? 0.2 : -0.1 + 0.2 * (P.fingers[a.i] - 0.4)) * bendSign;
    // a hand laid flat (on her chest) is placed by its own angle; otherwise it follows the forearm
    let ang = a.handAbs != null ? a.handAbs : a.ang + bend;
    // holding a tool, the fist turns to wrap its handle
    if (P._tool && P._holder === a.i) ang = toolHold(P, a, P._tool).hand;
    // her sheet's own relaxed hand (a left hand seen from the back) wherever it fits:
    // as drawn on her left, mirrored on her right; every other hand is drawn in code
    if (role === 'relaxed' && face === 'back' && pieceImg('hand')) part(g, 'hand', a.wrist, ang, behind, P.sideOf[a.i] !== 'L');
    else {
      // a fist round a handle is drawn bigger, so it wraps the tool (as cartoons draw them)
      const big = P._tool && P._holder === a.i ? GRIP_FIST : 1;
      g.save(); g.translate(a.wrist[0], a.wrist[1]); g.scale(big, big); g.translate(-a.wrist[0], -a.wrist[1]);
      drawHandVec(g, a.wrist, ang, P.sideOf[a.i], face, ROLE_POSE[role] || 'relaxed', skin, behind ? mixRGB(V.shade, '#3a1040', 0.15) : V.shade);
      g.restore();
    }
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
    // the face: joy or crying (front only), eyes closed for a blink, or her own drawing
    const V = P.V, key = P.view === 'front' && P.face === 'joy' ? 'front_joy' : P.view === 'front' && P.face === 'cry' ? 'front_cry'
      : P.blink && !P.face && SW.ENE_BODY[P.view + '_blink'] ? P.view + '_blink' : P.view;
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
    // room for the hair to swing and for the body to lean
    const lean = Math.abs(P.body.rot) * 260 + 6;
    let x0 = Math.min(0, -Math.abs(P.sway) * 16) - lean, x1 = V.w + Math.abs(P.sway) * 16 + lean, y0 = Math.min(0, P.body.y) - 8, y1 = V.ground + 16;
    for (const j of [...P.A, ...P.L]) for (const q of [j.wrist || j.ankle, j.elbow || j.knee]) {
      x0 = Math.min(x0, q[0] - 40); x1 = Math.max(x1, q[0] + 40); y0 = Math.min(y0, q[1] - 40); y1 = Math.max(y1, q[1] + 30);
    }
    // her gear, laid out in the drawing's own pixels, to fit the canvas around everything
    const K = (RIG.front.ground - 8) / 108;              // sticker units -> sheet pixels (she is 108 units tall)
    const props = layoutProps(P, opts, K);
    for (const pr of props) {
      // the prop's own four corners, scaled, turned and placed (in the unmirrored drawing)
      const c = Math.cos(pr.rot || 0), n = Math.sin(pr.rot || 0), sp = pr.spr;
      for (const [u, v] of [[-sp.ax, -sp.ay], [sp.w - sp.ax, -sp.ay], [-sp.ax, sp.h - sp.ay], [sp.w - sp.ax, sp.h - sp.ay]]) {
        const px = u * pr.kx * K, py = v * pr.ky * K;
        const qx = pr.x + px * c - py * n, qy = pr.y + px * n + py * c;
        x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      }
    }
    const ow = (opts.outline && opts.outline.width) || opts.border || 3.4;
    const m = ((ow * ((opts.outline && opts.outline.glow) ? 2 : 1)) * dpr + 4) / s + (opts.tool ? 60 : 0);
    if (P.flip) { const a = V.anchor * 2 - x1, b2 = V.anchor * 2 - x0; x0 = a; x1 = b2; }
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    const w = Math.ceil((x1 - x0) * s), h = Math.ceil((y1 - y0) * s);
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); sk.width = cv.width; sk.height = cv.height; }
    cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, cv.width, cv.height);
    cg.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    if (P.flip) { cg.translate(V.anchor * 2, 0); cg.scale(-1, 1); }
    cg.imageSmoothingEnabled = true;
    // draw order, back to front:
    //   side:  far leg, far arm, near leg, body, near arm
    //   front: legs, the tool arm (behind her), body, the chest arm
    //   back:  legs, both arms, then the body and hair over them
    // The tool in her hand (opts.tool: a sticker sprite and how far it tips forward of the
    // forearm) is drawn after her body and before the arm that holds it, so it always sits
    // between her body and her hand. That arm comes in front of her body while it holds it.
    const tool = opts.tool && opts.tool.spr;
    const holder = tool ? P.toolArm : -1;
    P._tool = tool ? opts.tool : null; P._holder = holder;
    const drawTool = () => {
      if (!tool) return;
      const H = toolHold(P, P.A[holder], opts.tool), spr = opts.tool.spr, gp = toolGrip(spr);
      const k = 0.72 * (RIG.front.ground - 8) / 108;   // sticker units -> sheet pixels (her height is 108 units)
      cg.save(); cg.translate(H.fist[0], H.fist[1]); cg.rotate(H.beta + Math.PI / 2);
      cg.scale(k * H.fx, k);
      cg.drawImage(spr.raw || spr.img, -spr.ax - gp[0], -spr.ay - gp[1], spr.w, spr.h);
      cg.restore();
    };


    const drawProps = (layer) => { for (const pr of props) if (pr.layer === layer) drawProp(cg, pr, P, K); };
    // draw order, back to front:
    //   side:  far leg, far arm, near leg, body, (tool, holding arm), near arm
    //   back:  legs, both arms, body (arms reaching up a ladder, or holding the tool, over it)
    //   front: legs, body, her left arm, (tool), her right arm
    let ok;
    drawProps('under');                                 // the raft, under her feet
    if (P.view !== 'back') drawProps('behind');         // the tool carried on her back
    if (P.view === 'side') {
      // the far arm is always behind her body, with anything it holds; the near arm in front
      drawLeg(cg, P.L[1], P, true);
      if (holder === 1) drawTool();
      drawArm(cg, P.A[1], P, true);
      drawLeg(cg, P.L[0], P, false);
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      if (holder === 0) drawTool();
      drawArm(cg, P.A[0], P, false);
    } else if (P.view === 'back') {
      drawLeg(cg, P.L[0], P, false); drawLeg(cg, P.L[1], P, false);
      // from behind both arms are at her sides, behind her back and hair (the swing stays
      // out to her side, so it shows); only on a ladder do her hands reach up over her hair
      const over = () => P.climb;
      drawTool();
      for (const j of [0, 1]) if (!over(j)) drawArm(cg, P.A[j], P, false);
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      drawProps('behind');                              // from behind, the carried tool is over her back
      for (const j of [0, 1]) if (over(j)) drawArm(cg, P.A[j], P, false);
    } else {
      drawLeg(cg, P.L[0], P, false); drawLeg(cg, P.L[1], P, false);
      // her right arm (on her chest, pointing, or holding the tool) in front of her body
      // both arms over her hair, as on the sheet (her left arm comes out over it); her
      // right arm (on her chest, pointing, or holding the tool) last, in front
      const fa = P.dom === undefined ? 0 : P.dom;
      drawShoulders(cg, P);
      ok = drawBody(cg, P);
      drawArm(cg, P.A[1 - fa], P, false);
      drawTool();
      drawArm(cg, P.A[fa], P, false);
    }
    drawProps('over');                                  // the leaf glider and its stems, over her head
    if (!ok) return null;
    if (opts.raw) {
      // just the drawing, for a caller that makes its own sticker of it
      g.save(); g.drawImage(cv, 0, 0, w, h, x + (x0 - V.anchor) * s0, y + (y0 - V.ground) * s0, w / dpr, h / dpr); g.restore();
      return locate(x, y, s0, P);
    }
    // sticker border and shadow
    // ---- the shared outline: one die-cut edge round her and everything she holds ----
    const O = opts.outline || {}, b = Math.max(1.5, ow) * dpr;
    const ring = (rad, color, soft) => {
      skg.setTransform(1, 0, 0, 1, 0, 0); skg.globalCompositeOperation = 'source-over'; skg.clearRect(0, 0, sk.width, sk.height);
      // a thin border needs fewer stamps to stay round; a soft halo needs only a few
      const ns = soft ? 6 : rad < 5 ? 8 : rad < 10 ? 12 : 16;
      for (let k = 0; k < ns; k++) { const a = (k / ns) * TAU; skg.drawImage(cv, 0, 0, w, h, Math.cos(a) * rad, Math.sin(a) * rad, w, h); }
      skg.drawImage(cv, 0, 0, w, h, 0, 0, w, h);
      skg.globalCompositeOperation = 'source-in'; skg.fillStyle = color; skg.fillRect(0, 0, w, h);
      skg.globalCompositeOperation = 'source-over';
    };
    const ox0 = x + (x0 - V.anchor) * s0, oy0 = y + (y0 - V.ground) * s0;
    if (O.glow) {
      // a soft halo outside the edge, in the gear's colour
      ring(b * 2.1, O.glow, true);
      g.save(); g.globalAlpha *= (O.glowAlpha || 0.55) * (opts.alpha === undefined ? 1 : opts.alpha);
      g.drawImage(sk, 0, 0, w, h, ox0, oy0, w / dpr, h / dpr); g.restore();
    }
    if (O.rim) {
      // a coloured band along the outer edge of the white
      ring(b, O.rim);
      g.save(); if (opts.alpha !== undefined) g.globalAlpha *= opts.alpha;
      g.drawImage(sk, 0, 0, w, h, ox0, oy0, w / dpr, h / dpr); g.restore();
    }
    ring(O.rim ? b * 0.68 : b, O.color || '#ffffff');
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
    if (p.pointT > 0) p.pointT -= dt;
    return dt;
  }
  function state(p, react, now, extra) {
    const e = react || {};
    const st = {
      view: p.eneView, flip: p.eneFlip, t: now, phase: p.walkT * 1.75, speed: p.eneSpd,
      sway: clamp(p.eneSway, -1.2, 1.2), blink: p.eneBlink < 0,
      lean: p.eneSpd > 1.2 ? 0.08 : 0, point: p.pointT > 0,
    };
    if (e.cryT > 0) { st.face = 'cry'; st.faceT = 1; st.action = 'cry'; st.actionT = 0; }
    else if (e.faceT > 0 && e.face) { st.face = e.face === 'Joy' ? 'joy' : 'ay'; st.faceT = e.faceT; }
    if (!st.action && p.swingT > 0) { st.action = 'swing'; st.actionT = 0.26 * (1 - p.swingT / 0.24); }
    else if (!st.action && p.hurtT > 0) { st.action = 'hurt'; st.actionT = 0.5 * (1 - p.hurtT / 0.35); }
    else if (!st.action && e.faceT > 0 && e.face === 'Joy') { st.action = 'joy'; st.actionT = 1.6 - e.faceT; }
    return Object.assign(st, extra);
  }

  // ---- her gear as layers of her sticker ----
  // Each prop is a sticker's raw art (no outline of its own), placed in the drawing's
  // pixels and drawn in her canvas at its layer, so it shares her one outline:
  //   under:  the raft, below her feet
  //   behind: the tool carried on her back (over her back when seen from behind)
  //   over:   the leaf glider over her head, held by two stems from her hands
  function layoutProps(P, opts, K) {
    const V = P.V, out = [];
    const side = P.view === 'side', back = P.view === 'back';
    if (opts.raft && opts.raft.spr) {
      const r = opts.raft;
      out.push({ layer: 'under', spr: r.spr, x: V.anchor, y: V.ground + 6 * K + (r.bob || 0) * K, rot: r.rot || 0, kx: r.kx || 1, ky: r.ky || 1 });
    }
    if (opts.carry && opts.carry.spr) {
      // the blade over a shoulder: side-on behind her (she faces left), from the front
      // over her left shoulder, from behind across her back
      const dx = side ? 9 : back ? 10 : -9, rot = side ? 0.55 : back ? 0.5 : -0.55, kx = side ? 0.8 : back ? 0.8 : -0.8;
      out.push({ layer: 'behind', spr: opts.carry.spr, x: V.anchor + dx * K, y: V.ground - 50 * K + P.body.y, rot, kx, ky: 0.8 });
    }
    if (opts.glider && opts.glider.spr) {
      const gl = opts.glider;
      out.push({ layer: 'over', spr: gl.spr, x: V.anchor, y: V.ground - 100 * K + P.body.y, rot: gl.rot || 0, kx: 0.9, ky: 0.9 * (gl.ky || 1), stems: true });
    }
    return out;
  }
  function drawProp(g, pr, P, K) {
    if (pr.stems) {
      // two leaf stems from her fists up to the leaf's middle
      g.lineCap = 'round';
      for (const [wd, col] of [[4.6, INK], [2.2, '#6fae3c']]) {
        g.lineWidth = wd; g.strokeStyle = col;
        for (const a of P.A) {
          const h = [a.wrist[0] + Math.cos(a.ang) * 10, a.wrist[1] + Math.sin(a.ang) * 10];
          g.beginPath(); g.moveTo(h[0], h[1]); g.quadraticCurveTo((h[0] + pr.x) / 2, pr.y + 30, pr.x + (h[0] - pr.x) * 0.25, pr.y + 20); g.stroke();
        }
      }
    }
    const spr = pr.spr;
    g.save(); g.translate(pr.x, pr.y); if (pr.rot) g.rotate(pr.rot); g.scale(pr.kx * K, pr.ky * K);
    g.drawImage(spr.raw || spr.img, -spr.ax, -spr.ay, spr.w, spr.h);
    g.restore();
  }

  // the whole height of the character in sheet pixels (feet to hair top)
  SW.ene = {
    pose, draw, locate, look, state,
    drawHand: drawHandVec,   // for the hand contact sheet
    // for checking: each arm's hand in a pose, as {side, onScreen, role, face, picture, mirrored}
    handInfo: (P) => P.A.map((a) => {
      const role = P.role[a.i] || 'relaxed', face = handFace(P.view, a.i, role), side = P.sideOf[a.i];
      const sheet = role === 'relaxed' && face === 'back';
      return { arm: a.i, side, onScreen: P.flip ? (side === 'R' ? 'L' : 'R') : side, role, face, picture: sheet ? 'sheet hand' : 'drawn ' + (ROLE_POSE[role] || 'relaxed'), pictureHand: sheet ? 'L' : side, mirrored: sheet && side !== 'L' };
    }),
    // the rig preview page: read the skeleton, and retune it live
    skeleton: () => { if (!RIG) RIG = build(); return RIG; },
    retune: (t) => { SW.ENE_TUNE = t; RIG = null; },
    ready: () => !!SW.ENE_BODY && [...Object.values(SW.ENE_BODY), ...Object.values(SW.ENE_LIMB_IMG || {})].every((im) => im.complete && im.naturalWidth > 0),
    get height() { if (!RIG) RIG = build(); return RIG.front.ground - 8; },
  };
  // tell the sprite sheet when her drawing has loaded, so it can remake her stickers
  if (SW.ENE_BODY) Promise.all([...Object.values(SW.ENE_BODY), ...Object.values(SW.ENE_LIMB_IMG || {})].map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())))
    .then(() => { if (SW.refreshEne) SW.refreshEne(); });
})();
