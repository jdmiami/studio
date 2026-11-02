// Decorative props from the hub's asset families, with sizes in world units. `native` is the
// height the family's builder makes at scale 1 (src/cave/props-placement.json: the cave's props
// at about scale 1), so scale = height / native. `radius` is the footprint on the ground: cells it
// touches are covered (no finds, critters or other props there); a `blocks` prop also makes those
// cells impassable for the reachability check (trunks, domes, fences, tall stones and poms).

export const LANDMARK_KINDS = {
  'cube-tree': { native: 3.2, height: [2.6, 3.6], radius: 0.3, blocks: () => true },
  willow: { native: 3.6, height: [3.0, 4.2], radius: 0.3, blocks: () => true },
  dome: { native: 1.4, height: [1.0, 1.8], radius: 0.6, blocks: () => true },
  mushroom: { native: 0.42, height: [0.25, 0.55], radius: 0.2, blocks: () => false },
  pom: { native: 0.34, height: [0.3, 0.7], radius: 0.4, blocks: (h) => h > 0.45 },
  stone: { native: 0.32, height: [0.25, 0.8], radius: 0.25, blocks: (h) => h > 0.5 },
  fence: { native: 0.7, height: [0.5, 0.6], radius: 0.15, blocks: () => true },
};

/**
 * World cells a landmark covers (and whether they block): for a fence its two end cells, else the
 * cells whose square meets the footprint disc.
 * @returns {{ cells: [number, number][], blocks: boolean }}
 */
export function landmarkCells(lm) {
  if (lm.kind === 'fence') {
    const cells = [[Math.round(lm.from[0]), Math.round(lm.from[1])], [Math.round(lm.to[0]), Math.round(lm.to[1])]];
    return { cells, blocks: true };
  }
  const r = lm.radius;
  const cells = [];
  for (let cz = Math.floor(lm.z - r) - 1; cz <= Math.ceil(lm.z + r) + 1; cz++) {
    for (let cx = Math.floor(lm.x - r) - 1; cx <= Math.ceil(lm.x + r) + 1; cx++) {
      // Nearest point of the cell square to the centre.
      const nx = Math.max(cx - 0.5, Math.min(cx + 0.5, lm.x));
      const nz = Math.max(cz - 0.5, Math.min(cz + 0.5, lm.z));
      const dx = nx - lm.x;
      const dz = nz - lm.z;
      if (dx * dx + dz * dz < r * r) cells.push([cx, cz]);
    }
  }
  return { cells, blocks: !!lm.blocking };
}

export const round3 = (v) => Math.round(v * 1000) / 1000;

/** A landmark record (world coordinates) with its size drawn from the family's range. */
export function makeLandmark(rng, kind, x, z, { yaw = null, height = null, source = 'scatter', tile = null } = {}) {
  const K = LANDMARK_KINDS[kind];
  const h = height ?? rng.range(K.height[0], K.height[1]);
  const y = yaw ?? rng.float() * 2 * Math.PI;
  return {
    kind,
    x: round3(x),
    z: round3(z),
    yaw: round3(y),
    height: round3(h),
    scale: round3(h / K.native),
    radius: K.radius,
    blocking: K.blocks(h),
    source,
    ...(tile ? { tile } : {}),
  };
}

/** A fence piece from one cell centre to the next (world coordinates). */
export function makeFence(rng, from, to, { source = 'tile', tile = null } = {}) {
  const K = LANDMARK_KINDS.fence;
  const h = rng.range(K.height[0], K.height[1]);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  // Yaw: the rail runs along local +x of the builder; yaw 0 faces -z (three.js / controls.js).
  const yaw = dx !== 0 ? 0 : Math.PI / 2;
  return {
    kind: 'fence',
    x: round3((from[0] + to[0]) / 2),
    z: round3((from[1] + to[1]) / 2),
    yaw: round3(yaw),
    height: round3(h),
    scale: round3(h / K.native),
    radius: K.radius,
    blocking: true,
    length: round3(Math.sqrt(dx * dx + dz * dz)),
    from: [round3(from[0]), round3(from[1])],
    to: [round3(to[0]), round3(to[1])],
    source,
    ...(tile ? { tile } : {}),
  };
}
