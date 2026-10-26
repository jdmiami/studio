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

/** Adds a contact decal under `element` (already placed in world space). */
export function addContactShadow(scene, element, { strength = 0.65, softness = 0.05, color = '#2c3048', near = 0.06, bias = [0.06, -0.09] } = {}) {
  element.updateMatrixWorld(true);
  const min = new THREE.Vector2(Infinity, Infinity);
  const max = new THREE.Vector2(-Infinity, -Infinity);
  const v = new THREE.Vector3();
  element.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.y > near) continue;
      min.min(new THREE.Vector2(v.x, v.z));
      max.max(new THREE.Vector2(v.x, v.z));
    }
  });
  if (!Number.isFinite(min.x)) return null;
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
}

const blobFragment = /* glsl */ `
  uniform vec2 uCenter;
  uniform vec2 uRadii;
  uniform float uAngle;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vXZ;
  void main() {
    vec2 p = vXZ - uCenter;
    float c = cos(uAngle); float s = sin(uAngle);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / uRadii;
    float a = uStrength * (1.0 - smoothstep(0.15, 1.0, length(p)));
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Soft elliptical shadow blobs on the ground, for elements whose reference shadow a single
 * directional light can't reproduce (the sheet's shadows are not physically consistent: blocks
 * cast short ones, trees long ones). Each blob is [s, d, rs, rd, strength] in screen-aligned
 * units relative to the element's base: s along screen-right, d toward the camera.
 */
export function addShadowBlobs(scene, element, blobs, color = '#3a3d55') {
  const k = Math.SQRT1_2;
  for (const [bs, bd, rs, rd, strength] of blobs) {
    const center = new THREE.Vector2(element.position.x + (bs + bd) * k, element.position.z + (bd - bs) * k);
    const size = Math.max(rs, rd) * 2.2;
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
          uAngle: { value: -Math.PI / 4 }, // screen-aligned axes
          uStrength: { value: strength },
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
