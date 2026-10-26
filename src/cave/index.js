// Assembles "The Great Cave Door" level and its props.
import * as THREE from 'three';
import { rng } from '../world/util.js';
import { buildCaveLevel, DOOR } from './level.js';
import {
  buildBroomTree, buildCritters, buildCubeTree, buildDoor, buildFence, buildFluffDog, buildKnitShrub,
  buildLightShafts, buildMushrooms, buildScaffold, buildStones, buildWillows,
} from './props.js';

/** Builds the level and props; options.hide(x, y, z) leaves out blocks (the ?clear= flag). */
export function buildCave(scene, { hide = null } = {}) {
  const random = rng(20261026);
  const level = buildCaveLevel({ hide });
  scene.add(level.group);
  const at = (x, z, dy = 0) => new THREE.Vector3(x, level.heightAt(x, z) + dy, z);

  scene.add(buildDoor(random));
  scene.add(buildCubeTree(at(-8, -9), random));
  scene.add(buildWillows([at(-6, -10.2), at(4.6, -11)], random, 0.7));
  scene.add(buildBroomTree(at(1.8, -9.1), random));
  scene.add(buildKnitShrub(at(0.3, -7.6), random));
  const fence = buildFence(-2.2, 0.4, level.heightAt(-1, -6));
  fence.rotation.y = Math.PI / 2; // runs across the view along the terrace edge
  fence.position.z = -6.25;
  scene.add(fence);
  scene.add(buildMushrooms(
    [[0.3, -9.2], [-0.3, -5.4], [2.6, -10.7], [-8.4, -9.3], [-7.8, -10.1], [-6.2, -7.6], [-1.6, -13.4], [3.6, -13]]
      .map(([x, z]) => at(x, z)),
    random,
  ));
  scene.add(buildStones([[-6.8, -7.4], [-6.1, -7.2], [-6.3, -8.2], [-7.4, -10], [-2.6, -12.4]].map(([x, z]) => at(x, z)), random));
  scene.add(buildScaffold(at(-11.5, -13)));

  const dog = buildFluffDog(random);
  const dogBase = at(-3.7, -10.6);
  dog.position.copy(dogBase);
  dog.rotation.y = -2.0; // three-quarter view, looking toward the player
  scene.add(dog);

  const critterSpots = [[-2.2, -9.6], [-3.8, -7.9], [-1.5, -12]].map(([x, z]) => at(x, z));
  const critters = buildCritters(critterSpots, random);
  scene.add(critters);

  scene.add(buildLightShafts([
    { x: -11, y: 7, z: -8, width: 3.4, length: 9, twist: 0.4 },
    { x: 0, y: 8, z: -13, width: 2.4, length: 9, twist: 0.9 },
  ]));

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
    // The reference frame's camera, solved by line tracing (scripts/fp/solve_camera.py): the player
    // stands at the front-right corner of the room looking 40 degrees left of the door's axis, eye at
    // y = 3.78 (so the landing under the spawn should be 2.2 high; the eye is EYE_HEIGHT above it).
    spawn: {
      position: new THREE.Vector3(7.4, 0, 2.26),
      yaw: THREE.MathUtils.degToRad(40.43),
      pitch: THREE.MathUtils.degToRad(-7.99),
    },
    stats: { blocks: level.blockCount, caps: level.capCount },
    update(time) {
      dog.position.y = dogBase.y + Math.abs(Math.sin(time * 2.2)) * 0.03;
      dog.rotation.z = Math.sin(time * 1.3) * 0.03;
      critters.position.y = Math.abs(Math.sin(time * 3.1)) * 0.05;
    },
  };
}
