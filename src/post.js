// Post-processing chain: [ink outlines] → god rays → bloom → tilt-shift → filmic grade → output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

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
        // High threshold: only the emissive sun disc casts rays, not the bright sky.
        float bright = max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.8, 0.0);
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
    // Natural grade: true saturation, faintly cool shadows, gentle warm highlights.
    uSaturation: { value: 1.0 },
    uContrast: { value: 1.08 },
    uShadowTint: { value: new THREE.Color('#7088a6') },
    uHighlightTint: { value: new THREE.Color('#fff6ea') },
    uVignette: { value: 0.25 },
    uAberration: { value: 0.0002 },
    uGrain: { value: 0.025 },
  },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSaturation;
    uniform float uContrast;
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

      // Log-space contrast around linear mid-grey: depth without crushing light colors.
      c = 0.18 * pow(max(c, 0.0) / 0.18, vec3(uContrast));
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      float shadow = 1.0 - smoothstep(0.0, 0.45, luma);
      float highlight = smoothstep(0.55, 1.2, luma);
      // Tint shadows cool by multiplying (never lifting blacks into a milky veil).
      c *= mix(vec3(1.0), uShadowTint * 1.6, shadow * 0.3);
      c = mix(c, c * uHighlightTint * 1.1, highlight * 0.35);

      c *= 1.0 - uVignette * smoothstep(0.12, 0.6, edge * 2.0);
      c += (rand(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};

/**
 * Ink outlines, as the cave painting draws them: a thin line of a darker tone of the local colour
 * around every silhouette and step. Found in the scene's depth buffer: inverse view depth is linear
 * in screen space on any plane, so its Laplacian is zero on flat faces (the floor at a grazing
 * angle included) and spikes where one surface passes behind another or at a sharp crease.
 * Normalized by the depth itself, so a line has the same weight near and far.
 */
class InkPass extends Pass {
  constructor(camera, { strength = 0.4, threshold = 0.05, tint = '#6a4a46' } = {}) {
    super();
    this.camera = camera;
    this.fsQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 576) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uStrength: { value: strength },
        uThreshold: { value: threshold },
        uTint: { value: new THREE.Color(tint) },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uNear;
        uniform float uFar;
        uniform float uStrength;
        uniform float uThreshold;
        uniform vec3 uTint;
        varying vec2 vUv;
        float invDepth(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
        }
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float w = invDepth(vUv);
          float lap = invDepth(vUv + vec2(uTexel.x, 0.0)) + invDepth(vUv - vec2(uTexel.x, 0.0))
                    + invDepth(vUv + vec2(0.0, uTexel.y)) + invDepth(vUv - vec2(0.0, uTexel.y)) - 4.0 * w;
          float e = abs(lap) / max(w, 1e-4);
          float ink = smoothstep(uThreshold, uThreshold * 2.5, e) * uStrength;
          // A darker, warmer tone of what is there, never black.
          vec3 line = c.rgb * mix(vec3(1.0), uTint * 1.4, 0.6) * 0.55;
          gl_FragColor = vec4(mix(c.rgb, line, ink), c.a);
        }
      `,
    }));
  }

  setSize(width, height) {
    this.fsQuad.material.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.fsQuad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }
}

export function createPost(renderer, scene, camera, {
  lowfx = false, bloomStrength = 0.35, godRays: useGodRays = true, tiltShift: useTiltShift = true, saturation = 1.0,
  outline = null, contrast, shadowTint,
} = {}) {
  // Ink outlines read the scene's depth, so the composer's targets carry a depth texture then.
  let composer;
  let ink = null;
  if (outline) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    composer = new EffectComposer(renderer, target);
    // The composer clones the target for its ping-pong buffer; give each its own depth texture so
    // the ink pass never samples the depth of the buffer it writes.
    composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
  } else {
    composer = new EffectComposer(renderer);
  }
  composer.addPass(new RenderPass(scene, camera));
  if (outline) {
    ink = new InkPass(camera, outline === true ? {} : outline);
    composer.addPass(ink);
  }

  const godRays = new ShaderPass(godRaysShader);
  if (!lowfx && useGodRays) composer.addPass(godRays);

  // Threshold above lit surfaces so only glints, glitter, motes and the sun bloom.
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bloomStrength, 0.6, 1.3);
  composer.addPass(bloom);

  const tiltH = new ShaderPass(tiltShiftShader(new THREE.Vector2(1, 0)));
  const tiltV = new ShaderPass(tiltShiftShader(new THREE.Vector2(0, 1)));
  if (!lowfx && useTiltShift) {
    composer.addPass(tiltH);
    composer.addPass(tiltV);
  }

  const grade = new ShaderPass(gradeShader);
  grade.uniforms.uSaturation.value = saturation;
  if (contrast !== undefined) grade.uniforms.uContrast.value = contrast;
  if (shadowTint !== undefined) grade.uniforms.uShadowTint.value.set(shadowTint);
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
    /** Re-grades live (the game's areas each have their own grade). */
    setGrade({ saturation: s, contrast: c, shadowTint: t } = {}) {
      if (s !== undefined) grade.uniforms.uSaturation.value = s;
      if (c !== undefined) grade.uniforms.uContrast.value = c;
      if (t !== undefined) grade.uniforms.uShadowTint.value.set(t);
    },
    /** Bloom strength (the quality setting turns it off on low). */
    setBloom(strength) { bloom.strength = strength; },
    render(time, sunDir, sunColor) {
      // Project the sun into screen space; fade rays out as it leaves the view.
      sunWorld.copy(camera.position).addScaledVector(sunDir, 400);
      sunNdc.copy(sunWorld).project(camera);
      camera.getWorldDirection(forward);
      toSun.copy(sunDir).normalize();
      const facing = THREE.MathUtils.smoothstep(forward.dot(toSun), 0.0, 0.5);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)), 1.0, 1.6);
      godRays.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
      godRays.uniforms.uIntensity.value = 0.7 * facing * onScreen;
      godRays.uniforms.uColor.value.copy(sunColor);
      grade.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
