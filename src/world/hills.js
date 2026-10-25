// Knitted hills (striped stockinette mounds topped with pom-poms, like beanies) and knitted rocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { PALETTE, withSeed } from './util.js';

export function buildKnitHills(hills, rocks, random) {
  const group = new THREE.Group();

  // Each hill gets its own material so the stitch scale matches its size.
  const poms = [];
  for (const hill of hills) {
    const dome = new THREE.SphereGeometry(1, 72, 36, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(hill.radius, hill.height, hill.radius);
    prepareTextileGeometry(dome);
    const mesh = new THREE.Mesh(dome, createTextile('knit', {
      knit: [Math.round(hill.radius * 18), Math.round(hill.height * 9)],
      stripes: hill.stripes ?? PALETTE.knitStripes,
      fuzz: 0.45,
    }));
    mesh.position.set(hill.x, hill.y - 0.15, hill.z);
    group.add(mesh);

    const pom = new THREE.SphereGeometry(0.45, 24, 16);
    pom.translate(hill.x, hill.y + hill.height + 0.15, hill.z);
    paint(pom, '#f5f1ea');
    poms.push(withSeed(pom, random()));
  }
  if (poms.length) {
    group.add(createFur(mergeGeometries(poms), {
      shells: 28, length: 0.32, density: 30, gravity: 0.15, curl: 0.4, clump: 0.5, tipTint: '#ffffff', rim: 1.2,
    }));
  }

  // Knitted rocks: plain stockinette in soft stone tones.
  const rockGeoms = [];
  for (const rock of rocks) {
    const g = new THREE.SphereGeometry(rock.size, 32, 20);
    g.scale(1.2, 0.7, 1);
    g.rotateY(random() * Math.PI);
    g.translate(rock.x, rock.y + rock.size * 0.35, rock.z);
    paint(g, PALETTE.rock[Math.floor(random() * PALETTE.rock.length)]);
    rockGeoms.push(prepareTextileGeometry(g));
  }
  if (rockGeoms.length) {
    group.add(new THREE.Mesh(mergeGeometries(rockGeoms), createTextile('knit', { knit: [14, 9], fuzz: 0.4 })));
  }
  return group;
}
