// Assembles "The Great Cave Door" level and its props.
import * as THREE from 'three';
import { rng } from '../world/util.js';
import { buildCaveLevel, DOOR } from './level.js';
import placement from './props-placement.json';
import { loadKitAssets, paintKitModel, placeKitModel } from './kit-assets.js';
import kitPaint from './kit-paint.json';
import { buildTracedDoor } from './door.js';
import { buildTracedProps } from './traced-props.js';
import { contactShadow } from './contact-shadows.js';
import { projectPaint } from './projection-paint.js';
import { buildNpc, buildRailing } from './npc.js';
import { buildLightShafts } from './props.js';

/** Builds the level and props; options.hide(x, y, z) leaves out blocks (the ?clear= flag). */
export function buildCave(scene, { hide = null } = {}) {
  const random = rng(20261026);
  const level = buildCaveLevel({ hide });
  scene.add(level.group);
  // The door frame's stones take the painting's own tones (projection painting).
  const noPaint = new URLSearchParams(location.search).has('nopaint');
  const levelPainted = noPaint
    ? Promise.resolve()
    : Promise.all(level.paintable.map((mesh) => projectPaint(mesh, mesh.userData.paint)));

  // The door is the reference's own mosaic, traced (src/cave/door.js).
  const doorReady = buildTracedDoor().then((door) => scene.add(door));

  // Every prop stands where the reference paints it: src/cave/props-placement.json is computed by
  // scripts/fp/place_props.py (the base pixel's ray from the reference camera into the layout, and
  // the painted height in pixels over the pixels per unit at that spot); the game only reads it.
  const props = placement.props.filter((p) => p.build);
  const byName = (name) => props.filter((p) => p.name === name);
  const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);

  // The stepped felt domes and the broom tree, traced from the reference (src/cave/traced-props.js).
  const traced = buildTracedProps();
  scene.add(traced);
  for (const object of traced.children) if (object.userData.grounded) scene.add(contactShadow(object));
  // The girl on the upper-left terrace, waving from behind a small wooden railing (the painting's
  // "scaffold"): she stands at her traced spot facing the painter, the railing just in front.
  const npcSpec = placement.props.find((p) => p.name === 'npc');
  const npc = buildNpc();
  const npcPos = npcSpec ? vec(npcSpec) : new THREE.Vector3(-7.5, level.heightAt(-7.5, -2.4), -2.4);
  const eyeXZ = new THREE.Vector2(placement.camera?.eye?.[0] ?? 7.4, placement.camera?.eye?.[2] ?? 2.261);
  const facing = Math.atan2(eyeXZ.x - npcPos.x, eyeXZ.y - npcPos.z);
  npc.group.position.copy(npcPos);
  npc.group.rotation.y = facing;
  npc.group.scale.setScalar(1.88); // painted 74 px tall at 39 px per unit
  scene.add(npc.group);
  // The railing stands in front of the terrace edge, posts down the block face, its top rail at
  // her chest (painted: 0.9 above the terrace), 1.7 wide.
  const railAt = npcPos.clone().add(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(0.62));
  const railBase = Math.min(npcPos.y, level.heightAt(railAt.x, railAt.z));
  const railing = buildRailing(1.7, npcPos.y + 0.9 - railBase);
  railing.position.set(railAt.x, railBase, railAt.z);
  railing.rotation.y = facing;
  scene.add(railing);
  scene.add(contactShadow(npc.group));

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
    const painting = []; // projection paint jobs: each model takes the painting's own pixels
    const paintFor = (p) => (noPaint ? null : kitPaint.paints.find((k) => k.name === p.name && k.base[0] === p.base?.[0] && k.base[1] === p.base?.[1]));
    const place = (id, p, parent = scene, at = vec(p)) => {
      const model = placeKitModel(kit, id, { position: at, height: p.height, yaw: VIEW_TURN });
      parent.add(model);
      const paint = paintFor(p);
      if (paint) {
        // Align the model's axis with the painted silhouette (scripts/fp/paint_props.py), then paint.
        model.position.x += paint.shift?.[0] ?? 0;
        model.position.z += paint.shift?.[1] ?? 0;
        painting.push(paintKitModel(model, paint));
      }
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
      const paint = paintFor(p);
      if (paint) painting.push(paintKitModel(fence, paint));
    }
    place('dog-a', dogSpec, dog, new THREE.Vector3());
    const critterIds = ['critter-a', 'critter-b', 'critter-c'];
    byName('critter').forEach((p, i) => place(critterIds[i % critterIds.length], p, critters));
    for (const model of grounded) scene.add(contactShadow(model));
    return Promise.all(painting);
  });

  // The painting's shafts fall from the ceiling openings down toward the viewer: the door's skylight
  // onto the willow and the door steps, the upper-left opening down and to the right.
  const shafts = [
    { from: [-0.6, 9.5, -15.2], target: new THREE.Vector3(0.5, 0, -10), width: 3.6 },
    { from: [-9.5, 9.5, -1.2], target: new THREE.Vector3(-5, 2, -1.5), width: 4.2 },
  ];
  const viewer = new THREE.Vector3(7.4, 3.775, 2.261); // the spawn eye: the shafts' broad side faces the room
  scene.add(buildLightShafts(shafts.map((s) => ({
    x: s.from[0], y: s.from[1], z: s.from[2], width: s.width, length: 12, target: s.target, faceToward: viewer,
  }))));

  // Lights only affect the glossy button eyes and the compass; textiles and fur light themselves.
  scene.add(new THREE.HemisphereLight('#fff1e6', '#d9b3a3', 1.3));
  const sun = new THREE.DirectionalLight('#ffe9cc', 2.0);
  sun.position.set(-4, 10, -4);
  scene.add(sun);

  const interactables = [
    { id: 'door', label: 'Inspect', position: new THREE.Vector3(0, 1.5, DOOR.z + 1), radius: 3.2 },
    { id: 'dog', label: 'Pet', position: dogBase.clone(), radius: 1.8 },
    { id: 'npc', label: 'Talk', position: npcPos.clone().add(new THREE.Vector3(0, 0.8, 0)), radius: 2.4 },
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
    ready: Promise.all([propsReady, doorReady, traced.userData.painted, levelPainted]),
    update(time) {
      dog.position.y = dogBase.y + Math.abs(Math.sin(time * 2.2)) * 0.03 * dogSpec.scale;
      dog.rotation.z = Math.sin(time * 1.3) * 0.03;
      critters.position.y = Math.abs(Math.sin(time * 3.1)) * 0.02;
      npc.update(time);
    },
  };
}
