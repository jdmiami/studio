// Fences fitted from their painted cut-outs (src/assets/fence-fits.json, scripts/assets/fit_fences.py),
// built along local +x from 0 to the fitted length, standing on y = 0, front toward +z:
// - 'fence': the pink knit fence, puffy pillow posts with two pillow rails in each gap;
// - 'wood-fence': the small wooden fence, plank posts at both ends and two rails.
// Colours come from projection painting; until then a neutral tone per style.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';

const STYLE = {
  // The fit measures a post's width on its part above the rails, where the round cap narrows it.
  fence: { color: '#d2b6c4', depth: 0.75, round: 0.48, postScale: 1.35, material: () => createTextile('felt', { fuzz: 0.45, grain: 1.6 }) },
  'wood-fence': { color: '#d6ac8f', depth: 1, round: 0.18, postScale: 1, material: () => createTextile('felt', { fuzz: 0.15, grain: 1 }) },
  // The girl's railing: the same wooden build, taller.
  scaffold: { color: '#c79f86', depth: 1, round: 0.15, postScale: 1, material: () => createTextile('felt', { fuzz: 0.15, grain: 1 }) },
};
const materials = new Map();

function box(w, h, d, radius, color) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2) * 0.98);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** A fence from its fit: base at the origin, along +x, front +z. */
export function buildFence(fit) {
  const style = STYLE[fit.family] ?? STYLE.fence;
  const parts = [];
  const posts = [...fit.posts].sort((a, b) => a.t - b.t).map((p) => ({ ...p, w: p.w * style.postScale }));
  const thick = Math.max(...posts.map((p) => p.w)) * style.depth;
  for (const p of posts) {
    const g = box(p.w, p.h, thick, p.w * style.round, style.color);
    g.translate(p.t, p.h / 2, 0);
    parts.push(g);
  }
  // Rails in each gap between neighbouring posts: two, stacked up to the rails' top (the railing's
  // painted boards are dense: two thick planks match it better than three thin rails).
  const railH = (fit.railTop - 0.04) / 2;
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i].t + posts[i].w / 2;
    const b = posts[i + 1].t - posts[i + 1].w / 2;
    if (b - a < 0.06) continue; // side-by-side posts
    for (const k of [0, 1]) {
      // Pillow rails fill the gap's height and nearly the posts' depth (the painting's are fat);
      // plank rails are thinner.
      const pillow = fit.family === 'fence';
      const h = railH * (pillow ? 1.04 : 0.8);
      const g = box(b - a + 0.04, h, thick * (pillow ? 0.92 : 0.6), h * style.round, style.color);
      g.translate((a + b) / 2, 0.04 + railH * k + railH / 2, 0);
      parts.push(g);
    }
  }
  if (!materials.has(fit.family)) materials.set(fit.family, style.material());
  const mesh = new THREE.Mesh(prepareTextileGeometry(mergeGeometries(parts)), materials.get(fit.family));
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Where a fitted fence stands: its first end, turned so local +x runs to its second end. */
export function fencePlacement(fit) {
  const [e0, e1] = fit.ends;
  return {
    position: new THREE.Vector3(...e0),
    rotationY: Math.atan2(-(e1[2] - e0[2]), e1[0] - e0[0]),
  };
}
