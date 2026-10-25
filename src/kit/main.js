// The pastel-cubism kit page (kit.html): every kit element on one sheet, posed and lit like
// docs/reference/asset-kit.jpg so each one can be scored against its crop of the reference.
//
// URL flags:
//   ?family=blocks       only that family (each family module loads on its own, so a broken
//                        module only breaks its own items)
//   ?only=id1,id2        only those items
//   ?overlay=0.5         show the reference sheet over the render at that opacity (dev server)
//   ?shot=1              render a few frames, then set window.__phluphReady for screenshots
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import { rng } from '../world/util.js';
import { ITEMS, SHEET, anchorOf } from './manifest.js';
import { createKitRenderer } from './render.js';
import { KIT_STAGE, applyKitLighting, castShadows } from './style.js';

const params = new URLSearchParams(location.search);
const familyFilter = params.get('family');
const onlyFilter = params.get('only')?.split(',');
const shot = params.has('shot');
const families = import.meta.glob('./families/*.js');

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(shot ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(KIT_STAGE.background);
applyKitLighting();
sharedFurUniforms.uTime.value = 1;

// Isometric camera: orthographic, looking from +x +z at the stage's elevation.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
const dir = new THREE.Vector3(
  Math.cos(KIT_STAGE.elevation) * Math.sin(KIT_STAGE.azimuth),
  Math.sin(KIT_STAGE.elevation),
  Math.cos(KIT_STAGE.elevation) * Math.cos(KIT_STAGE.azimuth),
);
camera.position.copy(dir).multiplyScalar(40);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(); // groundPointAt unprojects before the first render

// Soft shadows on an invisible ground that writes no depth (the outline pass reads depth to
// find silhouettes, so only elements may write it).
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ color: '#4a4048', opacity: KIT_STAGE.shadowOpacity, depthWrite: false }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.renderOrder = -1;
scene.add(ground);
const sun = new THREE.DirectionalLight('#ffffff', 1);
sun.position.copy(KIT_STAGE.sunDir).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 10;
sun.shadow.blurSamples = 16;
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });
scene.add(sun);
scene.add(sun.target);

const kit = createKitRenderer(renderer, scene, camera);

function layout() {
  // Fit the whole reference sheet in the window, keeping its aspect.
  const w = innerWidth;
  const h = innerHeight;
  const sheetAspect = SHEET.width / SHEET.height;
  const pxPerRef = Math.min(w / SHEET.width, h / SHEET.height); // window pixels per sheet pixel
  const halfH = (h / pxPerRef) / KIT_STAGE.pxPerUnit / 2;
  const halfW = halfH * (w / h);
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  kit.setSize(w, h, pxPerRef);
  return { pxPerRef, sheetAspect };
}
let view = layout();

/** World point on the ground under a reference-sheet pixel. */
function groundPointAt([u, v]) {
  const w = innerWidth;
  const h = innerHeight;
  // Sheet pixel -> window pixel (the sheet is centered in the window) -> NDC.
  const x = w / 2 + (u - SHEET.width / 2) * view.pxPerRef;
  const y = h / 2 + (v - SHEET.height / 2) * view.pxPerRef;
  const ndc = new THREE.Vector3((x / w) * 2 - 1, 1 - (y / h) * 2, -1).unproject(camera);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const t = -ndc.y / forward.y;
  return ndc.addScaledVector(forward, t);
}

const items = ITEMS.filter((it) => (!familyFilter || it.family === familyFilter) && (!onlyFilter || onlyFilter.includes(it.id)));
const errors = [];
await Promise.all([...new Set(items.map((it) => it.family))].map(async (family) => {
  const load = families[`./families/${family}.js`];
  if (!load) { errors.push(`no module for family "${family}"`); return; }
  let mod;
  try {
    mod = await load();
  } catch (e) {
    errors.push(`${family}: ${e.message}`);
    return;
  }
  for (const item of items.filter((it) => it.family === family)) {
    try {
      const object = mod.build(item.variant, rng(item.variant.seed ?? 1), item);
      // A family module may export ANCHORS = { id: [u, v] } to fine-tune where its items stand.
      object.position.copy(groundPointAt(mod.ANCHORS?.[item.id] ?? anchorOf(item)));
      object.name = item.id;
      scene.add(castShadows(object));
    } catch (e) {
      errors.push(`${item.id}: ${e.message}`);
    }
  }
}));
for (const e of errors) console.error(`[kit] ${e}`);
window.__kitErrors = errors;
window.__kitScene = scene; // for probes and tests

if (params.has('overlay')) {
  const img = document.createElement('img');
  img.src = SHEET.image;
  const w = SHEET.width * view.pxPerRef;
  const h = SHEET.height * view.pxPerRef;
  Object.assign(img.style, {
    position: 'fixed', left: `${(innerWidth - w) / 2}px`, top: `${(innerHeight - h) / 2}px`,
    width: `${w}px`, height: `${h}px`, opacity: params.get('overlay') || '0.5', pointerEvents: 'none',
  });
  document.body.appendChild(img);
}

addEventListener('resize', () => { view = layout(); });

let frames = 0;
renderer.setAnimationLoop(() => {
  kit.render();
  if (shot && ++frames === 3) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});
