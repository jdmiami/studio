// Candy sky dome with a raymarched volumetric cloud layer.
import * as THREE from 'three';
import { sharedFurUniforms } from './fur.js';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    vec4 pos = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = pos.xyww; // pin the dome to the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHorizonSun;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uVolumetric;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
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
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  float cloudDensity(vec3 p) {
    vec3 q = p * 0.012 + vec3(uTime * 0.01, 0.0, uTime * 0.004);
    float shape = fbm(q);
    float height = smoothstep(0.0, 0.3, (p.y - 60.0) / 50.0) * smoothstep(1.0, 0.6, (p.y - 60.0) / 50.0);
    return clamp((shape - 0.48) * 3.0, 0.0, 1.0) * height;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y, -1.0, 1.0);

    // Sunset candy gradient: the horizon warms to peach toward the low sun.
    float sunDot = clamp(dot(dir, uSunDir), 0.0, 1.0);
    vec3 horizon = mix(uHorizon, uHorizonSun, pow(sunDot, 3.0));
    vec3 col = mix(horizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.5));
    col = mix(col, horizon * 1.05, smoothstep(0.0, -0.3, up)); // below horizon

    // Soft glow around the felt sun (the disc itself is geometry).
    col += uSunColor * (pow(sunDot, 40.0) * 0.25 + pow(sunDot, 6.0) * 0.05);

    // Volumetric clouds in a slab from y = 60 to 110 (off when felt clouds are used).
    if (uVolumetric > 0.5 && dir.y > 0.02) {
      float tStart = (60.0 - cameraPosition.y) / dir.y;
      float tEnd = (110.0 - cameraPosition.y) / dir.y;
      float stepLen = (tEnd - tStart) / 36.0;
      float transmittance = 1.0;
      vec3 scattered = vec3(0.0);
      for (int i = 0; i < 36; i++) {
        vec3 p = cameraPosition + dir * (tStart + stepLen * (float(i) + 0.5));
        float d = cloudDensity(p);
        if (d > 0.001) {
          float lightD = cloudDensity(p + uSunDir * 8.0);
          float lit = exp(-lightD * 2.5);
          vec3 c = mix(uCloudShade, uCloudLit, lit) + uSunColor * pow(sunDot, 6.0) * lit * 0.6;
          float a = 1.0 - exp(-d * stepLen * 0.06);
          scattered += transmittance * a * c;
          transmittance *= 1.0 - a;
          if (transmittance < 0.02) break;
        }
      }
      float fade = smoothstep(0.02, 0.18, dir.y);
      col = mix(col, scattered + col * transmittance, fade);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: sharedFurUniforms.uTime,
      uSunDir: sharedFurUniforms.uSunDir,
      uSunColor: sharedFurUniforms.uSunColor,
      // Pastel sky: powder zenith, blush horizon, cream toward the sun.
      uZenith: { value: new THREE.Color('#c9d3ef') },
      uHorizon: { value: new THREE.Color('#f6e7ec') },
      uHorizonSun: { value: new THREE.Color('#fbefe2') },
      uCloudLit: { value: new THREE.Color('#ffe9f4') },
      uCloudShade: { value: new THREE.Color('#9a6bff') },
      uVolumetric: { value: 0 }, // felt cutout clouds replace the volumetric layer
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  sky.frustumCulled = false;
  return sky;
}
