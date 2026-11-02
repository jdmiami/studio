// Wave function collapse, simple-tiled model, on a small grid of tiles.
//
// Every cell starts with the variants allowed there (border and spawn constraints, zero weights
// removed); repeat: observe the open cell of lowest entropy, collapse it to one variant by weight,
// propagate (AC-3: neighbours keep only variants some remaining option supports). A contradiction
// (an empty cell) restarts the run with a fresh fork of the rng, up to `maxAttempts`.
//
// Domains are bitsets (32 variants per word), so propagation is a few ORs and ANDs per edge.
//
// Entropy is the Renyi order-2 ("collision") entropy -log(sum p^2): ordering cells by it is the
// same as ordering by sum(w^2) / (sum w)^2, which needs no logarithm, so the choice of cell is
// bit-identical across JS engines. Ties break by a tiny seeded jitter.

export const DIRS = [
  { dx: 0, dz: -1, name: 'N' },
  { dx: 1, dz: 0, name: 'E' },
  { dx: 0, dz: 1, name: 'S' },
  { dx: -1, dz: 0, name: 'W' },
];
export const opposite = (d) => (d + 2) & 3;

/**
 * @param {object} o
 * @param {number} o.width tiles across
 * @param {number} o.height tiles down
 * @param {number} o.count number of variants
 * @param {(d: number, a: number, b: number) => boolean} o.compatible may b sit in direction d of a?
 * @param {(cell: number) => ArrayLike<number>} o.weightsAt per-variant weights at a cell (0 = not allowed)
 * @param {{ fork: (label: string) => any }} o.rng a seeded Rng (src/game/core/rng.js)
 * @param {number} [o.maxAttempts]
 * @returns {{ grid: number[] | null, attempts: number, contradictions: number }}
 */
export function solveWfc({ width, height, count, compatible, weightsAt, rng, maxAttempts = 80 }) {
  const n = width * height;
  const WORDS = Math.ceil(count / 32);
  // mask[(d * count + a) * WORDS + w]: the variants allowed in direction d of variant a.
  const mask = new Uint32Array(4 * count * WORDS);
  for (let d = 0; d < 4; d++) {
    for (let a = 0; a < count; a++) {
      for (let b = 0; b < count; b++) {
        if (compatible(d, a, b)) mask[(d * count + a) * WORDS + (b >>> 5)] |= 1 << (b & 31);
      }
    }
  }
  const weights = [];
  for (let c = 0; c < n; c++) weights.push(Float64Array.from(weightsAt(c)));

  const neighbour = new Int32Array(n * 4).fill(-1);
  for (let c = 0; c < n; c++) {
    for (let d = 0; d < 4; d++) {
      const x = (c % width) + DIRS[d].dx;
      const z = Math.floor(c / width) + DIRS[d].dz;
      if (x >= 0 && z >= 0 && x < width && z < height) neighbour[c * 4 + d] = z * width + x;
    }
  }
  const has = (dom, c, v) => (dom[c * WORDS + (v >>> 5)] >>> (v & 31)) & 1;
  const popcount = (v) => {
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  };

  let contradictions = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = rng.fork(`wfc-attempt-${attempt}`);
    const dom = new Uint32Array(n * WORDS);
    const size = new Int32Array(n);
    for (let c = 0; c < n; c++) {
      for (let v = 0; v < count; v++) {
        if (weights[c][v] > 0) { dom[c * WORDS + (v >>> 5)] |= 1 << (v & 31); size[c]++; }
      }
    }

    const support = new Uint32Array(WORDS);
    const propagate = (stack) => {
      while (stack.length) {
        const c = stack.pop();
        for (let d = 0; d < 4; d++) {
          const nb = neighbour[c * 4 + d];
          if (nb < 0) continue;
          support.fill(0);
          for (let a = 0; a < count; a++) {
            if (!has(dom, c, a)) continue;
            const base = (d * count + a) * WORDS;
            for (let w = 0; w < WORDS; w++) support[w] |= mask[base + w];
          }
          let changed = false;
          let left = 0;
          for (let w = 0; w < WORDS; w++) {
            const before = dom[nb * WORDS + w];
            const after = (before & support[w]) >>> 0;
            if (after !== before) { dom[nb * WORDS + w] = after; changed = true; }
            left += popcount(after);
          }
          size[nb] = left;
          if (left === 0) return false;
          if (changed) stack.push(nb);
        }
      }
      return true;
    };

    let ok = true;
    for (let c = 0; c < n; c++) if (size[c] === 0) ok = false;
    if (ok) ok = propagate([...Array(n).keys()]);
    if (!ok) { contradictions++; continue; }

    while (ok) {
      // Observe: the open cell with the highest weight concentration (lowest Renyi-2 entropy).
      let best = -1;
      let bestScore = -Infinity;
      for (let c = 0; c < n; c++) {
        if (size[c] <= 1) continue;
        let sw = 0;
        let sw2 = 0;
        for (let v = 0; v < count; v++) {
          if (!has(dom, c, v)) continue;
          const wv = weights[c][v];
          sw += wv;
          sw2 += wv * wv;
        }
        const score = sw2 / (sw * sw) + r.float() * 1e-6;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best < 0) {
        const grid = [];
        for (let c = 0; c < n; c++) {
          for (let v = 0; v < count; v++) if (has(dom, c, v)) { grid.push(v); break; }
        }
        return { grid, attempts: attempt + 1, contradictions };
      }
      // Collapse by weight.
      const options = [];
      for (let v = 0; v < count; v++) if (has(dom, best, v)) options.push([v, weights[best][v]]);
      const chosen = r.weighted(options);
      for (let w = 0; w < WORDS; w++) dom[best * WORDS + w] = 0;
      dom[best * WORDS + (chosen >>> 5)] = (1 << (chosen & 31)) >>> 0;
      size[best] = 1;
      ok = propagate([best]);
    }
    contradictions++;
  }
  return { grid: null, attempts: maxAttempts, contradictions };
}
