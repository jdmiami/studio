// Arches: rounded pale stone blocks stacked into two pillars (a wider base block under each) with a
// lintel of blocks across the top, the middle one raised. Both arches run forward to the right.
//
// The blocks were fitted to the reference silhouette as world-aligned rounded boxes with
// scripts/kit/boxfit.py; their seams and the stone's mottling come from the baked finish.
import * as THREE from 'three';
import { PASTEL, felt, lumpy, mottle, shadeBottom, softBox } from '../style.js';

// Where each arch's centre (between its pillars) stands on the sheet (reference px).
export const ANCHORS = {
  'arch-a': [397.60, 213.68], // anchor
  'arch-b': [464.20, 215.00], // anchor
};

// Ground shadows: blobs and colour fitted to the reference by scripts/kit/shadowfit.py.
export const SHADOWS = {
  'arch-a': { cast: false, color: '#6d7995', blobs: [[1.088, -0.22, 2.452, 0.314, 0.523, 0.026, 0.241], [0.748, 0.195, 0.83, 0.247, 0.588, -0.65, 0.325], [0.503, -0.001, 0.364, 0.714, 0.404, -0.015, 0.276]], contact: 0.3 },
  'arch-b': { cast: false, color: '#6d7995', blobs: [[1.74, -0.5, 0.6, 0.35, 0.5, 0.0, 0.15], [0.911, -0.09, 0.605, 1.115, 0.483, -0.993, 0.006], [0.659, 0.403, 0.696, 0.228, 0.539, -0.68, 0.278]], contact: 0.3 },
};

// Fitted boxes [s, y, d, w, h, dp]: bottom centre (screen-aligned) and size along world x, y, z.
const BOXES = {
  'arch-a': [[-0.391, 0.0, -0.116, 0.332, 0.232, 0.389], [-0.387, 0.219, -0.25, 0.259, 0.26, 0.3], [-0.372, 0.48, -0.3, 0.3, 0.23, 0.3], [-0.289, 0.814, -0.295, 0.3, 0.284, 0.402], [0.372, 0.024, 0.445, 0.332, 0.25, 0.37], [0.356, 0.29, 0.3, 0.11, 0.294, 0.35], [0.396, 0.57, 0.196, 0.212, 0.21, 0.35], [0.372, 0.754, 0.276, 0.32, 0.27, 0.29], [0.17, 0.889, -0.051, 0.34, 0.24, 0.33], [0.32, 0.68, 0.131, 0.3, 0.24, 0.282]],
  'arch-b': [[-0.408, 0.0, -0.031, 0.374, 0.371, 0.37], [-0.408, 0.26, -0.28, 0.29, 0.39, 0.32], [-0.394, 0.6, -0.266, 0.29, 0.3, 0.32], [-0.385, 0.925, -0.299, 0.331, 0.274, 0.368], [0.393, 0.0, 0.532, 0.392, 0.342, 0.364], [0.408, 0.206, 0.28, 0.14, 0.436, 0.32], [0.36, 0.644, 0.28, 0.32, 0.31, 0.32], [0.408, 0.93, 0.32, 0.32, 0.31, 0.32], [0.056, 1.156, -0.08, 0.75, 0.281, 0.32], [0.324, 0.876, 0.15, 0.26, 0.3, 0.32]],
};

const worldOf = (s, y, d) => [(s + d) * Math.SQRT1_2, y, (d - s) * Math.SQRT1_2];

function arch(id, seed) {
  const group = new THREE.Group();
  const material = felt('#ffffff', { fuzz: 0.08 });
  BOXES[id].forEach(([s, y, d, w, h, dp], i) => {
    const g = softBox(w, h, dp, { radius: Math.min(w, h, dp) * 0.18, res: 40 });
    g.translate(...worldOf(s, y + h / 2, d));
    lumpy(g, { amount: 0.005, scale: 6, seed: seed + i });
    mottle(g, PASTEL.stone, PASTEL.stoneDeep, { scale: 3, seed: seed + i, bias: -0.3 });
    shadeBottom(g, { from: 0, to: 0.12, dark: 0.75 });
    group.add(new THREE.Mesh(g, material));
  });
  return group;
}

export function build(variant, random, item) {
  return arch(item.id, variant.seed ?? 1);
}
