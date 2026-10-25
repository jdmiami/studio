// Assembles the textile world: terrain by biome, then trees, hills, flora, water, sky dressing.
import * as THREE from 'three';
import { buildTerrain } from './terrain.js';
import { buildTasselTrees } from './trees.js';
import { buildKnitHills } from './hills.js';
import { buildFlora } from './flora.js';
import { buildFeltClouds } from './clouds.js';
import { buildPond, buildWaterfall } from './water.js';
import { buildFluffalo } from './creatures.js';
import { buildComb, buildGlowMotes, buildIslets, buildSeeds } from './props.js';
import { rng } from './util.js';

const COMB_SPOT = [3, 2];
const FLUFFALO_SPOT = [-1, 1];

export function buildWorld(scene) {
  const random = rng(20261025);
  const { group: terrain, tops, topAt } = buildTerrain(random);
  scene.add(terrain);

  // Tassel willows stand in the meadow and among the knitted hills.
  scene.add(buildTasselTrees([[3, -5], [6, -2], [-1, -6], [-4, -1]].map(([x, z]) => topAt(x, z)), random));

  const hill = (x, z, radius, height) => ({ ...topAt(x, z), radius, height });
  scene.add(buildKnitHills(
    [hill(-5, -4, 2.2, 1.7), hill(-6, 1, 1.8, 1.4), hill(-3, -7, 1.5, 1.1)],
    [[-2, -4, 0.45], [-7, -2, 0.55], [-1, -8, 0.4]].map(([x, z, size]) => ({ ...topAt(x, z), size })),
    random,
  ));

  // Velvet blooms across the flower beds, skipping the water and the Comb's pedestal.
  const flowerSpots = tops.filter((t) => t.biome === 'flowers' && t.y > 0
    && !(t.x === COMB_SPOT[0] && t.z === COMB_SPOT[1]) && random() < 0.7);
  scene.add(buildFlora(flowerSpots, random));

  scene.add(buildPond());
  const waterfall = buildWaterfall(random);
  scene.add(waterfall);

  const fluffalo = buildFluffalo(random);
  fluffalo.scale.setScalar(1.3);
  const fluffaloBase = topAt(...FLUFFALO_SPOT);
  fluffalo.position.copy(fluffaloBase);
  fluffalo.rotation.y = -0.5;
  scene.add(fluffalo);

  const comb = buildComb(random);
  const combBase = topAt(...COMB_SPOT).add(new THREE.Vector3(0, 1.2, 0));
  comb.position.copy(combBase);
  scene.add(comb);

  scene.add(buildFeltClouds(random));
  scene.add(buildIslets(random));
  const seeds = buildSeeds(random);
  scene.add(seeds);
  const motes = buildGlowMotes(random);
  scene.add(motes);

  // Lights only affect the glossy button eyes; textiles and fur light themselves.
  scene.add(new THREE.HemisphereLight('#dfe6fb', '#f5dbe3', 1.2));
  const sun = new THREE.DirectionalLight('#fff1e2', 2.2);
  sun.position.set(-10, 8, -2);
  scene.add(sun);

  return {
    update(time) {
      fluffalo.position.y = fluffaloBase.y + Math.abs(Math.sin(time * 1.6)) * 0.08;
      comb.position.y = combBase.y + Math.sin(time * 1.2) * 0.25;
      comb.rotation.y = time * 0.8;
      motes.rotation.y = time * 0.03;
      seeds.userData.update(time);
      waterfall.userData.update(time);
    },
  };
}
