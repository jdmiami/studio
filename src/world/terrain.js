// Island terrain: a grid of Tufts whose material depends on the biome.
// Felt biomes (meadow, flowers, hills) get stitched felt patches with a fine fuzz;
// the shag zone gets long swaying pile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFur, paint } from '../fur.js';
import { createTextile } from '../textile.js';
import { PALETTE, ISLAND_RADIUS, biomeAt, islandHeight, pick, puffyTuft, withLocal, withSeed } from './util.js';

const BIOME_COLORS = {
  meadow: PALETTE.felt,
  flowers: PALETTE.flowerBed,
  hills: PALETTE.hillFelt,
};

// A felt cushion: rounded and slightly pillowy, so each Tuft reads as a stitched patch.
function feltTuft() {
  return withLocal(puffyTuft(0.22, 0.96, 0.26));
}

export function buildTerrain(random) {
  const felt = [];
  const shag = [];
  const tops = [];

  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const r = Math.hypot(x, z);
      if (r > ISLAND_RADIUS) continue;
      const biome = biomeAt(x, z);
      const height = islandHeight(x, z);
      const topColor = biome === 'shag' ? pick(random, PALETTE.shag) : pick(random, BIOME_COLORS[biome]);

      for (let y = -2; y <= height; y++) {
        // Only the island's outer shell is visible, so skip buried Tufts.
        if (y < height && r < 7.5 && y > -2) continue;
        const isTop = y === height;
        if (isTop && biome === 'shag') {
          const g = puffyTuft();
          g.translate(x, y, z);
          paint(g, topColor);
          shag.push(withSeed(g, random()));
        } else {
          const g = feltTuft();
          g.translate(x, y, z);
          paint(g, isTop ? topColor : PALETTE.cliff);
          felt.push(withSeed(g, random()));
        }
      }
      tops.push({ x, z, y: height + 0.5, biome });
    }
  }

  const group = new THREE.Group();
  const feltGeometry = mergeGeometries(felt);
  // Smooth matte felt; the shader's rim fuzz keeps silhouettes soft without grainy shells.
  group.add(new THREE.Mesh(feltGeometry, createTextile('felt', { stitch: 1, fuzz: 0.4 })));
  group.add(createFur(mergeGeometries(shag), {
    shells: 32, length: 0.5, density: 16, gravity: 0.45, curl: 0.35, clump: 0.5,
    tipTint: '#fffaf6', rim: 1.0, sheen: 0.7,
  }));

  const topAt = (x, z) => {
    const t = tops.find((c) => c.x === x && c.z === z);
    return new THREE.Vector3(x, t ? t.y : 0.5, z);
  };
  return { group, tops, topAt };
}
