// The pastel-cubism kit page (kit.html): every kit element on one sheet, posed and lit like
// docs/reference/asset-kit.jpg so each one can be scored against its crop of the reference.
//
// URL flags:
//   ?family=blocks       only that family, or a list (trees,domes: neighbours' shadows reach into
//                        each other's crops); each family module loads on its own, so a broken
//                        module only breaks its own items
//   ?only=id1,id2        only those items
//   ?overlay=0.5         show the reference sheet over the render at that opacity (dev server)
//   ?finish=procedural   pure procedural felt (default: baked, the reference's de-lit colors baked into
//                        the felt as vertex colors, see src/kit/bake.js)
//   ?warp=N              silhouette-warp passes (default 3 with the baked finish, 0 skips; src/kit/warp.js)
//   ?contact=s,soft,bx,bz  contact-shadow decal strength, softness, bias x/z (for tuning sweeps)
//   ?shadow=opacity      cast-shadow opacity (for tuning sweeps)
//   ?line=side,up[,w,dn,dw] silhouette-line ink strength on side-, up- and down-facing edges, width,
//                        and the down-facing edges' own width
//                        in reference px (for tuning sweeps)
//   ?fit=id:sx,sy,sz,ry  override one element's fit transform (for tuning sweeps)
//   ?anchor=id:u,v       override one element's anchor (for tuning sweeps)
//   ?shot=1              render a few frames, then set window.__phluphReady for screenshots
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import { rng } from '../world/util.js';
import { ITEMS, SHEET, anchorOf } from './manifest.js';
import { bakeFinish, loadSheet } from './bake.js';
import { addContactShadow, addPlanarShadow, addShadowBlobs } from './contact.js';
import { createKitRenderer } from './render.js';
import { warpToReference } from './warp.js';
import { KIT_STAGE, applyKitLighting, castShadows } from './style.js';

const params = new URLSearchParams(location.search);
window.__kitWarpProbe = params.get('warpprobe'); // dev: keep that element's warp fields in __kitWarpDebug
const familyFilter = params.get('family')?.split(',');
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
  new THREE.ShadowMaterial({ color: '#3a3d55', opacity: KIT_STAGE.shadowOpacity, depthWrite: false }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.renderOrder = -1;
scene.add(ground);
const sun = new THREE.DirectionalLight('#ffffff', 1);
sun.position.copy(KIT_STAGE.shadowDir).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6;
sun.shadow.blurSamples = 16;
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });
scene.add(sun);
scene.add(sun.target);
const kit = createKitRenderer(renderer, scene, camera);
if (params.has('line')) {
  const [side, up, width, down, downWidth] = params.get('line').split(',').map(Number);
  kit.uniforms.uLine.value.set(side, up);
  if (width) kit.uniforms.uLineWidth.value = width;
  if (down) kit.uniforms.uLineDown.value = down;
  if (downWidth) kit.uniforms.uLineDownWidth.value = downWidth;
}

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

const anchorArg = params.get('anchor')?.split(':');
const anchorOverride = anchorArg?.length === 2 ? { id: anchorArg[0], value: anchorArg[1].split(',').map(Number) } : null;
const fitArg = params.get('fit')?.split(':');
const fitOverride = fitArg?.length === 2 ? { id: fitArg[0], value: fitArg[1].split(',').map(Number) } : null;
// ?blobs=id:s,d,rs,rd,strength;s,d,... overrides one element's shadow blobs (for tuning sweeps).
const blobArg = params.get('blobs')?.split(':');
// A leading "!" also switches off the element's cast shadow (blobs only).
const blobOverride = blobArg?.length === 2
  ? { id: blobArg[0], cast: !blobArg[1].startsWith('!'), blobs: blobArg[1].replace(/^!/, '').split(';').map((b) => b.split(',').map(Number)) }
  : null;
// ?planar=id:s,d,strength,soft overrides one element's planar shadow (for tuning sweeps).
const planarArg = params.get('planar')?.split(':');
const planarOverride = planarArg?.length === 2 ? { id: planarArg[0], value: planarArg[1].split(',').map(Number) } : null;
const contactArg = params.get('contact')?.split(',').map(Number);
const contactOptions = contactArg?.length === 4
  ? { strength: contactArg[0], softness: contactArg[1], bias: [contactArg[2], contactArg[3]] }
  : {};
if (params.has('shadow')) ground.material.opacity = Number(params.get('shadow'));

const items = ITEMS.filter((it) => (!familyFilter || familyFilter.includes(it.family)) && (!onlyFilter || onlyFilter.includes(it.id)));
const errors = [];
const loadedModules = {};
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
  loadedModules[family] = mod;
  for (const item of items.filter((it) => it.family === family)) {
    try {
      const object = mod.build(item.variant, rng(item.variant.seed ?? 1), item);
      // A family module may export ANCHORS = { id: [u, v] } to fine-tune where its items stand, and
      // FIT = { id: [sx, sy, sz, ry] }: the per-element scale and turn found by the fit search.
      const anchor = anchorOverride?.id === item.id ? anchorOverride.value : mod.ANCHORS?.[item.id] ?? anchorOf(item);
      object.position.copy(groundPointAt(anchor));
      const fit = fitOverride?.id === item.id ? fitOverride.value : mod.FIT?.[item.id];
      if (fit) {
        object.scale.set(fit[0], fit[1], fit[2]);
        object.rotation.y += fit[3] ?? 0;
      }
      object.name = item.id;
      // A family may export SHADOWS = { id: { cast: false, blobs: [[s, d, rs, rd, strength, turn]], color, contact: 0.3 } }
      // to drop the global cast shadow, add fitted soft blobs, or soften the contact shadow (contact
      // may also be { strength, softness, bias } to reshape it), and planar: { dir: [s, d], strength,
      // soft } for a shadow of the element's own shape thrown its own way.
      const shadow = blobOverride?.id === item.id ? blobOverride : mod.SHADOWS?.[item.id];
      scene.add(shadow?.cast === false ? object : castShadows(object));
      if (shadow?.blobs) addShadowBlobs(scene, object, shadow.blobs, shadow.color);
      const planar = planarOverride?.id === item.id
        ? { dir: planarOverride.value.slice(0, 2), strength: planarOverride.value[2], soft: planarOverride.value[3] }
        : shadow?.planar;
      if (planar) addPlanarShadow(renderer, scene, object, { color: shadow?.color, ...planar });
      const contact = typeof shadow?.contact === 'object' ? shadow.contact : shadow?.contact !== undefined ? { strength: shadow.contact } : {};
      addContactShadow(scene, object, { ...contactOptions, ...contact });
    } catch (e) {
      errors.push(`${item.id}: ${e.message}`);
    }
  }
}));
if ((params.get('finish') ?? 'baked') === 'baked') {
  const placed = scene.children.filter((o) => o.name && items.some((it) => it.id === o.name));
  const toSheet = (x, y) => [(x - innerWidth / 2) / view.pxPerRef + SHEET.width / 2, (y - innerHeight / 2) / view.pxPerRef + SHEET.height / 2];
  try {
    // Families may export BAKE = { id: { skipNeutral: false } } for neutral-grey elements.
    const options = Object.assign({}, ...Object.values(loadedModules).map((m) => m.BAKE ?? {}));
    window.__kitBake = await bakeFinish(placed, { renderer, scene, camera, toSheet, options });
    if (params.get('warp') !== '0') {
      // The warp measures the baked render (the test's masks depend on its colors), then the
      // finish is baked again so colors register on the moved vertices.
      const toWindow = (u, v) => [(u - SHEET.width / 2) * view.pxPerRef + innerWidth / 2, (v - SHEET.height / 2) * view.pxPerRef + innerHeight / 2];
      const passes = Number(params.get('warp') ?? 3);
      window.__kitWarp = warpToReference(placed, items, await loadSheet(), { renderer, scene, camera, renderFrame: kit.render, toWindow, pxPerRef: view.pxPerRef, passes });
      window.__kitBake = await bakeFinish(placed, { renderer, scene, camera, toSheet, options });
    }
  } catch (e) {
    errors.push(`bake: ${e.message}`);
  }
}
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
