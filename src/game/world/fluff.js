// Fluff puffs: the felt world's particles (landing puffs, running scuffs, a find's sparkle burst, a
// petted dog's happy fluff). One pooled THREE.Points of soft round motes: a ring buffer of MAX
// particles, so bursts never allocate and old motes are simply overwritten.
import * as THREE from 'three';

const MAX = 384;

const vertexShader = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vAge;
  varying vec3 vColor;
  void main() {
    vAge = aAge;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float grow = 0.6 + 0.8 * smoothstep(0.0, 0.3, aAge);
    gl_PointSize = aSize * grow * (300.0 / -mv.z) * step(0.0, aAge) * step(aAge, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  varying float vAge;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.2, d) * (1.0 - smoothstep(0.55, 1.0, vAge));
    gl_FragColor = vec4(vColor, a * 0.85);
  }
`;

export function createFluff() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(2);
  const size = new Float32Array(MAX);
  const color = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX).fill(1);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  points.name = 'fluff';
  let next = 0;
  const c = new THREE.Color();

  /**
   * A burst at `at`: count motes thrown outward (spread) and upward (lift), drifting down slowly.
   * colors: one or more CSS colours picked per mote.
   */
  function puff(at, { count = 10, colors = ['#fbf3ea'], spread = 1.2, lift = 1.2, size: s = 0.09, life: l = 0.9 } = {}) {
    for (let k = 0; k < count; k++) {
      const i = next;
      next = (next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 0.6) * spread;
      pos.set([at.x + Math.cos(a) * 0.1, at.y + 0.05, at.z + Math.sin(a) * 0.1], i * 3);
      vel.set([Math.cos(a) * r, lift * (0.4 + Math.random() * 0.8), Math.sin(a) * r], i * 3);
      age[i] = 0;
      life[i] = l * (0.7 + Math.random() * 0.6);
      size[i] = s * (0.6 + Math.random() * 0.8);
      c.set(colors[k % colors.length]);
      color.set([c.r, c.g, c.b], i * 3);
    }
  }

  function update(dt) {
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (age[i] > 1) continue;
      alive = true;
      age[i] += dt / life[i];
      const drag = Math.exp(-dt * 3.2);
      vel[i * 3] *= drag;
      vel[i * 3 + 2] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag - dt * 1.4;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    if (alive) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAge.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    }
  }

  return { points, puff, update };
}
