// "Living Plush" shell fur. Every fluffy object is drawn as `shells` stacked copies of
// its geometry pushed out along a combed direction; fragments outside a strand are
// discarded, so the stack reads as millions of soft fibers.
//
// Per strand: clumping, two-tone hand-dyed color with jitter, Kajiya-Kay anisotropic
// sheen, optional glitter fibers and iridescence, backlit translucency, and aerial haze.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uShells;
  uniform vec3 uWind;
  uniform float uGravity;
  uniform float uCurl;

  attribute vec3 color;
  attribute float aSeed;

  varying vec3 vBase;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vColor;
  varying float vLayer;
  varying float vSeed;

  void main() {
    float layer = float(gl_InstanceID) / uShells;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);

    // Comb direction: wind gusts and gravity bend the tips more than the roots.
    float bend = layer * layer;
    float gust = sin(uTime * 1.7 + world.x * 0.35 + world.z * 0.25 + aSeed * 6.28) * 0.5 + 0.5;
    vec3 sway = uWind * (0.4 + gust) + vec3(0.0, -uGravity, 0.0);

    // Curl: tips twist around the normal, phase varies slowly across the surface.
    vec3 t1 = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    float phase = dot(position, vec3(3.1, 2.3, 2.7)) + aSeed * 9.0 + layer * 5.0;
    vec3 curl = (t1 * cos(phase) + t2 * sin(phase)) * uCurl * pow(layer, 1.5);

    vec3 offset = n * uLength * layer + (sway * bend + curl) * uLength;
    world.xyz += offset;

    vBase = position;
    vWorld = world.xyz;
    vNormalW = n;
    // Strand tangent follows the combed direction (used for the anisotropic sheen).
    vTangentW = normalize(n + (sway + curl) * 1.5);
    vColor = color;
    vLayer = layer;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The cel light ramp, shared by the fur and textile shaders: a light factor in 0..1 stepped into
 * three tones (shadow, half, lit) with soft edges, mixed with the smooth value by uCel.
 */
export const CEL_GLSL = /* glsl */ `
  float celRamp(float x, float cel) {
    float w = 0.05;
    float stepped = 0.3 * smoothstep(0.18 - w, 0.18 + w, x) + 0.7 * smoothstep(0.5 - w, 0.5 + w, x);
    return mix(x, stepped, cel);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;
  uniform float uClump;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uTipTint;
  uniform float uRim;
  uniform float uSheen;
  uniform float uGlitter;
  uniform float uIridescence;
  uniform vec3 uFlow;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uCel;
  ${CEL_GLSL}

  varying vec3 vBase;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vColor;
  varying float vLayer;
  varying float vSeed;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  vec3 hash3(vec3 p) {
    return vec3(hash(p + 3.1), hash(p + 7.7), hash(p + 11.3));
  }

  // Small hue rotation in YIQ space for per-strand dye variation.
  vec3 hueShift(vec3 c, float a) {
    const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYIQ * c;
    float h = atan(yiq.z, yiq.y) + a;
    float chroma = length(yiq.yz);
    return toRGB * vec3(yiq.x, chroma * cos(h), chroma * sin(h));
  }

  // Kajiya-Kay strand highlight.
  float strandSpec(vec3 t, vec3 h, float exponent) {
    float th = dot(t, h);
    return pow(sqrt(max(0.0, 1.0 - th * th)), exponent);
  }

  void main() {
    // uFlow scrolls the strand pattern over time (cotton-wool waterfall).
    vec3 cellPos = (vBase + uFlow * uTime) * uDensity;

    // Clumping: tips lean toward the center of a larger clump cell, so strands gather into
    // soft locks instead of a uniform pin-cushion.
    vec3 clumpPos = cellPos / 3.5;
    vec3 clumpCenter = floor(clumpPos) + 0.5 + (hash3(floor(clumpPos) + 19.0) - 0.5) * 0.6;
    cellPos += (clumpCenter - clumpPos) * 3.5 * uClump * vLayer;

    vec3 cell = floor(cellPos);
    float strand = hash(cell + vSeed * 13.0);
    vec3 local = fract(cellPos) - 0.5 - (hash3(cell) - 0.5) * 0.45;

    float radius = (1.0 - vLayer) * 0.55;
    if (vLayer > 0.0 && (length(local) > radius || strand < vLayer * 0.92)) discard;

    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 l = normalize(uSunDir);
    vec3 t = normalize(vTangentW);

    // Hand-dyed yarn: saturated deep roots, pale sunlit tips, per-strand hue/value jitter.
    vec3 dyed = hueShift(vColor, (strand - 0.5) * 0.15) * (0.9 + hash(cell + 5.0) * 0.2);
    float luma = dot(dyed, vec3(0.2126, 0.7152, 0.0722));
    vec3 root = mix(vec3(luma), dyed, 1.15) * 0.86; // slightly deeper roots, same soft hue
    vec3 tip = mix(dyed, uTipTint, 0.3) * 1.08;
    vec3 base = mix(root, tip, smoothstep(0.0, 1.0, vLayer));

    // Iridescent fleece: thin-film-like hue shift by viewing angle on the tips.
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (ndv * 1.4 + strand * 0.3 + vec3(0.0, 0.33, 0.67)));
    base = mix(base, base * 0.5 + film * 0.7, uIridescence * vLayer * 0.6);

    // Lighting: wrapped diffuse, sky/ground ambient, root occlusion.
    float wrap = clamp((dot(n, l) + 0.5) / 1.5, 0.0, 1.0);
    vec3 ambient = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    float occlusion = mix(0.5, 1.0, pow(vLayer, 0.6));
    float celWrap = celRamp(wrap, uCel);
    // Under cel shading the shell occlusion flattens too: the fluff reads as one soft tone.
    occlusion = mix(occlusion, mix(0.8, 1.0, step(0.35, vLayer)), uCel);
    vec3 col = base * (ambient * 0.78 + uSunColor * celWrap) * occlusion;

    // Silky sheen sliding along the fibers: white primary lobe, dye-tinted secondary lobe.
    vec3 h = normalize(l + v);
    vec3 t1 = normalize(t + n * 0.25);
    vec3 t2 = normalize(t - n * 0.35);
    float spec1 = strandSpec(t1, h, 90.0) * 0.55;
    float spec2 = strandSpec(t2, h, 18.0) * 0.35;
    float sheenMask = smoothstep(-0.2, 0.4, dot(n, l)) * vLayer;
    col += (uSunColor * spec1 + dyed * uSunColor * spec2) * uSheen * sheenMask * (1.0 - uCel);

    // Backlit glow: light leaks through thin tips when the sun is behind the fluff.
    float back = pow(clamp(dot(-v, l), 0.0, 1.0), 3.0);
    col += uSunColor * mix(dyed, uTipTint, 0.5) * back * pow(vLayer, 1.5) * 0.75;

    // Rim light on fiber edges.
    float rim = pow(1.0 - ndv, 3.0) * uRim * vLayer;
    col += mix(uSkyColor, uTipTint, 0.5) * rim * (1.0 - 0.7 * uCel);

    // Glitter fibers: a few strands twinkle in HDR so bloom turns them into sparkles.
    if (uGlitter > 0.0 && vLayer > 0.55 && hash(cell + 42.0) > 1.0 - uGlitter * 0.05) {
      float twinkle = pow(max(0.0, sin(uTime * 3.0 + strand * 40.0 + dot(v, vec3(13.0, 7.0, 5.0)) * 6.0)), 10.0);
      col += vec3(1.0, 0.85, 0.95) * twinkle * 5.0;
    }

    // Aerial perspective: distance melts into the sunset haze, warmer toward the sun.
    float dist = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-max(dist - 18.0, 0.0) * uFogDensity); // haze starts past the island
    vec3 haze = mix(uFogColor, uSunColor * 0.9, pow(clamp(dot(-v, l), 0.0, 1.0), 4.0) * 0.6);
    col = mix(col, haze, fog);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Lighting shared by every fur material (and the sky): golden hour, sun low behind the island.
export const sharedFurUniforms = {
  uTime: { value: 0 },
  // Off to the left of the default view so rays cross the frame and the hero gets a side rim.
  uSunDir: { value: new THREE.Vector3(-0.95, 0.16, -0.18).normalize() },
  // Natural daylight: warm white sun, blue sky fill, green bounce from the grass.
  uSunColor: { value: new THREE.Color('#fff4e5').multiplyScalar(1.2) },
  uSkyColor: { value: new THREE.Color('#a9c8ec') },
  uGroundColor: { value: new THREE.Color('#9cbf7e') },
  uWind: { value: new THREE.Vector3(0.18, 0, 0.08) },
  uFogColor: { value: new THREE.Color('#cfe2f3') },
  uFogDensity: { value: 0.0045 },
  // Cel shading, 0..1 (the cave turns it on; the kit page and the island keep the smooth light):
  // light falls in flat bands instead of a smooth gradient, shadow sides take a deeper, more
  // saturated tone of the colour, and specular / white rim highlights fade out, as in the cave
  // painting, where each face is one flat pastel tone.
  uCel: { value: 0 },
};


/**
 * Wraps a geometry (with a `color` attribute) in shell fur.
 * Returns an InstancedMesh whose instances are the shells.
 */
export function createFur(geometry, {
  shells = 24,
  length = 0.18,
  density = 36,
  gravity = 0.25,
  curl = 0.15,
  clump = 0.35,
  tipTint = '#ffffff',
  rim = 0.9,
  sheen = 1,
  glitter = 0,
  iridescence = 0,
  flow = [0, 0, 0],
  seed = Math.random(),
} = {}) {
  const count = geometry.getAttribute('position').count;
  if (!geometry.getAttribute('color')) {
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  if (!geometry.getAttribute('aSeed')) {
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(count).fill(seed), 1));
  }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...sharedFurUniforms,
      uLength: { value: length },
      uShells: { value: shells },
      uDensity: { value: density },
      uGravity: { value: gravity },
      uCurl: { value: curl },
      uClump: { value: clump },
      uTipTint: { value: new THREE.Color(tipTint) },
      uRim: { value: rim },
      uSheen: { value: sheen },
      uGlitter: { value: glitter },
      uIridescence: { value: iridescence },
      uFlow: { value: new THREE.Vector3(...flow) },
    },
  });

  const mesh = new THREE.InstancedMesh(geometry, material, shells);
  // Shells are positioned in the shader, so instance matrices stay identity.
  for (let i = 0; i < shells; i++) mesh.setMatrixAt(i, new THREE.Matrix4());
  mesh.frustumCulled = false;
  return mesh;
}

/** Fills a geometry's color attribute with one color. */
export function paint(geometry, color) {
  const c = new THREE.Color(color);
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}
