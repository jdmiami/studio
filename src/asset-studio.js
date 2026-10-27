// Asset studio: one asset of the cave painting, alone, judged against its own cut-out.
//
// asset.html?ref=<id> builds the asset for that reference (docs/reference/assets/index.json, via
// src/assets/library.js) and shows it exactly as the painting does: standing at the painted spot,
// seen through the painting's solved camera, in the cave's light and grade (src/cave/look.js), with
// its projection paint. scripts/assets/score.py compares the shot with the painted cut-out.
//
// Flags: ?ref=<id> (default the first)  ?mask=1 white silhouette on black, no post (for scoring)
//        ?turn=<degrees> a close orbit round the asset, from the painter's side (its hidden sides)  ?paint=0 no projection
//        paint  ?shot=<s> freeze time and signal window.__phluphReady  ?bg=<hex> background
import * as THREE from 'three';
import { sharedFurUniforms } from './fur.js';
import { createPost } from './post.js';
import { applyCaveLook } from './cave/look.js';
import layout from './cave/layout.json';
import kitPaint from './cave/kit-paint.json';
import { paintKitModel } from './cave/kit-assets.js';
import { projectPaint } from './cave/projection-paint.js';
import { buildAsset, references } from './assets/library.js';

const params = new URLSearchParams(location.search);
const ref = references.find((r) => r.id === params.get('ref')) ?? references[0];
const mask = params.has('mask');
const turn = Number(params.get('turn') ?? 0);
const shotTime = params.has('shot') ? Number(params.get('shot') || 4) : null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = mask ? THREE.NoToneMapping : THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(mask ? '#000000' : `#${params.get('bg') ?? 'cdb8ad'}`);
const postOptions = applyCaveLook(renderer, params);

// The painting's camera (docs/reference/cave-door-camera.json, solved by line tracing).
const c = layout.camera;
const camera = new THREE.PerspectiveCamera(c.fov, innerWidth / innerHeight, 0.03, 600);
camera.position.fromArray(c.eye);
camera.rotation.set(THREE.MathUtils.degToRad(c.pitch), THREE.MathUtils.degToRad(c.yaw), THREE.MathUtils.degToRad(c.roll), 'YXZ');

const built = await buildAsset(ref).catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;position:fixed;top:8px;left:8px">${e.message}</pre>`);
  throw e;
});
const { object, kind } = built;
const at = new THREE.Vector3().fromArray(ref.position ?? [0, 0, 0]);
// The scene stands each asset as the painting shows it: the kit models turned by the difference
// between the kit's view azimuth and the painting's, the others facing the painter; the traced
// props and kit models aligned on their painted silhouette's centre.
const facing = Math.atan2(c.eye[0] - at.x, c.eye[2] - at.z);
let paint = null;
if (kind === 'kit') {
  object.rotation.y += THREE.MathUtils.degToRad(c.yaw - 45);
  paint = kitPaint.paints.find((k) => k.name === ref.name && k.base.join() === ref.base.join());
  if (paint?.shift) at.add(new THREE.Vector3(paint.shift[0], 0, paint.shift[1]));
} else if (kind === 'fence') {
  at.fromArray(built.place);
  object.rotation.y = built.rotationY;
  paint = built.paint;
} else if (kind === 'lathe') {
  at.fromArray(built.place);
  object.rotation.y = facing;
  paint = built.paint;
} else if (kind === 'traced') {
  at.set(built.traced.x, built.traced.y, built.traced.z);
  object.rotation.y = facing;
  paint = built.traced.paint;
} else {
  object.rotation.y = facing;
  paint = built.paint ?? null;
}
object.position.copy(at);
scene.add(object);

built.update?.(shotTime ?? 0); // pose an animated asset before painting it
if (!mask && params.get('paint') !== '0' && paint) {
  await (kind === 'kit' ? paintKitModel(object, paint) : projectPaint(object, paint, { revolve: kind === 'lathe' || built.revolve, faced: built.faced, mirror: built.mirror }));
}

// The turntable (?turn=<degrees>): a close orbit round the asset's vertical axis, starting from the
// painter's side, framed on the asset (its hidden sides are what the painting cannot show).
const box = new THREE.Box3().setFromObject(object);
const mid = box.getCenter(new THREE.Vector3());
if (params.has('turn')) {
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.6;
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * 1.3;
  const fromPainter = new THREE.Vector3(c.eye[0] - mid.x, 0, c.eye[2] - mid.z).normalize();
  const dir = fromPainter.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(turn));
  dir.y = 0.35;
  camera.position.copy(mid).add(dir.normalize().multiplyScalar(dist));
  camera.lookAt(mid);
}

if (mask) {
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
}
const post = mask ? null : createPost(renderer, scene, camera, { ...postOptions, bloomStrength: 0 });

window.__assetStudio = { ref: ref.id, kind, size: box.getSize(new THREE.Vector3()).toArray(), position: at.toArray() };
const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const time = shotTime ?? clock.getElapsedTime();
  sharedFurUniforms.uTime.value = time;
  built.update?.(time);
  if (post) post.render(time, sharedFurUniforms.uSunDir.value, sharedFurUniforms.uSunColor.value);
  else renderer.render(scene, camera);
  if (shotTime !== null && ++frames === 3) {
    renderer.setAnimationLoop(null);
    window.__phluphReady = true;
  }
});
