// Post-processing chain: god rays → bloom → tilt-shift → filmic grade → output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Screen-space light shafts: march from each pixel toward the sun, gathering bright
// (unoccluded sky) samples, so canopies and clouds cut visible rays.
const godRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.8) },
    uIntensity: { value: 0.0 },
    uColor: { value: new THREE.Color('#ffc58f') },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uIntensity;
    uniform vec3 uColor;
    varying vec2 vUv;
    const int SAMPLES = 48;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 delta = (vUv - uSun) / float(SAMPLES) * 0.9;
      vec2 uv = vUv;
      float decay = 1.0;
      float shafts = 0.0;
      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float bright = max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.15, 0.0);
        shafts += bright * decay;
        decay *= 0.955;
      }
      shafts /= float(SAMPLES);
      gl_FragColor = vec4(base + uColor * shafts * uIntensity, 1.0);
    }
  `,
};

// Separable tilt-shift blur: sharp focus band, growing blur above and below it.
function tiltShiftShader(direction) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFocus: { value: 0.56 },
      uBand: { value: 0.22 },
      uMaxRadius: { value: 2.4 },
      uDirection: { value: direction },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform float uFocus;
      uniform float uBand;
      uniform float uMaxRadius;
      uniform vec2 uDirection;
      varying vec2 vUv;
      void main() {
        float amount = smoothstep(uBand, uBand + 0.4, abs(vUv.y - uFocus));
        vec2 stepUv = uDirection / uResolution * uMaxRadius * amount;
        vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270;
        sum += texture2D(tDiffuse, vUv + stepUv * 1.3846).rgb * 0.3162;
        sum += texture2D(tDiffuse, vUv - stepUv * 1.3846).rgb * 0.3162;
        sum += texture2D(tDiffuse, vUv + stepUv * 3.2308).rgb * 0.0703;
        sum += texture2D(tDiffuse, vUv - stepUv * 3.2308).rgb * 0.0703;
        gl_FragColor = vec4(sum, 1.0);
      }
    `,
  };
}

// Filmic grade: saturation, split-tone, edge chromatic aberration, vignette, grain.
const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSaturation: { value: 1.4 },
    uShadowTint: { value: new THREE.Color('#5a2a9a') },
    uHighlightTint: { value: new THREE.Color('#ffd9b0') },
    uVignette: { value: 0.38 },
    uAberration: { value: 0.0007 },
    uGrain: { value: 0.035 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSaturation;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 fromCenter = vUv - 0.5;
      float edge = dot(fromCenter, fromCenter);
      vec2 shift = fromCenter * edge * uAberration * 40.0;
      vec3 c = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );

      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      float shadow = 1.0 - smoothstep(0.0, 0.45, luma);
      float highlight = smoothstep(0.55, 1.2, luma);
      c += uShadowTint * 0.1 * shadow;
      c = mix(c, c * uHighlightTint * 1.1, highlight * 0.35);

      c *= 1.0 - uVignette * smoothstep(0.12, 0.6, edge * 2.0);
      c += (rand(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera, { lowfx = false } = {}) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const godRays = new ShaderPass(godRaysShader);
  if (!lowfx) composer.addPass(godRays);

  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.65, 0.9);
  composer.addPass(bloom);

  const tiltH = new ShaderPass(tiltShiftShader(new THREE.Vector2(1, 0)));
  const tiltV = new ShaderPass(tiltShiftShader(new THREE.Vector2(0, 1)));
  if (!lowfx) {
    composer.addPass(tiltH);
    composer.addPass(tiltV);
  }

  const grade = new ShaderPass(gradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const sunWorld = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const toSun = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function setSize(width, height) {
    composer.setSize(width, height);
    const ratio = renderer.getPixelRatio();
    for (const pass of [tiltH, tiltV]) pass.uniforms.uResolution.value.set(width * ratio, height * ratio);
  }
  setSize(innerWidth, innerHeight);

  return {
    setSize,
    render(time, sunDir, sunColor) {
      // Project the sun into screen space; fade rays out as it leaves the view.
      sunWorld.copy(camera.position).addScaledVector(sunDir, 400);
      sunNdc.copy(sunWorld).project(camera);
      camera.getWorldDirection(forward);
      toSun.copy(sunDir).normalize();
      const facing = THREE.MathUtils.smoothstep(forward.dot(toSun), 0.0, 0.5);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)), 1.0, 1.6);
      godRays.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
      godRays.uniforms.uIntensity.value = 1.0 * facing * onScreen;
      godRays.uniforms.uColor.value.copy(sunColor);
      grade.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
