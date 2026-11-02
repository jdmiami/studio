// Analog shaping and timers: pure functions, testable in Node.

/**
 * Radial deadzone with rescale: inside `deadzone` (of the vector length) -> 0; outside, the length
 * ramps 0..1 from the deadzone edge to full deflection and is capped at 1 (pads overshoot on
 * diagonals). Per-axis deadzones carve a square hole and snap diagonals to the axes; this does not.
 */
export function radialDeadzone(x, y, deadzone = 0.18) {
  const mag = Math.hypot(x, y);
  if (!(mag > deadzone) || mag === 0) return { x: 0, y: 0 };
  const dz = Math.min(Math.max(deadzone, 0), 0.99);
  const scaled = Math.min((mag - dz) / (1 - dz), 1);
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

/** Response curve on a 0..1 magnitude: exponent > 1 gives finer control near the centre. */
export const responseCurve = (t, exponent = 2) => Math.pow(Math.min(Math.max(t, 0), 1), exponent);

/** Deadzone, rescale, then a response curve applied to the vector's length (direction kept). */
export function shapeStick(x, y, { deadzone = 0.18, exponent = 1 } = {}) {
  const d = radialDeadzone(x, y, deadzone);
  const mag = Math.hypot(d.x, d.y);
  if (mag === 0 || exponent === 1) return d;
  const k = responseCurve(mag, exponent) / mag;
  return { x: d.x * k, y: d.y * k };
}

/** Caps a vector's length at 1 (so diagonal WASD is not faster than straight). */
export function clampLength(x, y, max = 1) {
  const mag = Math.hypot(x, y);
  if (mag <= max || mag === 0) return { x, y };
  return { x: (x / mag) * max, y: (y / mag) * max };
}

/**
 * Hold-to-repeat timer for menu navigation: step(held, dt) is true on the first held frame, then
 * once after `delay` seconds, then every `interval` seconds while held. Releasing resets it. At
 * most one pulse per step, so a long frame never skips several menu rows.
 */
export function createRepeat({ delay = 0.35, interval = 0.09 } = {}) {
  let wasHeld = false;
  let timer = 0;
  return {
    step(held, dt) {
      if (!held) { wasHeld = false; timer = 0; return false; }
      if (!wasHeld) { wasHeld = true; timer = delay; return true; }
      timer -= dt;
      if (timer > 0) return false;
      timer = Math.max(timer + interval, interval * 0.5);
      return true;
    },
    reset() { wasHeld = false; timer = 0; },
  };
}
