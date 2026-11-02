// Felt cutout clouds: flat, bevelled felt cloud shapes standing in rings like a stop-motion
// stage set, plus a felt sun bright enough to drive the god rays.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { paint, sharedFurUniforms } from '../fur.js';
import { PALETTE, pick } from './util.js';

/** A cloud silhouette: a flat base under a row of overlapping round bumps. */
function cloudShape(random, width) {
  const bumps = [];
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = width * (0.16 + random() * 0.12) * (1 - Math.abs(t - 0.5) * 0.6);
    bumps.push({ x: (t - 0.5) * width * 0.8, y: r * 0.35, r });
  }
  const top = (x) => Math.max(0.15, ...bumps.map((b) => {
    const dx = x - b.x;
    return Math.abs(dx) < b.r ? b.y + Math.sqrt(b.r * b.r - dx * dx) : 0;
  }));

  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  const samples = 64;
  for (let i = 0; i <= samples; i++) {
    const x = -half + (i / samples) * width;
    shape.lineTo(x, top(x));
  }
  shape.lineTo(half, 0);
  shape.closePath();
  return shape;
}

function cloudGeometry(random, width) {
  const g = new THREE.ExtrudeGeometry(cloudShape(random, width), {
    depth: width * 0.03,
    bevelEnabled: true,
    bevelThickness: width * 0.025,
    bevelSize: width * 0.025,
    bevelSegments: 4,
    curveSegments: 12,
  });
  g.computeBoundingBox();
  g.translate(-(g.boundingBox.max.x + g.boundingBox.min.x) / 2, 0, -(g.boundingBox.max.z + g.boundingBox.min.z) / 2);
  return g;
}

export function buildFeltClouds(random) {
  const pieces = [];
  const dummy = new THREE.Object3D();

  const ring = (count, radiusMin, radiusMax, yMin, yMax, widthMin, widthMax) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + random() * 0.4;
      const r = radiusMin + random() * (radiusMax - radiusMin);
      const g = cloudGeometry(random, widthMin + random() * (widthMax - widthMin));
      dummy.position.set(Math.cos(a) * r, yMin + random() * (yMax - yMin), Math.sin(a) * r);
      dummy.lookAt(0, dummy.position.y, 0); // face the island like a stage flat
      dummy.updateMatrix();
      g.applyMatrix4(dummy.matrix);
      paint(g, pick(random, PALETTE.cloud));
      pieces.push(prepareTextileGeometry(g));
    }
  };

  // Sky layers.
  ring(12, 70, 95, 14, 30, 14, 24);
  ring(14, 110, 150, 18, 45, 22, 36);
  // The cloud floor below the island: overlapping flats at staggered depths.
  ring(10, 13, 22, -12, -8, 9, 14);
  ring(16, 26, 45, -15, -9, 14, 22);
  ring(20, 55, 90, -18, -10, 20, 34);

  const group = new THREE.Group();
  // A little self-glow keeps backlit cloud flats soft and bright instead of grey.
  group.add(new THREE.Mesh(mergeGeometries(pieces), createTextile('felt', {
    fuzz: 0.55, emissive: 0.4, side: THREE.DoubleSide,
  })));
  group.add(buildFeltSun());
  return group;
}

// A felt sun disc with a peach halo disc behind it; emissive so bloom and god rays pick it up.
function buildFeltSun() {
  const disc = (radius, color) => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: radius * 0.05, bevelEnabled: true, bevelThickness: radius * 0.06,
      bevelSize: radius * 0.06, bevelSegments: 4, curveSegments: 48,
    });
    paint(g, color);
    return prepareTextileGeometry(g);
  };
  const group = new THREE.Group();
  const sun = new THREE.Mesh(disc(5.5, '#fff6dc'), createTextile('felt', { emissive: 3.0, fuzz: 0.6 }));
  const halo = new THREE.Mesh(disc(9, '#fff1d6'), createTextile('felt', { emissive: 0.5, fuzz: 0.5 }));
  halo.position.z = -1.5;
  group.add(sun, halo);
  group.position.copy(sharedFurUniforms.uSunDir.value).multiplyScalar(150);
  group.lookAt(0, 0, 0);
  return group;
}
