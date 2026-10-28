// The finds: everything the player can collect, catalogue in the collection book, carry home and
// place in the Nest. Each find's look is one of the cave painting's assets (src/game/world/finds.js
// builds it from `look`), so the world stays in the painted family.
//
// rarity: common 60, uncommon 28, rare 10, legendary 2 (relative weights; biomes reweight them).
// biomes: where a trip scatters it ('meadow' green felt hills, 'grotto' pink terraces, 'lake' blue
// water terraces); 'hub': found in the Nest itself.

export const RARITY = {
  common: { weight: 60, color: '#e9dccb', label: 'Common' },
  uncommon: { weight: 28, color: '#a8d5b9', label: 'Uncommon' },
  rare: { weight: 10, color: '#a9c6ea', label: 'Rare' },
  legendary: { weight: 2, color: '#f2c46b', label: 'Legendary' },
};

/**
 * look: { kind: 'mushroom' | 'stone' | 'dome' | 'pom' | 'puff' | 'leaf' | 'spool' | 'button' | 'thimble' | 'crown' | 'critter',
 *         color, accent?, scale }
 */
export const ITEMS = [
  // Common
  { id: 'fluff-stone', name: 'Fluff Stone', rarity: 'common', biomes: ['hub', 'meadow', 'grotto', 'lake'],
    look: { kind: 'stone', color: '#e3d3bf', scale: 0.32 }, text: 'A pebble of pressed wool, warm from the cave floor.' },
  { id: 'button-mushroom', name: 'Button Mushroom', rarity: 'common', biomes: ['hub', 'meadow', 'grotto'],
    look: { kind: 'mushroom', color: '#e8b7a7', accent: '#f2e6d6', scale: 0.34 }, text: 'Its cap is stitched on with three tiny loops.' },
  { id: 'moss-tuft', name: 'Moss Tuft', rarity: 'common', biomes: ['meadow', 'lake'],
    look: { kind: 'dome', color: '#9fbf86', scale: 0.26 }, text: 'Soft as a sleeping caterpillar.' },
  { id: 'felt-leaf', name: 'Felt Leaf', rarity: 'common', biomes: ['meadow', 'grotto'],
    look: { kind: 'leaf', color: '#b7cc94', scale: 0.3 }, text: 'Cut from a green jumper long ago.' },
  { id: 'blue-pebble', name: 'Lake Pebble', rarity: 'common', biomes: ['lake'],
    look: { kind: 'stone', color: '#a9c3df', scale: 0.28 }, text: 'Smoothed by water that never got it wet.' },
  { id: 'peach-pebble', name: 'Peach Pebble', rarity: 'common', biomes: ['grotto'],
    look: { kind: 'stone', color: '#f0c3a8', scale: 0.28 }, text: 'Smells faintly of apricot jam.' },
  // Uncommon
  { id: 'tiered-dome', name: 'Tiered Dome', rarity: 'uncommon', biomes: ['hub', 'meadow', 'grotto'],
    look: { kind: 'dome', color: '#d8c4a9', accent: '#cbb294', scale: 0.4, tiers: 3 }, text: 'Someone stacked three cushions and forgot them.' },
  { id: 'lilac-puff', name: 'Lilac Puff', rarity: 'uncommon', biomes: ['grotto', 'lake'],
    look: { kind: 'puff', color: '#b6a6cf', scale: 0.32 }, text: 'Hums when nobody is listening.' },
  { id: 'spotted-mushroom', name: 'Spotted Toadstool', rarity: 'uncommon', biomes: ['meadow', 'grotto'],
    look: { kind: 'mushroom', color: '#e49c94', accent: '#fbf1e6', scale: 0.42, spots: true }, text: 'Its spots are mother-of-pearl buttons.' },
  { id: 'thread-spool', name: 'Thread Spool', rarity: 'uncommon', biomes: ['meadow', 'lake'],
    look: { kind: 'spool', color: '#c79a7e', accent: '#e7a0a6', scale: 0.3 }, text: 'Rose thread, enough for a hundred hearts.' },
  { id: 'mint-dome', name: 'Mint Dome', rarity: 'uncommon', biomes: ['lake', 'meadow'],
    look: { kind: 'dome', color: '#a7d0c0', scale: 0.36, tiers: 2 }, text: 'Cool to the touch, like a peppermint.' },
  // Rare
  { id: 'golden-button', name: 'Golden Button', rarity: 'rare', biomes: ['grotto', 'meadow'],
    look: { kind: 'button', color: '#e8c56e', scale: 0.26 }, text: 'From the coat of the first felter, they say.' },
  { id: 'rainbow-pom', name: 'Rainbow Pom', rarity: 'rare', biomes: ['meadow', 'lake'],
    look: { kind: 'pom', color: '#f1c0c8', accent: '#bfe0e8', scale: 0.3, rainbow: true }, text: 'Every strand a different colour.' },
  { id: 'moon-thimble', name: 'Moon Thimble', rarity: 'rare', biomes: ['lake', 'grotto'],
    look: { kind: 'thimble', color: '#cfd6e6', scale: 0.26 }, text: 'Glows faintly when held up to a cave light.' },
  // Legendary
  { id: 'felt-crown', name: 'Felt Crown', rarity: 'legendary', biomes: ['grotto', 'meadow', 'lake'],
    look: { kind: 'crown', color: '#f2c46b', accent: '#e78a8a', scale: 0.34 }, text: 'Too small for anyone. Perfect for the Nest.' },
  { id: 'starlit-yarn', name: 'Starlit Yarn', rarity: 'legendary', biomes: ['lake', 'meadow'],
    look: { kind: 'spool', color: '#9fb3e0', accent: '#fff2b8', scale: 0.34 }, text: 'Spun from the light that leaks through the ceiling.' },
  // Critter sightings (catalogued by meeting a critter, not carried)
  { id: 'critter-cream', name: 'Cream Puffling', rarity: 'common', biomes: ['hub', 'meadow', 'grotto'], sighting: true,
    look: { kind: 'critter', color: '#f1e8dc', scale: 0.4 }, text: 'Rolls rather than walks. Mostly on purpose.' },
  { id: 'critter-mint', name: 'Mint Puffling', rarity: 'uncommon', biomes: ['meadow', 'lake'], sighting: true,
    look: { kind: 'critter', color: '#cfe6d6', scale: 0.4 }, text: 'Shy, but loves a sunny felt patch.' },
  { id: 'critter-blush', name: 'Blush Puffling', rarity: 'rare', biomes: ['grotto', 'lake'], sighting: true,
    look: { kind: 'critter', color: '#f3c9c9', scale: 0.4 }, text: 'Turns pinker when it is happy. It is always pink.' },
  // Story items (the felt lock's three keys come from the Nest's own treasures)
  { id: 'dog-badge', name: 'Best Friend Badge', rarity: 'rare', biomes: [], story: true,
    look: { kind: 'button', color: '#f1e3d4', accent: '#e78a8a', scale: 0.26 }, text: 'Earned by throwing a felt ball nine hundred times. Or three.' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** The finds a biome can scatter, with weights from rarity (story items and sightings excluded). */
export function findTable(biome) {
  return ITEMS.filter((i) => !i.story && !i.sighting && i.biomes.includes(biome))
    .map((i) => ({ item: i.id, weight: RARITY[i.rarity].weight }));
}
