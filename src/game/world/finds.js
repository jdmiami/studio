// The finds' looks (src/game/data/items.js `look`), built as small felt objects in the painting's
// family: lathed mushrooms, pebbles and tiered domes, fuzzy poms and puffs, a felt leaf, a thread
// spool wrapped in yarn, a sewing button, a thimble and a little felt crown. A find in the world
// bobs and turns slowly, with a soft sparkle and a rarity-coloured ring under it so it reads from
// afar. Meshes are cached per item (clones share geometry and materials); a pool recycles
// world finds between trips.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextile, prepareTextileGeometry } from '../../textile.js';
import { ITEM_BY_ID, RARITY } from '../data/items.js';

const mats = {};
const mat = (key, make) => (mats[key] ??= make());
const felt = () => mat('felt', () => createTextile('felt', { fuzz: 0.35, grain: 1.4 }));
const fuzzy = () => mat('fuzzy', () => createTextile('felt', { fuzz: 0.8, grain: 2.2 }));
const yarn = () => mat('yarn', () => createTextile('yarn', { wraps: 26, fuzz: 0.2 }));
const knit = () => mat('knit', () => createTextile('knit', { knit: [16, 6], fuzz: 0.2 }));

function paint(g, color, color2 = null, split = null) {
  const a = new THREE.Color(color);
  const b = new THREE.Color(color2 ?? color);
  const pos = g.getAttribute('position');
  const data = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = split && split(pos.getX(i), pos.getY(i), pos.getZ(i)) ? b : a;
    data.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
  return g.index ? g.toNonIndexed() : g;
}
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
const mesh = (g, m) => {
  g.setAttribute('aLocal', g.getAttribute('position').clone()); // the stitch coordinates
  return new THREE.Mesh(prepareTextileGeometry(g), m);
};

/** One unit tall builders per look kind (scaled by look.scale). */
const BUILD = {
  mushroom(look) {
    const stem = paint(lathe([[0, 0], [0.16, 0], [0.13, 0.25], [0.12, 0.45], [0, 0.45]]), look.accent ?? '#f2e6d6');
    const cap = paint(lathe([[0, 0.38], [0.5, 0.42], [0.52, 0.5], [0.42, 0.7], [0.22, 0.86], [0, 0.9]]), look.color);
    const parts = [stem, cap];
    if (look.spots) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const s = new THREE.SphereGeometry(0.06, 8, 6);
        s.scale(1, 0.4, 1);
        s.translate(Math.cos(a) * 0.32, 0.72 - (i % 2) * 0.06, Math.sin(a) * 0.32);
        parts.push(paint(s, look.accent ?? '#fbf1e6'));
      }
    }
    return [mesh(mergeGeometries(parts), felt())];
  },
  stone(look) {
    const g = new THREE.SphereGeometry(0.5, 20, 14);
    g.scale(1.15, 0.62, 0.95);
    g.translate(0, 0.31, 0);
    return [mesh(paint(g, look.color), felt())];
  },
  dome(look) {
    const tiers = look.tiers ?? 1;
    const pts = [[0, 0]];
    for (let t = 0; t < tiers; t++) {
      const r = 0.5 * (1 - t * 0.22);
      const y0 = t * (0.9 / tiers);
      const y1 = (t + 1) * (0.9 / tiers);
      pts.push([r * 0.92, y0 + 0.01], [r, y0 + (y1 - y0) * 0.45], [r * 0.82, y1]);
    }
    pts.push([0.12, 0.95], [0, 1]);
    const g = lathe(pts);
    return [mesh(paint(g, look.color, look.accent, (x, y) => tiers > 1 && Math.floor(y * tiers / 0.9) % 2 === 1), felt())];
  },
  pom(look) {
    const g = new THREE.SphereGeometry(0.5, 22, 16);
    g.translate(0, 0.5, 0);
    const rainbow = ['#f1c0c8', '#f6dcaa', '#cfe6c4', '#bfe0e8', '#d6c6ec'];
    const out = paint(g, look.color, look.accent, (x, y) => (look.rainbow ? Math.floor((Math.atan2(y - 0.5, x) + 4) * 2.2) % 2 === 0 : false));
    if (look.rainbow) {
      const c = out.getAttribute('color');
      const pos = out.getAttribute('position');
      for (let i = 0; i < c.count; i++) {
        const k = Math.floor(((Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI) / (Math.PI * 2)) * rainbow.length) % rainbow.length;
        const col = new THREE.Color(rainbow[k]);
        c.setXYZ(i, col.r, col.g, col.b);
      }
    }
    return [mesh(out, fuzzy())];
  },
  puff(look) {
    const g = new THREE.IcosahedronGeometry(0.5, 3);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.08 * Math.sin(v.x * 9) * Math.sin(v.y * 7 + 1) * Math.sin(v.z * 8 + 2);
      p.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k);
    }
    g.computeVertexNormals();
    g.translate(0, 0.43, 0);
    return [mesh(paint(g, look.color), fuzzy())];
  },
  leaf(look) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.quadraticCurveTo(0.42, -0.1, 0, 0.5);
    shape.quadraticCurveTo(-0.42, -0.1, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2 + 0.25);
    g.translate(0, 0.12, 0);
    return [mesh(paint(g, look.color), felt())];
  },
  spool(look) {
    const ends = [];
    for (const y of [0, 0.82]) {
      const d = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24);
      d.translate(0, y + 0.06, 0);
      ends.push(paint(d, look.color));
    }
    const thread = new THREE.CylinderGeometry(0.32, 0.32, 0.72, 24, 1, true);
    thread.translate(0, 0.48, 0);
    return [mesh(mergeGeometries(ends), felt()), mesh(paint(thread, look.accent ?? '#e7a0a6'), yarn())];
  },
  button(look) {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 28);
    g.translate(0, 0.07, 0);
    const rim = new THREE.TorusGeometry(0.44, 0.06, 8, 28);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.15, 0);
    const holes = [];
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
      const h = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10);
      h.translate(x, 0.15, z);
      holes.push(paint(h, '#6b5a4c'));
    }
    const parts = [paint(g, look.color), paint(rim, look.accent ?? look.color), ...holes];
    const m = mesh(mergeGeometries(parts), felt());
    m.rotation.x = -0.5;
    m.position.y = 0.25;
    return [m];
  },
  thimble(look) {
    const g = lathe([[0, 0.02], [0.36, 0], [0.38, 0.1], [0.34, 0.6], [0.26, 0.78], [0.12, 0.84], [0, 0.85]]);
    return [mesh(paint(g, look.color), knit())];
  },
  crown(look) {
    const band = new THREE.CylinderGeometry(0.45, 0.42, 0.32, 28, 1, true);
    band.translate(0, 0.16, 0);
    const parts = [paint(band, look.color)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = new THREE.ConeGeometry(0.11, 0.32, 10);
      p.translate(Math.cos(a) * 0.43, 0.46, Math.sin(a) * 0.43);
      parts.push(paint(p, look.color));
      const gem = new THREE.SphereGeometry(0.06, 8, 6);
      gem.translate(Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45);
      parts.push(paint(gem, look.accent ?? '#e78a8a'));
    }
    return [mesh(mergeGeometries(parts), felt())];
  },
  critter(look) {
    const g = new THREE.SphereGeometry(0.5, 20, 14);
    g.scale(1, 0.85, 1);
    g.translate(0, 0.43, 0);
    return [mesh(paint(g, look.color), fuzzy())];
  },
};

const cache = new Map();
/** The item's model (a cached template clone), base at the origin, `look.scale` tall-ish. */
export function buildFindModel(itemId) {
  if (!cache.has(itemId)) {
    const item = ITEM_BY_ID[itemId];
    const look = item.look;
    const g = new THREE.Group();
    for (const m of (BUILD[look.kind] ?? BUILD.stone)(look)) g.add(m);
    g.scale.setScalar(look.scale);
    const holder = new THREE.Group();
    holder.add(g);
    holder.userData.itemId = itemId;
    cache.set(itemId, holder);
  }
  return cache.get(itemId).clone(true);
}

// The sparkle and the rarity ring, shared.
let sparkleMat = null;
let ringGeo = null;
const ringMats = {};
function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,250,235,1)');
  grd.addColorStop(0.25, 'rgba(255,240,210,0.55)');
  grd.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fillRect(31, 6, 2, 52);
  x.fillRect(6, 31, 52, 2);
  return new THREE.CanvasTexture(c);
}

/** A world find: the model on a ring with a sparkle; `update(t)` animates it. */
export function createWorldFind(itemId, rarity) {
  const root = new THREE.Group();
  const model = buildFindModel(itemId);
  root.add(model);
  sparkleMat ??= new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkle = new THREE.Sprite(sparkleMat);
  sparkle.scale.setScalar(0.5);
  sparkle.position.y = 0.7;
  root.add(sparkle);
  ringGeo ??= new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2);
  ringMats[rarity] ??= new THREE.MeshBasicMaterial({ color: RARITY[rarity]?.color ?? '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMats[rarity]);
  ring.position.y = 0.03;
  root.add(ring);
  const phase = Math.random() * 6;
  root.userData = { itemId, rarity };
  return {
    root,
    update(t) {
      model.position.y = 0.12 + Math.sin(t * 2 + phase) * 0.05;
      model.rotation.y = t * 0.6 + phase;
      const s = 0.38 + 0.12 * Math.sin(t * 3.1 + phase);
      sparkle.scale.setScalar(s);
      sparkle.material.rotation = t * 0.4;
      ring.scale.setScalar(1 + 0.08 * Math.sin(t * 2.4 + phase));
    },
  };
}

/** A small pool of world finds per item, reused between trips. */
export function createFindPool() {
  const free = new Map();
  return {
    get(itemId, rarity) {
      const list = free.get(itemId);
      return list?.length ? list.pop() : createWorldFind(itemId, rarity);
    },
    release(f) {
      f.root.removeFromParent();
      const id = f.root.userData.itemId;
      if (!free.has(id)) free.set(id, []);
      free.get(id).push(f);
    },
  };
}
