// The great door, traced from the reference (scripts/fp/trace_door.py): public/cave/door-albedo.png
// is the painted door rectified to a front view, public/cave/door-relief.png its traced panel seams
// as a relief map. A dense felt sheet takes the painting's colors as vertex colors and pushes each
// panel out by the relief, so the mosaic is the reference's own, in felt that lights like the rest.
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { DOOR } from './level.js';

const RELIEF = 0.035; // how far a panel stands out of its seams (world units; low, so under cel shading the
// bevels stay thin seams as painted instead of falling into the shadow band as dark grooves)

async function pixels(url) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** Builds the traced door; resolves to a mesh standing in the door opening. */
export async function buildTracedDoor() {
  const [albedo, relief] = await Promise.all([pixels('/cave/door-albedo.png'), pixels('/cave/door-relief.png')]);
  const width = DOOR.xMax - DOOR.xMin + 1; // 5
  const height = DOOR.height; // 6
  const cols = albedo.width;
  const rows = albedo.height;
  const g = new THREE.PlaneGeometry(width, height, cols - 1, rows - 1); // one vertex per traced pixel
  const pos = g.getAttribute('position');
  const color = new Float32Array(pos.count * 3);
  // The painting is lit already: divide out the scene light's response on a face looking down +z,
  // so the felt shader's own lighting brings the painted values back.
  const u = sharedFurUniforms;
  const n = new THREE.Vector3(0, 0, 1);
  const wrap = THREE.MathUtils.clamp((n.dot(u.uSunDir.value) + 0.4) / 1.4, 0, 1);
  const amb = u.uSkyColor.value.clone().lerp(u.uGroundColor.value, 0.5).multiplyScalar(0.7);
  const response = amb.add(u.uSunColor.value.clone().multiplyScalar(0.8 * wrap));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const k = (y * cols + x) * 4;
    pos.setZ(i, (relief.data[k] / 255) * RELIEF);
    c.setRGB(albedo.data[k] / 255, albedo.data[k + 1] / 255, albedo.data[k + 2] / 255, THREE.SRGBColorSpace);
    color[i * 3] = c.r / response.r;
    color[i * 3 + 1] = c.g / response.g;
    color[i * 3 + 2] = c.b / response.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.computeVertexNormals();
  prepareTextileGeometry(g);
  const mesh = new THREE.Mesh(g, createTextile('felt', { fuzz: 0.15, grain: 0.6 }));
  mesh.position.set((DOOR.xMin + DOOR.xMax) / 2, height / 2, DOOR.z + 0.4); // set 0.1 into the opening
  return mesh;
}
