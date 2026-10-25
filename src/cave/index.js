// Assembles "The Great Cave Door" level and its props.
import * as THREE from 'three';
import { rng } from '../world/util.js';
import { buildCaveLevel, DOOR } from './level.js';
import {
  buildBroomTree, buildCritters, buildCubeTree, buildDoor, buildFence, buildFluffDog, buildKnitShrub,
  buildLightShafts, buildMushrooms, buildScaffold, buildStones, buildWillows,
} from './props.js';

export function buildCave(scene) {
  const random = rng(20261026);
  const level = buildCaveLevel();
  scene.add(level.group);
  const at = (x, z, dy = 0) => new THREE.Vector3(x, level.heightAt(x, z) + dy, z);

  scene.add(buildDoor(random));
  scene.add(buildCubeTree(at(-2, -9), random));
  scene.add(buildWillows([at(2, -11.5), at(5, -12)], random));
  scene.add(buildBroomTree(at(4.2, -3.5), random));
  scene.add(buildKnitShrub(at(5, -6.5), random));
  const fence = buildFence(-9, -4, level.heightAt(3, -6));
  fence.position.x = 2.62;
  scene.add(fence);
  scene.add(buildMushrooms(
    [[2.2, -6], [2.4, -5.4], [-1.6, -4], [3, -10], [4, -9.5], [-2.3, -8.4], [1.8, -13], [5.2, -9], [-1.4, -1.5]]
      .map(([x, z]) => at(x, z)),
    random,
  ));
  scene.add(buildStones([[1.6, -3.2], [2.1, -9], [-1.4, -12], [3.2, -6.5], [-1.7, -6]].map(([x, z]) => at(x, z)), random));
  scene.add(buildScaffold(at(-6, -6)));

  const dog = buildFluffDog(random);
  const dogBase = at(0.6, -7.5);
  dog.position.copy(dogBase);
  dog.rotation.y = -1.2; // faces the player, turned slightly toward the path
  scene.add(dog);

  const critterSpots = [[1.6, -5.6], [0.2, -4.6], [2.0, -7.8]].map(([x, z]) => at(x, z));
  const critters = buildCritters(critterSpots, random);
  scene.add(critters);

  scene.add(buildLightShafts([
    { x: -4.5, y: 9, z: -9.5, width: 3.4, length: 11, twist: 0.4 },
    { x: 0, y: 9, z: -13, width: 2.4, length: 10, twist: 0.9 },
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
    spawn: { position: new THREE.Vector3(0.2, 0, -2.5), yaw: 0, pitch: -0.04 },
    stats: { blocks: level.blockCount, caps: level.capCount },
    update(time) {
      dog.position.y = dogBase.y + Math.abs(Math.sin(time * 2.2)) * 0.03;
      dog.rotation.z = Math.sin(time * 1.3) * 0.03;
      critters.position.y = Math.abs(Math.sin(time * 3.1)) * 0.05;
    },
  };
}
