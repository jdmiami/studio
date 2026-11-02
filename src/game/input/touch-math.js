// The on-screen controls' maths, without the DOM (tested in Node): the floating stick's vector
// from a thumb's offset, where a stick may appear, and when a touch counts as a tap.

export const STICK = {
  radius: 56, // CSS px from the base centre to the rim (scaled by settings.touchButtonScale)
  deadzone: 0.14, // fraction of the radius ignored round the centre
  runAt: 1.12, // pushing the thumb past the rim (this fraction of the radius) runs
  maxPull: 1.4, // the knob stops here; the base follows the thumb beyond it
};

/**
 * The stick's output for a thumb at (dx, dy) CSS px from the base (screen y down):
 * { x: right, y: forward } with length <= 1 (deadzone rescaled), run when pushed past the rim, and
 * the knob's drawn offset (clamped to maxPull radii).
 */
export function stickVector(dx, dy, radius = STICK.radius, { deadzone = STICK.deadzone, runAt = STICK.runAt, maxPull = STICK.maxPull } = {}) {
  const d = Math.hypot(dx, dy);
  const r = d / radius;
  const knobScale = r > maxPull ? (maxPull * radius) / d : 1;
  const knob = { x: dx * knobScale, y: dy * knobScale };
  if (r <= deadzone || d === 0) return { x: 0, y: 0, run: false, knob, pull: r };
  const m = Math.min(1, (r - deadzone) / (1 - deadzone));
  return { x: (dx / d) * m, y: (-dy / d) * m, run: r >= runAt, knob, pull: r };
}

/**
 * When the thumb has pulled past maxPull, the base slides after it so reversing is immediate.
 * Returns the new base position.
 */
export function followBase(base, thumb, radius = STICK.radius, maxPull = STICK.maxPull) {
  const dx = thumb.x - base.x;
  const dy = thumb.y - base.y;
  const d = Math.hypot(dx, dy);
  const lim = maxPull * radius;
  if (d <= lim) return base;
  const k = (d - lim) / d;
  return { x: base.x + dx * k, y: base.y + dy * k };
}

/** Where a stick may sit: its whole rim on screen, clear of the safe-area insets. */
export function clampBase(x, y, radius, view, inset = { left: 0, right: 0, top: 0, bottom: 0 }) {
  const pad = radius + 10;
  return {
    x: Math.min(Math.max(x, inset.left + pad), view.width - inset.right - pad),
    y: Math.min(Math.max(y, inset.top + pad), view.height - inset.bottom - pad),
  };
}

/** A touch that ended quickly without travelling is a tap. */
export const isTap = (ms, travel) => ms < 260 && travel < 12;

/** Should the on-screen controls show? setting 'on' | 'off' | 'auto' (auto: a touch screen was seen). */
export function touchWanted(setting, { coarse = false, touched = false } = {}) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return coarse || touched;
}
