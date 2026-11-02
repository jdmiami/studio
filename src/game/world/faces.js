// Faces and feelings for the creatures: glossy button eyes with a catchlight, felt blush, a tiny
// "w" mouth, all on the front of the painted model; eyes that blink and follow you, squeeze into
// happy ^ ^ arcs when petted or after a fetch, and droop when sleepy. Emote bubbles (a felt speech
// bubble with a heart, an exclamation, zzz, a note or a question) pop up over a creature's head.
//
// Models face +Z (the brains' yaw convention); the face sits on the model's front at a fraction of
// its height (FACE_ANCHORS), measured from its bounding box, so it fits any of the painted assets.
import * as THREE from 'three';

/** Where the face sits per asset, as fractions of the model's height (y up, z out of the front). */
export const FACE_ANCHORS = {
  'dog-0': { y: 0.64, z: 0.98, spread: 0.13, eye: 0.055, blush: true, mouth: true },
  'critter-0': { y: 0.5, z: 1.0, spread: 0.19, eye: 0.075, blush: true, mouth: false },
  'critter-1': { y: 0.5, z: 1.0, spread: 0.19, eye: 0.075, blush: true, mouth: false },
  'critter-2': { y: 0.5, z: 1.0, spread: 0.19, eye: 0.075, blush: true, mouth: false },
};

/** Which emote a creature shows for a game event (null for none). */
export function emoteFor(event, payload = {}) {
  switch (event) {
    case 'creature:petted': return 'heart';
    case 'dog:fetched': return 'heart';
    case 'dog:bark': return payload.reason === 'greet' ? 'note' : null; // fetch and pet barks already show a heart
    case 'critter:sighted': return 'heart';
    case 'critter:squeak': return 'alert';
    default: return null;
  }
}

/** The expression for a pose and a recent feeling: 'happy' | 'sleepy' | 'normal'. */
export function expressionFor(pose, happyFor = 0) {
  if (pose === 'sleep') return 'sleepy';
  if (happyFor > 0 || pose === 'wag') return 'happy';
  return 'normal';
}

const GLYPHS = { heart: '♥', alert: '!', sleep: 'z z', note: '♪', curious: '?' };
const GLYPH_COLORS = { heart: '#f0788f', alert: '#e8a03a', sleep: '#8f8fd6', note: '#6fb38a', curious: '#9a7fd0' };
const bubbleTextures = {};
function bubbleTexture(kind) {
  if (bubbleTextures[kind]) return bubbleTextures[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  // A felt bubble: cream, a soft shadow, a dashed stitch inside, a little tail.
  x.fillStyle = 'rgba(80, 50, 40, 0.22)';
  x.beginPath(); x.arc(66, 60, 46, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff7ee';
  x.beginPath(); x.arc(64, 56, 46, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(52, 96); x.lineTo(64, 120); x.lineTo(76, 96); x.fill();
  x.strokeStyle = 'rgba(190, 150, 130, 0.7)';
  x.setLineDash([7, 6]); x.lineWidth = 3;
  x.beginPath(); x.arc(64, 56, 38, 0, Math.PI * 2); x.stroke();
  x.setLineDash([]);
  x.fillStyle = GLYPH_COLORS[kind] ?? '#6b4c42';
  x.font = `900 ${kind === 'sleep' ? 40 : 58}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(GLYPHS[kind] ?? '?', 64, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bubbleTextures[kind] = t;
  return t;
}

const eyeGeo = new THREE.SphereGeometry(1, 16, 12);
const shineGeo = new THREE.SphereGeometry(1, 10, 8);
const arcGeo = new THREE.TorusGeometry(1, 0.28, 8, 16, Math.PI);
const blushGeo = new THREE.CircleGeometry(1, 20);
const mats = {
  eye: new THREE.MeshBasicMaterial({ color: '#2b211f' }),
  shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  blush: new THREE.MeshBasicMaterial({ color: '#f39aa6', transparent: true, opacity: 0.55, depthWrite: false }),
  mouth: new THREE.MeshBasicMaterial({ color: '#4a3530' }),
};

/**
 * A face on `model` (a placed painted asset, base at the origin, facing +Z), anchored by assetId.
 * Returns { group, update(dt, { pose, look: worldPoint|null }), feel(name, seconds), emote(kind) }.
 */
export function createFace(model, assetId) {
  const a = FACE_ANCHORS[assetId] ?? null; // no anchor (Mira's painted figure): a bubble only
  const group = new THREE.Group();
  group.name = 'face';
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  box.applyMatrix4(inv); // into the model's own frame
  const h = box.max.y - box.min.y;
  const r = h * (a?.eye ?? 0);
  const faceY = a ? box.min.y + h * a.y : 0;

  // Each feature sits on the painted surface: a ray from in front of the model, straight back
  // along -Z (model frame), finds where the felt is at that (x, y) and which way it faces there.
  const caster = new THREE.Raycaster();
  const toWorld = (v) => v.applyMatrix4(model.matrixWorld);
  const back = new THREE.Vector3(0, 0, -1).transformDirection(model.matrixWorld);
  const normalMat = new THREE.Matrix3();
  function surface(x, y) {
    const from = toWorld(new THREE.Vector3(x, y, box.max.z + h));
    caster.set(from, back);
    const hit = caster.intersectObject(model, true).find((i) => i.object.isMesh && !i.object.userData.face);
    if (!hit) return { z: box.max.z * (a?.z ?? 1), n: new THREE.Vector3(0, 0, 1) };
    const n = hit.face ? hit.face.normal.clone().applyMatrix3(normalMat.getNormalMatrix(hit.object.matrixWorld)).transformDirection(inv) : new THREE.Vector3(0, 0, 1);
    if (n.z < 0.2) n.set(0, 0, 1);
    return { z: hit.point.applyMatrix4(inv).z, n: n.normalize() };
  }
  const zAxis = new THREE.Vector3(0, 0, 1);
  /** Places `obj` on the surface at (x, y) of the face, `lift` out along the surface normal. */
  function stick(obj, x, y, lift) {
    const s = surface(x, faceY + y);
    obj.position.set(x, y, s.z).addScaledVector(s.n, lift);
    obj.quaternion.setFromUnitVectors(zAxis, s.n);
    obj.traverse((o) => { o.userData.face = true; });
    return s;
  }
  group.position.set(0, faceY, 0);

  const eyes = !a ? [] : [-1, 1].map((side) => {
    const g = new THREE.Group();
    const x = side * h * a.spread;
    const ball = new THREE.Mesh(eyeGeo, mats.eye);
    ball.scale.set(r * 0.85, r, r * 0.6);
    const shine = new THREE.Mesh(shineGeo, mats.shine);
    shine.scale.setScalar(r * 0.32);
    shine.position.set(-r * 0.3, r * 0.38, r * 0.5);
    const arc = new THREE.Mesh(arcGeo, mats.eye); // the happy ^ ^
    arc.scale.setScalar(r * 0.8);
    arc.position.z = r * 0.2;
    arc.visible = false;
    g.add(ball, shine, arc);
    stick(g, x, 0, -r * 0.15);
    group.add(g);
    return { g, ball, shine, arc, x, rest: g.position.clone() };
  });
  if (a?.blush) {
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(blushGeo, mats.blush);
      b.scale.setScalar(r * 0.9);
      stick(b, side * h * (a.spread + 0.09), -r * 1.3, r * 0.06);
      group.add(b);
    }
  }
  if (a?.mouth) {
    for (const side of [-1, 1]) {
      const m = new THREE.Group();
      const cup = new THREE.Mesh(arcGeo, mats.mouth);
      cup.scale.setScalar(r * 0.35);
      cup.rotation.z = Math.PI; // a cup: the two halves of the w
      m.add(cup);
      stick(m, side * r * 0.36, -r * 1.25, r * 0.04);
      group.add(m);
    }
  }
  model.add(group);

  // Emote bubble.
  const bubbleMat = new THREE.SpriteMaterial({ map: bubbleTexture('heart'), transparent: true, depthWrite: false });
  const bubble = new THREE.Sprite(bubbleMat);
  bubble.renderOrder = 10;
  bubble.visible = false;
  bubble.position.set(0, box.max.y + h * 0.35, 0);
  model.add(bubble);
  let bubbleT = 0;

  let blinkIn = 1 + Math.random() * 3;
  let blinkT = 0;
  let happy = 0;
  let sleepy = 0;
  let zzzIn = 1.5;
  const local = new THREE.Vector3();
  const look = new THREE.Vector2();

  const api = {
    group,
    /** A feeling for a while: 'happy' (^ ^). */
    feel(name, seconds = 1.6) { if (name === 'happy') happy = Math.max(happy, seconds); },
    emote(kind) {
      bubbleMat.map = bubbleTexture(kind);
      bubbleMat.needsUpdate = true;
      bubble.visible = true;
      bubbleT = 1.6;
    },
    update(dt, { pose = 'idle', look: target = null } = {}) {
      happy = Math.max(0, happy - dt);
      const expr = expressionFor(pose, happy);
      sleepy += ((expr === 'sleepy' ? 1 : 0) - sleepy) * (1 - Math.exp(-dt * 4));
      // Blinks every few seconds (a double blink now and then).
      blinkIn -= dt;
      if (blinkIn <= 0) { blinkT = 0.13; blinkIn = Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3.5; }
      blinkT = Math.max(0, blinkT - dt);
      const open = Math.min(1 - sleepy * 0.85, blinkT > 0 ? 0.08 : 1);
      // A sleeper breathes out a zzz every few seconds.
      if (expr === 'sleepy') {
        zzzIn -= dt;
        if (zzzIn <= 0 && bubbleT <= 0) { api.emote('sleep'); zzzIn = 3.5 + Math.random() * 2; }
      } else zzzIn = 1.5;
      // Eyes drift toward what the creature looks at, within the face.
      look.set(0, 0);
      if (target) {
        local.copy(target);
        group.worldToLocal(local);
        const len = Math.hypot(local.x, local.y, local.z) || 1;
        look.set(THREE.MathUtils.clamp(local.x / len, -1, 1), THREE.MathUtils.clamp(local.y / len, -1, 1));
      }
      for (const e of eyes) {
        const isHappy = expr === 'happy';
        e.ball.visible = !isHappy;
        e.shine.visible = !isHappy && open > 0.5;
        e.arc.visible = isHappy;
        e.ball.scale.y = r * Math.max(0.08, open);
        e.g.position.set(e.rest.x + look.x * r * 0.6, e.rest.y + look.y * r * 0.5, e.rest.z);
      }
      // The bubble pops in with an overshoot, floats up a little and fades.
      if (bubbleT > 0) {
        bubbleT -= dt;
        const age = 1.6 - bubbleT;
        const pop = age < 0.25 ? THREE.MathUtils.lerp(0.2, 1.15, age / 0.25) : age < 0.4 ? THREE.MathUtils.lerp(1.15, 1, (age - 0.25) / 0.15) : 1;
        bubble.scale.setScalar(h * 0.55 * pop);
        bubble.position.y = box.max.y + h * (0.35 + age * 0.12);
        bubbleMat.opacity = Math.min(1, bubbleT / 0.4);
        if (bubbleT <= 0) bubble.visible = false;
      }
    },
  };
  return api;
}
