import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvents } from '../src/game/core/events.js';
import { EVENTS, newGameState } from '../src/game/core/contracts.js';
import { createSession } from '../src/game/play/session.js';
import { LOCK_ANSWER, LOCK_COLORS } from '../src/game/play/puzzles.js';

function play(session, graph, picks = []) {
  const run = session.dialogue(graph);
  let step = run.start();
  let i = 0;
  const lines = [];
  while (step) { lines.push(step.text); step = run.choose(step.choices.length ? (picks[i++] ?? 0) : 0); }
  return lines;
}

test('a session plays the story through its own api, the way the game drives it', () => {
  const events = createEvents();
  const state = newGameState({ now: 1 });
  const s = createSession({ state, events, labels: () => ({ decorate: 'B', throw: 'F' }), now: () => 1000 });
  const log = [];
  events.on(EVENTS.FIND_COLLECTED, (p) => log.push(p));
  const toasts = [];
  events.on(EVENTS.TOAST, (p) => toasts.push(p.text));

  play(s, s.graphs.MIRA, [1, 0]);
  assert.equal(s.quests.stepId('welcome'), 'stone');
  s.collectFind('fluff-stone', { position: [0, 0, 0] });
  s.collectFind('button-mushroom');
  assert.equal(log[0].rarity, 'common');
  assert.ok(toasts.includes('New find: Fluff Stone!'));
  // A critter brain reports a sighting; the session catalogues it once.
  assert.equal(s.sight('critter-cream'), true);
  assert.equal(s.sight('critter-cream'), false);
  assert.equal(state.inventory['critter-cream'], undefined, 'sightings are not carried');
  play(s, s.graphs.MIRA);
  assert.equal(s.quests.status('welcome'), 'done');

  // The felt lock: wrong, then the answer.
  events.emit(EVENTS.INTERACTED, { id: 'door', kind: 'door' });
  assert.notEqual(s.tryLock(), 'open');
  const opened = [];
  events.on(EVENTS.DOOR_OPENED, () => opened.push(1));
  LOCK_ANSWER.forEach((id, k) => { s.lock.state.dials[k] = LOCK_COLORS.findIndex((c) => c.id === id); });
  assert.equal(s.tryLock(), 'open');
  assert.equal(opened.length, 1);
  assert.equal(state.flags.doorOpen, true);
  assert.equal(s.quests.stepId('first-trip'), 'enter');

  // A trip: five finds, then home and report.
  s.beginTrip(1234, 'ABCDEFG', 'meadow');
  assert.equal(state.trips.taken, 1);
  assert.deepEqual(state.trips.visited, ['ABCDEFG']);
  for (let i = 0; i < 5; i++) s.collectFind('moss-tuft', { inTrip: true });
  assert.equal(state.flags.tripFinds, 5);
  assert.equal(s.quests.stepId('first-trip'), 'home');
  s.endTrip();
  assert.equal(state.area.kind, 'hub');
  play(s, s.graphs.MIRA);
  assert.equal(state.flags.basket, true);

  // Decorating: place three, pick one up again.
  const world = { heightAt: () => 1, kindAt: () => 'floor', protect: [], player: { x: 0, y: 1, z: 0 }, reach: 5 };
  for (let i = 0; i < 3; i++) {
    const spot = { x: i * 1.2, y: 1, z: 1 };
    assert.equal(s.canPlace(spot, world).ok, true);
    assert.ok(s.placeDecor('moss-tuft', spot, 0));
  }
  assert.equal(state.decor.length, 3);
  assert.equal(s.quests.status('nest-maker'), 'done');
  assert.equal(s.canPlace({ x: 0, y: 1, z: 1 }, world).reason, 'crowded');
  const back = s.pickUpDecor({ x: 0, y: 1, z: 1 });
  assert.equal(back.itemId, 'moss-tuft');
  assert.equal(state.decor.length, 2);
  assert.equal(state.inventory['moss-tuft'], 3);
  s.dispose();
});

test('petting and fetching count toward Biscuit\'s quest', () => {
  const events = createEvents();
  const state = newGameState();
  const s = createSession({ state, events });
  s.quests.start('biscuit');
  for (let i = 0; i < 3; i++) events.emit(EVENTS.PETTED, { creature: 'dog' });
  events.emit(EVENTS.DOG_FETCHED, {});
  events.emit(EVENTS.DOG_FETCHED, {});
  assert.equal(state.flags.pets, 3);
  assert.equal(state.flags.fetches, 2);
  assert.equal(s.quests.status('biscuit'), 'done');
  assert.ok(state.collection['dog-badge']);
});
