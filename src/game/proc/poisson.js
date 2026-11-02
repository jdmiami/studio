// Poisson-disc sampling (Bridson 2007): points no closer than `r`, spread evenly without clumps.
//
// The domain is [0, w) x [0, d) in cell units. `accept(x, z)` filters candidates (walkable ground,
// not water...). With `snap`, each candidate is moved to the centre of its cell (x + 0.5) before
// the distance test, so stored points sit on cell centres and still keep the minimum distance.
// Candidates in the annulus [r, 2r] are drawn by rejection from a square (no sin/cos: bit-identical
// across JS engines). When the active list dies (the accepted region is in pieces, e.g. split by
// water), new seed points are tried so every piece gets covered.

export function poissonDisc(rng, { w, d, r, k = 30, accept = () => true, snap = false, maxPoints = Infinity, seedTries = 60 }) {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(w / cell);
  const gd = Math.ceil(d / cell);
  const grid = new Int32Array(gw * gd).fill(-1);
  const points = [];
  const active = [];
  const r2 = r * r;

  const place = (x, z) => {
    if (snap) { x = Math.floor(x) + 0.5; z = Math.floor(z) + 0.5; }
    if (x < 0 || z < 0 || x >= w || z >= d) return false;
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    for (let j = Math.max(0, gz - 2); j <= Math.min(gd - 1, gz + 2); j++) {
      for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const q = grid[j * gw + i];
        if (q < 0) continue;
        const dx = points[q].x - x;
        const dz = points[q].z - z;
        if (dx * dx + dz * dz < r2) return false;
      }
    }
    if (!accept(x, z)) return false;
    // A slot's diagonal is exactly r, so two points r apart never share one (kept as a guard).
    if (grid[gz * gw + gx] >= 0) return false;
    grid[gz * gw + gx] = points.length;
    points.push({ x, z });
    active.push(points.length - 1);
    return true;
  };

  let tries = 0;
  while (points.length < maxPoints && tries < seedTries) {
    if (!active.length) {
      tries++;
      place(rng.float() * w, rng.float() * d);
      continue;
    }
    const ai = Math.floor(rng.float() * active.length);
    const p = points[active[ai]];
    let found = false;
    for (let n = 0; n < k && !found; n++) {
      // Uniform point in the annulus [r, 2r] around p, by rejection from the square of side 4r.
      let dx, dz, dd;
      do {
        dx = (rng.float() * 4 - 2) * r;
        dz = (rng.float() * 4 - 2) * r;
        dd = dx * dx + dz * dz;
      } while (dd < r2 || dd > 4 * r2);
      found = place(p.x + dx, p.z + dz);
    }
    if (!found) active.splice(ai, 1);
  }
  return points;
}
