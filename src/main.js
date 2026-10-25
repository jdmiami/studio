import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sharedFurUniforms } from './fur.js';
import { createSky } from './sky.js';
import { buildWorld } from './world.js';

// ?shot=<seconds> freezes time at that value and disables auto-rotation, for screenshots.
const params = new URLSearchParams(location.search);
const shotTime = params.has('shot') ? Number(params.get('shot') || 4) : null;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1200);
// Low three-quarter view so the island, the cloud sea, and the sky clouds share the frame.
camera.position.set(15, 5.5, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.autoRotate = shotTime === null;
controls.autoRotateSpeed = 0.35;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 60;

const sky = createSky();
scene.add(sky);
const world = buildWorld(scene);

// Post: bloom for glowing tips and motes, then a candy color grade.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.82));
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.55 },
    uShadowTint: { value: new THREE.Color('#5a2a8a') },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform vec3 uShadowTint;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);                  // oversaturate
      c += uShadowTint * 0.08 * (1.0 - smoothstep(0.0, 0.5, luma)); // violet shadows
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const time = shotTime ?? clock.getElapsedTime();
  sharedFurUniforms.uTime.value = time;
  world.update(time);
  controls.update();
  sky.position.copy(camera.position);
  composer.render();
  // Screenshot mode: after a few frames, stop rendering so the capture isn't racing a
  // slow (software-rendered) frame, then signal readiness.
  if (++frames === 3 && shotTime !== null) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});
