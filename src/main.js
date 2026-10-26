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
//   Cave matching flags (scripts/fp/compare_frame.py compares a shot to docs/reference/cave-door.jpg):
//   ?eye=x,y,z         camera position, overriding the spawn and eye height
//   ?look=yaw,pitch[,roll]  camera angles in degrees (yaw 0 looks down -z, pitch up is positive)
//   ?fov=<degrees>     vertical field of view (default 58.3, the reference frame's)
//   ?nohud=1 ?nohands=1  hide the HUD / the hands, for comparing the world alone
//   ?clear=x0,x1,z0,z1 hide the level's blocks in that cell box (to look from a solved camera that
//                      the current layout walls in; scripts/fp/solve_camera.py)
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

// Screenshots wait for the scene's loaded assets (the cave's kit models) before counting frames.
let assetsReady = false;
Promise.resolve(start.ready).then(() => { assetsReady = true; }, (e) => { console.error(e); assetsReady = true; });

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
  if (assetsReady && ++frames === 3 && shotTime !== null) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});

// --- Scenes -------------------------------------------------------------------

function startCave() {
  // Warm light from above-left, behind the player, so the great door is lit.
  sharedFurUniforms.uSunDir.value.set(-0.4, 0.8, 0.45).normalize();
  // The reference is chalky and slightly cool (mean Lab b 9.5 against 17 with the warmer light).
  sharedFurUniforms.uSunColor.value.set('#fff6f1').multiplyScalar(1.25);
  sharedFurUniforms.uSkyColor.value.set('#f3e4e2');
  sharedFurUniforms.uGroundColor.value.set('#dcb4a4');
  sharedFurUniforms.uFogColor.value.set('#f2dfd2');
  sharedFurUniforms.uFogDensity.value = 0.004;
  const u = sky.material.uniforms;
  u.uZenith.value.set('#9cc2ec');
  u.uHorizon.value.set('#fbe8d6');
  u.uHorizonSun.value.set('#fff3dc');

  // 58.3 degrees vertical is the reference frame's solved field of view (scripts/fp/solve_camera.py).
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov')) || 58.3, innerWidth / innerHeight, 0.03, 600);
  scene.add(camera); // the hands are children of the camera
  const clear = params.get('clear')?.split(',').map(Number);
  const hide = clear?.length === 4 && clear.every(Number.isFinite)
    ? (x, y, z) => x >= clear[0] && x <= clear[1] && z >= clear[2] && z <= clear[3]
    : null;
  const cave = buildCave(scene, { hide });
  const controls = createFirstPersonControls(camera, renderer.domElement, cave);
  const hands = params.has('nohands') ? { update() {} } : createHands(camera, rng(7));
  const hud = params.has('nohud')
    ? { update: () => null, completeQuest() {}, showToast() {} }
    : createHud({ columns: cave.columns, interactables: cave.interactables, shot: shotTime !== null });
  // A fixed camera pose for matching the reference frame (the controls still run underneath).
  const eye = params.get('eye')?.split(',').map(Number);
  const look = params.get('look')?.split(',').map((v) => THREE.MathUtils.degToRad(Number(v)));
  const fixedPose = () => {
    if (eye?.length === 3 && eye.every(Number.isFinite)) camera.position.set(eye[0], eye[1], eye[2]);
    if (look?.length >= 2 && look.every(Number.isFinite)) camera.rotation.set(look[1], look[0], look[2] ?? 0, 'YXZ');
  };

  let near = null;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || !near) return;
    if (near.id === 'door') hud.completeQuest();
    if (near.id === 'dog') hud.showToast('The fluffy dog wags its whole body at you!');
  });

  // Read-only handles for automated tests (scripts/fp-walk-test.mjs, scripts/fp/trace_blocks.py).
  window.__phluph = { get position() { return controls.position.clone(); } };
  window.__phluphLayout = Object.fromEntries(cave.columns);
  window.__phluphCamera = () => ({
    fov: camera.fov, eye: camera.position.toArray(),
    yaw: THREE.MathUtils.radToDeg(camera.rotation.y), pitch: THREE.MathUtils.radToDeg(camera.rotation.x), roll: THREE.MathUtils.radToDeg(camera.rotation.z),
  });

  const timerStart = 15 * 60 - 3; // matches the reference frame's 14:57
  return {
    camera,
    ready: cave.ready,
    postOptions: { godRays: false, tiltShift: false, saturation: 0.72 }, // the reference's muted chalky colors
    update(time, dt) {
      controls.update(dt);
      fixedPose();
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
