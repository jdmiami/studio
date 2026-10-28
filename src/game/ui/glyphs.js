// Felt glyphs for finds: a small inline SVG per look.kind, tinted by look.color / look.accent, with a
// dashed "stitch" line so they read as sewn patches. silhouette: true draws the same shape as a soft
// flat shadow for unfound entries. Pure string output (no DOM), so it also works in tests.

const SIL = '#bfae9c';

/** Darken (k < 1) or lighten (k > 1) a #rrggbb colour. */
export function shade(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

const KINDS = {
  mushroom(c, a, look, sil) {
    const spots = look.spots && !sil
      ? `<circle cx="24" cy="25" r="3" fill="${a}"/><circle cx="36" cy="20" r="2.6" fill="${a}"/><circle cx="42" cy="28" r="2.2" fill="${a}"/>`
      : '';
    return `<rect x="25" y="30" width="14" height="22" rx="6" fill="${sil ? SIL : a}"/>
      <path d="M10 34c0-12 10-21 22-21s22 9 22 21c0 2-2 3-4 3H14c-2 0-4-1-4-3z" fill="${c}"/>${spots}
      ${sil ? '' : `<path d="M14 32c1-9 8-15 18-15s17 6 18 15" class="st"/>`}`;
  },
  stone(c, a, look, sil) {
    return `<path d="M12 40c-2-10 6-20 18-22 12-2 22 4 23 14 1 9-6 16-20 17-12 1-19-3-21-9z" fill="${c}"/>
      ${sil ? '' : `<path d="M19 38c0-7 6-13 14-14" class="st"/><ellipse cx="26" cy="27" rx="5" ry="3" fill="#fff" opacity=".35"/>`}`;
  },
  dome(c, a, look, sil) {
    const tiers = Math.max(1, Math.min(3, look.tiers ?? 1));
    let s = '';
    for (let i = 0; i < tiers; i++) {
      const w = 22 - i * 6;
      const y = 48 - i * 10;
      const col = sil ? SIL : i % 2 ? (a ?? shade(c, 0.9)) : c;
      s += `<path d="M${32 - w} ${y}c0-${10 - i * 1.5} ${w * 0.45}-${15 - i * 2} ${w}-${15 - i * 2}s${w} ${5 - i * 0.5} ${w} ${15 - i * 2}z" fill="${col}"/>`;
      if (!sil) s += `<path d="M${36 - w} ${y - 2}c1-${7 - i} ${w * 0.4}-${11 - i * 1.5} ${w - 4}-${11 - i * 1.5}" class="st"/>`;
    }
    return `<ellipse cx="32" cy="49" rx="23" ry="4" fill="${sil ? SIL : shade(c, 0.82)}"/>${s}`;
  },
  pom(c, a, look, sil) {
    const cols = look.rainbow && !sil ? ['#f1c0c8', '#f4d68e', '#a9c89b', '#a9c6ea', '#c2b3dc'] : [c];
    let s = '';
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2;
      s += `<circle cx="${(32 + Math.cos(t) * 15).toFixed(1)}" cy="${(33 + Math.sin(t) * 15).toFixed(1)}" r="7" fill="${cols[i % cols.length]}"/>`;
    }
    return `${s}<circle cx="32" cy="33" r="16" fill="${cols[0]}"/>${sil ? '' : `<circle cx="32" cy="33" r="10" class="st"/>`}`;
  },
  puff(c, a, look, sil) {
    return `<circle cx="22" cy="36" r="11" fill="${c}"/><circle cx="42" cy="36" r="11" fill="${c}"/>
      <circle cx="32" cy="27" r="13" fill="${c}"/><rect x="18" y="34" width="28" height="13" rx="6" fill="${c}"/>
      ${sil ? '' : `<path d="M22 42c-4-3-3-9 2-10M30 22c4-2 9 0 10 4" class="st"/>`}`;
  },
  leaf(c, a, look, sil) {
    return `<path d="M12 50C12 28 28 12 52 12c0 24-16 40-40 38z" fill="${c}"/>
      ${sil ? '' : `<path d="M14 48L46 18M24 38l-2-9M32 30l-1-9M30 32l9 1M22 40l9 1" fill="none" stroke="${shade(c, 0.7)}" stroke-width="1.6" stroke-linecap="round"/>`}`;
  },
  spool(c, a, look, sil) {
    const th = sil ? SIL : a ?? '#e7a0a6';
    return `<rect x="16" y="10" width="32" height="8" rx="4" fill="${c}"/><rect x="16" y="46" width="32" height="8" rx="4" fill="${c}"/>
      <rect x="20" y="17" width="24" height="30" fill="${th}"/>
      ${sil ? '' : `<path d="M20 23h24M20 29h24M20 35h24M20 41h24" stroke="${shade(th, 0.85)}" stroke-width="1.6"/><path d="M44 30c6 4 8 10 6 16" class="st"/>`}`;
  },
  button(c, a, look, sil) {
    const rim = sil ? SIL : shade(c, 0.86);
    return `<circle cx="32" cy="32" r="20" fill="${rim}"/><circle cx="32" cy="32" r="15" fill="${c}"/>
      ${sil ? '' : `<circle cx="27" cy="27" r="2.6" fill="${shade(c, 0.6)}"/><circle cx="37" cy="27" r="2.6" fill="${shade(c, 0.6)}"/>
      <circle cx="27" cy="37" r="2.6" fill="${shade(c, 0.6)}"/><circle cx="37" cy="37" r="2.6" fill="${shade(c, 0.6)}"/>
      ${a ? `<path d="M27 27l10 10M37 27L27 37" stroke="${a}" stroke-width="2.2" stroke-linecap="round"/>` : ''}
      <circle cx="32" cy="32" r="17.5" class="st"/>`}`;
  },
  thimble(c, a, look, sil) {
    let dots = '';
    if (!sil) for (let y = 22; y <= 40; y += 6) for (let x = 24 + ((y / 6) % 2) * 3; x <= 40; x += 6) dots += `<circle cx="${x}" cy="${y}" r="1.4" fill="${shade(c, 0.78)}"/>`;
    return `<path d="M18 50l4-30c1-6 5-9 10-9s9 3 10 9l4 30z" fill="${c}"/><rect x="15" y="46" width="34" height="8" rx="4" fill="${sil ? SIL : shade(c, 0.88)}"/>${dots}
      ${sil ? '' : `<path d="M18 50h28" class="st"/>`}`;
  },
  crown(c, a, look, sil) {
    const gem = sil ? SIL : a ?? '#e78a8a';
    return `<path d="M10 46l-2-26 13 11 11-17 11 17 13-11-2 26z" fill="${c}"/><rect x="10" y="44" width="44" height="9" rx="4" fill="${sil ? SIL : shade(c, 0.88)}"/>
      ${sil ? '' : `<circle cx="32" cy="36" r="4" fill="${gem}"/><circle cx="19" cy="38" r="3" fill="${gem}"/><circle cx="45" cy="38" r="3" fill="${gem}"/><path d="M12 42h40" class="st"/>`}`;
  },
  critter(c, a, look, sil) {
    let fluff = '';
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      fluff += `<circle cx="${(32 + Math.cos(t) * 16).toFixed(1)}" cy="${(34 + Math.sin(t) * 14).toFixed(1)}" r="6" fill="${c}"/>`;
    }
    return `${fluff}<ellipse cx="32" cy="34" rx="17" ry="15" fill="${c}"/>
      ${sil ? '' : `<circle cx="26" cy="32" r="2.4" fill="#4a332d"/><circle cx="38" cy="32" r="2.4" fill="#4a332d"/>
      <ellipse cx="22" cy="38" rx="3" ry="1.8" fill="#f1a9a6" opacity=".7"/><ellipse cx="42" cy="38" rx="3" ry="1.8" fill="#f1a9a6" opacity=".7"/>
      <path d="M30 37q2 2 4 0" stroke="#4a332d" stroke-width="1.4" fill="none" stroke-linecap="round"/>`}
      <ellipse cx="25" cy="50" rx="4" ry="2.4" fill="${sil ? SIL : shade(c, 0.85)}"/><ellipse cx="39" cy="50" rx="4" ry="2.4" fill="${sil ? SIL : shade(c, 0.85)}"/>`;
  },
};

/** The kinds that have a dedicated glyph. */
export const GLYPH_KINDS = Object.keys(KINDS);

/**
 * An inline SVG for a find's look ({ kind, color, accent, tiers, spots, rainbow }).
 * Unknown kinds fall back to a stone.
 */
export function glyph(look = {}, { silhouette = false, className = 'phl-glyph' } = {}) {
  const draw = KINDS[look.kind] ?? KINDS.stone;
  const c = silhouette ? SIL : look.color ?? '#e3d3bf';
  const a = silhouette ? SIL : look.accent;
  const stitch = silhouette ? 'transparent' : shade(look.color ?? '#e3d3bf', 0.62);
  // Stitches as plain attributes: a <style> inside inline SVG would leak to the whole document.
  const st = `fill="none" stroke="${stitch}" stroke-width="1.6" stroke-dasharray="3 2.6" stroke-linecap="round"`;
  const body = draw(c, a, look, silhouette).replaceAll('class="st"', st);
  return `<svg class="${className}${silhouette ? ' is-sil' : ''}" viewBox="0 0 64 64" aria-hidden="true">
    <ellipse cx="32" cy="57" rx="18" ry="3" fill="#3a2520" opacity="${silhouette ? 0.08 : 0.14}"/>${body}</svg>`;
}
