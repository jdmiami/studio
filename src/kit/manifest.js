// Every element of the pastel-cubism kit, laid out exactly where it sits on the reference sheet
// docs/reference/asset-kit.jpg (512 x 286). `box` is the element's bounding box on that sheet in
// pixels [x0, y0, x1, y1]; the kit page places each element so its base center lands on its
// anchor: the box's bottom center raised by the depth of a round footprint, unless the family
// module exports ANCHORS = { id: [u, v] }.
//
// `family` names the module in ./families that builds it; `variant` is passed to that builder.

export const SHEET = { width: 512, height: 286, image: '/docs/reference/asset-kit.jpg' };

export const ITEMS = [
  // Row 1: blocks
  { id: 'block-grass-a', family: 'blocks', variant: { kind: 'grass', seed: 1 }, box: [21, 16, 76, 75] },
  { id: 'block-grass-b', family: 'blocks', variant: { kind: 'grass', seed: 2 }, box: [84, 16, 138, 75] },
  { id: 'block-pink', family: 'blocks', variant: { kind: 'pink', seed: 3 }, box: [147, 17, 201, 75] },
  { id: 'block-water', family: 'blocks', variant: { kind: 'water', seed: 4 }, box: [210, 17, 263, 75] },
  { id: 'block-stone-plain', family: 'blocks', variant: { kind: 'stone', seed: 5 }, box: [315, 17, 367, 75] },
  { id: 'block-stone-seam-a', family: 'blocks', variant: { kind: 'stone-seam', seed: 6 }, box: [377, 17, 430, 75] },
  { id: 'block-stone-seam-b', family: 'blocks', variant: { kind: 'stone-seam', seed: 7 }, box: [440, 17, 492, 75] },

  // Row 2: trees, knit domes, bushes
  { id: 'tree-cube-large', family: 'trees', variant: { kind: 'cube', size: 'large', seed: 11 }, box: [17, 82, 81, 158] },
  { id: 'tree-cube-small', family: 'trees', variant: { kind: 'cube', size: 'small', seed: 12 }, box: [88, 94, 142, 158] },
  { id: 'tree-willow-a', family: 'trees', variant: { kind: 'willow', seed: 13 }, box: [152, 86, 208, 151] },
  { id: 'tree-willow-b', family: 'trees', variant: { kind: 'willow', seed: 14 }, box: [219, 86, 274, 151] },
  { id: 'dome-knit-teal', family: 'domes', variant: { kind: 'knit', color: 'teal', seed: 21 }, box: [289, 106, 336, 153] },
  { id: 'dome-knit-green', family: 'domes', variant: { kind: 'knit', color: 'green', seed: 22 }, box: [347, 105, 391, 152] },
  { id: 'bush-round-light', family: 'domes', variant: { kind: 'bush', color: 'light', seed: 23 }, box: [404, 111, 441, 147] },
  { id: 'bush-round-dark', family: 'domes', variant: { kind: 'bush', color: 'dark', seed: 24 }, box: [454, 111, 491, 147] },

  // Row 3: mushrooms, fences, lollipops, arches
  { id: 'mushroom-pink', family: 'mushrooms', variant: { kind: 'big', color: 'pink', seed: 31 }, box: [23, 176, 56, 207] },
  { id: 'mushroom-tan', family: 'mushrooms', variant: { kind: 'small', color: 'tan', seed: 32 }, box: [62, 186, 84, 207] },
  { id: 'mushroom-lilac', family: 'mushrooms', variant: { kind: 'small', color: 'lilac', seed: 33 }, box: [95, 181, 115, 207] },
  { id: 'mushroom-pair', family: 'mushrooms', variant: { kind: 'pair', color: 'tan', seed: 34 }, box: [120, 186, 144, 207] },
  { id: 'fence-a', family: 'fences', variant: { kind: 'a', seed: 41 }, box: [158, 171, 198, 212] },
  { id: 'fence-b', family: 'fences', variant: { kind: 'b', seed: 42 }, box: [207, 172, 246, 212] },
  { id: 'fence-c', family: 'fences', variant: { kind: 'c', seed: 43 }, box: [253, 178, 292, 214] },
  { id: 'lollipop-pink', family: 'lollipops', variant: { kind: 'swirl', color: 'pink', seed: 51 }, box: [308, 175, 327, 211] },
  { id: 'lollipop-purple', family: 'lollipops', variant: { kind: 'swirl', color: 'purple', seed: 52 }, box: [340, 175, 355, 211] },
  { id: 'arch-a', family: 'arches', variant: { kind: 'a', seed: 61 }, box: [372, 166, 420, 226] },
  { id: 'arch-b', family: 'arches', variant: { kind: 'b', seed: 62 }, box: [437, 160, 491, 231] },

  // Row 4: creatures
  { id: 'dog-a', family: 'creatures', variant: { kind: 'dog', seed: 71 }, box: [22, 226, 66, 272] },
  { id: 'dog-b', family: 'creatures', variant: { kind: 'dog', seed: 72 }, box: [83, 226, 129, 272] },
  { id: 'critter-a', family: 'creatures', variant: { kind: 'critter', seed: 73 }, box: [148, 248, 168, 268] },
  { id: 'critter-b', family: 'creatures', variant: { kind: 'critter', seed: 74 }, box: [186, 248, 206, 268] },
  { id: 'critter-c', family: 'creatures', variant: { kind: 'critter', seed: 75 }, box: [223, 248, 244, 268] },
];

/** Default spot for an item's base center on the sheet, in reference pixels. */
export function anchorOf(item) {
  const [x0, , x1, y1] = item.box;
  return [(x0 + x1) / 2, y1 - 0.22 * (x1 - x0)];
}
