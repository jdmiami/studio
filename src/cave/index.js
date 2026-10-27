// Assembles "The Great Cave Door" level and its props.
import * as THREE from 'three';
import { rng } from '../world/util.js';
import { buildCaveLevel, DOOR } from './level.js';
import placement from './props-placement.json';
import { loadKitAssets, placeKitModel } from './kit-assets.js';
import { buildTracedDoor } from './door.js';
import { buildTracedProps } from './traced-props.js';
import { contactShadow } from './contact-shadows.js';
import {
  buildLightShafts, buildScaffold,
} from './props.js';

/** Builds the level and props; options.hide(x, y, z) leaves out blocks (the ?clear= flag). */
export function buildCave(scene, { hide = null } = {}) {
  const random = rng(20261026);
  const level = buildCaveLevel({ hide });
  scene.add(level.group);

  // The door is the reference's own mosaic, traced (src/cave/door.js).
  const doorReady = buildTracedDoor().then((door) => scene.add(door));

  // Every prop stands where the reference paints it: src/cave/props-placement.json is computed by
  // scripts/fp/place_props.py (the base pixel's ray from the reference camera into the layout, and
  // the painted height in pixels over the pixels per unit at that spot); the game only reads it.
  const props = placement.props.filter((p) => p.build);
  const byName = (name) => props.filter((p) => p.name === name);
  const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
  const scaled = (object, s) => { object.scale.setScalar(s); return object; };

  // The stepped felt domes and the broom tree, traced from the reference (src/cave/traced-props.js).
  const traced = buildTracedProps();
  scene.add(traced);
  for (const object of traced.children) if (object.userData.grounded) scene.add(contactShadow(object));
  for (const p of byName('scaffold')) {
    const scaffold = scaled(buildScaffold(vec(p)), p.scale);
    scaffold.rotation.y = p.yaw;
    scene.add(scaffold);
  }

  // The trees, domes, bushes, mushrooms, fence, dog and critters are the kit's own models, the ones
  // matched to the asset sheet (src/cave/kit-assets.js), each as tall as the reference paints it.
  // The kit sees every model from azimuth 45 degrees and bakes the sheet's colors for that view; the
  // reference's camera looks 40.43 degrees round, so each model turns by the difference to show
  // the same side.
  const VIEW_TURN = THREE.MathUtils.degToRad(40.43 - 45);
  const dogSpec = byName('dog')[0] ?? { x: 0, y: level.heightAt(0, -10), z: -10, height: 0.9 };
  const dogBase = vec(dogSpec);
  const dog = new THREE.Group(); // the model is added when the kit file has loaded
  dog.position.copy(dogBase);
  scene.add(dog);
  const critters = new THREE.Group();
  scene.add(critters);
  const propsReady = loadKitAssets().then((kit) => {
    const grounded = []; // small props and creatures get a contact shadow (not trees or fences)
    const place = (id, p, parent = scene, at = vec(p)) => {
      const model = placeKitModel(kit, id, { position: at, height: p.height, yaw: VIEW_TURN });
      parent.add(model);
      if (!id.startsWith('tree') && !id.startsWith('fence')) grounded.push(model);
      return model;
    };
    for (const p of byName('cube-tree')) place('tree-cube-large', p);
    for (const p of byName('willow')) place('tree-willow-a', p);
    for (const p of byName('knit-shrub')) place('dome-knit-teal', p);
    for (const p of byName('knit-bush')) place('dome-knit-green', p);
    const shrooms = ['mushroom-pink', 'mushroom-tan', 'mushroom-lilac'];
    byName('mushroom').forEach((p, i) => place(shrooms[i % shrooms.length], p));
    for (const p of byName('fence')) {
      // Along the line between its two painted end posts: the kit fence's long side onto it.
      const [a, b] = p.ends;
      const fence = placeKitModel(kit, 'fence-a', { position: new THREE.Vector3((a[0] + b[0]) / 2, Math.min(a[1], b[1]), (a[2] + b[2]) / 2), height: p.height });
      const size = new THREE.Box3().setFromObject(kit.get('fence-a')).getSize(new THREE.Vector3());
      fence.rotation.y += p.yaw - (size.x >= size.z ? 0 : -Math.PI / 2);
      scene.add(fence);
    }
    place('dog-a', dogSpec, dog, new THREE.Vector3());
    const critterIds = ['critter-a', 'critter-b', 'critter-c'];
    byName('critter').forEach((p, i) => place(critterIds[i % critterIds.length], p, critters));
    for (const model of grounded) scene.add(contactShadow(model));
  });

  scene.add(buildLightShafts(placement.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, width: l.width, length: 9, twist: 0.6 }))));

  // Lights only affect the glossy button eyes and the compass; textiles and fur light themselves.
  scene.add(new THREE.HemisphereLight('#fff1e6', '#d9b3a3', 1.3));
  const sun = new THREE.DirectionalLight('#ffe9cc', 2.0);
  sun.position.set(-4, 10, -4);
  scene.add(sun);

  const interactables = [
    { id: 'door', label: 'Inspect', position: new THREE.Vector3(0, 1.5, DOOR.z + 1), radius: 3.2 },
    { id: 'dog', label: 'Pet', position: dogBase.clone(), radius: 1.8 },
  ];

  return {
    heightAt: level.heightAt,
    columns: level.columns,
    interactables,
    // The reference frame's camera pose (docs/reference/cave-door-camera.json, solved by line
    // tracing): the room's front-right corner, looking 40 degrees left of the door's axis. The feet
    // land on the spawn terrace (top 2) and the eye is EYE_HEIGHT 1.775 above: the solved 3.775.
    spawn: { position: new THREE.Vector3(7.4, 0, 2.261), yaw: THREE.MathUtils.degToRad(40.43), pitch: THREE.MathUtils.degToRad(-7.99) },
    stats: { blocks: level.blockCount, caps: level.capCount },
    // Resolves when the kit models, the door and the traced props' projection paint are in.
    ready: Promise.all([propsReady, doorReady, traced.userData.painted]),
    update(time) {
      dog.position.y = dogBase.y + Math.abs(Math.sin(time * 2.2)) * 0.03 * dogSpec.scale;
      dog.rotation.z = Math.sin(time * 1.3) * 0.03;
      critters.position.y = Math.abs(Math.sin(time * 3.1)) * 0.02;
    },
  };
}
