// The finished assets (exported from the asset studio as glTF: public/assets/glb/, see
// scripts/assets/export_glb.mjs) as templates the world places: each mesh's felt settings travel in
// its extras and the textile shader is rebuilt from them here (shared per setting), its painted
// colours in its vertex colours. Templates are loaded once and cloned per placement; a clone shares
// geometry and materials, so a trip with forty domes costs forty draw calls of one geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createTextile, prepareTextileGeometry } from '../../textile.js';
import manifest from '../../../public/assets/glb/manifest.json';

/** Landmark kinds (the trip generator's) to the exported assets that can play them. */
export const KIND_ASSETS = {
  'cube-tree': ['cube-tree-0'],
  willow: ['willow-0'],
  broom: ['broom-tree-0'],
  dome: ['stone-0', 'stone-1', 'stone-2', 'bush-0', 'bush-1', 'bush-2', 'bush-3'],
  mushroom: ['mushroom-1', 'mushroom-4', 'mushroom-5'],
  fence: ['fence-0', 'crate-0'],
  pom: ['pom-0', 'knit-shrub-0'],
  stone: ['stone-4', 'knit-bush-0', 'stone-0'],
  critter: ['critter-0', 'critter-1', 'critter-2'],
  dog: ['dog-0'],
};

const materials = new Map();
function materialFor(t) {
  const key = JSON.stringify(t);
  if (!materials.has(key)) {
    const { mode, doubleSide, knit, stripes, ...options } = t;
    materials.set(key, createTextile(mode ?? 'felt', {
      ...options, ...(knit ? { knit } : {}), ...(stripes ? { stripes } : {}),
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    }));
  }
  return materials.get(key);
}

const templates = new Map();
let loader = null;

/** Loads the named assets (default: all in the manifest); resolves when every template is ready. */
export async function loadModels(ids = Object.keys(manifest.assets), onProgress = () => {}) {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  await Promise.all(ids.filter((id) => !templates.has(id)).map(async (id) => {
    const gltf = await loader.loadAsync(`/assets/glb/${id}.glb`);
    const root = gltf.scene.getObjectByName(id) ?? gltf.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      // Colours arrive quantized; the textile shader reads a float colour attribute.
      const c = o.geometry.getAttribute('color');
      if (c && !(c.array instanceof Float32Array)) {
        const f = new THREE.BufferAttribute(new Float32Array(c.count * 3), 3);
        for (let i = 0; i < c.count; i++) f.setXYZ(i, c.getX(i), c.getY(i), c.getZ(i));
        o.geometry.setAttribute('color', f);
      }
      prepareTextileGeometry(o.geometry);
      o.geometry.computeBoundingSphere();
      o.material = materialFor(o.userData.textile ?? { mode: 'felt' });
    });
    const box = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    // Base centre at the origin.
    const holder = new THREE.Group();
    root.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
    holder.add(root);
    holder.userData = { id, height: box.max.y - box.min.y, size: box.getSize(new THREE.Vector3()), family: manifest.assets[id]?.family };
    templates.set(id, holder);
    onProgress(++done / ids.length);
  }));
  return templates;
}

/** A placed copy of asset `id`: base at `position`, `height` tall (or the asset's own), turned by yaw. */
export function placeModel(id, { position = new THREE.Vector3(), height = null, yaw = 0 } = {}) {
  const t = templates.get(id);
  if (!t) throw new Error(`model ${id} not loaded`);
  const copy = t.clone(true);
  if (height) copy.scale.setScalar(height / t.userData.height);
  copy.position.copy(position);
  copy.rotation.y = yaw;
  copy.userData = { ...t.userData };
  return copy;
}

export const modelIds = () => Object.keys(manifest.assets);
export const hasModel = (id) => templates.has(id);
