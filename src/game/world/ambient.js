// Ambient life: the soft things in the air. Dust motes drifting and twinkling inside the cave's
// light shafts (as in the painting), pollen round the player on meadow trips, slow glowing
// fireflies in grottos, pale motes over lakes. One THREE.Points of round soft sprites; each mote
// wanders on a smooth noise field and wraps round its volume, so the cloud never thins out.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScale;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vTw = 0.55 + 0.45 * sin(uTime * (1.3 + aPhase) + aPhase * 17.0);
    gl_PointSize = aSize * uScale * (220.0 / -mv.z);
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTw;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * (0.8 + 0.4 * vTw), a * a * uOpacity * vTw);
  }
`;

/** Area presets: how many motes, their colour, size, brightness and drift speed. */
export const AMBIENT_PRESETS = {
  hub: { count: 260, color: '#fff1d6', size: 0.05, opacity: 0.85, speed: 0.08, additive: true },
  meadow: { count: 160, color: '#fff8e0', size: 0.045, opacity: 0.7, speed: 0.22, additive: true },
  grotto: { count: 90, color: '#ffe48f', size: 0.09, opacity: 0.95, speed: 0.12, additive: true },
  lake: { count: 140, color: '#eaf4ff', size: 0.05, opacity: 0.6, speed: 0.16, additive: true },
};

/**
 * A point inside a light shaft: shafts are { from: [x, y, z], target: Vector3-like, width }.
 * t along the shaft, a random offset across it (the shaft's cross-section).
 */
export function pointInShaft(shaft, r1, r2, r3) {
  const a = shaft.from;
  const b = shaft.target;
  const t = 0.1 + 0.85 * r1;
  const ang = r2 * Math.PI * 2;
  const rad = Math.sqrt(r3) * shaft.width * 0.42;
  return [a[0] + (b.x - a[0]) * t + Math.cos(ang) * rad, a[1] + (b.y - a[1]) * t, a[2] + (b.z - a[2]) * t + Math.sin(ang) * rad];
}

export function createAmbient() {
  const MAX = 300;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const home = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const phase = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color('#fff1d6') }, uOpacity: { value: 0.8 } },
  });
  const points = new THREE.Points(geo, material);
  points.name = 'ambient';
  points.frustumCulled = false;
  points.renderOrder = 5;

  let preset = AMBIENT_PRESETS.hub;
  let mode = 'hub';
  let shafts = [];
  let count = 0;
  const center = new THREE.Vector3();

  function seedMote(i, anchor) {
    const r = () => Math.random();
    let p;
    if (mode === 'hub' && shafts.length) p = pointInShaft(shafts[i % shafts.length], r(), r(), r());
    else p = [anchor.x + (r() - 0.5) * 24, anchor.y + 0.3 + r() * 4, anchor.z + (r() - 0.5) * 24];
    home.set(p, i * 3);
    pos.set(p, i * 3);
    size[i] = preset.size * (0.5 + r());
    phase[i] = r();
  }

  return {
    points,
    /** kind: 'hub' (motes in the shafts) or a trip biome; shafts: the cave's light shafts. */
    setArea({ kind = 'hub', shafts: list = [] } = {}, anchor = new THREE.Vector3()) {
      mode = kind;
      shafts = list;
      preset = AMBIENT_PRESETS[kind] ?? AMBIENT_PRESETS.meadow;
      count = Math.min(MAX, preset.count);
      material.uniforms.uColor.value.set(preset.color);
      material.uniforms.uOpacity.value = preset.opacity;
      for (let i = 0; i < MAX; i++) {
        if (i < count) seedMote(i, anchor);
        else pos.set([0, -999, 0], i * 3);
      }
      geo.setDrawRange(0, count);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aPhase.needsUpdate = true;
    },
    update(dt, time, viewer) {
      material.uniforms.uTime.value = time;
      const s = preset.speed;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        const ph = phase[i] * 40;
        // A smooth wander round home: three slow sines per axis, never the same twice.
        pos[k] = home[k] + Math.sin(time * s * 1.7 + ph) * 0.35 + Math.sin(time * s * 0.6 + ph * 2.1) * 0.6;
        pos[k + 1] = home[k + 1] + Math.sin(time * s * 1.1 + ph * 1.3) * 0.3;
        pos[k + 2] = home[k + 2] + Math.cos(time * s * 1.4 + ph * 0.7) * 0.4 + Math.sin(time * s * 0.5 + ph) * 0.5;
        // Outdoors the cloud follows the player: motes left far behind come back round ahead.
        if (mode !== 'hub' && viewer) {
          const dx = home[k] - viewer.x;
          const dz = home[k + 2] - viewer.z;
          if (Math.abs(dx) > 13) home[k] -= Math.sign(dx) * 26;
          if (Math.abs(dz) > 13) home[k + 2] -= Math.sign(dz) * 26;
          if (home[k + 1] < viewer.y - 1 || home[k + 1] > viewer.y + 6) home[k + 1] = viewer.y + 0.3 + Math.random() * 4;
        }
      }
      geo.attributes.position.needsUpdate = true;
      center.copy(viewer ?? center);
    },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
