// Grass blankets for the cave: one continuous draped felt sheet per terrace (every 4-connected
// group of same-height grass cells), as in docs/reference/cave-door.jpg, instead of a cap per block.
//
// Each region is one indexed geometry: a pillowy top sheet over its cells, and along the region's
// open edges (where the neighbouring column is lower or missing) a strip that rounds over the top
// edge, overhangs the pink earth face and hangs down it as a hem ending in soft drip scallops.
// Against a taller wall the sheet ends flush. A thin dark band on the earth just under each hem
// (a separate, cube-matched felt) is the hem's contact shadow.
import * as THREE from 'three';
import { prepareTextileGeometry } from '../textile.js';
import { PASTEL, felt, lumpy, mottle, noise3 } from '../kit/style.js';
import { rng } from '../world/util.js';

export const BLANKET = {
  res: 12, // sheet subdivisions per cell (also the hem's samples per cell edge)
  lift: 0.03, // sheet height above the cube top (the earth's own lumps reach ~0.02)
  pillow: 0.035, // how much the sheet rises toward the terrace interior
  pillowReach: 0.7, // distance from an open edge over which the pillow rises
  lumps: [[0.028, 2.2], [0.008, 6]], // upward felt lumps on the sheet: [height, noise scale]
  overhang: 0.08, // the hem's distance in front of the earth face; also the plan corner radius
  wobble: 0.012, // the hem's gentle in-and-out waviness
  roundTop: 0.09, // vertical radius of the rounded top edge
  hemNotch: 0.24, // depth below the cube top of the scallops' notches
  scallop: 0.08, // depth of the deepest lobe below the notches
  lobeWidth: [0.3, 0.55], // lobe widths: two to three per block face
  roll: 0.035, // the bottom edge rolls back under by this much
  tuck: 0.03, // a flush edge slips this far under the wall's rounded foot
  hemShade: 0.9, // vertex-colour factor on the hanging hem
  underShade: 0.78, // ... and on the rolled-under bottom edge
  shadowOffset: 0.035, // the contact-shadow band's distance in front of the earth face
  // The contact shadow on the earth under the scallops: rows of [height below the edge, darkness].
  shadowRows: [[-0.02, 0.45], [0.012, 0.45], [0.045, 0.75], [0.1, 1]],
};

const RINGS_ROUND = 4; // rings over the rounded top edge
const RINGS_HEM = 4; // rings down the hanging face
const RING_COUNT = RINGS_ROUND + RINGS_HEM + 2; // + ring 0 (sheet edge) + the rolled-under ring
const FAN = 4; // segments around a rounded plan corner

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Groups grass cells into regions: 4-connected cells of the same top height. */
function findRegions(cells) {
  const byKey = new Map(cells.map((c) => [`${c.x},${c.z}`, c]));
  const seen = new Set();
  const regions = [];
  for (const start of cells) {
    const k0 = `${start.x},${start.z}`;
    if (seen.has(k0)) continue;
    const region = [];
    const stack = [start];
    seen.add(k0);
    while (stack.length) {
      const c = stack.pop();
      region.push(c);
      for (const [dx, dz] of DIRS) {
        const k = `${c.x + dx},${c.z + dz}`;
        const n = byKey.get(k);
        if (n && !seen.has(k) && n.y === c.y) { seen.add(k); stack.push(n); }
      }
    }
    regions.push(region);
  }
  return regions;
}

/**
 * The region's boundary as ordered loops of directed edges, the region on the inside. Each edge is
 * one cell side; `open` means the column beyond it is lower (or missing), so the blanket hangs a hem
 * there; otherwise it meets a taller (or level) neighbour and ends flush.
 */
function outlineLoops(region, y, heightAt) {
  const inRegion = new Set(region.map((c) => `${c.x},${c.z}`));
  const edges = [];
  const byStart = new Map();
  for (const c of region) {
    // Going around the cell: +x side runs +z, +z side runs -x, -x side runs -z, -z side runs +x.
    const sides = [
      { nx: 1, nz: 0, ax: c.x + 0.5, az: c.z - 0.5, bx: c.x + 0.5, bz: c.z + 0.5 },
      { nx: 0, nz: 1, ax: c.x + 0.5, az: c.z + 0.5, bx: c.x - 0.5, bz: c.z + 0.5 },
      { nx: -1, nz: 0, ax: c.x - 0.5, az: c.z + 0.5, bx: c.x - 0.5, bz: c.z - 0.5 },
      { nx: 0, nz: -1, ax: c.x - 0.5, az: c.z - 0.5, bx: c.x + 0.5, bz: c.z - 0.5 },
    ];
    for (const s of sides) {
      if (inRegion.has(`${c.x + s.nx},${c.z + s.nz}`)) continue;
      const nbTop = heightAt(c.x + s.nx, c.z + s.nz);
      const edge = { ...s, cell: c, nbTop: nbTop ?? -Infinity, open: nbTop === null || nbTop === undefined || nbTop < y, used: false };
      edges.push(edge);
      const k = `${s.ax},${s.az}`;
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(edge);
    }
  }
  const loops = [];
  for (const first of edges) {
    if (first.used) continue;
    const loop = [];
    let e = first;
    while (e && !e.used) {
      e.used = true;
      loop.push(e);
      const next = (byStart.get(`${e.bx},${e.bz}`) ?? []).filter((n) => !n.used);
      // Where two diagonal cells touch at a corner, keep each loop tight around its own cell.
      e = next.find((n) => n.cell === e.cell) ?? next[0];
    }
    loops.push(loop);
  }
  return { loops, edges };
}

/**
 * Samples a loop into outline points { px, pz, dx, dz, open, nbTop, corner } where (dx, dz) is the
 * direction the hem is offset along (unit on edges and rounded convex corners, diagonal at concave
 * ones) and `corner` is the distance along the edge to the nearest convex corner (0 on a corner fan).
 */
function samplePoints(loop, res) {
  const h = 1 / res;
  const pts = [];
  const push = (px, pz, dx, dz, e, corner) => pts.push({ px, pz, dx, dz, open: e.open, nbTop: e.nbTop, corner });
  for (let i = 0; i < loop.length; i++) {
    const e1 = loop[(i + loop.length - 1) % loop.length];
    const e2 = loop[i];
    const vx = e2.ax; const vz = e2.az;
    if (e1.cell === e2.cell) {
      // Convex corner: a fan from e1's normal to e2's. A hem ends flat against a wall, so beside a
      // flush edge the fan is flush too, with an extra point closing the hem's end.
      const bothOpen = e1.open && e2.open;
      if (!bothOpen && e1.open) push(vx, vz, e1.nx, e1.nz, e1, 0);
      for (let f = 0; f <= FAN; f++) {
        const a = (f / FAN) * (Math.PI / 2);
        const dx = Math.cos(a) * e1.nx + Math.sin(a) * e2.nx;
        const dz = Math.cos(a) * e1.nz + Math.sin(a) * e2.nz;
        push(vx, vz, dx, dz, bothOpen ? (f < FAN / 2 ? e1 : e2) : { open: false, nbTop: Math.max(e1.nbTop, e2.nbTop) }, 0);
      }
      if (!bothOpen && e2.open) push(vx, vz, e2.nx, e2.nz, e2, 0);
    } else if (e1.nx === e2.nx && e1.nz === e2.nz) {
      // Straight on; where the neighbour changes from low to tall the hem ends flat.
      push(vx, vz, e2.nx, e2.nz, e1, 1);
      if (e1.open !== e2.open) push(vx, vz, e2.nx, e2.nz, e2, 1);
    } else {
      // Concave corner: both sides face the same outside cell.
      push(vx, vz, e1.nx + e2.nx, e1.nz + e2.nz, e2, 1);
    }
    const tx = Math.sign(e2.bx - e2.ax); const tz = Math.sign(e2.bz - e2.az);
    const e3 = loop[(i + 1) % loop.length];
    const endConvex = e3.cell === e2.cell;
    for (let k = 1; k < res; k++) {
      const startDist = k * h;
      const endDist = 1 - k * h;
      const corner = Math.min(e1.cell === e2.cell ? startDist : 1, endConvex ? endDist : 1);
      push(vx + tx * startDist, vz + tz * startDist, e2.nx, e2.nz, e2, corner);
    }
  }
  return pts;
}

/** Drip lobes along a loop of length `total`: rounded bottoms, cusped notches, seeded per region. */
function makeScallop(total, random) {
  const [wMin, wMax] = BLANKET.lobeWidth;
  const lobes = [];
  let sum = 0;
  while (sum < total || lobes.length < 2) {
    const w = wMin + random() * (wMax - wMin);
    lobes.push({ w, a: 0.55 + random() * 0.45 });
    sum += w;
  }
  const scale = total / sum;
  let s0 = 0;
  for (const l of lobes) { l.w *= scale; l.s0 = s0; s0 += l.w; }
  const phase = random() * total;
  return (s) => {
    let t = (s + phase) % total;
    if (t < 0) t += total;
    let lo = 0; let hi = lobes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lobes[mid].s0 <= t) lo = mid; else hi = mid - 1;
    }
    const l = lobes[lo];
    const u = Math.min(1, (t - l.s0) / l.w);
    return l.a * Math.pow(Math.sin(Math.PI * u), 0.6); // round-bottomed drips with cusped notches
  };
}

const distToSegment = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax; const vz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  const dx = px - (ax + vx * t); const dz = pz - (az + vz * t);
  return Math.sqrt(dx * dx + dz * dz);
};

/** Builds one region's blanket geometry and its contact-shadow band. */
function buildRegion(region, heightAt, shadeAt, seed) {
  const y = region[0].y;
  const B = BLANKET;
  const res = B.res;
  const h = 1 / res;
  const random = rng(seed);
  const { loops, edges } = outlineLoops(region, y, heightAt);
  const openEdges = edges.filter((e) => e.open);

  // Sheet height: lifted off the cube, pillowing up away from the open edges, with hand-pressed
  // felt lumps that only ever rise (so the earth's own lumps never poke through).
  const pillowAt = (px, pz) => {
    if (!openEdges.length) return B.pillow;
    let d = Infinity;
    for (const e of openEdges) d = Math.min(d, distToSegment(px, pz, e.ax, e.az, e.bx, e.bz));
    const t = Math.min(1, d / B.pillowReach);
    return B.pillow * t * t * (3 - 2 * t);
  };
  const lumpsAt = (px, pz) => B.lumps.reduce((sum, [height, scale]) => sum + height * noise3(px * scale, y * 0.7, pz * scale, seed), 0);
  const sheetY = (px, pz) => y + B.lift + pillowAt(px, pz) + lumpsAt(px, pz);

  const positions = [];
  const hemMul = []; // per-vertex colour factor (hem and underside darkening)
  const indices = [];
  const addVertex = (px, py, pz, mul) => {
    positions.push(px, py, pz);
    hemMul.push(mul);
    return positions.length / 3 - 1;
  };
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

  // Top sheet: a grid over the region's cells, vertices shared across cell borders.
  const grid = new Map();
  const gridVertex = (gi, gj) => {
    const k = `${gi},${gj}`;
    let v = grid.get(k);
    if (v === undefined) {
      const px = gi * h; const pz = gj * h;
      v = addVertex(px, sheetY(px, pz), pz, 1);
      grid.set(k, v);
    }
    return v;
  };
  for (const c of region) {
    const gi0 = Math.round((c.x - 0.5) * res); const gj0 = Math.round((c.z - 0.5) * res);
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        quad(gridVertex(gi0 + i, gj0 + j), gridVertex(gi0 + i, gj0 + j + 1), gridVertex(gi0 + i + 1, gj0 + j + 1), gridVertex(gi0 + i + 1, gj0 + j));
      }
    }
  }

  // Hem strips along each loop: rings from the sheet edge over the rounded top, down the face to
  // the scalloped bottom and rolled under; flush edges just tuck under the wall.
  const shadowPos = [];
  const shadowCol = [];
  const shadowIdx = [];
  const pink = new THREE.Color(PASTEL.pink);
  for (const loop of loops) {
    const pts = samplePoints(loop, res);
    const n = pts.length;
    // Arc length along the hem's outer line, for the scallops.
    let s = 0;
    const at = (p) => [p.px + p.dx * B.overhang, p.pz + p.dz * B.overhang];
    for (let i = 0; i < n; i++) {
      const [ax, az] = at(pts[(i + n - 1) % n]);
      const [bx, bz] = at(pts[i]);
      if (i > 0) s += Math.hypot(bx - ax, bz - az);
      pts[i].s = s;
    }
    const [lx, lz] = at(pts[n - 1]); const [fx, fz] = at(pts[0]);
    const total = s + Math.hypot(fx - lx, fz - lz);
    const scallop = makeScallop(Math.max(total, 0.5), random);

    const ring = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const hS = sheetY(p.px, p.pz);
      const vs = new Array(RING_COUNT);
      // Ring 0 lies on the sheet's grid: share that vertex so normals run smoothly over the edge.
      vs[0] = gridVertex(Math.round(p.px * res), Math.round(p.pz * res));
      if (p.open) {
        // The scalloped bottom edge, never reaching the lower neighbour's top.
        const shadowBottom = B.shadowRows[B.shadowRows.length - 1][0];
        p.yB = Math.max(y - B.hemNotch - B.scallop * scallop(p.s), p.nbTop + shadowBottom + 0.04);
        const yFace = hS - B.roundTop;
        // The hanging felt isn't dead flat: it waves in and out a little along the face.
        const wobble = B.wobble * (noise3(p.px * 3.1, y, p.pz * 3.1, seed + 5) - 0.5) * 2;
        for (let k = 1; k < RING_COUNT; k++) {
          let u; let py; let mul;
          if (k <= RINGS_ROUND) {
            const a = (k / RINGS_ROUND) * (Math.PI / 2);
            u = (B.overhang + wobble) * Math.sin(a);
            py = hS - B.roundTop * (1 - Math.cos(a));
            mul = THREE.MathUtils.lerp(1, B.hemShade, k / RINGS_ROUND);
          } else if (k <= RINGS_ROUND + RINGS_HEM) {
            const t = (k - RINGS_ROUND) / RINGS_HEM;
            u = B.overhang + wobble + 0.01 * Math.sin(Math.PI * t); // the felt's thickness bellies out
            py = THREE.MathUtils.lerp(yFace, p.yB, t);
            mul = B.hemShade;
          } else {
            u = B.overhang + wobble - B.roll;
            py = p.yB - 0.015;
            mul = B.underShade;
          }
          vs[k] = addVertex(p.px + p.dx * u, py, p.pz + p.dz * u, mul);
        }
      } else {
        for (let k = 1; k < RING_COUNT; k++) {
          const t = k / (RING_COUNT - 1);
          vs[k] = addVertex(p.px + p.dx * B.tuck * t, hS - 0.012 * t, p.pz + p.dz * B.tuck * t, 1);
        }
      }
      ring[i] = vs;
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i]; const b = ring[(i + 1) % n];
      for (let k = 0; k < RING_COUNT - 1; k++) quad(a[k], b[k], b[k + 1], a[k + 1]);
    }

    // Contact shadow: a short band on the earth face under the scallops, fading out before the
    // rounded plan corners (where the cube's own edge curves away).
    const fade = (p) => THREE.MathUtils.smoothstep(p.corner, 0.12, 0.34);
    const band = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!p.open || p.corner < 0.12) continue;
      const f = fade(p);
      const shade = shadeAt(p.px, p.pz);
      const vs = [];
      for (const [below, dark] of B.shadowRows) {
        const k = THREE.MathUtils.lerp(1, dark, f) * shade;
        shadowPos.push(p.px + p.dx * B.shadowOffset, p.yB - below, p.pz + p.dz * B.shadowOffset);
        shadowCol.push(pink.r * k, pink.g * k, pink.b * k);
        vs.push(shadowPos.length / 3 - 1);
      }
      band[i] = vs;
    }
    for (let i = 0; i < n; i++) {
      const a = band[i]; const b = band[(i + 1) % n];
      if (!a || !b) continue;
      for (let k = 0; k < a.length - 1; k++) shadowIdx.push(a[k], b[k], b[k + 1], a[k], b[k + 1], a[k + 1]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // A fine fiber ripple over everything (the sheet's lumps are baked into its height), then
  // recomputed smooth normals.
  lumpy(g, { amount: 0.004, scale: 8, seed: seed + 3 });
  g.computeVertexNormals();
  mottle(g, PASTEL.grass, PASTEL.grassDeep, { scale: 4, seed, bias: -0.25 });
  const col = g.getAttribute('color');
  const pos = g.getAttribute('position');
  for (let i = 0; i < col.count; i++) {
    const k = hemMul[i] * shadeAt(pos.getX(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  prepareTextileGeometry(g);

  let shadow = null;
  if (shadowIdx.length) {
    shadow = new THREE.BufferGeometry();
    shadow.setAttribute('position', new THREE.Float32BufferAttribute(shadowPos, 3));
    shadow.setAttribute('color', new THREE.Float32BufferAttribute(shadowCol, 3));
    shadow.setIndex(shadowIdx);
    shadow.computeVertexNormals();
    prepareTextileGeometry(shadow);
  }
  return { geometry: g, shadow };
}

/**
 * Builds the grass blankets for a level.
 * @param {{x:number, z:number, y:number}[]} cells grass cells (x, z) with the column top y
 * @param {(x:number, z:number) => number|null} heightAt a column's top, or null off the map
 * @param {(x:number, z:number) => number} shadeAt the level's darkening factor at a point
 * @returns {THREE.Group} with userData { regions, vertices }
 */
export function buildGrassBlankets(cells, { heightAt, shadeAt = () => 1, seed = 1 } = {}) {
  const group = new THREE.Group();
  const blanketMaterial = felt('#ffffff', { fuzz: 0.25, side: THREE.DoubleSide });
  const shadowMaterial = felt('#ffffff'); // the pink cube's own felt, so the band blends into it
  const regions = findRegions(cells);
  let vertices = 0;
  regions.forEach((region, i) => {
    const { geometry, shadow } = buildRegion(region, heightAt, shadeAt, seed + i * 17);
    vertices += geometry.getAttribute('position').count;
    const mesh = new THREE.Mesh(geometry, blanketMaterial);
    mesh.frustumCulled = false;
    group.add(mesh);
    if (shadow) {
      vertices += shadow.getAttribute('position').count;
      const band = new THREE.Mesh(shadow, shadowMaterial);
      band.frustumCulled = false;
      group.add(band);
    }
  });
  group.userData = { regions: regions.length, vertices };
  return group;
}
