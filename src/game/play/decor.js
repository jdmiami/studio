// Decorating the Nest: where a carried find may be placed. A spot must be on top of a walkable
// column (a block top within reach, not water), inside the hub, clear of other decorations (by
// radius), clear of the protected spots (the door way, the gate, Mira's terrace edge, the spawn)
// and not too high above or below the player.
export const DECOR_RADIUS = 0.42;
export const MAX_DECOR = 60;

/**
 * @param spot { x, z, y } the aimed spot on a block top
 * @param ctx { heightAt(x, z), kindAt(x, z), decor: [{ position: [x, y, z] }], protect: [{ x, z, r }], player: { x, y, z }, reach }
 * @returns { ok, reason? }
 */
export function canPlace(spot, ctx) {
  if (ctx.decor.length >= MAX_DECOR) return { ok: false, reason: 'full' };
  const top = ctx.heightAt(Math.round(spot.x), Math.round(spot.z));
  if (top === null || top === undefined || !Number.isFinite(top)) return { ok: false, reason: 'outside' };
  const kind = ctx.kindAt(Math.round(spot.x), Math.round(spot.z));
  if (kind === 'water' || kind === 'stream') return { ok: false, reason: 'water' };
  if (Math.abs(top - spot.y) > 0.05) return { ok: false, reason: 'not-on-top' };
  const dx = spot.x - ctx.player.x;
  const dz = spot.z - ctx.player.z;
  if (Math.hypot(dx, dz) > ctx.reach) return { ok: false, reason: 'far' };
  if (spot.y - ctx.player.y > 2.5 || ctx.player.y - spot.y > 4) return { ok: false, reason: 'height' };
  for (const d of ctx.decor) {
    if (Math.hypot(d.position[0] - spot.x, d.position[2] - spot.z) < DECOR_RADIUS * 2 && Math.abs(d.position[1] - spot.y) < 0.6) {
      return { ok: false, reason: 'crowded' };
    }
  }
  for (const p of ctx.protect) if (Math.hypot(p.x - spot.x, p.z - spot.z) < p.r) return { ok: false, reason: 'protected' };
  return { ok: true };
}

/** The decoration nearest the aimed point within `r`, for picking up. */
export function nearestDecor(decor, point, r = 0.7) {
  let best = null;
  let bestD = r;
  for (const d of decor) {
    const dist = Math.hypot(d.position[0] - point.x, d.position[1] - point.y, d.position[2] - point.z);
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best;
}
