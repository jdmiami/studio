// Stickerwild — procedural world: terrain, biomes, objects, chunk rendering.
// Ground is stacked like cut cardboard: water at level 0, land at level 1,
// highlands at level 2. Each layer gets a die-cut white edge and a shadow.
'use strict';
(function () {
  const { hash, fbm, makeNoise } = SW;
  const TILT = (SW.TILT = 0.625);
  const LH = (SW.LEVEL_H = 17);
  const CHUNK = (SW.CHUNK = 256);
  const STEP = 4;
  const CELL = 32;

  const ISLAND_R = (SW.ISLAND_R = 20000);
  const B = (SW.BIOME = { DEEP: 0, WATER: 1, SHALLOW: 2, SAND: 3, MEADOW: 4, GRASS: 5, FOREST: 6, HIGH: 7, PEAK: 8, SWAMP: 9 });
  SW.BIOME_NAME = ['Deep Sea', 'Sea', 'Shallows', 'Beach', 'Meadow', 'Grassland', 'Forest', 'Highlands', 'Crystal Peaks', 'Swamp'];
  const TOP = {
    [B.SAND]: ['#f3d58b', '#ecca7a', '#f8e0a4'],
    [B.MEADOW]: ['#a5da5e', '#98d052', '#b3e270'],
    [B.GRASS]: ['#7cc34f', '#71b946', '#88cc5a'],
    [B.FOREST]: ['#56a64c', '#4c9a43', '#61b057'],
    [B.HIGH]: ['#bdb6a4', '#b1aa97', '#c8c1b0'],
    [B.PEAK]: ['#dcd8ce', '#d0ccc1', '#e7e4dc'],
    [B.SWAMP]: ['#6e9f6a', '#64945f', '#79aa74'],
  };
  const SIDE = {
    [B.SAND]: '#d4a95d', [B.MEADOW]: '#8b6239', [B.GRASS]: '#8b6239', [B.FOREST]: '#7c5532',
    [B.HIGH]: '#8f8778', [B.PEAK]: '#a29c8f', [B.SWAMP]: '#5a5a3a',
  };
  const WATER = { [B.DEEP]: '#3b86c9', [B.WATER]: '#4f9fdb', [B.SHALLOW]: '#79c3ea' };
  SW.MAP_COLOR = ['#3b86c9', '#4f9fdb', '#79c3ea', '#f3d58b', '#a5da5e', '#7cc34f', '#4c9a43', '#b1aa97', '#e7e4dc', '#64945f'];

  // What lives in the world and what it gives back.
  SW.OBJ = {
    treeRound: { hp: 4, r: 11, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop' },
    treeBlossom: { hp: 4, r: 11, tool: 'axe', drops: { wood: 2, petal: 2 }, after: 'stump', regrow: 300, sway: 1, sound: 'chop' },
    treePine: { hp: 4, r: 10, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 0.7, sound: 'chop' },
    treePineSnow: { hp: 5, r: 10, tool: 'axe', drops: { wood: 3 }, after: 'stump', regrow: 300, sway: 0.7, sound: 'chop' },
    rock: { hp: 5, r: 16, tool: 'pick', drops: { stone: 3 }, sound: 'mine' },
    rock2: { hp: 4, r: 14, tool: 'pick', drops: { stone: 2 }, sound: 'mine' },
    bush: { hp: 1, r: 11, drops: { berry: 2 }, after: 'bushEmpty', afterR: 11, regrow: 70, sound: 'rustle', sway: 0.5 },
    crystal: { hp: 6, r: 11, tool: 'pick', needs: 'pick', drops: { gem: 2 }, sound: 'mine' },
    flowerPink: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4 },
    flowerGold: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4 },
    flowerLilac: { hp: 1, r: 0, drops: { petal: 1 }, regrow: 110, sound: 'rustle', sway: 1.4 },
    driftwood: { hp: 1, r: 0, drops: { wood: 2 }, regrow: 220, sound: 'chop' },
    tuft: { hp: 1, r: 0, drops: { fiber: 1 }, regrow: 90, sound: 'rustle', sway: 1.6 },
    reeds: { hp: 1, r: 0, drops: { fiber: 2 }, regrow: 120, sound: 'rustle', sway: 1.2 },
    mushroom: { hp: 1, r: 0, drops: { mushroom: 1 }, regrow: 150, sound: 'rustle' },
    swampTree: { hp: 5, r: 11, tool: 'axe', drops: { wood: 3, fiber: 1 }, after: 'stump', regrow: 300, sway: 0.6, sound: 'chop' },
    chest: { hp: 1, r: 13, chest: true, sound: 'chop' },
  };
  SW.OBJ_NAME = {
    treeRound: 'Oak', treeBlossom: 'Blossom Tree', treePine: 'Pine', treePineSnow: 'Snowy Pine', rock: 'Boulder', rock2: 'Rock',
    bush: 'Berry Bush', crystal: 'Crystal', flowerPink: 'Flower', flowerGold: 'Flower', flowerLilac: 'Flower', driftwood: 'Driftwood',
    tuft: 'Grass', reeds: 'Reeds', mushroom: 'Mushroom', swampTree: 'Willow', chest: 'Treasure Chest',
  };
  SW.objVerb = (type) => { const d = SW.OBJ[type]; return d.chest ? 'Open' : d.tool === 'axe' ? 'Chop' : d.tool === 'pick' ? 'Mine' : 'Pick'; };

  class World {
    constructor(seed) {
      this.seed = seed;
      const s = seed * 7;
      this.nE = makeNoise(s + 1); this.nC = makeNoise(s + 2); this.nM = makeNoise(s + 3);
      this.nD = makeNoise(s + 4); this.nT = makeNoise(s + 5); this.nK = makeNoise(s + 6);
      this.spawn = { x: 0, y: 0 };
      this.regionNames = new Map();
      this.chunks = new Map();
      this.removed = new Map(); // object id -> game time it was taken
      this.damage = new Map();  // object id -> hits remaining
      this.structures = [];
      this.rs = 1;
      this.nextId = 1;
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
    classify(e, m) {
      if (e < 0.37) return B.DEEP;
      if (e < 0.405) return B.WATER;
      if (e < 0.425) return B.SHALLOW;
      if (e < 0.45) return B.SAND;
      if (e < 0.6) {
        if (m > 0.67 && e < 0.52) return B.SWAMP;
        if (m > 0.55) return B.FOREST; if (m < 0.42) return B.MEADOW; return B.GRASS;
      }
      if (e < 0.68) return B.HIGH;
      return B.PEAK;
    }
    biomeAt(x, y) { return this.classify(this.elev(x, y), this.moist(x, y)); }
    static levelOf(b) { return b <= B.SHALLOW ? 0 : b === B.HIGH || b === B.PEAK ? 2 : 1; }
    // Danger rises the further a region is from where you washed ashore.
    dangerAt(x, y) {
      const R = SW.REGION;
      const cx = (Math.floor(x / R) + 0.5) * R, cy = (Math.floor(y / R) + 0.5) * R;
      return Math.min(15, 1 + Math.floor(Math.max(0, Math.hypot(cx - this.spawn.x, cy - this.spawn.y) - 1100) / 1500));
    }
    regionAt(x, y) {
      const R = SW.REGION;
      const rx = Math.floor(x / R), ry = Math.floor(y / R), id = rx + ',' + ry;
      let name = this.regionNames.get(id);
      if (!name) { name = SW.regionName(this, rx, ry); this.regionNames.set(id, name); }
      return { id, rx, ry, name, danger: this.dangerAt(x, y) };
    }
    levelAt(x, y) { return World.levelOf(this.biomeAt(x, y)); }
    isWater(x, y) { return this.elev(x, y) < 0.425; }

    key(cx, cy) { return cx + ',' + cy; }
    getChunk(cx, cy) {
      const k = this.key(cx, cy);
      let ch = this.chunks.get(k);
      if (!ch) { ch = this.genChunk(cx, cy); this.chunks.set(k, ch); }
      return ch;
    }

    genChunk(cx, cy) {
      const objs = [], waves = [];
      const n = CHUNK / CELL;
      const seed = this.seed;
      for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const GX = cx * n + gx, GY = cy * n + gy;
          const r1 = hash(GX, GY, seed + 11), r2 = hash(GX, GY, seed + 12), p = hash(GX, GY, seed + 13);
          const x = (GX + 0.15 + r1 * 0.7) * CELL, y = (GY + 0.15 + r2 * 0.7) * CELL;
          const e = this.elev(x, y), m = this.moist(x, y), b = this.classify(e, m);
          const dens = fbm(this.nT, x / 300, y / 300, 2);
          const flower = r1 < 0.33 ? 'flowerPink' : r1 < 0.66 ? 'flowerGold' : 'flowerLilac';
          let type = null;
          if (b >= B.SAND && hash(GX, GY, seed + 99) < 0.0035) type = 'chest';
          else switch (b) {
            case B.FOREST: {
              const t = 0.12 + dens * 0.3;
              if (p < t) type = m > 0.66 || r2 < 0.3 ? 'treePine' : 'treeRound';
              else if (p < t + 0.05) type = 'bush';
              else if (p < t + 0.07) type = 'mushroom';
              else if (p < t + 0.15) type = 'tuft';
              break;
            }
            case B.GRASS:
              if (p < 0.045) type = 'treeRound';
              else if (p < 0.085) type = 'bush';
              else if (p < 0.105) type = 'rock2';
              else if (p < 0.16) type = flower;
              else if (p < 0.3) type = 'tuft';
              break;
            case B.MEADOW:
              if (p < 0.025) type = 'treeBlossom';
              else if (p < 0.055) type = 'bush';
              else if (p < 0.065) type = 'rock2';
              else if (p < 0.21) type = flower;
              else if (p < 0.32) type = 'tuft';
              break;
            case B.SWAMP:
              if (p < 0.09) type = 'swampTree';
              else if (p < 0.24) type = 'reeds';
              else if (p < 0.3) type = 'mushroom';
              else if (p < 0.32) type = 'bush';
              break;
            case B.SAND:
              if (p < 0.04) type = 'driftwood';
              else if (p < 0.065) type = 'rock2';
              break;
            case B.HIGH:
              if (p < 0.07) type = 'rock';
              else if (p < 0.11) type = 'rock2';
              else if (p < 0.15) type = 'treePine';
              else if (p < 0.165) type = 'crystal';
              break;
            case B.PEAK:
              if (p < 0.07) type = 'crystal';
              else if (p < 0.15) type = 'rock';
              else if (p < 0.2) type = 'treePineSnow';
              break;
            default:
              if (b <= B.WATER && p < 0.3) waves.push([x, y, r1 * 6.283]);
          }
          if (type) objs.push({ id: GX + ',' + GY, type, x, y, lvl: World.levelOf(b), seed: r2 });
        }
      }
      return { cx, cy, objs, waves, canvas: null, canvasRS: 0 };
    }

    // Status of a natural object right now: 'full', 'after' (stump/empty bush) or 'gone'.
    objState(o, now) {
      const t = this.removed.get(o.id);
      if (t === undefined) return 'full';
      const def = SW.OBJ[o.type];
      if (def.regrow && now - t > def.regrow) { this.removed.delete(o.id); this.damage.delete(o.id); return 'full'; }
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
      return out;
    }

    findSpawn() {
      for (let ring = 0; ring < 200; ring++) {
        const steps = Math.max(1, ring * 8);
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = Math.cos(a) * ring * 40, y = Math.sin(a) * ring * 40;
          const e = this.elev(x, y), b = this.classify(e, this.moist(x, y));
          if ((b === B.GRASS || b === B.MEADOW) && e > 0.47 && e < 0.55) return (this.spawn = { x, y });
        }
      }
      return (this.spawn = { x: 0, y: 0 });
    }

    // ---------- chunk ground art ----------
    buildCanvas(ch, rs) {
      const W = CHUNK, H = CHUNK * TILT;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(W * rs); cv.height = Math.ceil(H * rs);
      const g = cv.getContext('2d');
      g.scale(rs, rs);

      const ST = STEP * TILT;
      const layers = [];
      for (let i = 0; i < 11; i++) layers.push(new Map());
      const add = (li, color, x, y, w, h) => {
        const m = layers[li];
        let p = m.get(color);
        if (!p) { p = new Path2D(); m.set(color, p); }
        p.rect(x, y, w, h);
      };
      const x0 = ch.cx * CHUNK, y0 = ch.cy * CHUNK;
      const extraRows = Math.ceil((2 * LH + 8) / ST) + 1;
      const cols = CHUNK / STEP;
      const BW = 3.2; // die-cut white border width
      const seed = this.seed;
      for (let j = -2; j <= cols + extraRows; j++) {
        for (let i = -2; i <= cols + 1; i++) {
          const wx = x0 + i * STEP + STEP / 2, wy = y0 + j * STEP + STEP / 2;
          const e = this.elev(wx, wy);
          const b = this.classify(e, this.moist(wx, wy));
          const lvl = World.levelOf(b);
          const px = i * STEP, py = j * ST;
          const gxI = Math.floor(wx / STEP), gyI = Math.floor(wy / STEP);
          const rr = hash(gxI, gyI, seed + 5);
          if (lvl === 0) {
            add(0, WATER[b], px, py, STEP + 0.5, ST + 0.5);
            if (rr < 0.012) add(0, 'rgba(255,255,255,0.35)', px, py, 2, 1);
            continue;
          }
          const q = fbm(this.nD, wx / 90, wy / 90, 2);
          const shade = q < 0.43 ? 1 : q > 0.57 ? 2 : 0;
          const b1 = lvl === 2 ? (this.moist(wx, wy) > 0.56 ? B.FOREST : B.GRASS) : b;
          // level 1 block
          const t1 = py - LH;
          add(1, 'rgba(28,58,112,0.28)', px + 2.5, t1 + 4, STEP, LH + ST);
          add(2, '#ffffff', px - BW, t1 - BW, STEP + BW * 2, LH + ST + BW * 2);
          add(3, SIDE[b1], px, t1, STEP + 0.4, LH + ST);
          add(4, TOP[b1][lvl === 2 ? 0 : shade], px, t1, STEP + 0.5, ST + 0.5);
          if (lvl === 1) {
            if (rr < 0.03) add(5, 'rgba(40,30,20,0.13)', px + 1, t1 + 0.5, 1.8, 1.1);
            else if (rr > 0.975) add(5, 'rgba(255,255,255,0.3)', px + 1, t1 + 0.5, 1.8, 1.1);
            continue;
          }
          // level 2 block
          const t2 = py - 2 * LH;
          add(6, 'rgba(60,45,25,0.22)', px + 2.5, t2 + 4, STEP, LH + ST);
          add(7, '#ffffff', px - BW, t2 - BW, STEP + BW * 2, LH + ST + BW * 2);
          add(8, SIDE[b], px, t2, STEP + 0.4, LH + ST);
          add(9, TOP[b][shade], px, t2, STEP + 0.5, ST + 0.5);
          if (rr < 0.04) add(10, 'rgba(40,30,20,0.12)', px + 1, t2 + 0.5, 1.8, 1.1);
          else if (rr > 0.97) add(10, 'rgba(255,255,255,0.35)', px + 1, t2 + 0.5, 1.8, 1.1);
        }
      }
      for (const m of layers) for (const [color, p] of m) { g.fillStyle = color; g.fill(p); }
      ch.canvas = cv;
      ch.canvasRS = rs;
    }

    dropFarCanvases(ccx, ccy, keep) {
      for (const ch of this.chunks.values()) {
        if (ch.canvas && (Math.abs(ch.cx - ccx) > keep || Math.abs(ch.cy - ccy) > keep)) ch.canvas = null;
      }
    }
  }
  SW.World = World;
})();
