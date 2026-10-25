// The Dew pond and the cotton-wool waterfall that spills from it off the island's edge.
import * as THREE from 'three';
import { createFur, paint, sharedFurUniforms } from '../fur.js';
import { POND, withSeed } from './util.js';

// Glossy pastel water: rippled normals, fresnel sky reflection, sun glint, foamy shoreline.
export function buildPond() {
  const radius = POND.radius + 0.1;
  const geometry = new THREE.CircleGeometry(radius, 64);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: sharedFurUniforms.uTime,
      uSunDir: sharedFurUniforms.uSunDir,
      uSunColor: sharedFurUniforms.uSunColor,
      uRadius: { value: radius },
      uDeep: { value: new THREE.Color('#7fc3cc') },
      uShallow: { value: new THREE.Color('#cdeee8') },
      uZenith: { value: new THREE.Color('#b9c6ee') },
      uHorizon: { value: new THREE.Color('#f7dbe4') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vLocal;
      void main() {
        vLocal = position.xz;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uRadius;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      varying vec3 vWorld;
      varying vec2 vLocal;
      void main() {
        vec2 p = vLocal;
        float t = uTime;
        vec2 slope = vec2(
          cos(p.x * 4.0 + t * 1.3) * 0.5 + cos((p.x + p.y) * 7.0 - t * 1.9) * 0.3 + cos(length(p) * 9.0 - t * 2.4) * p.x,
          cos(p.y * 4.6 - t * 1.1) * 0.5 + cos((p.y - p.x) * 6.0 + t * 1.7) * 0.3 + cos(length(p) * 9.0 - t * 2.4) * p.y
        ) * 0.06;
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 r = reflect(-v, n);
        float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 skyRefl = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.6));
        float glint = pow(max(dot(r, normalize(uSunDir)), 0.0), 300.0) * 12.0;
        float radial = length(p) / uRadius;
        vec3 body = mix(uDeep, uShallow, smoothstep(0.2, 0.95, radial));
        vec3 col = mix(body, skyRefl, fresnel * 0.8) + uSunColor * glint;
        float foam = smoothstep(0.78, 0.95, radial) * (0.6 + 0.4 * sin(radial * 40.0 - t * 2.0));
        col = mix(col, vec3(1.0, 0.97, 0.98), foam * 0.7);
        float alpha = 1.0 - smoothstep(0.93, 1.0, radial);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const pond = new THREE.Mesh(geometry, material);
  pond.position.set(POND.x, -0.3, POND.z);
  return pond;
}

function wispTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,250,252,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Stray fibers so each wisp reads as pulled cotton, not a blurred dot.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r1 = 10 + Math.random() * 20;
    const r2 = r1 + 15 + Math.random() * 25;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
    ctx.quadraticCurveTo(64 + Math.cos(a + 0.3) * r2 * 0.8, 64 + Math.sin(a + 0.3) * r2 * 0.8,
      64 + Math.cos(a + 0.2) * r2, 64 + Math.sin(a + 0.2) * r2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

// Cotton-wool waterfall: a streaming fur ribbon from the pond over the edge into the clouds,
// with loose wisps tumbling alongside.
export function buildWaterfall(random) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(5.4, -0.35, 5.4),
    new THREE.Vector3(6.6, -0.45, 6.6),
    new THREE.Vector3(7.7, -1.2, 7.7),
    new THREE.Vector3(8.3, -4.5, 8.3),
    new THREE.Vector3(8.6, -9.5, 8.6),
    new THREE.Vector3(8.8, -14, 8.8),
  ]);
  const tube = new THREE.TubeGeometry(curve, 80, 0.5, 14, false);
  paint(tube, '#fdf6f8');
  withSeed(tube, random());

  const group = new THREE.Group();
  group.add(createFur(tube, {
    shells: 24, length: 0.55, density: 5.5, gravity: 0.35, curl: 0.5, clump: 0.55,
    tipTint: '#ffffff', rim: 1.6, sheen: 0.5, flow: [0.12, -0.9, 0.12],
  }));

  const count = 110;
  const positions = new Float32Array(count * 3);
  const wisps = Array.from({ length: count }, () => ({
    t: random(),
    speed: 0.05 + random() * 0.05,
    offset: new THREE.Vector3((random() - 0.5) * 1.6, (random() - 0.5) * 0.6, (random() - 0.5) * 1.6),
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 1.1, map: wispTexture(), color: '#fff9fb', transparent: true, depthWrite: false, opacity: 0.85,
  }));
  points.frustumCulled = false;
  group.add(points);

  const p = new THREE.Vector3();
  group.userData.update = (time) => {
    wisps.forEach((w, i) => {
      const t = (w.t + time * w.speed) % 1;
      curve.getPointAt(t, p).add(w.offset.clone().multiplyScalar(0.4 + t));
      positions.set([p.x, p.y, p.z], i * 3);
    });
    geometry.getAttribute('position').needsUpdate = true;
  };
  return group;
}
