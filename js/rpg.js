// Stickerwild — RPG rules: items, gear, recipes, creatures, fish, quests, region names.
'use strict';
(function () {
  const { hash } = SW;

  SW.ITEMS = {
    berry: { name: 'Berries', icon: 'itemBerry', food: { hunger: 14, hp: 0 } },
    mushroom: { name: 'Mushroom', icon: 'mushroom', food: { hunger: 8, hp: 3 } },
    cooked: { name: 'Grilled Meat', icon: 'itemCooked', food: { hunger: 40, hp: 10 } },
    grilledFish: { name: 'Grilled Fish', icon: 'itemGrilledFish', food: { hunger: 32, hp: 12 } },
    koi: { name: 'Crystal Koi', icon: 'itemKoi', food: { hunger: 45, hp: 30 } },
    meat: { name: 'Raw Meat', icon: 'itemMeat', food: { hunger: 16, hp: -6 } },
    fish: { name: 'Raw Fish', icon: 'itemFish', food: { hunger: 12, hp: -3 } },
    salve: { name: 'Petal Salve', icon: 'itemSalve', food: { hunger: 0, hp: 40 } },
    campfire: { name: 'Campfire', icon: 'campfire', place: true },
    wall: { name: 'Stake Wall', icon: 'wall', place: true },
    wood: { name: 'Wood', icon: 'itemWood' },
    stone: { name: 'Stone', icon: 'itemStone' },
    fiber: { name: 'Fiber', icon: 'itemFiber' },
    petal: { name: 'Petals', icon: 'itemPetal' },
    gem: { name: 'Crystal', icon: 'itemGem' },
    ink: { name: 'Ink', icon: 'itemInk' },
  };
  SW.ITEM_ORDER = ['berry', 'mushroom', 'cooked', 'grilledFish', 'koi', 'meat', 'fish', 'salve', 'campfire', 'wall', 'wood', 'stone', 'fiber', 'petal', 'gem', 'ink'];

  // One-off things you own once. Weapons and armour: the best one owned is used.
  SW.TOOLS = {
    axe: { name: 'Stone Axe', icon: 'toolAxe', kind: 'tool' },
    pick: { name: 'Pickaxe', icon: 'toolPick', kind: 'tool' },
    rod: { name: 'Fishing Rod', icon: 'toolRod', kind: 'tool' },
    lantern: { name: 'Lantern', icon: 'itemLantern', kind: 'tool' },
    sword: { name: 'Stone Sword', icon: 'toolSword', kind: 'weapon', dmg: 3 },
    gemSword: { name: 'Crystal Blade', icon: 'toolGemSword', kind: 'weapon', dmg: 6 },
    inkBlade: { name: 'Ink Edge', icon: 'toolInkBlade', kind: 'weapon', dmg: 10 },
    barkVest: { name: 'Bark Vest', icon: 'armorBark', kind: 'armor', def: 0.15 },
    stoneMail: { name: 'Stone Mail', icon: 'armorStone', kind: 'armor', def: 0.3 },
    crystalPlate: { name: 'Crystal Plate', icon: 'armorCrystal', kind: 'armor', def: 0.45 },
  };

  SW.RECIPES = [
    { id: 'campfire', cat: 'camp', gives: 'campfire', cost: { wood: 4, stone: 2 }, desc: 'Scribbles avoid its light. Burns about one night; hit it while holding wood to refuel.' },
    { id: 'wall', cat: 'camp', gives: 'wall', cost: { wood: 3 }, desc: 'Blocks creatures. Ring your fire with a few.' },
    { id: 'axe', cat: 'tools', tool: 'axe', cost: { wood: 3, stone: 2 }, desc: 'Chops trees twice as fast.' },
    { id: 'pick', cat: 'tools', tool: 'pick', cost: { wood: 3, stone: 3 }, desc: 'Breaks rock faster and mines crystals.' },
    { id: 'rod', cat: 'tools', tool: 'rod', cost: { wood: 3, fiber: 3 }, desc: 'Click water to fish. Reel in when the "!" pops up.' },
    { id: 'lantern', cat: 'tools', tool: 'lantern', cost: { wood: 2, stone: 1, gem: 1 }, desc: 'Wider light at night. Scribbles slow down inside it.' },
    { id: 'sword', cat: 'gear', tool: 'sword', cost: { wood: 2, stone: 4 }, desc: 'Weapon. Hits for 3.' },
    { id: 'gemSword', cat: 'gear', tool: 'gemSword', requires: 'sword', cost: { wood: 2, gem: 3 }, desc: 'Weapon. Hits for 6.' },
    { id: 'inkBlade', cat: 'gear', tool: 'inkBlade', requires: 'gemSword', cost: { wood: 2, gem: 2, ink: 6 }, desc: 'Weapon. Hits for 10. Made from Scribble ink.' },
    { id: 'barkVest', cat: 'gear', tool: 'barkVest', cost: { wood: 6, fiber: 4 }, desc: 'Armor. Blocks 15% of damage.' },
    { id: 'stoneMail', cat: 'gear', tool: 'stoneMail', requires: 'barkVest', cost: { stone: 8, fiber: 4 }, desc: 'Armor. Blocks 30% of damage.' },
    { id: 'crystalPlate', cat: 'gear', tool: 'crystalPlate', requires: 'stoneMail', cost: { gem: 5, fiber: 6 }, desc: 'Armor. Blocks 45% of damage.' },
    { id: 'cooked', cat: 'food', gives: 'cooked', fire: true, cost: { meat: 1 }, desc: '+40 food, +10 health. Craft next to a lit campfire.' },
    { id: 'grilledFish', cat: 'food', gives: 'grilledFish', fire: true, cost: { fish: 1 }, desc: '+32 food, +12 health. Craft next to a lit campfire.' },
    { id: 'salve', cat: 'food', gives: 'salve', cost: { petal: 3, berry: 1 }, desc: 'Restores 40 health.' },
  ];
  SW.RECIPE_CATS = [['all', 'All'], ['tools', 'Tools'], ['gear', 'Gear'], ['camp', 'Camp'], ['food', 'Food']];

  // ---- creatures ----
  // hp/dmg grow with level; level comes from the region's danger.
  SW.ENEMIES = {
    scribble: { name: 'Scribble', hp: 4, dmg: 8, spd: 90, r: 15, xp: 6, aggro: 700, night: true, drops: [['ink', 1, 0.7], ['ink', 1, 0.3]] },
    thornback: { name: 'Thornback', hp: 6, dmg: 7, spd: 92, r: 14, xp: 8, aggro: 170, charge: true, drops: [['meat', 1, 0.7], ['fiber', 2, 0.5]] },
    snapjaw: { name: 'Snapjaw', hp: 5, dmg: 9, spd: 84, r: 13, xp: 7, aggro: 150, drops: [['meat', 1, 0.6], ['stone', 1, 0.4]] },
    gloop: { name: 'Gloop', hp: 7, dmg: 6, spd: 66, r: 14, xp: 9, aggro: 200, split: true, drops: [['fiber', 1, 0.5], ['berry', 2, 0.4]] },
    pebblor: { name: 'Pebblor', hp: 15, dmg: 14, spd: 52, r: 19, xp: 16, aggro: 180, drops: [['stone', 3, 1], ['gem', 1, 0.35]] },
    puff: { name: 'Puff', hp: 2, dmg: 0, spd: 70, r: 12, xp: 2, passive: true, drops: [['meat', 1, 1], ['meat', 1, 0.5]] },
  };
  const B = SW.BIOME;
  SW.biomeEnemies = (b) => {
    switch (b) {
      case B.SAND: return ['snapjaw'];
      case B.MEADOW: return ['thornback', 'puff', 'puff'];
      case B.GRASS: return ['thornback', 'puff'];
      case B.FOREST: return ['thornback', 'gloop', 'puff'];
      case B.SWAMP: return ['gloop', 'gloop', 'snapjaw'];
      case B.HIGH: return ['pebblor', 'thornback'];
      case B.PEAK: return ['pebblor'];
      default: return [];
    }
  };
  SW.makeEnemy = (type, x, y, lvl, elite) => {
    const d = SW.ENEMIES[type];
    const L = Math.max(1, lvl + (elite ? 2 : 0));
    const hp = Math.round(d.hp * (1 + 0.45 * (L - 1)) * (elite ? 2.5 : 1));
    return {
      type, x, y, lvl: L, elite: !!elite, hp, maxHp: hp,
      dmg: Math.round(d.dmg * (1 + 0.3 * (L - 1))), spd: d.spd * (1 + Math.min(0.5, L * 0.03)),
      r: d.r * (elite ? 1.25 : 1), scale: elite ? 1.25 : 1,
      vx: 0, vy: 0, kx: 0, ky: 0, t: Math.random() * 10, hurtT: 0, atkCd: 0.5, dying: 0, lvlOff: 0, face: 1,
      homeX: x, homeY: y, state: 'idle', stateT: 0, wander: Math.random() * Math.PI * 2, wanderT: 0, hop: 0, idle: false,
    };
  };
  SW.xpForKill = (m) => Math.round(SW.ENEMIES[m.type].xp * m.lvl * (m.elite ? 3 : 1));

  // ---- fishing ----
  SW.FISH = [
    { id: 'minnow', name: 'Minnow', w: 40, min: 6, max: 12, xp: 4, item: 'fish' },
    { id: 'sunfish', name: 'Sunfish', w: 30, min: 14, max: 28, xp: 7, item: 'fish' },
    { id: 'perch', name: 'Stripe Perch', w: 18, min: 18, max: 35, xp: 9, item: 'fish' },
    { id: 'trout', name: 'Rainbow Trout', w: 0, deep: 14, min: 30, max: 62, xp: 13, item: 'fish' },
    { id: 'koi', name: 'Crystal Koi', w: 1, danger: 1.2, min: 40, max: 95, xp: 30, item: 'koi' },
    { id: 'boot', name: 'Soggy Boot', w: 6, min: 25, max: 30, xp: 1, item: 'fiber', junk: true },
  ];
  SW.rollFish = (rand, deep, danger) => {
    const pool = SW.FISH.map((f) => [f, f.w + (deep ? f.deep || 0 : 0) + (f.danger ? f.danger * danger : 0)]).filter((p) => p[1] > 0);
    let t = rand() * pool.reduce((s, p) => s + p[1], 0);
    for (const [f, w] of pool) { if ((t -= w) <= 0) return f; }
    return pool[0][0];
  };

  // ---- levels ----
  SW.xpToNext = (lvl) => Math.round(20 * Math.pow(lvl, 1.55));

  // ---- regions ----
  const ADJ = ['Thistle', 'Bramble', 'Sunny', 'Mossy', 'Pickle', 'Gloom', 'Honey', 'Whisper', 'Copper', 'Tangle', 'Bumble', 'Frost', 'Cinder', 'Velvet', 'Rattle', 'Pepper', 'Hollow', 'Saffron', 'Marble', 'Fable', 'Juniper', 'Crumble', 'Puddle', 'Tinker', 'Clover', 'Sorrel', 'Nettle', 'Mallow'];
  const NOUN = {
    [B.SAND]: ['Shore', 'Strand', 'Dunes', 'Cove'], [B.MEADOW]: ['Meadow', 'Fields', 'Lea'], [B.GRASS]: ['Downs', 'Glade', 'Plains', 'Green'],
    [B.FOREST]: ['Woods', 'Thicket', 'Grove', 'Wilds'], [B.HIGH]: ['Crags', 'Heights', 'Ridge', 'Tors'], [B.PEAK]: ['Peaks', 'Spires', 'Summit'],
    [B.SWAMP]: ['Marsh', 'Bog', 'Mire', 'Fen'], water: ['Lake', 'Bay', 'Sound', 'Deep'],
  };
  SW.REGION = 2200;
  SW.regionName = (world, rx, ry) => {
    const cx = (rx + 0.5) * SW.REGION, cy = (ry + 0.5) * SW.REGION;
    const b = world.biomeAt(cx, cy);
    const nouns = NOUN[b] || NOUN.water;
    const h1 = hash(rx, ry, world.seed + 501), h2 = hash(rx, ry, world.seed + 502);
    return ADJ[Math.floor(h1 * ADJ.length)] + ' ' + nouns[Math.floor(h2 * nouns.length)];
  };

  // ---- quests ----
  // Generated from the seed and a running counter, so every island has its own quest line.
  const GATHER = [['wood', 'Chop wood', 10, 26], ['stone', 'Collect stone', 8, 20], ['fiber', 'Cut grass for fiber', 6, 16], ['berry', 'Pick berries', 6, 14], ['petal', 'Gather petals', 4, 10]];
  SW.makeQuest = (world, n, ctx) => {
    const r = SW.rng((world.seed * 977 + n * 131) >>> 0);
    const lvl = ctx.level;
    const kinds = ['gather', 'gather', 'hunt', 'hunt', 'explore'];
    if (ctx.hasRod) kinds.push('fish', 'fish');
    if (lvl >= 3) kinds.push('gem');
    if (n === 0) kinds.length = 0, kinds.push('gather');
    if (n === 1) kinds.length = 0, kinds.push('hunt');
    const kind = kinds[Math.floor(r() * kinds.length)];
    const q = { id: n, kind, have: 0, done: false };
    const xpBase = Math.round(24 * (1 + 0.6 * (lvl - 1)));
    if (kind === 'gather') {
      const g = n === 0 ? GATHER[0] : GATHER[Math.floor(r() * GATHER.length)];
      q.key = g[0]; q.need = Math.round(g[2] + r() * (g[3] - g[2]) * Math.min(1, 0.4 + lvl * 0.15));
      q.title = `${g[1]}`; q.xp = xpBase;
    } else if (kind === 'gem') {
      q.kind = 'gather'; q.key = 'gem'; q.need = 3 + Math.floor(r() * 4); q.title = 'Mine crystals'; q.xp = Math.round(xpBase * 1.6);
    } else if (kind === 'hunt') {
      const pool = ['thornback', 'thornback', 'snapjaw', 'gloop'];
      if (lvl >= 3) pool.push('pebblor');
      if (lvl >= 2) pool.push('scribble');
      q.key = n === 1 ? 'thornback' : pool[Math.floor(r() * pool.length)];
      q.need = q.key === 'pebblor' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4);
      q.title = `Defeat ${SW.ENEMIES[q.key].name}s`; q.xp = Math.round(xpBase * 1.5);
    } else if (kind === 'fish') {
      q.key = 'fish'; q.need = 2 + Math.floor(r() * 4); q.title = 'Catch fish'; q.xp = Math.round(xpBase * 1.3);
    } else {
      // explore: a land region a few regions away from the player
      const R = SW.REGION;
      let best = null;
      for (let t = 0; t < 24 && !best; t++) {
        const a = r() * Math.PI * 2, d = R * (1.6 + r() * 2.2);
        const x = ctx.x + Math.cos(a) * d, y = ctx.y + Math.sin(a) * d;
        const rx = Math.floor(x / R), ry = Math.floor(y / R);
        const cx = (rx + 0.5) * R, cy = (ry + 0.5) * R;
        if (!world.isWater(cx, cy) && Math.hypot(cx, cy) < SW.ISLAND_R * 0.95) best = { rx, ry, x: cx, y: cy };
      }
      if (!best) return SW.makeQuest(world, n + 1000, ctx);
      q.key = best.rx + ',' + best.ry; q.tx = best.x; q.ty = best.y; q.need = 1;
      q.title = 'Visit ' + SW.regionName(world, best.rx, best.ry); q.xp = Math.round(xpBase * 1.8);
    }
    const loot = ['wood', 'stone', 'fiber', 'berry', 'petal'];
    q.reward = { [loot[Math.floor(r() * loot.length)]]: 3 + Math.floor(r() * 4) };
    if (lvl >= 3 && r() < 0.4) q.reward.gem = 1 + Math.floor(r() * 2);
    return q;
  };

  // Treasure-chest loot scales with the region's danger.
  SW.chestLoot = (rand, danger) => {
    const loot = {};
    const add = (k, n) => { if (n > 0) loot[k] = (loot[k] || 0) + n; };
    add('wood', 2 + Math.floor(rand() * 4));
    add('stone', 1 + Math.floor(rand() * 4));
    add('fiber', Math.floor(rand() * 4));
    if (rand() < 0.5) add('berry', 2 + Math.floor(rand() * 3));
    if (danger >= 2 && rand() < 0.4 + danger * 0.05) add('gem', 1 + Math.floor(rand() * Math.min(4, danger / 2)));
    if (danger >= 3 && rand() < 0.35) add('ink', 1 + Math.floor(rand() * 3));
    if (rand() < 0.25) add('salve', 1);
    return loot;
  };
})();
