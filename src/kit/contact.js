// Contact shadow: a soft dark decal on the ground hugging the outline of where an element actually
// touches it (its vertices within a few centimetres of y = 0), darkest at the contact edge. This is
// the reference sheet's ambient-occluded ground line, which a directional shadow map can't make.
// The decal writes no depth, so the outline pass never draws a line around it.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uMin;
  uniform vec2 uMax;
  uniform float uRadius;
  uniform float uSoftness;
  uniform float uStrength;
  uniform vec3 uColor;
  uniform vec2 uBias;
  varying vec2 vXZ;
  void main() {
    // Signed distance to the rounded footprint rectangle, nudged toward the shadow side.
    vec2 p = vXZ - uBias;
    vec2 c = (uMin + uMax) * 0.5;
    vec2 h = (uMax - uMin) * 0.5 - uRadius;
    vec2 q = abs(p - c) - h;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float a = uStrength * (1.0 - smoothstep(0.0, uSoftness, d));
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Adds contact decals under `element` (already placed in world space): one per part that stands on
 * the ground (a fence's two posts get one each, not one strip spanning both).
 */
export function addContactShadow(scene, element, { strength = 0.65, softness = 0.05, color = '#2c3048', near = 0.06, bias = [0.06, -0.09] } = {}) {
  element.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const footprints = [];
  element.traverse((o) => {
    // Parts that only brush the ground (willow drip tips) set userData.noContact.
    if (!o.isMesh || o.isInstancedMesh || o.userData.noContact) return;
    const min = new THREE.Vector2(Infinity, Infinity);
    const max = new THREE.Vector2(-Infinity, -Infinity);
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > near) continue;
      min.min(new THREE.Vector2(v.x, v.z));
      max.max(new THREE.Vector2(v.x, v.z));
    }
    if (Number.isFinite(min.x)) footprints.push([min, max]);
  });
  return footprints.map(([min, max]) => {
    const size = max.clone().sub(min);
    const pad = softness * 2;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x + pad * 2, size.y + pad * 2),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMin: { value: min },
          uMax: { value: max },
          uRadius: { value: Math.min(size.x, size.y) * 0.15 },
          uSoftness: { value: softness },
          uStrength: { value: strength },
          uColor: { value: new THREE.Color(color) },
          uBias: { value: new THREE.Vector2(...bias) },
        },
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((min.x + max.x) / 2, 0.002, (min.y + max.y) / 2);
    plane.renderOrder = -0.5; // over the cast shadow, under every element
    scene.add(plane);
    return plane;
  });
}

const blobFragment = /* glsl */ `
  uniform vec2 uCenter;
  uniform vec2 uRadii;
  uniform float uAngle;
  uniform float uStrength;
  uniform float uCore;
  uniform vec3 uColor;
  varying vec2 vXZ;
  void main() {
    vec2 p = vXZ - uCenter;
    // World x/z -> screen-aligned (s: screen-right, d: toward the camera), then the blob's own turn.
    vec2 q = vec2(p.x - p.y, p.x + p.y) * 0.70710678;
    float c = cos(uAngle); float s = sin(uAngle);
    q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) / uRadii;
    float a = uStrength * (1.0 - smoothstep(uCore, 1.0, length(q)));
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Soft elliptical shadow blobs on the ground, for elements whose reference shadow a single
 * directional light can't reproduce (the sheet's shadows are not physically consistent: blocks
 * cast short ones, trees long ones). Each blob is [s, d, rs, rd, strength, turn?, core?] in
 * screen-aligned units relative to the element's base: s along screen-right, d toward the camera,
 * radii along those axes, an optional turn (radians, from the s axis toward d) and core (the
 * fraction of the radius that is fully dark before the fade; 0.15 by default, higher is crisper). scripts/kit/shadowfit.py
 * fits them to the reference's ground.
 */
export function addShadowBlobs(scene, element, blobs, color = '#3a3d55') {
  const k = Math.SQRT1_2;
  for (const [bs, bd, rs, rd, strength, turn = 0, core = 0.15] of blobs) {
    const center = new THREE.Vector2(element.position.x + (bs + bd) * k, element.position.z + (bd - bs) * k);
    const size = Math.max(rs, rd) * 2.2; // the blob fades to zero at radius 1
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: blobFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uCenter: { value: center },
          uRadii: { value: new THREE.Vector2(rs, rd) },
          uAngle: { value: turn },
          uStrength: { value: strength },
          uCore: { value: core },
          uColor: { value: new THREE.Color(color) },
        },
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(center.x, 0.0015, center.y);
    plane.renderOrder = -0.6;
    scene.add(plane);
  }
}

const planarFragment = /* glsl */ `
  uniform sampler2D uMask;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(uColor, uStrength * texture2D(uMask, vUv).r);
  }
`;

const planarVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Planar soft shadow: the element's own geometry flattened onto the ground along its own light
 * direction, blurred, as a decal. For shadows that follow an element's shape (fence rails, a
 * lollipop's stick and disc) but fall where the global light doesn't throw them. `dir` is the
 * ground offset per unit of height in screen-aligned units [s, d] (s: screen-right, d: toward the
 * camera), `soft` the blur radius in world units.
 */
export function addPlanarShadow(renderer, scene, element, { dir = [0.1, -0.7], strength = 0.5, soft = 0.04, color = '#3a3d55', res = 160 } = {}) {
  element.updateMatrixWorld(true);
  const ox = (dir[0] + dir[1]) * Math.SQRT1_2;
  const oz = (dir[1] - dir[0]) * Math.SQRT1_2;
  const positions = [];
  const v = new THREE.Vector3();
  element.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      positions.push(v.x + ox * v.y, 0, v.z + oz * v.y);
    }
  });
  if (!positions.length) return null;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const pad = soft * 3 + 0.02;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const size = Math.max(maxX - minX, maxZ - minZ);
  const cx = (minX + maxX) / 2; const cz = (minZ + maxZ) / 2;
  // Render the flattened silhouette from above into a mask.
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const maskScene = new THREE.Scene();
  maskScene.add(new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })));
  const top = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, 10);
  top.position.set(cx, 5, cz);
  top.up.set(0, 0, -1);
  top.lookAt(cx, 0, cz);
  const target = new THREE.WebGLRenderTarget(res, res);
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(maskScene, top);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearAlpha);
  const pixels = new Uint8Array(res * res * 4);
  renderer.readRenderTargetPixels(target, 0, 0, res, res, pixels);
  target.dispose();
  flat.dispose();
  // Separable box blur, three passes (close to Gaussian), radius in mask pixels.
  let mask = new Float32Array(res * res);
  for (let i = 0; i < res * res; i++) mask[i] = pixels[i * 4] / 255;
  const r = Math.max(1, Math.round((soft / size) * res));
  const blur1 = (src, horizontal) => {
    const out = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        let s = 0; let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x; const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= res || yy >= res) { n++; continue; }
          s += src[yy * res + xx]; n++;
        }
        out[y * res + x] = s / n;
      }
    }
    return out;
  };
  for (let pass = 0; pass < 3; pass++) mask = blur1(blur1(mask, true), false);
  const data = new Uint8Array(res * res * 4);
  for (let i = 0; i < res * res; i++) { const m = Math.round(mask[i] * 255); data.set([m, m, m, 255], i * 4); }
  const texture = new THREE.DataTexture(data, res, res);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  // The mask's rows run from the camera's bottom (+z) to top (-z), columns along +x; a ground plane
  // rotated -90 deg about x has uv (0, 0) at (minX, +z), matching.
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      vertexShader: planarVertex,
      fragmentShader: planarFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uMask: { value: texture }, uStrength: { value: strength }, uColor: { value: new THREE.Color(color) } },
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(cx, 0.0014, cz);
  plane.renderOrder = -0.6;
  scene.add(plane);
  return plane;
}
