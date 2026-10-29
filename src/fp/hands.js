// First-person viewmodel: two hands in green Fair Isle fingerless gloves with cream sweater cuffs.
// The left hand holds a fluff stone, the right a compass with a teal radar face.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createFur, paint } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { withSeed } from '../world/util.js';

const SKIN = '#e9b99c';
const GLOVE_STRIPES = ['#2d5f40', '#2d5f40', '#e3d8c0', '#2d5f40'];

function radarTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const bg = ctx.createRadialGradient(c, c, 10, c, c, c);
  bg.addColorStop(0, '#1f4b4f');
  bg.addColorStop(1, '#0d2427');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(120, 240, 230, 0.85)';
  ctx.lineWidth = 3;
  for (const r of [40, 80, 112]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(c, 18); ctx.lineTo(c, size - 18);
  ctx.moveTo(18, c); ctx.lineTo(size - 18, c);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150, 255, 240, 0.95)';
  for (const [x, y] of [[c + 30, c - 52], [c - 64, c + 20], [c + 70, c + 44]]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildHand(side) {
  const hand = new THREE.Group();
  const knitGlove = createTextile('knit', { knit: [18, 12], stripes: GLOVE_STRIPES, fuzz: 0.5 });
  const knitCuff = createTextile('knit', { knit: [22, 6], fuzz: 0.5 });
  const skin = createTextile('felt', { fuzz: 0.15, color: SKIN });

  // Sleeve cuff and gloved forearm run along -Z (away from the camera).
  const cuff = prepareTextileGeometry(new THREE.CylinderGeometry(0.085, 0.09, 0.2, 24, 4), '#efe6d6');
  cuff.rotateX(Math.PI / 2);
  cuff.translate(0, 0, 0.12);
  hand.add(new THREE.Mesh(cuff, knitCuff));
  const forearm = prepareTextileGeometry(new THREE.CylinderGeometry(0.06, 0.068, 0.26, 24, 6));
  forearm.rotateX(Math.PI / 2);
  forearm.translate(0, 0, -0.08);
  hand.add(new THREE.Mesh(forearm, knitGlove));

  // Gloved palm and bare fingertips curled around the held object.
  const palm = prepareTextileGeometry(new RoundedBoxGeometry(0.11, 0.05, 0.12, 2, 0.02));
  palm.translate(0, 0.005, -0.25);
  hand.add(new THREE.Mesh(palm, knitGlove));
  for (let i = 0; i < 4; i++) {
    const finger = prepareTextileGeometry(new THREE.CapsuleGeometry(0.014, 0.045, 4, 8));
    finger.rotateX(-Math.PI / 2.6);
    finger.translate((i - 1.5) * 0.026, 0.03, -0.32);
    hand.add(new THREE.Mesh(finger, skin));
  }
  const thumb = prepareTextileGeometry(new THREE.CapsuleGeometry(0.016, 0.05, 4, 8));
  thumb.rotateZ(side * 0.9);
  thumb.translate(-side * 0.06, 0.03, -0.24);
  hand.add(new THREE.Mesh(thumb, skin));
  return hand;
}

// Hands enter from the lower corners, forearms angled inward, sized and placed so the stone and
// the compass sit where they do in docs/reference/cave-door.jpg.
const HAND_SCALE = 1.45;

export function createHands(camera, random) {
  const root = new THREE.Group();
  camera.add(root);

  const left = buildHand(-1);
  left.scale.setScalar(HAND_SCALE);
  left.position.set(-0.39, -0.27, -0.14);
  left.rotation.set(-0.05, -0.55, -0.35);
  root.add(left);
  const stone = withSeed(paint(new THREE.SphereGeometry(0.07, 20, 16), '#ead0c8'), random());
  stone.scale(0.62, 0.5, 0.55);
  stone.translate(0.045, 0.03, -0.3);
  left.add(createFur(stone, {
    shells: 18, length: 0.025, density: 300, gravity: 0, curl: 0.2, clump: 0.3, tipTint: '#fff4f0', rim: 1,
  }));

  const right = buildHand(1);
  right.scale.setScalar(HAND_SCALE);
  right.position.set(0.62, -0.265, -0.15);
  right.rotation.set(-0.05, 0.6, 0.3);
  root.add(right);
  const compass = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.035, 40),
    new THREE.MeshPhysicalMaterial({ color: '#8d9196', roughness: 0.45, metalness: 0.35, clearcoat: 0.4 }),
  );
  body.rotation.x = Math.PI / 2;
  compass.add(body);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.08, 0.009, 12, 48),
    new THREE.MeshPhysicalMaterial({ color: '#5e6266', roughness: 0.35, metalness: 0.5 }),
  );
  bezel.position.z = 0.018;
  compass.add(bezel);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.072, 48),
    new THREE.MeshBasicMaterial({ map: radarTexture(), color: new THREE.Color(1.4, 1.4, 1.4), toneMapped: false }),
  );
  face.position.z = 0.019;
  compass.add(face);
  const lug = new THREE.Mesh(
    new THREE.TorusGeometry(0.018, 0.006, 8, 20),
    new THREE.MeshPhysicalMaterial({ color: '#6e7276', roughness: 0.4, metalness: 0.5 }),
  );
  lug.position.y = 0.095;
  compass.add(lug);
  // The needle: a coral felt arrow over the radar face, turned toward a target by setTarget().
  const needleShape = new THREE.Shape();
  needleShape.moveTo(0, 0.058);
  needleShape.lineTo(0.011, 0);
  needleShape.lineTo(0, -0.04);
  needleShape.lineTo(-0.011, 0);
  needleShape.closePath();
  const needle = new THREE.Mesh(new THREE.ShapeGeometry(needleShape), new THREE.MeshBasicMaterial({ color: '#ff8f7a', toneMapped: false }));
  needle.position.z = 0.021;
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), new THREE.MeshBasicMaterial({ color: '#fff4e6', toneMapped: false }));
  hub.position.z = 0.022;
  compass.add(needle, hub);
  compass.position.set(-0.03, 0.06, -0.3);
  compass.rotation.set(-0.55, -0.6, 0); // face tilted up and turned back toward the eye
  compass.scale.setScalar(0.6);
  right.add(compass);

  const leftBase = left.position.clone();
  const rightBase = right.position.clone();
  let bearing = null; // radians, relative to straight ahead (positive to the left), or null
  let needleAngle = 0;
  let needleVel = 0;
  let catchT = 0;
  return {
    root,
    /** The needle's target as an angle from straight ahead (positive = left), or null to wander. */
    setTarget(angle) { bearing = angle; },
    /** The left hand catches something (a find popping into the pocket). */
    bump() { catchT = 0.35; },
    update(walkPhase, speed, dt = 0.016, time = 0) {
      const sway = Math.sin(walkPhase) * 0.012 * speed;
      const lift = Math.abs(Math.cos(walkPhase)) * 0.01 * speed;
      catchT = Math.max(0, catchT - dt);
      const dip = Math.sin((catchT / 0.35) * Math.PI) * 0.025;
      left.position.set(leftBase.x + sway, leftBase.y + lift - dip, leftBase.z);
      right.position.set(rightBase.x + sway, rightBase.y - lift, rightBase.z);
      // A damped spring toward the bearing; with no target, a slow lost wander.
      const goal = bearing ?? Math.sin(time * 0.7) * 1.2 + Math.sin(time * 1.9) * 0.4;
      let d = goal - needleAngle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      needleVel += (d * 60 - needleVel * 7) * dt;
      needleAngle += needleVel * dt;
      needle.rotation.z = needleAngle;
    },
  };
}
