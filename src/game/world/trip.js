// A trip, assembled from the generator's plain data (src/game/proc/: generateTrip): the block
// terrain with chunk streaming (blockworld.js), the landmarks played by the painted assets
// (models.js), the finds (finds.js), the return gate home and a chime circle (the trip's light
// puzzle, src/game/play/puzzles.js createChimeRing). Critters are returned as spots: the game spawns
// them as creatures with brains (src/game/ai/), like the hub's.
import * as THREE from 'three';
import { createTextile, prepareTextileGeometry } from '../../textile.js';
import { hashString, createRng } from '../core/rng.js';
import { buildBlockWorld } from './blockworld.js';
import { KIND_ASSETS, hasModel, placeModel } from './models.js';
import { ITEM_BY_ID } from '../data/items.js';

const COLLECT_RADIUS = 0.95;

function feltMesh(geometry, color, options = {}) {
  geometry = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const n = geometry.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  geometry.setAttribute('aLocal', geometry.getAttribute('position').clone());
  return new THREE.Mesh(prepareTextileGeometry(geometry), createTextile('felt', { fuzz: 0.4, grain: 1.3, ...options }));
}

function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,236,1)');
  g.addColorStop(0.45, 'rgba(250,214,228,0.85)');
  g.addColorStop(0.8, 'rgba(206,196,242,0.5)');
  g.addColorStop(1, 'rgba(206,196,242,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.55)';
  x.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    x.beginPath();
    for (let t = 0; t < 1; t += 0.01) {
      const a = t * Math.PI * 3 + (k * Math.PI * 2) / 3;
      const r = 6 + t * 52;
      x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/** The return gate: a stitched felt arch on two stacked posts, with a soft swirl to step through. */
export function buildGate() {
  const g = new THREE.Group();
  g.name = 'gate';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.SphereGeometry(0.42 - i * 0.04, 18, 12);
      s.scale(1, 0.8, 1);
      const m = feltMesh(s, ['#e8c9b4', '#d9b8cf', '#c9d9bc'][i], { stitch: 1 });
      m.position.set(side * 1.25, 0.32 + i * 0.62, 0);
      g.add(m);
    }
  }
  const arch = new THREE.TorusGeometry(1.25, 0.24, 12, 32, Math.PI);
  const archMesh = feltMesh(arch, '#f0b9c4', { stitch: 1, stitchColor: '#fff6ea' });
  archMesh.position.y = 1.9;
  g.add(archMesh);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 40),
    new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  swirl.position.y = 1.45;
  swirl.scale.y = 1.25;
  g.add(swirl);
  g.userData.update = (t) => {
    swirl.rotation.z = -t * 0.8;
    swirl.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.1);
  };
  return g;
}

export const CHIME_COLORS = ['#f2b8c2', '#bfe0c9', '#c6c0ec', '#f6dba6'];

/** The chime circle: four felt chime stones round a mossy centre. lit(i, on) glows one. */
export function buildChimeCircle() {
  const g = new THREE.Group();
  g.name = 'chimes';
  const stones = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const geo = new THREE.CylinderGeometry(0.3, 0.38, 0.9, 16);
    geo.translate(0, 0.45, 0);
    const m = feltMesh(geo, CHIME_COLORS[i], { stitch: 1 });
    m.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
    const cap = feltMesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), CHIME_COLORS[i]);
    cap.position.y = 0.9;
    m.add(cap);
    g.add(m);
    stones.push({ mesh: m, glows: [m.material, cap.material], base: m.position.clone(), lit: 0 });
  }
  const moss = new THREE.CylinderGeometry(0.7, 0.8, 0.12, 20);
  moss.translate(0, 0.06, 0);
  g.add(feltMesh(moss, '#a9c48f'));
  g.userData.stones = stones;
  g.userData.lit = (i, on = 1) => { stones[i].lit = on; };
  g.userData.update = (t, dt) => {
    for (const s of stones) {
      s.lit = Math.max(0, s.lit - dt * 1.6);
      for (const mat of s.glows) mat.uniforms.uEmissive.value = s.lit * 0.6;
      s.mesh.position.y = s.base.y + s.lit * 0.12;
      s.mesh.scale.setScalar(1 + s.lit * 0.08);
    }
  };
  return g;
}

/** A walkable, flat spot for the chime circle, away from spawn, finds and landmarks. */
function chimeSpot(trip, world) {
  const rng = createRng(trip.seed).fork('chimes');
  const taken = [...trip.finds, ...trip.landmarks, trip.spawn, trip.gate];
  const ok = (x, z) => {
    const k = world.kindAt(x, z);
    if (!k || k === 'water' || k === 'stream') return false;
    const h = world.heightAt(x, z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const kk = world.kindAt(x + dx, z + dz);
      if (!kk || kk === 'water' || kk === 'stream' || Math.abs(world.heightAt(x + dx, z + dz) - h) > 0.01) return false;
    }
    return taken.every((p) => Math.hypot(p.x - x, p.z - z) > 3);
  };
  const cells = [...world.columns.keys()].map((k) => k.split(',').map(Number))
    .filter(([x, z]) => {
      const d = Math.hypot(x - trip.spawn.x, z - trip.spawn.z);
      return d > 7 && d < 22 && ok(x, z);
    });
  return cells.length ? rng.pick(cells) : null;
}

/**
 * Builds the trip. `pool` is a find pool (finds.js createFindPool); `collected` an optional set of
 * find ids already taken on an earlier visit of this seed.
 */
export function buildTripWorld(trip, { pool, collected = new Set() } = {}) {
  const group = new THREE.Group();
  group.name = `trip ${trip.code}`;
  const world = buildBlockWorld({ columns: trip.columns, biome: trip.biome });
  group.add(world.group);
  const ground = (x, z) => world.heightAt(x, z);

  // Landmarks: each kind played by one of its painted assets (a stable pick per landmark).
  const landmarks = new THREE.Group();
  landmarks.name = 'landmarks';
  for (const l of trip.landmarks) {
    const options = (KIND_ASSETS[l.kind] ?? []).filter(hasModel);
    if (!options.length) continue;
    const id = options[hashString(`${trip.seed}:${l.x},${l.z}`) % options.length];
    landmarks.add(placeModel(id, { position: new THREE.Vector3(l.x, ground(l.x, l.z), l.z), height: l.scale, yaw: l.yaw ?? 0 }));
  }
  group.add(landmarks);

  // Finds.
  const finds = [];
  for (const f of trip.finds) {
    if (collected.has(f.id) || !ITEM_BY_ID[f.itemId]) continue;
    const wf = pool.get(f.itemId, ITEM_BY_ID[f.itemId].rarity);
    wf.root.position.set(f.x, ground(f.x, f.z), f.z);
    wf.data = f;
    group.add(wf.root);
    finds.push(wf);
  }

  // The return gate.
  const gate = buildGate();
  gate.position.set(trip.gate.x, ground(trip.gate.x, trip.gate.z), trip.gate.z);
  gate.rotation.y = trip.gate.yaw ?? 0;
  group.add(gate);

  // The chime circle.
  const spot = chimeSpot(trip, world);
  let chimes = null;
  if (spot) {
    chimes = buildChimeCircle();
    chimes.position.set(spot[0], ground(spot[0], spot[1]), spot[1]);
    group.add(chimes);
  }

  const interactables = [
    { id: 'gate', kind: 'gate', label: 'Go home', position: gate.position.clone().add(new THREE.Vector3(0, 1.2, 0)), radius: 2.4 },
  ];
  if (chimes) {
    chimes.userData.stones.forEach((s, i) => {
      interactables.push({ id: `chime-${i}`, kind: 'chime', index: i, label: 'Ring', position: chimes.localToWorld(s.base.clone()).add(new THREE.Vector3(0, 0.9, 0)), radius: 1.3 });
    });
  }

  const tmp = new THREE.Vector3();
  return {
    group, world, finds, gate, chimes, interactables,
    critters: trip.critters,
    heightAt: ground,
    kindAt: world.kindAt,
    walkable: (x, z) => { const k = world.kindAt(x, z); return !!k && k !== 'water' && world.heightAt(x, z) < 6; },
    spawn: {
      position: new THREE.Vector3(trip.spawn.x, ground(trip.spawn.x, trip.spawn.z), trip.spawn.z),
      yaw: trip.spawn.yaw ?? 0, pitch: -0.08,
    },
    /** Finds within reach of the feet: removed from the world and returned (the caller collects them). */
    takeNear(feet) {
      const out = [];
      for (let i = finds.length - 1; i >= 0; i--) {
        const f = finds[i];
        tmp.copy(f.root.position);
        if (Math.hypot(tmp.x - feet.x, tmp.z - feet.z) < COLLECT_RADIUS && Math.abs(tmp.y - feet.y) < 1.4) {
          finds.splice(i, 1);
          pool.release(f);
          out.push(f.data);
        }
      }
      return out;
    },
    /** Drops a new find (a puzzle's reward) at a point. */
    addFind(itemId, at, id = `reward-${itemId}`) {
      const wf = pool.get(itemId, ITEM_BY_ID[itemId].rarity);
      wf.root.position.copy(at);
      wf.data = { id, itemId, x: at.x, z: at.z };
      group.add(wf.root);
      finds.push(wf);
      return wf;
    },
    update(time, dt, feet) {
      world.update(feet, 5);
      for (const f of finds) f.update(time);
      gate.userData.update(time);
      chimes?.userData.update(time, dt);
    },
    dispose() {
      for (const f of finds) pool.release(f);
      world.dispose();
      group.removeFromParent();
    },
  };
}
