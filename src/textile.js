// Textile surface materials: felt, knit, velvet, and yarn wrap. One shader, four modes,
// sharing the scene's golden-hour lighting and aerial haze with the fur shader.
// Supports vertex colors, instancing (with per-instance color), and hanging-strand sway.
import * as THREE from 'three';
import { sharedFurUniforms } from './fur.js';

const MODES = { felt: 0, knit: 1, velvet: 2, yarn: 3 };

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSway;

  attribute vec3 color;
  attribute vec3 aLocal;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vColor;
  varying vec3 vObj;
  varying vec3 vLocal;
  varying vec2 vUv;

  void main() {
    vec4 local = vec4(position, 1.0);
    mat3 normalMat = mat3(modelMatrix);
    vColor = color;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      normalMat = normalMat * mat3(instanceMatrix);
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor *= instanceColor;
    #endif

    vec4 world = modelMatrix * local;
    // Hanging strands (modeled from y = 0 down to y = -1) swing more toward their tips.
    if (uSway > 0.0) {
      float hang = clamp(-position.y, 0.0, 1.0);
      float phase = world.x * 0.35 + world.z * 0.3 + uTime * 1.2;
      world.xz += vec2(sin(phase), cos(phase * 0.83)) * uSway * hang * hang;
    }

    vWorld = world.xyz;
    vNormalW = normalize(normalMat * normal);
    vObj = local.xyz;
    vLocal = aLocal;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform int uMode;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uSheenColor;
  uniform float uFuzz;
  uniform float uStitch;
  uniform vec3 uStitchColor;
  uniform vec2 uKnit;
  uniform float uStripeCount;
  uniform vec3 uStripes[4];
  uniform float uWraps;
  uniform float uEmissive;

  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vColor;
  varying vec3 vObj;
  varying vec3 vLocal;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
  }

  // One leaning lobe of a knit V stitch; returns squared ellipse distance and the
  // coordinate along the yarn (for ply twist).
  vec2 lobe(vec2 p, vec2 c, float angle) {
    vec2 d = p - c;
    float s = sin(angle), co = cos(angle);
    d = vec2(co * d.x - s * d.y, s * d.x + co * d.y);
    vec2 e = d / vec2(0.21, 0.5);
    return vec2(dot(e, e), d.x * 2.0 + d.y * 0.6);
  }

  vec3 stripeColor(float band) {
    int i = int(mod(band, 4.0));
    if (i == 0) return uStripes[0];
    if (i == 1) return uStripes[1];
    if (i == 2) return uStripes[2];
    return uStripes[3];
  }

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 l = normalize(uSunDir);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    vec3 base = vColor * uColor;
    float shade = 1.0;
    float fuzz = uFuzz;

    if (uMode == 0) {
      // Felt: matted fiber noise and specks.
      // Matted fiber clouds at two scales; kept low-contrast so felt stays smooth at distance.
      base *= 0.93 + 0.1 * fbm(vObj * 9.0) + 0.04 * fbm(vObj * 40.0);
      // Running stitches inset from the edges of each Tuft's top face.
      if (uStitch > 0.0 && n.y > 0.6) {
        float edge = max(abs(vLocal.x), abs(vLocal.z));
        float along = abs(vLocal.x) > abs(vLocal.z) ? vLocal.z : vLocal.x;
        float d = abs(edge - 0.36);
        float dash = step(fract(along * 6.0 + 0.25), 0.6);
        if (d < 0.045) shade *= 0.88;
        if (d < 0.028 && dash > 0.5) base = mix(base, uStitchColor, 0.95);
      }
    } else if (uMode == 1) {
      // Knit stockinette: columns of V stitches, each two leaning plied lobes.
      vec2 uv = vUv * uKnit;
      vec2 f = fract(uv);
      vec2 a = lobe(f, vec2(0.29, 0.5), 0.5);
      vec2 b = lobe(f, vec2(0.71, 0.5), -0.5);
      vec2 s = a.x < b.x ? a : b;
      float h = clamp(1.0 - s.x, 0.0, 1.0);
      float ply = 0.5 + 0.5 * sin(s.y * 26.0 + (a.x < b.x ? 1.0 : -1.0) * f.y * 8.0);
      shade = mix(0.38, 1.0, sqrt(h)) * (0.88 + 0.12 * ply);
      if (uStripeCount > 0.0) base = stripeColor(floor(vUv.y * uStripeCount)) * uColor;
      base *= 0.95 + 0.08 * fbm(vObj * 30.0);
    } else if (uMode == 3) {
      // Yarn wrap: helical coils with grooves and ply twist.
      float t = vUv.y * uWraps + vUv.x;
      float g = fract(t);
      float groove = smoothstep(0.0, 0.18, g) * smoothstep(1.0, 0.82, g);
      float ply = 0.5 + 0.5 * sin((vUv.x * 6.2831 * 3.0 - g * 9.0));
      shade = mix(0.5, 1.0, groove) * (0.9 + 0.1 * ply);
      base *= 0.95 + 0.08 * fbm(vObj * 40.0);
    }

    // Shared soft lighting: wrapped sun, sky/ground ambient.
    float wrap = clamp((dot(n, l) + 0.4) / 1.4, 0.0, 1.0);
    vec3 ambient = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    vec3 col;
    if (uMode == 2) {
      // Velvet: subdued core, bright silvery pile at grazing angles.
      base *= 0.94 + 0.08 * fbm(vObj * 50.0);
      col = base * (ambient * 0.45 + uSunColor * wrap * 0.55) * 0.85;
      float edge = pow(1.0 - ndv, 2.2);
      col += mix(base, uSheenColor, 0.55) * edge * (0.45 + 0.55 * wrap) * 1.1;
    } else {
      col = base * shade * (ambient * 0.7 + uSunColor * wrap * 0.8);
      // Fiber fuzz catches light at the silhouette.
      col += uSheenColor * pow(1.0 - ndv, 2.5) * fuzz * (0.4 + 0.6 * wrap);
    }
    col += base * uEmissive;

    float dist = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-max(dist - 18.0, 0.0) * uFogDensity);
    vec3 haze = mix(uFogColor, uSunColor * 0.8, pow(clamp(dot(-v, l), 0.0, 1.0), 4.0) * 0.5);
    col = mix(col, haze, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Creates a textile material.
 * @param {'felt'|'knit'|'velvet'|'yarn'} mode
 */
export function createTextile(mode, {
  color = '#ffffff',
  sheen = '#ffffff',
  fuzz = 0.3,
  stitch = 0,
  stitchColor = '#fffaf2',
  knit = [24, 16],
  stripes = null,
  wraps = 30,
  sway = 0,
  emissive = 0,
  side = THREE.FrontSide,
} = {}) {
  const stripeColors = (stripes ?? ['#ffffff', '#ffffff', '#ffffff', '#ffffff']).map((c) => new THREE.Color(c));
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side,
    uniforms: {
      uTime: sharedFurUniforms.uTime,
      uSunDir: sharedFurUniforms.uSunDir,
      uSunColor: sharedFurUniforms.uSunColor,
      uSkyColor: sharedFurUniforms.uSkyColor,
      uGroundColor: sharedFurUniforms.uGroundColor,
      uFogColor: sharedFurUniforms.uFogColor,
      uFogDensity: sharedFurUniforms.uFogDensity,
      uMode: { value: MODES[mode] },
      uColor: { value: new THREE.Color(color) },
      uSheenColor: { value: new THREE.Color(sheen) },
      uFuzz: { value: fuzz },
      uStitch: { value: stitch },
      uStitchColor: { value: new THREE.Color(stitchColor) },
      uKnit: { value: new THREE.Vector2(...knit) },
      uStripeCount: { value: stripes ? stripes.length * 2 : 0 },
      uStripes: { value: stripeColors },
      uWraps: { value: wraps },
      uSway: { value: sway },
      uEmissive: { value: emissive },
    },
  });
}

/** Ensures a geometry has the attributes the textile shader reads. */
export function prepareTextileGeometry(geometry, color = '#ffffff') {
  const count = geometry.getAttribute('position').count;
  if (!geometry.getAttribute('color')) {
    const c = new THREE.Color(color);
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  }
  if (!geometry.getAttribute('aLocal')) {
    geometry.setAttribute('aLocal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  }
  return geometry;
}
