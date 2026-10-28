// The quests, as data. A step completes when its event arrives `count` times (with `match`
// filtering the payload), when `check(state)` turns true, or when the game completes it directly
// (dialogue: `by: 'dialogue'`). `reward(api)` runs once on completion; `next` starts a follow-up.
// Step text may be a function of the state (live counts in the journal).
import { EVENTS } from '../core/contracts.js';
import { ITEM_BY_ID, ITEMS } from './items.js';

const kinds = (state) => Object.keys(state.collection).length;
const tripFinds = (state) => state.flags.tripFinds ?? 0;
const decorCount = (state) => state.decor.length;

export const QUESTS = [
  {
    id: 'welcome', title: 'Welcome to the Nest', giver: 'mira',
    description: 'Mira asked you to explore the Nest and meet its residents.',
    steps: [
      { id: 'talk', text: 'Say hello to Mira on the upper terrace', by: 'dialogue' },
      { id: 'stone', text: 'Find a Fluff Stone', on: { event: EVENTS.FIND_COLLECTED, match: (p) => p.itemId === 'fluff-stone' },
        check: (s) => !!s.collection['fluff-stone'] },
      { id: 'mushroom', text: 'Pick a Button Mushroom', on: { event: EVENTS.FIND_COLLECTED, match: (p) => p.itemId === 'button-mushroom' },
        check: (s) => !!s.collection['button-mushroom'] },
      { id: 'critter', text: 'Meet a Cream Puffling (stand still near one)', on: { event: EVENTS.CRITTER_SIGHTED, match: (p) => p.itemId === 'critter-cream' },
        check: (s) => !!s.collection['critter-cream'] },
      { id: 'report', text: 'Tell Mira what you found', by: 'dialogue' },
    ],
    reward: (api) => { api.flag('lockNotes', true); api.friendship('mira', 1); },
    next: 'felt-lock',
  },
  {
    id: 'felt-lock', title: 'The Felt Lock', giver: 'mira',
    description: 'The great door is sealed with three dials of coloured wool. Mira\'s grandmother left a riddle.',
    steps: [
      { id: 'study', text: 'Study the great door', on: { event: EVENTS.INTERACTED, match: (p) => p.id === 'door' } },
      { id: 'solve', text: 'Set the three dials (the one who wags, the knitted one, the one who hums)',
        on: { event: EVENTS.PUZZLE_SOLVED, match: (p) => p.puzzleId === 'great-door' } },
    ],
    reward: (api) => { api.flag('doorOpen', true); api.friendship('mira', 1); },
    next: 'first-trip',
  },
  {
    id: 'first-trip', title: 'Into the Wander Lands', giver: 'mira',
    description: 'Behind the great door, the Wander Gate leads somewhere new every time.',
    steps: [
      { id: 'enter', text: 'Step through the Wander Gate', on: { event: EVENTS.AREA_ENTERED, match: (p) => p.area === 'trip' } },
      { id: 'collect', text: (s) => `Collect finds on the trip (${Math.min(5, tripFinds(s))}/5)`, check: (s) => tripFinds(s) >= 5 },
      { id: 'home', text: 'Come home through the gate', on: { event: EVENTS.AREA_ENTERED, match: (p) => p.area === 'hub' } },
      { id: 'report', text: 'Show Mira your finds', by: 'dialogue' },
    ],
    reward: (api) => { api.flag('basket', true); api.friendship('mira', 1); },
    next: 'nest-maker',
  },
  {
    id: 'nest-maker', title: 'Make the Nest Yours', giver: 'mira',
    description: 'Mira gave you a basket. Place your finds around the Nest.',
    steps: [
      { id: 'place', text: (s) => `Place finds in the Nest (${Math.min(3, decorCount(s))}/3)`, check: (s) => decorCount(s) >= 3 },
    ],
    reward: (api) => { api.friendship('mira', 1); api.flag('curatorOffered', true); },
    next: 'curator',
  },
  {
    id: 'curator', title: 'Curator of the Nest', giver: 'mira',
    description: 'Mira dreams of a full collection book.',
    steps: [
      { id: 'kinds', text: (s) => `Catalogue different kinds of finds (${Math.min(12, kinds(s))}/12)`, check: (s) => kinds(s) >= 12 },
      { id: 'report', text: 'Tell Mira', by: 'dialogue' },
    ],
    reward: (api) => { api.give('felt-crown'); api.friendship('mira', 2); },
  },
  {
    id: 'biscuit', title: 'Biscuit\'s Best Friend', giver: 'dog',
    description: 'The Nest\'s fluffy dog wants to play.',
    steps: [
      { id: 'pet', text: (s) => `Pet Biscuit (${Math.min(3, s.flags.pets ?? 0)}/3)`, check: (s) => (s.flags.pets ?? 0) >= 3 },
      { id: 'fetch', text: (s) => `Play fetch with Biscuit (${Math.min(2, s.flags.fetches ?? 0)}/2)`, check: (s) => (s.flags.fetches ?? 0) >= 2 },
    ],
    reward: (api) => { api.give('dog-badge'); api.friendship('dog', 3); },
  },
  {
    id: 'wish', title: 'Mira\'s Wish', giver: 'mira', repeatable: true,
    description: 'Mira hopes for something from the Wander Lands.',
    steps: [
      { id: 'bring', text: (s) => `Bring Mira a ${ITEM_BY_ID[s.quests.wish?.vars?.itemId]?.name ?? 'find'}`, by: 'dialogue' },
    ],
    reward: (api) => { api.friendship('mira', 1); api.giveRandom('uncommon'); },
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** A wish item for the n-th wish: an uncommon or rare trip find (deterministic). */
export function wishItemFor(n) {
  const pool = ITEMS.filter((i) => !i.story && !i.sighting && ['uncommon', 'rare'].includes(i.rarity));
  return pool[(n * 7 + 3) % pool.length].id;
}
