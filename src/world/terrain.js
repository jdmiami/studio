// Island terrain: a grid of Tufts whose material depends on the biome.
// Felt biomes (meadow, flowers, hills) are stitched felt cushions; the shag zone gets long
// swaying pile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile, prepareTextileGeometry } from '../textile.js';
import { PALETTE, ISLAND_RADIUS, biomeAt, islandHeight, pick, puffyTuft, withLocal, withSeed } from './util.js';

const BIOME_COLORS = {
  meadow: PALETTE.felt,
  flowers: PALETTE.flowerBed,
  hills: PALETTE.hillFelt,
};

// A felt cushion: rounded and slightly pillowy, so each Tuft reads as a stitched patch.
function feltTuft() {
  return withLocal(puffyTuft(0.22, 0.96, 0.26, 3));
}

export function buildTerrain(random) {
  const felt = []; // { x, y, z, color }
  const shag = [];
  const tops = [];

  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const r = Math.hypot(x, z);
      if (r > ISLAND_RADIUS) continue;
      const biome = biomeAt(x, z);
      const height = islandHeight(x, z);
      const topColor = biome === 'shag' ? pick(random, PALETTE.shag) : pick(random, BIOME_COLORS[biome]);

      // Columns are solid. (Skipping "buried" Tufts left the island hollow: wherever the
      // ground steps down, the open side of a raised Tuft showed the empty interior.)
      for (let y = -2; y <= height; y++) {
        const isTop = y === height;
        if (isTop && biome === 'shag') {
          const g = puffyTuft();
          g.translate(x, y, z);
          paint(g, topColor);
          shag.push(withSeed(g, random()));
        } else {
          felt.push({ x, y, z, color: isTop ? topColor : PALETTE.cliff });
        }
      }
      tops.push({ x, z, y: height + 0.5, biome });
    }
  }

  const group = new THREE.Group();

  // Every felt Tuft is an instance of one cushion, colored per instance. The cushion's local
  // coordinates (aLocal) are shared, so the stitches land in the same place on each one.
  const cushion = prepareTextileGeometry(feltTuft());
  const feltMesh = new THREE.InstancedMesh(cushion, createTextile('felt', { stitch: 1, fuzz: 0.4 }), felt.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  felt.forEach((t, i) => {
    feltMesh.setMatrixAt(i, m.makeTranslation(t.x, t.y, t.z));
    feltMesh.setColorAt(i, c.set(t.color));
  });
  feltMesh.frustumCulled = false;
  group.add(feltMesh);

  group.add(createFur(mergeGeometries(shag), {
    shells: 32, length: 0.5, density: 16, gravity: 0.45, curl: 0.35, clump: 0.5,
    tipTint: '#cfe8a8', rim: 0.8, sheen: 0.6,
  }));

  const topAt = (x, z) => {
    const t = tops.find((cell) => cell.x === x && cell.z === z);
    return new THREE.Vector3(x, t ? t.y : 0.5, z);
  };
  return { group, tops, topAt };
}
