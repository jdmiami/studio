// Assembles "The Great Cave Door" level and its props.
import * as THREE from 'three';
import { rng } from '../world/util.js';
import { buildCaveLevel, DOOR } from './level.js';
import placement from './props-placement.json';
import {
  buildBroomTree, buildCritters, buildCubeTree, buildDoor, buildFence, buildFluffDog, buildKnitShrub,
  buildLightShafts, buildMushrooms, buildScaffold, buildStones, buildWillows,
} from './props.js';

/** Builds the level and props; options.hide(x, y, z) leaves out blocks (the ?clear= flag). */
export function buildCave(scene, { hide = null } = {}) {
  const random = rng(20261026);
  const level = buildCaveLevel({ hide });
  scene.add(level.group);

  scene.add(buildDoor(random));

  // Every prop stands where the reference paints it: src/cave/props-placement.json is computed by
  // scripts/fp/place_props.py (the base pixel's ray from the reference camera into the layout, and
  // the painted height in pixels over the pixels per unit at that spot); the game only reads it.
  const props = placement.props.filter((p) => p.build);
  const byName = (name) => props.filter((p) => p.name === name);
  const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
  const scaled = (object, s) => { object.scale.setScalar(s); return object; };

  for (const p of byName('cube-tree')) scene.add(scaled(buildCubeTree(vec(p), random), p.scale));
  for (const p of [...byName('willow'), ...byName('willow-2')]) scene.add(buildWillows([vec(p)], random, p.scale));
  for (const p of byName('broom-tree')) scene.add(scaled(buildBroomTree(vec(p), random), p.scale));
  for (const p of byName('knit-shrub')) scene.add(buildKnitShrub(vec(p), random, p.scale, true));
  for (const p of [...byName('bush'), ...byName('knit-bush')]) scene.add(buildKnitShrub(vec(p), random, p.scale, false));
  for (const p of byName('fence')) {
    // Built along local +z from the origin, then turned onto the line between its two end legs.
    const [a, b] = p.ends;
    const fence = buildFence(0, p.length, 0, p.scale);
    fence.position.set(a[0], Math.min(a[1], b[1]), a[2]);
    fence.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
    scene.add(fence);
  }
  scene.add(buildMushrooms(byName('mushroom').map((p) => Object.assign(vec(p), { scale: p.scale })), random));
  scene.add(buildStones(byName('stone').map((p) => Object.assign(vec(p), { scale: p.scale })), random));
  for (const p of byName('scaffold')) {
    const scaffold = scaled(buildScaffold(vec(p)), p.scale);
    scaffold.rotation.y = p.yaw;
    scene.add(scaffold);
  }

  const dogSpec = byName('dog')[0] ?? { x: 0, y: level.heightAt(0, -10), z: -10, scale: 1, yaw: 0 };
  const dog = scaled(buildFluffDog(random), dogSpec.scale);
  const dogBase = vec(dogSpec);
  dog.position.copy(dogBase);
  dog.rotation.y = dogSpec.yaw; // facing the player, as in the reference
  scene.add(dog);

  const critters = buildCritters(byName('critter').map((p) => Object.assign(vec(p), { scale: p.scale })), random);
  scene.add(critters);

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
    // land on the spawn terrace (top 2), so the eye is at 3.6, 0.175 below the solved 3.775.
    spawn: { position: new THREE.Vector3(7.4, 0, 2.261), yaw: THREE.MathUtils.degToRad(40.43), pitch: THREE.MathUtils.degToRad(-7.99) },
    stats: { blocks: level.blockCount, caps: level.capCount },
    update(time) {
      dog.position.y = dogBase.y + Math.abs(Math.sin(time * 2.2)) * 0.03 * dogSpec.scale;
      dog.rotation.z = Math.sin(time * 1.3) * 0.03;
      critters.position.y = Math.abs(Math.sin(time * 3.1)) * 0.02;
    },
  };
}
