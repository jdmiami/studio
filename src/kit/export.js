// Exports the kit's finished elements (built, warped onto the sheet's silhouettes, the sheet's
// de-lit colors baked into their vertex colors) as one glTF binary, so the game can place the
// exact models the kit page matches to docs/reference/asset-kit.jpg instead of rebuilding them.
//
// Each element is a node named by its manifest id, its base centre at the origin (the kit's FIT
// scale and turn kept). The felt/knit shader isn't glTF, so every mesh carries its textile
// settings in extras (userData.textile) and a plain vertex-colored material; the game rebuilds the
// textile from them (src/cave/kit-assets.js).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const MODE_NAMES = ['felt', 'knit', 'velvet', 'yarn'];

/** The createTextile() options that reproduce a textile ShaderMaterial. */
function textileParams(material) {
  const u = material.uniforms;
  const hex = (c) => `#${c.getHexString()}`;
  return {
    mode: MODE_NAMES[u.uMode.value],
    color: hex(u.uColor.value),
    sheen: hex(u.uSheenColor.value),
    fuzz: u.uFuzz.value,
    grain: u.uGrain?.value ?? 1,
    shadeSat: u.uShadeSat?.value ?? 0,
    stitch: u.uStitch?.value ?? 0,
    knit: u.uKnit ? [u.uKnit.value.x, u.uKnit.value.y] : undefined,
    stripes: u.uStripeCount?.value > 0 ? u.uStripes.value.map(hex) : null,
    wraps: u.uWraps?.value,
    doubleSide: material.side === THREE.DoubleSide,
  };
}

/** A copy of one placed element, at the origin, with exportable materials. */
function exportable(element) {
  const copy = element.clone(true);
  copy.position.set(0, 0, 0);
  copy.updateMatrixWorld(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const textile = o.material?.uniforms?.uMode ? textileParams(o.material) : null;
    const geometry = o.geometry.clone();
    geometry.deleteAttribute('aLocal'); // the stitch coordinates; no kit element stitches
    o.geometry = geometry;
    o.userData = { textile };
    o.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: textile?.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  });
  copy.name = element.name;
  return copy;
}

/** glTF binary of the named elements (all placed elements when ids is empty), base64-encoded. */
export async function exportElementsGLB(scene, ids = []) {
  const root = new THREE.Scene();
  for (const element of scene.children) {
    if (!element.name || (ids.length && !ids.includes(element.name))) continue;
    if (!element.children.length && !element.isMesh) continue;
    root.add(exportable(element));
  }
  const buffer = await new GLTFExporter().parseAsync(root, { binary: true });
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { names: root.children.map((c) => c.name), base64: btoa(s) };
}
