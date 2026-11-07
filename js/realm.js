// Stickerwild — the realm: danger zones, tribes, knowledge, trade, relics and mods.
// This is the hand-written layer on top of the procedural island: five zones
// you unlock by levelling up, one settlement and one cave per zone, and a
// crafting tree that grows with what you have learned, not just what you hold.
'use strict';
(function () {
  const TAU = Math.PI * 2;

  // ---------------- zones ----------------
  // Rings around where you washed ashore. Danger rises inside each ring, and
  // you can't cross into the next ring until you reach its level.
  SW.ZONES = [
    { id: 0, name: 'Sunny Shallows', level: 1, minDanger: 1, color: '#6bbf4a' },
    { id: 1, name: 'Bramble Reach', level: 3, minDanger: 3, color: '#ffb13b' },
    { id: 2, name: 'Lantern Wilds', level: 6, minDanger: 5, color: '#4fb3e8' },
    { id: 3, name: 'Frost Heights', level: 9, minDanger: 7, color: '#a78bfa' },
    { id: 4, name: 'Ink Rim', level: 12, minDanger: 9, color: '#ff4d6d' },
  ];
  SW.ZONE_R = [7000, 12200, 17400, 22600];   // outer radius of zones 0..3, measured from the spawn
  SW.zoneAt = function (world, x, y) {
    const d = Math.hypot(x - world.spawn.x, y - world.spawn.y);
    let z = 0;
    while (z < SW.ZONE_R.length && d > SW.ZONE_R[z]) z++;
    return z;
  };
  SW.zoneBand = (z) => [z === 0 ? 0 : SW.ZONE_R[z - 1], z < SW.ZONE_R.length ? SW.ZONE_R[z] : SW.ZONE_R[SW.ZONE_R.length - 1] + 6000];

  // ---------------- items ----------------
  const I = SW.ITEMS;
  Object.assign(I, {
    shell: { name: 'Shells', icon: 'itemShell', money: true },
    amber: { name: 'Amber', icon: 'itemAmber', rare: true },
    ruby: { name: 'Ruby', icon: 'itemRuby', rare: true },
    moonOpal: { name: 'Moon Opal', icon: 'itemOpal', rare: true },
    starShard: { name: 'Star Shard', icon: 'itemStar', rare: true },
    // relics: one per cave; you keep them, they unlock crafting
    sunstone: { name: 'Sunstone', icon: 'relicSun', relic: true, desc: 'Warm to the touch. It melts ice.' },
    echoCrystal: { name: 'Echo Crystal', icon: 'relicEcho', relic: true, desc: 'Hums when struck. Runesmiths prize it.' },
    tidePearl: { name: 'Tide Pearl', icon: 'relicPearl', relic: true, desc: 'Always wet. It washes ink away.' },
    frostHeart: { name: 'Frost Heart', icon: 'relicFrost', relic: true, desc: 'A cold that never melts.' },
    inkCrown: { name: 'Ink Crown', icon: 'relicCrown', relic: true, desc: 'Worn by the first Scribble. It binds what ink tore.' },
    // mods: use them from the Mods tab to upgrade your gear
    runeKeen: { name: 'Keen Rune', icon: 'runeKeen', mod: true },
    runeSwift: { name: 'Swift Rune', icon: 'runeSwift', mod: true },
    runeLucky: { name: 'Lucky Rune', icon: 'runeLucky', mod: true },
    runeWard: { name: 'Ward Rune', icon: 'runeWard', mod: true },
    featherCharm: { name: 'Feather Charm', icon: 'modFeather', mod: true },
    tarPot: { name: 'Pot of Tar', icon: 'modTar', mod: true },
    firePepper: { name: 'Fire Pepper', icon: 'modPepper', mod: true },
  });
  SW.ITEM_ORDER.push('shell', 'amber', 'ruby', 'moonOpal', 'starShard', 'runeKeen', 'runeSwift', 'runeLucky', 'runeWard', 'featherCharm', 'tarPot', 'firePepper', 'sunstone', 'echoCrystal', 'tidePearl', 'frostHeart', 'inkCrown');
  SW.RELICS = ['sunstone', 'echoCrystal', 'tidePearl', 'frostHeart', 'inkCrown'];

  // what a trader pays for one (buying costs about 2.5x)
  SW.VALUE = {
    wood: 1, stone: 1, fiber: 1, berry: 1, petal: 2, mushroom: 2, meat: 2, fish: 2, cooked: 5, grilledFish: 5, koi: 30, salve: 7,
    gem: 6, ink: 5, campfire: 4, wall: 2, amber: 18, ruby: 40, moonOpal: 75, starShard: 140,
    runeKeen: 30, runeSwift: 30, runeLucky: 35, runeWard: 35, featherCharm: 30, tarPot: 25, firePepper: 20,
  };

  // ---------------- mods ----------------
  // Each gear slot takes up to three mods. They stack.
  SW.MODS = {
    runeKeen: { slots: ['weapon'], desc: '+2 damage for your weapon.' },
    runeSwift: { slots: ['axe', 'pick'], desc: 'Chops or mines 50% faster.' },
    runeLucky: { slots: ['pick', 'rod'], desc: 'Pickaxe: a chance of bonus crystals. Rod: rare fish bite more often.' },
    runeWard: { slots: ['armor'], desc: 'Armour blocks 10% more damage.' },
    featherCharm: { slots: ['glider'], desc: 'The leaf sinks 30% slower.' },
    tarPot: { slots: ['raft'], desc: 'The raft soaks up water half as fast.' },
    firePepper: { slots: ['food'], desc: 'All food fills and heals 50% more.' },
  };
  SW.MOD_SLOTS = { weapon: 'Weapon', axe: 'Axe', pick: 'Pickaxe', rod: 'Fishing Rod', armor: 'Armour', glider: 'Leaf Glider', raft: 'Raft', food: 'Cooking' };
  SW.MOD_MAX = 3;

  // ---------------- knowledge ----------------
  // Know-how is taught by tribe elders after their side quests.
  SW.KNOW = {
    lantern: { name: 'Lantern-making', from: 'Reedwick' },
    windcraft: { name: 'Windcraft', from: 'Reedwick' },
    masonry: { name: 'Masonry', from: 'Stonebrook' },
    runecraft: { name: 'Runecraft', from: 'Stonebrook' },
    tidecraft: { name: 'Tidecraft', from: 'Lumenport' },
    frostcraft: { name: 'Frostcraft', from: 'Lumenport' },
    inkcraft: { name: 'Inkcraft', from: 'Hearthhold' },
    bookbinding: { name: 'Bookbinding', from: 'Quillspire' },
  };
  SW.TOOLS.warmCloak = { name: 'Warm Cloak', icon: 'toolCloak', kind: 'tool' };
  SW.TOOLS.greatBook = { name: 'The Great Sticker Book', icon: 'greatBook', kind: 'tool' };
  // gate the advanced recipes behind know-how and relics
  const gate = { lantern: ['lantern'], glider: ['windcraft', 'sunstone'], stoneMail: ['masonry'], gemSword: ['runecraft', 'echoCrystal'], crystalPlate: ['tidecraft'], inkBlade: ['inkcraft', 'frostHeart'] };
  for (const r of SW.RECIPES) if (gate[r.id]) { r.learn = gate[r.id][0]; if (gate[r.id][1]) r.relic = gate[r.id][1]; }
  SW.RECIPES.push(
    { id: 'featherCharm', cat: 'mods', gives: 'featherCharm', learn: 'windcraft', cost: { petal: 8, fiber: 4, amber: 1 }, desc: 'A mod for the Leaf Glider: sinks 30% slower.' },
    { id: 'tarPot', cat: 'mods', gives: 'tarPot', learn: 'tidecraft', cost: { ink: 2, wood: 4 }, desc: 'A mod for the Raft: soaks up water half as fast.' },
    { id: 'runeKeen', cat: 'mods', gives: 'runeKeen', learn: 'runecraft', cost: { stone: 6, gem: 3 }, desc: 'A mod for your weapon: +2 damage.' },
    { id: 'warmCloak', cat: 'gear', tool: 'warmCloak', learn: 'frostcraft', relic: 'tidePearl', cost: { fiber: 12, meat: 4, petal: 4 }, desc: 'No extra hunger in the cold, and better footing on snow and ice.' },
    { id: 'greatBook', cat: 'gear', tool: 'greatBook', learn: 'bookbinding', relic: 'inkCrown', pages: 6, cost: { fiber: 10, ink: 10, gem: 6 }, desc: 'Bind the six Lost Pages with the Ink Crown and make the island whole.' },
  );
  SW.RECIPE_CATS.splice(4, 0, ['mods', 'Mods']);

  // ---------------- tribes ----------------
  // One settlement per zone, each its own kind of civilisation. Elders give
  // side quests that teach know-how; traders buy and sell; everyone talks.
  SW.TRIBES = [
    {
      id: 'reedwick', zone: 0, name: 'Reedwick', folk: 'the Reedfolk', style: 'reed', buildings: ['hutReed', 'hutReed', 'hutReed', 'totem', 'hutReed'],
      elder: 'Elder Wisp', trader: 'Tam the Trader', color: '#6bbf4a',
      greet: 'Welcome to Reedwick, little sticker. We fish, we weave, and we remember.',
      quests: [
        { id: 'reed1', title: 'Snapjaws at the Docks', kind: 'hunt', key: 'snapjaw', need: 4, teach: 'lantern', xp: 70, shells: 25,
          ask: 'Snapjaws keep nipping our nets. Chase off four of them on the beaches and I will teach you to make a lantern.',
          done: 'Our nets are safe. Here: a lantern keeps the dark at arm\'s length. You will want one in the deeper caves.' },
        { id: 'reed2', title: 'The Sunstone of Mossmouth', kind: 'relic', key: 'sunstone', teach: 'windcraft', xp: 160, shells: 40,
          ask: 'In the mossy mountain to the {dir} there is a cave, Mossmouth Burrow. Deep inside lies the Sunstone. Bring it back to show me and I will teach you Windcraft. Take an axe: the way is overgrown.',
          done: 'The Sunstone! Keep it, it is yours now. With it you can craft a Leaf Glider and ride the wind.' },
      ],
      lore: [
        'Past the ring of thorns lies the Bramble Reach. You will need to be Level 3 before the ink barrier lets you through.',
        'Stonebrook\'s masons live in the Reach. They know how to carve runes that make tools stronger.',
        'Long ago, the Ink tore the Great Sticker Book apart. Its pages blew all over the island. Find them, and find a way to bind them.',
      ],
      stock: [['salve', 18], ['cooked', 12], ['fiber', 3], ['petal', 5], ['firePepper', 55]],
    },
    {
      id: 'stonebrook', zone: 1, name: 'Stonebrook', folk: 'the Stonebrook masons', style: 'stone', buildings: ['houseStone', 'houseStone', 'forge', 'houseStone'],
      elder: 'Mason Grenda', trader: 'Pell the Peddler', color: '#a3a1b5',
      greet: 'Stonebrook. We cut stone and carve runes. Mind your feet.',
      quests: [
        { id: 'stone1', title: 'Ore for the Forge', kind: 'bring', cost: { stone: 12, gem: 3 }, teach: 'masonry', xp: 120, shells: 45,
          ask: 'The forge is hungry. Bring me 12 stone and 3 crystals and I will teach you Masonry, so you can make Stone Mail.',
          done: 'Good, honest stone. Masonry is yours: you can craft Stone Mail now.' },
        { id: 'stone2', title: 'The Echo Crystal', kind: 'relic', key: 'echoCrystal', teach: 'runecraft', xp: 260, shells: 70,
          ask: 'Under the mountain to the {dir} is the Echo Mine. Its heart is a crystal that sings. Bring it to me and I will teach you Runecraft. You will need a pickaxe for the rubble.',
          done: 'Listen to it hum! With the Echo Crystal and Runecraft you can craft a Crystal Blade, carve Keen Runes, and fit mods to your gear.' },
      ],
      lore: [
        'Beyond the Reach are the Lantern Wilds and the city of Lumenport. The barrier opens at Level 6.',
        'Mods are carved runes and charms. Fit up to three to each piece of gear from the Mods tab in Crafting.',
        'Rare gems from the caves sell for a lot. Traders love a Moon Opal.',
      ],
      stock: [['stone', 3], ['gem', 16], ['runeSwift', 80], ['runeWard', 90], ['salve', 18]],
    },
    {
      id: 'lumenport', zone: 2, name: 'Lumenport', folk: 'the city of lamps', style: 'city', city: true, buildings: ['tower', 'houseCity', 'houseCity', 'market', 'houseCity', 'tower', 'houseCity'],
      elder: 'Lamplord Ottilie', trader: 'Marrow & Daughters', color: '#4fb3e8',
      greet: 'Lumenport, the city of a thousand lamps. Trade is good, and so is the gossip.',
      quests: [
        { id: 'lumen1', title: 'A Letter for Stonebrook', kind: 'deliver', key: 'stonebrook', back: true, teach: 'tidecraft', xp: 200, shells: 60,
          ask: 'Take this letter to Mason Grenda in Stonebrook, then bring me her answer. I will teach you Tidecraft for your trouble.',
          relay: 'A letter from Ottilie? Tell her yes, the stone is on its way. Off you go, back to Lumenport.',
          done: 'She said yes! Tidecraft is yours: Crystal Plate, and tar to keep your raft dry.' },
        { id: 'lumen2', title: 'The Tide Pearl', kind: 'relic', key: 'tidePearl', teach: 'frostcraft', xp: 380, shells: 110,
          ask: 'The Sunken Grotto lies under the mountain to the {dir}. It is pitch dark, so bring a lantern, an axe and a pickaxe. The Tide Pearl rests at the bottom.',
          done: 'The Tide Pearl washes ink away. And now, Frostcraft: you can craft a Warm Cloak for the Frost Heights.' },
      ],
      lore: [
        'North and beyond lie the Frost Heights. The barrier opens at Level 9. Without a Warm Cloak, the cold makes you hungry.',
        'Hearthhold\'s clan knows how to forge Ink into a blade, but they need a Frost Heart to temper it.',
        'The Scribbles get stronger near the Ink Rim. Something there is still drawing them.',
      ],
      stock: [['cooked', 12], ['salve', 16], ['runeKeen', 85], ['runeLucky', 95], ['tarPot', 65], ['featherCharm', 80], ['amber', 50]],
    },
    {
      id: 'hearthhold', zone: 3, name: 'Hearthhold', folk: 'the Hearth clan', style: 'snow', buildings: ['igloo', 'igloo', 'hearth', 'igloo'],
      elder: 'Chief Bruna', trader: 'Old Fennick', color: '#a78bfa',
      greet: 'Come in from the cold. Hearthhold keeps its fires lit day and night.',
      quests: [
        { id: 'hearth1', title: 'Pebblors at the Wall', kind: 'hunt', key: 'pebblor', need: 4, teach: 'inkcraft', xp: 320, shells: 90,
          ask: 'Pebblors keep rolling into our wall. Break four of them and I will teach you Inkcraft.',
          done: 'Ha! Inkcraft is yours. With a Frost Heart to temper it, you can forge the Ink Edge.' },
        { id: 'hearth2', title: 'The Frost Heart', kind: 'relic', key: 'frostHeart', xp: 520, shells: 150, teach: null,
          ask: 'Frostfang Hollow is the mountain to the {dir}. Ice seals its halls; only something warm will melt it. The Frost Heart is inside.',
          done: 'The Frost Heart, still beating cold. Forge your Ink Edge. The monks of Quillspire on the Ink Rim are waiting for you.' },
      ],
      lore: [
        'The Ink Rim is the last ring. The barrier opens at Level 12.',
        'The Quillspire monks have kept the art of Bookbinding since the Book was torn.',
        'They say the Ink Crown sits at the bottom of the Inkwell, a cave full of living ink. A Tide Pearl washes the ink walls away.',
      ],
      stock: [['cooked', 10], ['salve', 15], ['runeWard', 85], ['runeKeen', 85], ['moonOpal', 190]],
    },
    {
      id: 'quillspire', zone: 4, name: 'Quillspire', folk: 'the Quill monks', style: 'temple', buildings: ['pagoda', 'shrine', 'pagoda'],
      elder: 'Abbess Quilla', trader: 'Brother Nib', color: '#ff4d6d',
      greet: 'Quiet, please. The monks are writing. You must be the sticker from the last page.',
      quests: [
        { id: 'quill1', title: 'Ink for the Scribes', kind: 'bring', cost: { ink: 12, petal: 6 }, teach: null, xp: 420, shells: 120, gift: { runeLucky: 1, starShard: 1 },
          ask: 'Our pens are dry. Bring 12 ink and 6 petals and we will share our rarest gifts.',
          done: 'Thank you. Take these, a Lucky Rune and a Star Shard. The Inkwell is next.' },
        { id: 'quill2', title: 'The Ink Crown', kind: 'relic', key: 'inkCrown', teach: 'bookbinding', xp: 900, shells: 250,
          ask: 'The Inkwell lies under the mountain to the {dir}. Its walls are living ink: bring the Tide Pearl, a lantern and a pickaxe. Bring back the Ink Crown.',
          done: 'The Ink Crown. Now you may learn Bookbinding. Gather all six Lost Pages and bind the Great Sticker Book.' },
      ],
      lore: [
        'With six pages, the Ink Crown and Bookbinding, you can craft the Great Sticker Book and end the Ink for good.',
        'The pages are scattered one per ring, the last two out here on the Rim.',
        'Every cave you finished left a little more colour in the world.',
      ],
      stock: [['salve', 14], ['runeLucky', 90], ['featherCharm', 75], ['starShard', 330]],
    },
  ];

  // ---------------- caves ----------------
  SW.CAVES = [
    { id: 'mossmouth', zone: 0, name: 'Mossmouth Burrow', relic: 'sunstone', needs: ['axe'], order: [2, 3, 1], gem: 'amber', mod: 'runeSwift', enemies: { b: 'bat', g: 'grub' }, tint: '#4a6b3f' },
    { id: 'echomine', zone: 1, name: 'Echo Mine', relic: 'echoCrystal', needs: ['pick'], order: [4, 1, 3, 2], gem: 'ruby', mod: 'runeLucky', enemies: { b: 'bat', g: 'grub', p: 'pebblor' }, tint: '#5b5470' },
    { id: 'grotto', zone: 2, name: 'Sunken Grotto', relic: 'tidePearl', needs: ['axe', 'pick', 'lantern'], dark: true, order: [3, 4, 2, 1], gem: 'moonOpal', mod: 'tarPot', enemies: { b: 'bat', g: 'grub', o: 'gloop' }, tint: '#2f5a6b' },
    { id: 'frostfang', zone: 3, name: 'Frostfang Hollow', relic: 'frostHeart', needs: ['pick', 'sunstone'], icy: true, order: [2, 4, 1, 3], gem: 'moonOpal', mod: 'runeWard', enemies: { b: 'bat', p: 'pebblor' }, tint: '#4d6f8f' },
    { id: 'inkwell', zone: 4, name: 'The Inkwell', relic: 'inkCrown', needs: ['pick', 'lantern', 'tidePearl'], dark: true, order: [5, 2, 4, 1, 3], gem: 'starShard', mod: 'featherCharm', enemies: { b: 'bat', s: 'scribble', p: 'pebblor', o: 'gloop' }, tint: '#2b2340' },
  ];
  // which breakable wall needs what
  SW.CAVE_BREAK = { V: { needs: 'axe', name: 'Vines', how: 'Cut them with an axe.' }, R: { needs: 'pick', name: 'Rubble', how: 'Break it with a pickaxe.' }, I: { needs: 'sunstone', name: 'Ice', how: 'The Sunstone would melt it.' }, X: { needs: 'tidePearl', name: 'Living ink', how: 'The Tide Pearl would wash it away.' } };

  // ---------------- placement ----------------
  // Each zone gets its settlement and its cave mountain on dry, flat land,
  // at angles chosen from the seed so every island is laid out differently.
  SW.placeRealm = function (world) {
    const r = SW.rng((world.seed * 613 + 29) >>> 0);
    const sp = world.spawn;
    const flatLand = (x, y, rad) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (world.isWater(px, py) || world.levelAt(px, py) !== 1) return false;
      }
      return !world.isWater(x, y) && world.levelAt(x, y) === 1;
    };
    const findSpot = (z, d0, d1, a0, rad) => {
      for (let t = 0; t < 400; t++) {
        const a = a0 + (r() - 0.5) * (t < 200 ? 0.9 : TAU), d = d0 + r() * (d1 - d0);
        const x = sp.x + Math.cos(a) * d, y = sp.y + Math.sin(a) * d;
        if (Math.hypot(x, y) > SW.ISLAND_R * 0.92) continue;
        if (SW.zoneAt(world, x, y) !== z) continue;
        if (flatLand(x, y, rad)) return { x: Math.round(x), y: Math.round(y) };
      }
      const fb = world.landNear(sp.x + Math.cos(a0) * d0, sp.y + Math.sin(a0) * d0, 3000) || { x: sp.x + 400, y: sp.y };
      return { x: Math.round(fb.x), y: Math.round(fb.y) };
    };
    const tribes = [], caves = [];
    for (let z = 0; z < SW.ZONES.length; z++) {
      const [b0, b1] = SW.zoneBand(z);
      const a = r() * TAU;
      const t = SW.TRIBES[z], c = SW.CAVES[z];
      const tp = z === 0 ? findSpot(0, 1400, 2600, a, 260) : findSpot(z, b0 + 900, b0 + (b1 - b0) * 0.45, a, 300);
      const cp = z === 0 ? findSpot(0, 3200, 5600, a + Math.PI * (0.6 + r() * 0.8), 200) : findSpot(z, b0 + (b1 - b0) * 0.45, b1 - 700, a + Math.PI * (0.5 + r()), 220);
      tribes.push(Object.assign({}, t, tp));
      caves.push(Object.assign({}, c, cp));
    }
    return { tribes, caves };
  };

  // the direction word an elder uses ("to the northeast")
  SW.dirWord = function (dx, dy) {
    const names = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
    const a = Math.atan2(dy, dx);
    return names[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
  };
})();
