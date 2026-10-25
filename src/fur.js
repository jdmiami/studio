// Shell-fur material: every fluffy object is drawn as `shells` stacked copies of its
// geometry, each pushed out along the normal. Fragments outside a strand are discarded,
// so stacked shells read as millions of soft fibers.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uShells;
  uniform vec3 uWind;
  uniform float uGravity;

  attribute vec3 color;
  attribute float aSeed;

  varying vec3 vBase;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLayer;
  varying float vSeed;

  void main() {
    float layer = float(gl_InstanceID) / uShells;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);

    // Wind and gravity bend the tips more than the roots.
    float bend = layer * layer;
    float gust = sin(uTime * 1.7 + world.x * 0.35 + world.z * 0.25 + aSeed * 6.28) * 0.5 + 0.5;
    vec3 sway = uWind * (0.4 + gust) + vec3(0.0, -uGravity, 0.0);
    world.xyz += n * uLength * layer + sway * bend * uLength;

    vBase = position;
    vNormalW = n;
    vViewDir = normalize(cameraPosition - world.xyz);
    vColor = color;
    vLayer = layer;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uDensity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uTipTint;
  uniform float uRim;

  varying vec3 vBase;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLayer;
  varying float vSeed;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 cellPos = vBase * uDensity;
    vec3 cell = floor(cellPos);
    float strand = hash(cell + vSeed * 13.0);
    // Jitter each strand inside its cell so the fur never shows a grid.
    vec3 jitter = vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 11.3)) - 0.5;
    vec3 local = fract(cellPos) - 0.5 - jitter * 0.45;

    // Strands taper toward the tip; short strands stop at lower shells.
    float radius = (1.0 - vLayer) * 0.55;
    if (vLayer > 0.0 && (length(local) > radius || strand < vLayer * 0.92)) discard;

    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewDir);

    // Wrapped diffuse keeps fluff soft; light leaks through thin tips.
    float wrap = clamp((dot(n, uSunDir) + 0.6) / 1.6, 0.0, 1.0);
    float sky = n.y * 0.5 + 0.5;
    vec3 ambient = mix(uGroundColor, uSkyColor, sky);
    float occlusion = mix(0.35, 1.0, pow(vLayer, 0.7));
    float translucency = pow(clamp(dot(-v, uSunDir), 0.0, 1.0), 4.0) * vLayer;
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0) * uRim * vLayer;

    vec3 base = mix(vColor * 0.65, mix(vColor, uTipTint, 0.25), vLayer);
    vec3 col = base * (ambient * 0.55 + uSunColor * wrap * 0.9) * occlusion;
    col += uSunColor * base * translucency * 1.2;
    col += mix(uSkyColor, uTipTint, 0.5) * rim;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const sharedFurUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.45, 0.7, 0.35).normalize() },
  uSunColor: { value: new THREE.Color('#fff1d6') },
  uSkyColor: { value: new THREE.Color('#a9c8ff') },
  uGroundColor: { value: new THREE.Color('#ff9ad5') },
  uWind: { value: new THREE.Vector3(0.18, 0, 0.08) },
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
  tipTint = '#ffffff',
  rim = 0.9,
  seed = Math.random(),
} = {}) {
  if (!geometry.getAttribute('color')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  if (!geometry.getAttribute('aSeed')) {
    const count = geometry.getAttribute('position').count;
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
      uTipTint: { value: new THREE.Color(tipTint) },
      uRim: { value: rim },
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
