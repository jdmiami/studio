// Trip names from word lists: "Whispering Meadow", "Thimble Mere", "Grotto of Buttons".

const ADJECTIVES = [
  'Whispering', 'Drowsy', 'Velvet', 'Hushed', 'Tumbling', 'Mossy', 'Sleepy', 'Golden', 'Dappled', 'Humming',
  'Woolly', 'Quilted', 'Pillowy', 'Rosy', 'Sunlit', 'Gentle', 'Lilac', 'Twinkling', 'Snug', 'Bramble',
  'Honeyed', 'Misty', 'Cosy', 'Peppermint', 'Tufted',
];
const THINGS = [
  'Thimble', 'Button', 'Bobbin', 'Pompom', 'Spool', 'Teacup', 'Mitten', 'Pincushion', 'Ribbon', 'Acorn',
  'Biscuit', 'Lantern', 'Puffling', 'Toadstool', 'Marshmallow',
];
const PLURALS = ['Buttons', 'Mittens', 'Bobbins', 'Ribbons', 'Thimbles', 'Lullabies', 'Pompoms', 'Daydreams', 'Stitches', 'Puddles'];
const NOUNS = {
  meadow: ['Meadow', 'Downs', 'Fields', 'Knoll', 'Green', 'Pasture', 'Hills'],
  grotto: ['Grotto', 'Terraces', 'Hollow', 'Nook', 'Steps', 'Canyon', 'Burrow'],
  lake: ['Lake', 'Mere', 'Pond', 'Shallows', 'Lagoon', 'Shore', 'Waters'],
};

/** A name for a trip of `biome`, drawn from `rng` (its own fork, so names stay stable). */
export function tripName(rng, biome) {
  const noun = rng.pick(NOUNS[biome]);
  const form = rng.weighted([['adj', 6], ['thing', 3], ['of', 2]]);
  if (form === 'adj') return `${rng.pick(ADJECTIVES)} ${noun}`;
  if (form === 'thing') return `${rng.pick(THINGS)} ${noun}`;
  return `${noun} of ${rng.pick(PLURALS)}`;
}
