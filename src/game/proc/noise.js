// Seeded 2D simplex noise, fBm and domain warping, written from scratch (no dependencies).
//
// Only + - * / floor and sqrt are used (all exactly rounded by IEEE 754), never sin/cos/exp/pow,
// whose last bits differ between JS engines: the same seed gives bit-identical terrain in Node,
// Chrome, Firefox and Safari.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
// Eight gradient directions (the axes and the diagonals).
const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GZ = [1, 1, -1, -1, 0, 0, 1, -1];

/** A 2D simplex noise function (x, z) -> about [-1, 1], its lattice shuffled by `rng`. */
export function createSimplex2D(rng) {
  const p = rng.shuffle([...Array(256).keys()]);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const corner = (gi, x, z) => {
    let t = 0.5 - x * x - z * z;
    if (t <= 0) return 0;
    t *= t;
    const g = gi & 7;
    return t * t * (GX[g] * x + GZ[g] * z);
  };

  return (x, z) => {
    const s = (x + z) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(z + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const z0 = z - (j - t);
    const i1 = x0 > z0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const z1 = z0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const z2 = z0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const n = corner(perm[ii + perm[jj]], x0, z0)
      + corner(perm[ii + i1 + perm[jj + j1]], x1, z1)
      + corner(perm[ii + 1 + perm[jj + 1]], x2, z2);
    return 70 * n;
  };
}

/** Fractal Brownian motion: octaves of `noise`, renormalised to about [-1, 1]. */
export function fbm(noise, x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    total += amp * noise(x * freq + o * 17.31, z * freq - o * 9.73); // offset octaves: no shared origin
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return total / norm;
}

/**
 * A domain-warped fBm field (x, z in cells) -> [0, 1]: the sample point is pushed around by two
 * further fBm fields first, which bends ridges and shores into softer, less grid-like shapes.
 */
export function createWarpedField(rng, { freq = 1 / 16, octaves = 4, gain = 0.5, warp = 1.2, warpFreq = 1 } = {}) {
  const base = createSimplex2D(rng.fork('base'));
  const wx = createSimplex2D(rng.fork('warp-x'));
  const wz = createSimplex2D(rng.fork('warp-z'));
  return (x, z) => {
    const fx = x * freq;
    const fz = z * freq;
    const qx = fbm(wx, fx * warpFreq, fz * warpFreq, 3);
    const qz = fbm(wz, fx * warpFreq + 5.2, fz * warpFreq + 1.3, 3);
    const n = fbm(base, fx + warp * qx, fz + warp * qz, octaves, 2, gain);
    return clamp01(n * 0.5 + 0.5);
  };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Hermite smoothstep between edges a and b. */
export function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
