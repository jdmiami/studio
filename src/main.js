import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sharedFurUniforms } from './fur.js';
import { createSky } from './sky.js';
import { createPost } from './post.js';
import { buildWorld } from './world/index.js';
import { rng } from './world/util.js';
import { buildCave } from './cave/index.js';
import { createFirstPersonControls } from './fp/controls.js';
import { createHands } from './fp/hands.js';
import { createHud } from './fp/hud.js';

// URL flags:
//   ?scene=island      the orbiting island showcase instead of the first-person cave (default)
//   ?shot=<seconds>    freeze time for a repeatable screenshot
//   ?cam=x,y,z         island only: starting camera position
//   ?lowfx=1           skip god rays and tilt-shift; ?bloom=<strength> overrides bloom
const params = new URLSearchParams(location.search);
const sceneName = params.get('scene') === 'island' ? 'island' : 'cave';
const shotTime = params.has('shot') ? Number(params.get('shot') || 4) : null;
const lowfx = params.has('lowfx');
const bloomStrength = params.has('bloom') ? Number(params.get('bloom')) : undefined;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
// Khronos PBR Neutral keeps hues true; ACES greyed bright front-lit colors into a milky wash.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = createSky();
scene.add(sky);

const start = sceneName === 'cave' ? startCave() : startIsland();
const post = createPost(renderer, scene, start.camera, { lowfx, bloomStrength, ...start.postOptions });

addEventListener('resize', () => {
  start.camera.aspect = innerWidth / innerHeight;
  start.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let last = 0;
let frames = 0;
renderer.setAnimationLoop(() => {
  const now = clock.getElapsedTime();
  const dt = now - last;
  last = now;
  const time = shotTime ?? now;
  sharedFurUniforms.uTime.value = time;
  start.update(time, shotTime === null ? dt : 0);
  sky.position.copy(start.camera.position);
  post.render(time, sharedFurUniforms.uSunDir.value, sharedFurUniforms.uSunColor.value);
  // Screenshot mode: after a few frames, stop rendering so the capture isn't racing a
  // slow (software-rendered) frame, then signal readiness.
  if (++frames === 3 && shotTime !== null) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});

// --- Scenes -------------------------------------------------------------------

function startCave() {
  // Warm light from above-left, behind the player, so the great door is lit.
  sharedFurUniforms.uSunDir.value.set(-0.4, 0.8, 0.45).normalize();
  sharedFurUniforms.uSunColor.value.set('#fff1e2').multiplyScalar(1.2);
  sharedFurUniforms.uSkyColor.value.set('#f0ddd2');
  sharedFurUniforms.uGroundColor.value.set('#dcb4a4');
  sharedFurUniforms.uFogColor.value.set('#f2dfd2');
  sharedFurUniforms.uFogDensity.value = 0.004;
  const u = sky.material.uniforms;
  u.uZenith.value.set('#9cc2ec');
  u.uHorizon.value.set('#fbe8d6');
  u.uHorizonSun.value.set('#fff3dc');

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 600);
  scene.add(camera); // the hands are children of the camera
  const cave = buildCave(scene);
  const controls = createFirstPersonControls(camera, renderer.domElement, cave);
  const hands = createHands(camera, rng(7));
  const hud = createHud({ columns: cave.columns, interactables: cave.interactables, shot: shotTime !== null });

  let near = null;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !near) return;
    if (near.id === 'door') hud.completeQuest();
    if (near.id === 'dog') hud.showToast('The fluffy dog wags its whole body at you!');
  });

  // Read-only handle for automated tests (scripts/fp-walk-test.mjs).
  window.__phluph = { get position() { return controls.position.clone(); } };

  const timerStart = 15 * 60 - 3; // matches the reference frame's 14:57
  return {
    camera,
    postOptions: { godRays: false, tiltShift: false, saturation: 0.9 }, // the reference's muted chalky colors
    update(time, dt) {
      controls.update(dt);
      hands.update(controls.walkPhase, controls.speed);
      cave.update(time);
      near = hud.update({
        dt,
        yaw: controls.yaw,
        position: controls.position,
        running: controls.running,
        moving: controls.speed > 0.1,
        timeLeft: timerStart - (shotTime === null ? time : 0),
      });
    },
  };
}

function startIsland() {
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 1200);
  const cam = params.get('cam')?.split(',').map(Number);
  if (cam?.length === 3 && cam.every(Number.isFinite)) camera.position.set(...cam);
  else camera.position.set(15, 5.5, 14); // low three-quarter view facing the sunset
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.5, 0);
  controls.enableDamping = true;
  controls.autoRotate = shotTime === null;
  controls.autoRotateSpeed = 0.35;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 60;
  const world = buildWorld(scene);
  return {
    camera,
    postOptions: {},
    update(time) {
      world.update(time);
      controls.update();
    },
  };
}
