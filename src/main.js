import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sharedFurUniforms } from './fur.js';
import { createSky } from './sky.js';
import { buildWorld } from './world.js';
import { createPost } from './post.js';

// ?shot=<seconds> freezes time at that value and disables auto-rotation, for screenshots.
// ?lowfx=1 skips god rays and tilt-shift for weaker GPUs.
const params = new URLSearchParams(location.search);
const shotTime = params.has('shot') ? Number(params.get('shot') || 4) : null;
const lowfx = params.has('lowfx');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1200);
// Low three-quarter view facing the sunset, so the island is backlit.
// ?cam=x,y,z overrides the starting camera position.
const cam = params.get('cam')?.split(',').map(Number);
if (cam?.length === 3 && cam.every(Number.isFinite)) camera.position.set(...cam);
else camera.position.set(15, 5.5, 14);

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
const post = createPost(renderer, scene, camera, { lowfx });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const time = shotTime ?? clock.getElapsedTime();
  sharedFurUniforms.uTime.value = time;
  world.update(time);
  controls.update();
  sky.position.copy(camera.position);
  post.render(time, sharedFurUniforms.uSunDir.value, sharedFurUniforms.uSunColor.value);
  // Screenshot mode: after a few frames, stop rendering so the capture isn't racing a
  // slow (software-rendered) frame, then signal readiness.
  if (++frames === 3 && shotTime !== null) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});
