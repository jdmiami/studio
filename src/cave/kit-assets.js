// The kit's finished models in the game: public/kit/kit-props.glb holds every kit element as the
// kit page builds it, warps it onto the asset sheet's silhouettes and bakes the sheet's colors into
// it (scripts/kit/export_glb.mjs; meshopt-compressed with gltf-transform). Each mesh carries its
// felt/knit settings in extras; the textile material is rebuilt from them here, so the models
// light with the game's sun like everything else.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { sharedFurUniforms } from '../fur.js';
import { KIT_STAGE } from '../kit/style.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';

const URL = '/kit/kit-props.glb';

/** Loads the kit models: a Map from element id (e.g. 'tree-willow-a') to a template Object3D. */
export async function loadKitAssets() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(URL);
  // The baked colors are albedos de-lit for the kit page's light; under the scene's (brighter,
  // warmer) light they would wash out. Scale them by the ratio of the two lights' response on a
  // half-lit face, the felt shader's ambient * 0.7 + sun * wrap * 0.8, so each model shows the
  // color it has on the sheet.
  const response = (amb, sun) => new THREE.Color(amb).multiplyScalar(0.7).add(new THREE.Color(sun).multiplyScalar(0.8 * 0.5));
  const u = sharedFurUniforms;
  const scene = response(u.uSkyColor.value.clone().lerp(u.uGroundColor.value, 0.5), u.uSunColor.value);
  const kit = response(KIT_STAGE.ambient, KIT_STAGE.sunColor);
  const lightMatch = new THREE.Color(kit.r / scene.r, kit.g / scene.g, kit.b / scene.b);
  const materials = new Map();
  const materialFor = (t) => {
    const key = JSON.stringify(t);
    if (!materials.has(key)) {
      const { mode, doubleSide, ...options } = t;
      const color = new THREE.Color(options.color ?? '#ffffff').multiply(lightMatch);
      materials.set(key, createTextile(mode, { ...options, color, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide }));
    }
    return materials.get(key);
  };
  const templates = new Map();
  for (const element of gltf.scene.children) {
    element.traverse((o) => {
      if (!o.isMesh) return;
      const t = o.userData.textile;
      prepareTextileGeometry(o.geometry);
      if (t) o.material = materialFor(t);
      o.frustumCulled = false;
    });
    // Base centre at the origin, as exported; remember the model's height for scaling.
    const box = new THREE.Box3().setFromObject(element);
    element.userData.height = box.max.y - Math.min(0, box.min.y);
    templates.set(element.name, element);
  }
  return templates;
}

/**
 * A copy of a kit model standing at `position`, scaled to `height` world units (the painted
 * height measured by scripts/fp/place_props.py), turned by `yaw`.
 */
export function placeKitModel(templates, id, { position, height, yaw = 0 }) {
  const template = templates.get(id);
  if (!template) throw new Error(`kit model "${id}" is not in ${URL}`);
  const model = template.clone(true);
  const s = height / template.userData.height;
  model.scale.multiplyScalar(s);
  model.position.copy(position);
  model.rotation.y += yaw;
  return model;
}
