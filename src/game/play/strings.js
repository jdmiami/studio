// The string table: every line the player reads, keyed by id, so dialogue and quests can be
// localized later by adding a table per locale. t(id, vars) interpolates {name} placeholders.
const EN = {
  // Mira
  'mira.hello.first': 'Oh! Hello! You must be the one who came down the long tunnel. I\'m Mira. Welcome to the Nest!',
  'mira.hello.again': 'Hi again, {player}! The Nest feels cosier with you around.',
  'mira.welcome.ask': 'Everything down here is made of felt and fluff. Would you help me with something?',
  'mira.choice.sure': 'Of course! What do you need?',
  'mira.choice.what': 'What is this place?',
  'mira.choice.joke': 'Only if it involves snacks.',
  'mira.place': 'This is the Nest, a cave stitched together by the first felters. Behind the great door are the Wander Lands. Nobody has opened it in ages.',
  'mira.joke': 'Ha! The mushrooms are buttons, not biscuits. But I like you already.',
  'mira.welcome.task': 'Before anything else: find a Fluff Stone and a Button Mushroom here in the Nest, and say hello to a puffling. Then come back and tell me!',
  'mira.welcome.progress': 'Still looking? Fluff Stones sit on the terraces, mushrooms grow by the walls, and pufflings roll about near the floor.',
  'mira.welcome.done': 'You found them all! Then you are ready. The great door has a felt lock: three dials. My grandmother left a note...',
  'mira.note': '"The door opens for the friends who watch over it: the one who wags, the one who is knitted, and the one who hums." Look around the door!',
  'mira.lock.progress': 'The friends who watch the door... the one who wags, the knitted one, and the one who hums. Their colours are the key!',
  'mira.lock.done': 'You opened it!! The Wander Lands! Step through the gate and see where it takes you. Bring back anything fluffy you find!',
  'mira.trip.progress': 'The gate behind the door takes you somewhere new every time. Collect five finds, then come back through it!',
  'mira.trip.done': 'Look at all that! Here, take this basket. You can decorate the Nest with your finds now. Press {decorate} to place things.',
  'mira.nest.progress': 'Place a few of your finds around the Nest. It will feel like home!',
  'mira.nest.done': 'It looks wonderful. The Nest has never been this cosy.',
  'mira.curator.offer': 'Do you know how many kinds of finds there are? I want to fill the collection book. Could you find twelve different kinds?',
  'mira.curator.progress': 'The collection book has {count} kinds so far. Twelve would make me so happy!',
  'mira.curator.done': 'Twelve kinds! You are a true Curator of the Nest. This crown has been waiting for you.',
  'mira.wish.ask': 'I have a little wish... could you bring me a {item} from the Wander Lands?',
  'mira.wish.progress': 'Still hoping for a {item}. No rush!',
  'mira.wish.done': 'A {item}! Thank you so much. Please take this in return.',
  'mira.idle': 'The ceiling light is lovely today. Do you hear the brook?',
  'mira.idle.2': 'Biscuit loves it when you throw his felt ball.',
  'mira.idle.3': 'Every trip through the gate is different. Some have chiming mushrooms!',
  'mira.choice.bye': 'See you later!',
  'mira.choice.ok': 'I\'m on it!',
  // Biscuit the dog
  'dog.pet.1': 'Biscuit wags his whole body!',
  'dog.pet.2': 'Biscuit leans into your hand. Boof.',
  'dog.pet.3': 'Biscuit rolls over for belly rubs.',
  'dog.ball': 'Biscuit drops a felt ball at your feet. Press {throw} to throw it!',
  'dog.badge': 'Biscuit brought it back twice! You earned the Best Friend Badge.',
  // Door and lock
  'door.sealed': 'The great door is sealed with a felt lock: three dials of coloured wool.',
  'door.study': 'Three dials, each with four colours: cream, sage, lilac, peach. Maybe Mira knows something.',
  'door.open': 'The felt lock clicks. The great door swings open!',
  'door.wrong': 'The dials thump softly. Not quite right.',
  'door.hint': 'Who watches the door? The one who wags, the knitted one, the one who hums.',
  // Gate and trips
  'gate.enter': 'Step into the Wander Gate?',
  'gate.leave': 'Return to the Nest?',
  'trip.arrive': 'You arrive at {name}. Seed {code}.',
  'trip.chime.found': 'A ring of chiming mushrooms! Watch which ones glow, then touch them in order.',
  'trip.chime.solved': 'The mushrooms chime together! Something sparkly appears.',
  'trip.chime.wrong': 'The mushrooms sigh. Watch again.',
  // Finds and decorating
  'find.new': 'New find: {name}!',
  'find.again': '{name} (x{count})',
  'sighting.new': 'You met a {name}!',
  'decor.on': 'Decorating: {item}',
  'decor.none': 'Nothing to place yet. Collect finds on your trips!',
  'decor.placed': 'Placed {item}.',
  'decor.picked': 'Picked up {item}.',
  'decor.blocked': 'It will not fit there.',
  // Quests
  'quest.new': 'New quest: {title}',
  'quest.done': 'Quest complete: {title}',
  'save.done': 'Saved',
};

let table = EN;

/** Sets the active string table (for localization). */
export function setLocale(strings) { table = { ...EN, ...strings }; }

/** The string for an id with {placeholders} filled; the id itself when missing. */
export function t(id, vars = {}) {
  const s = table[id] ?? id;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export const STRING_IDS = Object.keys(EN);
