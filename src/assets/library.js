// The cave's asset library: every object of the painting as a standalone asset, built on its own
// (base at the origin, front toward +z), so assets can be made and judged one by one in the asset
// studio (asset.html) and placed together into the scene at the end.
//
// An asset is identified by its reference: an entry of docs/reference/assets/index.json (the object
// cut out of the painting by scripts/assets/reference_sheet.py: its silhouette, painted size and the
// world spot the painting shows it at). Each family names the builder that makes it.
import * as THREE from 'three';
import reference from '../../docs/reference/assets/index.json';
import traced from '../cave/traced-props.json';
import { buildTracedProp } from '../cave/traced-props.js';
import { loadKitAssets, placeKitModel } from '../cave/kit-assets.js';
import { buildNpc, buildRailing } from '../cave/npc.js';
import lathes from './lathe-fits.json';
import fences from './fence-fits.json';
import { buildFence, fencePlacement } from './fence.js';
import { buildLathe } from './lathe.js';

let kit = null;
const kitModels = () => (kit ??= loadKitAssets());

/** Kit model ids per family (instances cycle through a family's variants). */
const KIT = {
  'cube-tree': ['tree-cube-large'],
  willow: ['tree-willow-a'],
  // The big mossy tree top right: the painting shows its moss drips (its canopy is under the HUD).
  'willow-2': ['tree-willow-a'],
  'knit-shrub': ['dome-knit-teal'],
  'knit-bush': ['dome-knit-green'],
  mushroom: ['mushroom-pink', 'mushroom-tan', 'mushroom-lilac'],
  fence: ['fence-a'],
  dog: ['dog-a'],
  critter: ['critter-a', 'critter-b', 'critter-c'],
};

export const references = reference.assets;

/** Round families with a face: their painted front must not repeat on their back. */
const FACED = new Set(['critter']);

/** The family of a reference ('stone-2' -> 'stone'). */
export const familyOf = (ref) => ref.family ?? ref.name;

/**
 * Builds the asset for a reference: { object, kind } with the object standing at the origin,
 * `height` world units tall (default: the painted height). Throws for a family with no builder yet.
 */
export async function buildAsset(ref, { height = ref.height } = {}) {
  const family = familyOf(ref);
  const index = Number(ref.id.split('-').pop());
  const fit = lathes.fits[ref.id];
  if (fit) {
    // A stepped dome keeps its traced tier lines as grooves.
    const t = traced.props.find((p) => p.box.join() === ref.box.join());
    const object = buildLathe(fit, { grooves: t?.grooves ?? [] });
    return { object, kind: 'lathe', place: fit.place, paint: fit.paint, faced: FACED.has(family) };
  }
  const fence = fences.fits[ref.id];
  if (fence) {
    const { position, rotationY } = fencePlacement(fence);
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    return { object: buildFence(fence), kind: 'fence', place: position.toArray(), rotationY, paint: fence.paint, mirror: normal };
  }
  if (KIT[family]) {
    const models = await kitModels();
    const ids = KIT[family];
    const object = placeKitModel(models, ids[index % ids.length], { position: new THREE.Vector3(), height });
    return { object, kind: 'kit' };
  }
  const t = traced.props.find((p) => p.box.join() === ref.box.join());
  if (t) {
    const object = buildTracedProp({ ...t, x: 0, y: 0, z: 0 }, 100 + index * 7);
    object.rotation.y = 0; // the studio turns it to the painter
    return { object, kind: 'traced', traced: t };
  }
  if (family === 'npc') {
    const npc = buildNpc();
    npc.group.scale.setScalar(height);
    return { object: npc.group, kind: 'procedural', update: npc.update };
  }
  if (family === 'scaffold') return { object: buildRailing(1.7, 0.9), kind: 'procedural' };
  throw new Error(`no builder for the "${family}" family yet`);
}
