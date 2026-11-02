import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvents } from '../src/game/core/events.js';
import { EVENTS, newGameState } from '../src/game/core/contracts.js';
import { createRng } from '../src/game/core/rng.js';
import { QUESTS, wishItemFor } from '../src/game/data/quests.js';
import { ITEMS } from '../src/game/data/items.js';
import { GATE, MIRA } from '../src/game/data/dialogues.js';
import { createQuestEngine } from '../src/game/play/quests.js';
import { createDialogueRunner, lintGraph } from '../src/game/play/dialogue.js';
import { collect, placeable, progress, take } from '../src/game/play/collection.js';
import { createChimeRing, createFeltLock, LOCK_ANSWER, LOCK_COLORS } from '../src/game/play/puzzles.js';
import { canPlace, nearestDecor } from '../src/game/play/decor.js';
import { STRING_IDS, t } from '../src/game/play/strings.js';

/** A minimal game: state, events, quest engine, reward api and a dialogue context. */
function makeGame() {
  const events = createEvents();
  const state = newGameState();
  const log = [];
  for (const k of Object.values(EVENTS)) events.on(k, (p) => log.push([k, p]));
  const rewards = {
    flag: (k, v) => { state.flags[k] = v; },
    friendship: (who, n) => { state.friendship[who] = (state.friendship[who] ?? 0) + n; },
    give: (id) => collect(state, id),
    giveRandom: () => collect(state, 'lilac-puff'),
  };
  const quests = createQuestEngine({ state: () => state, events, catalogue: QUESTS, rewards });
  const api = {
    ...rewards,
    has: (id) => (state.inventory[id] ?? 0) > 0,
    take: (id) => take(state, id),
    startQuest: (id, vars) => quests.start(id, vars),
    completeStep: (id, step) => quests.completeStep(id, step),
    wishItem: (n) => wishItemFor(n),
  };
  const ctx = { state, quests, api, vars: () => ({ player: 'friend', decorate: 'B', throw: 'F' }) };
  const find = (itemId) => { const r = collect(state, itemId); events.emit(EVENTS.FIND_COLLECTED, { itemId, first: r.first }); };
  const talk = (graph = MIRA, picks = []) => {
    const run = createDialogueRunner(graph, ctx, { rng: () => 0 });
    const lines = [];
    let step = run.start();
    let i = 0;
    while (step) { lines.push(step.text); step = run.choose(step.choices.length ? (picks[i++] ?? 0) : 0); }
    return lines;
  };
  return { events, state, quests, ctx, find, talk, log };
}

test('every string id resolves and every dialogue graph lints clean', () => {
  for (const id of STRING_IDS) assert.notEqual(t(id), '', id);
  assert.deepEqual(lintGraph(MIRA), []);
  assert.deepEqual(lintGraph(GATE(false)), []);
});

test('the whole story plays through: welcome -> lock -> trip -> nest -> curator, and wishes', () => {
  const g = makeGame();
  const lines = g.talk(MIRA, [1, 0]); // "what is this place?" then "sure"
  assert.ok(lines[0].startsWith('Oh! Hello!'));
  assert.ok(lines.some((l) => l.includes('Nest, a cave')));
  assert.equal(g.quests.status('welcome'), 'active');
  assert.equal(g.quests.stepId('welcome'), 'stone');
  assert.ok(g.talk()[0].startsWith('Still looking'));
  g.find('fluff-stone');
  g.find('button-mushroom');
  assert.equal(g.quests.stepId('welcome'), 'critter');
  collect(g.state, 'critter-cream');
  g.events.emit(EVENTS.CRITTER_SIGHTED, { itemId: 'critter-cream' });
  assert.equal(g.quests.stepId('welcome'), 'report');
  g.talk();
  assert.equal(g.quests.status('welcome'), 'done');
  assert.equal(g.state.flags.lockNotes, true);
  assert.equal(g.quests.status('felt-lock'), 'active');
  g.events.emit(EVENTS.INTERACTED, { id: 'door' });
  g.events.emit(EVENTS.PUZZLE_SOLVED, { puzzleId: 'great-door' });
  assert.equal(g.state.flags.doorOpen, true);
  assert.equal(g.quests.stepId('first-trip'), 'enter');
  g.events.emit(EVENTS.AREA_ENTERED, { area: 'trip' });
  for (let i = 0; i < 5; i++) { g.state.flags.tripFinds = i + 1; g.find('moss-tuft'); }
  assert.equal(g.quests.stepId('first-trip'), 'home');
  g.events.emit(EVENTS.AREA_ENTERED, { area: 'hub' });
  g.state.trips.taken = 1;
  g.talk();
  assert.equal(g.state.flags.basket, true);
  assert.equal(g.quests.status('nest-maker'), 'active');
  for (let i = 0; i < 3; i++) { g.state.decor.push({ id: `d${i}`, itemId: 'moss-tuft', position: [i, 0, 0], yaw: 0 }); g.events.emit(EVENTS.DECOR_PLACED, {}); }
  assert.equal(g.quests.status('nest-maker'), 'done');
  assert.equal(g.quests.status('curator'), 'active');
  // A wish: asked after a trip, granted when the item is carried.
  const askLines = g.talk();
  assert.ok(askLines[0].includes('Still') || askLines[0].includes('collection book'), askLines[0]);
  for (const it of ITEMS.filter((i) => !i.story).slice(0, 12)) collect(g.state, it.id);
  g.events.emit(EVENTS.FIND_COLLECTED, { itemId: 'x' });
  assert.equal(g.quests.stepId('curator'), 'report');
  g.talk();
  assert.equal(g.quests.status('curator'), 'done');
  assert.ok(g.state.collection['felt-crown']);
  const wishLines = g.talk();
  assert.ok(wishLines[0].includes('little wish'), wishLines[0]);
  const want = g.state.quests.wish.vars.itemId;
  delete g.state.inventory[want]; // not carried yet
  assert.ok(g.talk()[0].includes('Still hoping'));
  collect(g.state, want);
  g.talk();
  assert.equal(g.quests.status('wish'), 'done');
  // Saves are requested on every quest change.
  assert.ok(g.log.filter(([k]) => k === EVENTS.SAVE_REQUESTED).length > 10);
});

test('biscuit quest: pets then fetches, badge reward', () => {
  const g = makeGame();
  g.quests.start('biscuit');
  for (let i = 0; i < 3; i++) { g.state.flags.pets = i + 1; g.events.emit(EVENTS.PETTED, { creature: 'dog' }); }
  assert.equal(g.quests.stepId('biscuit'), 'fetch');
  for (let i = 0; i < 2; i++) { g.state.flags.fetches = i + 1; g.events.emit(EVENTS.DOG_FETCHED, {}); }
  assert.equal(g.quests.status('biscuit'), 'done');
  assert.ok(g.state.collection['dog-badge']);
  assert.equal(g.quests.start('biscuit'), false); // not repeatable
});

test('journal and tracker views', () => {
  const g = makeGame();
  g.talk(MIRA, [0]);
  const tr = g.quests.tracked();
  assert.equal(tr.id, 'welcome');
  assert.equal(tr.step, 'Find a Fluff Stone');
  const j = g.quests.journal();
  assert.equal(j[0].steps[0].done, true);
  assert.equal(j[0].steps[1].done, false);
});

test('felt lock: the riddle answer opens, three wrong tries give the hint', () => {
  const lock = createFeltLock();
  assert.equal(lock.attempt(), 'wrong');
  assert.equal(lock.attempt(), 'wrong');
  assert.equal(lock.attempt(), 'hint');
  for (let d = 0; d < 3; d++) {
    lock.state.selected = d;
    while (lock.colors()[d] !== LOCK_ANSWER[d]) lock.turn(1);
  }
  assert.equal(lock.attempt(), 'open');
  assert.equal(LOCK_COLORS.length, 4);
});

test('chime ring: grows each round, wrong replays, solves at full length', () => {
  const ring = createChimeRing({ rng: createRng(5), count: 4, start: 3, length: 5 });
  const play = () => { ring.shown(); let r; for (const i of ring.sequence()) r = ring.touch(i); return r; };
  assert.equal(play(), 'round');
  ring.shown();
  const wrongPick = (ring.sequence()[0] + 1) % 4;
  assert.equal(ring.touch(wrongPick), 'wrong');
  assert.equal(play(), 'round');
  assert.equal(play(), 'solved');
  const seq = ring.sequence();
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
});

test('collection, inventory and progress', () => {
  const s = newGameState();
  assert.equal(collect(s, 'lilac-puff').first, true);
  assert.equal(collect(s, 'lilac-puff').first, false);
  collect(s, 'critter-mint');
  assert.equal(s.inventory['critter-mint'], undefined); // sightings are not carried
  assert.deepEqual(placeable(s).map((p) => [p.item.id, p.count]), [['lilac-puff', 2]]);
  assert.equal(take(s, 'lilac-puff'), true);
  assert.equal(take(s, 'lilac-puff'), true);
  assert.equal(take(s, 'lilac-puff'), false);
  assert.equal(progress(s, ITEMS).found, 2);
});

test('decor placement rules', () => {
  const ctx = {
    heightAt: (x, z) => (x === 9 ? null : 2), kindAt: (x) => (x === 5 ? 'water' : 'wall'),
    decor: [{ position: [0, 2, 0] }], protect: [{ x: 3, z: 3, r: 1 }], player: { x: 0, y: 2, z: 0 }, reach: 6,
  };
  assert.equal(canPlace({ x: 2, y: 2, z: 0 }, ctx).ok, true);
  assert.equal(canPlace({ x: 0.4, y: 2, z: 0 }, ctx).reason, 'crowded');
  assert.equal(canPlace({ x: 5, y: 2, z: 0 }, ctx).reason, 'water');
  assert.equal(canPlace({ x: 9, y: 2, z: 0 }, ctx).reason, 'outside');
  assert.equal(canPlace({ x: 3, y: 2, z: 3 }, ctx).reason, 'protected');
  assert.equal(canPlace({ x: 2, y: 1, z: 0 }, ctx).reason, 'not-on-top');
  assert.equal(nearestDecor(ctx.decor, { x: 0.2, y: 2, z: 0 }).position[0], 0);
});
