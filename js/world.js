// Stickerwild — procedural world: terrain, climate, biomes, objects, ground textures.
// Ground is stacked like cut cardboard: water at level 0, land at level 1,
// highlands at level 2. Each chunk keeps flat top-down textures per layer;
// the renderer extrudes them into cliffs at whatever angle the camera faces.
'use strict';
(function () {
  const { hash, fbm, makeNoise } = SW;
  const TILT = (SW.TILT = 0.625);
  const LH = (SW.LEVEL_H = 17);
  const CHUNK = (SW.CHUNK = 256);
  const STEP = 4;          // ground cell size (world units)
  const CELL = 32;         // object placement grid
  const TS = (SW.TEX_SCALE = 0.75); // ground texture pixels per world unit
  const MARGIN = (SW.TEX_MARGIN = STEP * 2); // textures overlap neighbours to hide seams

  const ISLAND_R = (SW.ISLAND_R = 30000);
  const B = (SW.BIOME = {
    DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3, MEADOW: 4, GRASS: 5, FOREST: 6, HIGH: 7, PEAK: 8, SWAMP: 9,
    DESERT: 10, TUNDRA: 11, AUTUMN: 12, MUSHROOM: 13,
  });
  SW.BIOME_NAME = ['Deep Sea', 'Sea', 'Shallows', 'Beach', 'Meadow', 'Grassland', 'Forest', 'Highlands', 'Crystal Peaks', 'Swamp', 'Desert', 'Tundra', 'Autumn Woods', 'Mushroom Grove'];
  const TOP = {
    [B.SAND]: ['#f3d58b', '#ecca7a', '#f8e0a4'],
    [B.MEADOW]: ['#a5da5e', '#98d052', '#b3e270'],
    [B.GRASS]: ['#7cc34f', '#71b946', '#88cc5a'],
    [B.FOREST]: ['#56a64c', '#4c9a43', '#61b057'],
    [B.HIGH]: ['#bdb6a4', '#b1aa97', '#c8c1b0'],
    [B.PEAK]: ['#dcd8ce', '#d0ccc1', '#e7e4dc'],
    [B.SWAMP]: ['#6e9f6a', '#64945f', '#79aa74'],
    [B.DESERT]: ['#f0c27a', '#e8b46a', '#f6d08e'],
    [B.TUNDRA]: ['#eef4f7', '#e2ebf0', '#f7fbfc'],
    [B.AUTUMN]: ['#c9a24a', '#bb9440', '#d4ae58'],
    [B.MUSHROOM]: ['#7f8fbf', '#7484b4', '#8a9acb'],
  };
  const SIDE = {
    [B.SAND]: '#d4a95d', [B.MEADOW]: '#8b6239', [B.GRASS]: '#8b6239', [B.FOREST]: '#7c5532',
    [B.HIGH]: '#8f8778', [B.PEAK]: '#a29c8f', [B.SWAMP]: '#5a5a3a', [B.DESERT]: '#c98f4a',
    [B.TUNDRA]: '#9fb3c2', [B.AUTUMN]: '#8b6239', [B.MUSHROOM]: '#5a5478',
  };
  const WATER = { [B.DEEP]: '#3b86c9', [B.WATER]: '#4f9fdb', [B.SHALLOW]: '#79c3ea' };
  SW.MAP_COLOR = ['#3b86c9', '#4f9fdb', '#79c3ea', '#f3d58b', '#a5da5e', '#7cc34f', '#4c9a43', '#b1aa97', '#e7e4dc', '#64945f', '#e8b46a', '#e2ebf0', '#c9933a', '#7484b4'];

  // What lives in the world and what it gives back.
  SW.OBJ = {
    treeRound: { hp: 4, r: 11, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop', tree: true },
    treeBlossom: { hp: 4, r: 11, tool: 'axe', drops: { wood: 2, petal: 2 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop', tree: true },
    treePine: { hp: 4, r: 10, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 0.7, sound: 'chop', tree: true },
    treePineSnow: { hp: 5, r: 10, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 0.7, sound: 'chop', tree: true },
    treeAutumn: { hp: 4, r: 11, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop', tree: true },
    treeAutumnRed: { hp: 4, r: 11, tool: 'axe', drops: { wood: 2, berry: 1 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop', tree: true },
    swampTree: { hp: 5, r: 11, tool: 'axe', drops: { wood: 3, fiber: 1 }, after: 'stump', regrow: 300, sway: 0.6, sound: 'chop', tree: true },
    giantMushroom: { hp: 4, r: 12, tool: 'axe', drops: { mushroom: 3, fiber: 1 }, regrow: 260, sway: 0.4, sound: 'rustle', tree: true, glow: '#9fe8ff' },
    cactus: { hp: 3, r: 10, drops: { fiber: 2, berry: 1 }, regrow: 240, sway: 0.15, sound: 'rustle', tree: true },
    rock: { hp: 5, r: 16, tool: 'pick', drops: { stone: 3 }, sound: 'mine', rock: true },
    rock2: { hp: 4, r: 14, tool: 'pick', drops: { stone: 2 }, sound: 'mine', rock: true },
    rockBuddy: { hp: 4, r: 14, tool: 'pick', drops: { stone: 2 }, sound: 'mine', rock: true },
    snowRock: { hp: 4, r: 14, tool: 'pick', drops: { stone: 2 }, sound: 'mine', rock: true },
    bush: { hp: 1, r: 11, drops: { berry: 2 }, after: 'bushEmpty', afterR: 11, regrow: 70, sound: 'rustle', sway: 0.5, plant: true },
    deadBush: { hp: 1, r: 0, drops: { fiber: 1, wood: 1 }, regrow: 160, sound: 'rustle', sway: 1.1, plant: true },
    crystal: { hp: 6, r: 11, tool: 'pick', needs: 'pick', drops: { gem: 2 }, sound: 'mine', rock: true, glow: '#c9b8ff' },
    flowerPink: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4, plant: true },
    sunflower: { hp: 2, r: 5, drops: { petal: 2, berry: 1 }, regrow: 160, sound: 'rustle', sway: 0.9, plant: true },
    daisy: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 100, sound: 'rustle', sway: 1.5, plant: true },
    flowerGold: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4, plant: true },
    flowerLilac: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4, plant: true },
    driftwood: { hp: 1, r: 0, drops: { wood: 2 }, regrow: 220, sound: 'chop' },
    tuft: { hp: 1, r: 0, drops: { fiber: 1 }, regrow: 90, sound: 'rustle', sway: 1.6, plant: true },
    reeds: { hp: 1, r: 0, drops: { fiber: 2 }, regrow: 120, sound: 'rustle', sway: 1.2, plant: true },
    mushroom: { hp: 1, r: 0, drops: { mushroom: 1 }, regrow: 150, sound: 'rustle', plant: true, glow: '#b8f0ff' },
    chest: { hp: 1, r: 13, chest: true, sound: 'chop' },
  };
  SW.OBJ_NAME = {
    treeRound: 'Oak', treeBlossom: 'Blossom Tree', treePine: 'Pine', treePineSnow: 'Snowy Pine', treeAutumn: 'Maple', treeAutumnRed: 'Red Maple',
    swampTree: 'Willow', giantMushroom: 'Giant Mushroom', cactus: 'Cactus', rock: 'Boulder', rock2: 'Rock', snowRock: 'Frosty Rock',
    bush: 'Berry Bush', deadBush: 'Dry Bush', crystal: 'Crystal', rockBuddy: 'Worried Rock', sunflower: 'Sunflower', daisy: 'Daisy', flowerPink: 'Flower', flowerGold: 'Flower', flowerLilac: 'Flower',
    driftwood: 'Driftwood', tuft: 'Grass', reeds: 'Reeds', mushroom: 'Mushroom', chest: 'Treasure Chest',
  };
  SW.objVerb = (type) => { const d = SW.OBJ[type]; return d.chest ? 'Open' : d.tool === 'axe' ? 'Chop' : d.tool === 'pick' ? 'Mine' : d.tree ? 'Cut' : 'Pick'; };
  SW.DENSITY = { sparse: 0.55, normal: 1, lush: 1.6 };

  class World {
    constructor(seed, density) {
      this.seed = seed;
      this.density = density || 1;
      const s = seed * 7;
      this.nE = makeNoise(s + 1); this.nC = makeNoise(s + 2); this.nM = makeNoise(s + 3);
      this.nD = makeNoise(s + 4); this.nT = makeNoise(s + 5); this.nK = makeNoise(s + 6); this.nH = makeNoise(s + 8);
      this.spawn = { x: 0, y: 0 };
      this.regionNames = new Map();
      this.chunks = new Map();
      this.removed = new Map(); // object id -> game time it was taken
      this.damage = new Map();  // object id -> hits remaining
      this.structures = [];
      this.clearings = [];      // [x, y, r]: kept free of trees and rocks (villages, cave mountains)
      this.fixed = [];          // solid colliders that aren't structures: huts, mountains
      this.nextId = 1;
      this.frozen = 0;          // 0..1, shallow water ice from snowfall
      this.regrowMul = 1;       // rain makes things grow back faster
    }

    // One huge island: a noisy coastline around the origin, inland lakes,
    // and mountain ranges from a slow ridge noise.
    elev(x, y) {
      const d = Math.hypot(x, y);
      const cn = fbm(this.nC, x / 3400, y / 3400, 3);
      const t = d / (ISLAND_R * (0.72 + cn * 0.5));
      const mask = t < 1 ? 1 - t * t * t : -(t - 1) * 3;
      const e = fbm(this.nE, x / 640, y / 640, 5);
      const mtn = fbm(this.nK, x / 2600, y / 2600, 3);
      return 0.37 + mask * 0.16 + (e - 0.5) * 0.44 + Math.max(0, mtn - 0.58) * 0.95;
    }
    moist(x, y) { return fbm(this.nM, x / 1300, y / 1300, 3); }
    // Colder in the north and up high, warmer in the south.
    temp(x, y, e) { return fbm(this.nH, x / 4600, y / 4600, 3) + y / (ISLAND_R * 3.2) - Math.max(0, e - 0.55) * 1.5; }
    classify(e, m, t) {
      if (e < 0.37) return B.DEEP;
      if (e < 0.405) return B.WATER;
      if (e < 0.425) return B.SHALLOW;
      if (e < 0.45) return t < 0.3 ? B.TUNDRA : B.SAND;
      if (e < 0.6) {
        if (t < 0.36) return B.TUNDRA;
        if (t > 0.6 && m < 0.48) return B.DESERT;
        if (m > 0.67 && e < 0.52) return B.SWAMP;
        if (m > 0.55) { if (t > 0.58 && m > 0.6) return B.MUSHROOM; if (t < 0.45) return B.AUTUMN; return B.FOREST; }
        if (m < 0.42) return B.MEADOW;
        return B.GRASS;
      }
      if (e < 0.68) return B.HIGH;
      return B.PEAK;
    }
    biomeAt(x, y) { const e = this.elev(x, y); return this.classify(e, this.moist(x, y), this.temp(x, y, e)); }
    static levelOf(b) { return b <= B.SHALLOW ? 0 : b === B.HIGH || b === B.PEAK ? 2 : 1; }
    // Danger rises the further a region is from where you washed ashore, in
    // wide rings, and always stays within the zone you are standing in.
    dangerAt(x, y) {
      const R = SW.REGION;
      const cx = (Math.floor(x / R) + 0.5) * R, cy = (Math.floor(y / R) + 0.5) * R;
      const d = 1 + Math.floor(Math.max(0, Math.hypot(cx - this.spawn.x, cy - this.spawn.y) - 1800) / 2600);
      const z = SW.zoneAt ? SW.zoneAt(this, x, y) : 0, Z = SW.ZONES;
      if (!Z) return Math.min(15, d);
      const lo = Z[z].minDanger, hi = z + 1 < Z.length ? Z[z + 1].minDanger - 1 : 15;
      return Math.max(lo, Math.min(hi, d));
    }
    inClearing(x, y) {
      for (const [cx, cy, r] of this.clearings) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
      return false;
    }
    regionAt(x, y) {
      const R = SW.REGION;
      const rx = Math.floor(x / R), ry = Math.floor(y / R), id = rx + ',' + ry;
      let name = this.regionNames.get(id);
      if (!name) { name = SW.regionName(this, rx, ry); this.regionNames.set(id, name); }
      return { id, rx, ry, name, danger: this.dangerAt(x, y) };
    }
    levelAt(x, y) { return World.levelOf(this.biomeAt(x, y)); }
    // Walkable? Shallow water counts as land once it has frozen over.
    isWater(x, y) { const e = this.elev(x, y); return e < (this.frozen > 0.5 ? 0.405 : 0.425); }
    isDeep(x, y) { return this.elev(x, y) < 0.37; }

    key(cx, cy) { return cx + ',' + cy; }
    getChunk(cx, cy) {
      const k = this.key(cx, cy);
      let ch = this.chunks.get(k);
      if (!ch) { ch = this.genChunk(cx, cy); this.chunks.set(k, ch); }
      return ch;
    }

    genChunk(cx, cy) {
      const objs = [], waves = [], puddles = [];
      const n = CHUNK / CELL;
      const seed = this.seed, D = this.density;
      for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const GX = cx * n + gx, GY = cy * n + gy;
          const r1 = hash(GX, GY, seed + 11), r2 = hash(GX, GY, seed + 12), p = hash(GX, GY, seed + 13);
          const x = (GX + 0.15 + r1 * 0.7) * CELL, y = (GY + 0.15 + r2 * 0.7) * CELL;
          if (this.inClearing(x, y)) continue;
          const e = this.elev(x, y), m = this.moist(x, y), b = this.classify(e, m, this.temp(x, y, e));
          // clusters and clearings: density swings across the map, scaled by the world setting
          const dens = fbm(this.nT, x / 300, y / 300, 2);
          const k = D * (0.55 + dens * 0.9);
          const flower = r1 < 0.33 ? 'flowerPink' : r1 < 0.66 ? 'flowerGold' : 'flowerLilac';
          let type = null;
          if (b >= B.SAND && hash(GX, GY, seed + 99) < 0.0035) type = 'chest';
          else switch (b) {
            case B.FOREST: {
              const t = (0.1 + dens * 0.3) * D;
              if (p < t) type = m > 0.66 || r2 < 0.3 ? 'treePine' : 'treeRound';
              else if (p < t + 0.05 * k) type = 'bush';
              else if (p < t + 0.07 * k) type = 'mushroom';
              else if (p < t + 0.15 * k) type = 'tuft';
              break;
            }
            case B.AUTUMN: {
              const t = (0.1 + dens * 0.28) * D;
              if (p < t) type = r2 < 0.45 ? 'treeAutumnRed' : 'treeAutumn';
              else if (p < t + 0.04 * k) type = 'bush';
              else if (p < t + 0.08 * k) type = 'mushroom';
              else if (p < t + 0.16 * k) type = 'tuft';
              break;
            }
            case B.MUSHROOM:
              if (p < 0.09 * k) type = 'giantMushroom';
              else if (p < 0.3 * k) type = 'mushroom';
              else if (p < 0.34 * k) type = 'tuft';
              break;
            case B.GRASS:
              if (p < 0.045 * k) type = 'treeRound';
              else if (p < 0.085 * k) type = 'bush';
              else if (p < 0.105 * k) type = r2 < 0.2 ? 'rockBuddy' : 'rock2';
              else if (p < 0.16 * k) type = flower;
              else if (p < 0.3 * k) type = 'tuft';
              break;
            case B.MEADOW:
              if (p < 0.025 * k) type = 'treeBlossom';
              else if (p < 0.055 * k) type = 'bush';
              else if (p < 0.065 * k) type = r2 < 0.3 ? 'rockBuddy' : 'rock2';
              else if (p < 0.085 * k) type = 'sunflower';
              else if (p < 0.12 * k) type = 'daisy';
              else if (p < 0.21 * k) type = flower;
              else if (p < 0.32 * k) type = 'tuft';
              break;
            case B.SWAMP:
              if (p < 0.09 * k) type = 'swampTree';
              else if (p < 0.24 * k) type = 'reeds';
              else if (p < 0.3 * k) type = 'mushroom';
              else if (p < 0.32 * k) type = 'bush';
              break;
            case B.DESERT:
              if (p < 0.035 * k) type = 'cactus';
              else if (p < 0.07 * k) type = 'deadBush';
              else if (p < 0.085 * k) type = 'rock2';
              break;
            case B.TUNDRA:
              if (p < 0.06 * k) type = 'treePineSnow';
              else if (p < 0.09 * k) type = 'snowRock';
              else if (p < 0.1 * k) type = 'bush';
              break;
            case B.SAND:
              if (p < 0.04 * k) type = 'driftwood';
              else if (p < 0.065 * k) type = 'rock2';
              break;
            case B.HIGH:
              if (p < 0.07 * k) type = 'rock';
              else if (p < 0.11 * k) type = 'rock2';
              else if (p < 0.15 * k) type = 'treePine';
              else if (p < 0.165 * k) type = 'crystal';
              break;
            case B.PEAK:
              if (p < 0.07 * k) type = 'crystal';
              else if (p < 0.15 * k) type = 'rock';
              else if (p < 0.2 * k) type = 'treePineSnow';
              break;
            default:
              if (b <= B.WATER && p < 0.3) waves.push([x, y, r1 * 6.283]);
          }
          if (type) objs.push({ id: GX + ',' + GY, type, x, y, lvl: World.levelOf(b), seed: r2, b });
          else if (World.levelOf(b) === 1 && b !== B.SAND && b !== B.DESERT && p > 0.985) puddles.push([x, y, 10 + r1 * 14, r2]);
        }
      }
      return { cx, cy, objs, waves, puddles, tex: null };
    }

    // Status of a natural object right now: 'full', 'after' (stump/empty bush) or 'gone'.
    objState(o, now) {
      const t = this.removed.get(o.id);
      if (t === undefined) return 'full';
      const def = SW.OBJ[o.type];
      if (def.regrow && now - t > def.regrow * this.regrowMul) { this.removed.delete(o.id); this.damage.delete(o.id); return 'full'; }
      return def.after ? 'after' : 'gone';
    }

    // Every solid thing near (x, y): natural objects and structures.
    solidsNear(x, y, rad, now, out) {
      out.length = 0;
      const c0 = Math.floor((x - rad) / CHUNK), c1 = Math.floor((x + rad) / CHUNK);
      const r0 = Math.floor((y - rad) / CHUNK), r1 = Math.floor((y + rad) / CHUNK);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const ch = this.getChunk(cx, cy);
        for (const o of ch.objs) {
          const def = SW.OBJ[o.type];
          if (!def.r && !def.afterR) continue;
          if (Math.abs(o.x - x) > rad || Math.abs(o.y - y) > rad) continue;
          const st = this.objState(o, now);
          const r = st === 'full' ? def.r : st === 'after' ? def.afterR || 0 : 0;
          if (r > 0) out.push({ x: o.x, y: o.y, r });
        }
      }
      for (const s of this.structures) {
        if (Math.abs(s.x - x) < rad && Math.abs(s.y - y) < rad) out.push({ x: s.x, y: s.y, r: s.r, s });
      }
      for (const f of this.fixed) {
        if (Math.abs(f.x - x) < rad + f.r && Math.abs(f.y - y) < rad + f.r) out.push(f);
      }
      return out;
    }

    findSpawn() {
      for (let ring = 0; ring < 200; ring++) {
        const steps = Math.max(1, ring * 8);
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = Math.cos(a) * ring * 40, y = Math.sin(a) * ring * 40;
          const e = this.elev(x, y), b = this.classify(e, this.moist(x, y), this.temp(x, y, e));
          if ((b === B.GRASS || b === B.MEADOW) && e > 0.47 && e < 0.55) return (this.spawn = { x, y });
        }
      }
      return (this.spawn = { x: 0, y: 0 });
    }

    // Is there a walkable land spot near (x, y)? Searches outward in rings.
    landNear(x, y, maxR = 1600) {
      for (let r = 0; r < maxR; r += 60) {
        const n = Math.max(1, Math.round(r / 30));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (this.elev(px, py) > 0.45 && this.elev(px, py) < 0.62) return { x: px, y: py };
        }
      }
      return null;
    }

    // ---------- ground textures (top-down, one set per chunk) ----------
    // base: water + land colour. For each raised level L: white (die-cut rim,
    // slightly grown), side (cliff colour) and top (surface colour). Plus ice
    // for shallow water. The renderer stacks side copies to make cliffs.
    buildTextures(ch) {
      const span = CHUNK + MARGIN * 2, size = Math.ceil(span * TS);
      const x0 = ch.cx * CHUNK - MARGIN, y0 = ch.cy * CHUNK - MARGIN;
      const cells = Math.ceil(span / STEP) + 2;
      const BW = 2.4;
      const buckets = {};
      const bucket = (layer, color) => {
        const L = buckets[layer] || (buckets[layer] = new Map());
        let p = L.get(color);
        if (!p) { p = new Path2D(); L.set(color, p); }
        return p;
      };
      const has = { 1: false, 2: false, ice: false };
      for (let j = -1; j < cells; j++) {
        for (let i = -1; i < cells; i++) {
          const wx = x0 + i * STEP + STEP / 2, wy = y0 + j * STEP + STEP / 2;
          const e = this.elev(wx, wy), m = this.moist(wx, wy);
          const b = this.classify(e, m, this.temp(wx, wy, e));
          const lvl = World.levelOf(b);
          const px = i * STEP * TS, py = j * STEP * TS, cs = STEP * TS + 0.4;
          const rr = hash(Math.floor(wx / STEP), Math.floor(wy / STEP), this.seed + 5);
          if (lvl === 0) {
            bucket('base', WATER[b]).rect(px, py, cs, cs);
            if (rr < 0.012) bucket('base', 'rgba(255,255,255,0.35)').rect(px, py, 2, 1);
            if (b !== B.DEEP) { has.ice = true; bucket('ice', rr < 0.05 ? '#c7e4f5' : '#e6f5ff').rect(px, py, cs, cs); }
            continue;
          }
          const q = fbm(this.nD, wx / 90, wy / 90, 2);
          const shade = q < 0.43 ? 1 : q > 0.57 ? 2 : 0;
          const b1 = lvl === 2 ? (m > 0.56 ? B.FOREST : B.GRASS) : b;
          bucket('base', TOP[b1][0]).rect(px, py, cs, cs);
          for (let L = 1; L <= lvl; L++) {
            has[L] = true;
            const bb = L === 1 ? b1 : b;
            const g = BW * TS;
            bucket('white' + L, '#ffffff').rect(px - g, py - g, cs + g * 2, cs + g * 2);
            bucket('side' + L, SIDE[bb]).rect(px, py, cs, cs);
            bucket('top' + L, TOP[bb][L === lvl ? shade : 0]).rect(px, py, cs, cs);
            if (L === lvl) {
              if (rr < 0.035) bucket('top' + L, 'rgba(40,30,20,0.14)').rect(px + 0.6, py + 0.6, 1.6, 1.2);
              else if (rr > 0.97) bucket('top' + L, 'rgba(255,255,255,0.35)').rect(px + 0.6, py + 0.6, 1.6, 1.2);
            }
          }
        }
      }
      const tex = { size, span, has };
      const paint = (layer) => {
        if (!buckets[layer]) return null;
        const c = document.createElement('canvas'); c.width = c.height = size;
        const g = c.getContext('2d');
        for (const [color, p] of buckets[layer]) { g.fillStyle = color; g.fill(p); }
        return c;
      };
      tex.base = paint('base');
      if (has[1]) { tex.white1 = paint('white1'); tex.side1 = paint('side1'); tex.top1 = paint('top1'); }
      if (has[2]) { tex.white2 = paint('white2'); tex.side2 = paint('side2'); tex.top2 = paint('top2'); }
      if (has.ice) tex.ice = paint('ice');
      ch.tex = tex;
      return tex;
    }

    dropFarTextures(ccx, ccy, keep) {
      for (const ch of this.chunks.values()) {
        if (ch.tex && (Math.abs(ch.cx - ccx) > keep || Math.abs(ch.cy - ccy) > keep)) ch.tex = null;
      }
    }
  }
  SW.World = World;
})();
