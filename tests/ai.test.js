import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Action, BehaviorTree, Blackboard, Condition, Cooldown, Guard, Inverter, Parallel, ReactiveSelector,
  Repeater, Selector, Sequence, Status, Succeeder, TimeLimit, Wait,
} from '../src/game/ai/bt.js';
import { Option, UtilityEvaluator, curves } from '../src/game/ai/utility.js';
import { arrive, dist, integrate } from '../src/game/ai/steer.js';
import { createCritterBrain, createDogBrain, createNpcBrain } from '../src/game/ai/brains.js';
import { EVENTS } from '../src/game/core/contracts.js';
import { createRng } from '../src/game/core/rng.js';
import { createEvents } from '../src/game/core/events.js';

const { SUCCESS, FAILURE, RUNNING } = Status;
const DT = 1 / 30;

/** An action that returns the given statuses in turn (the last one repeats), with lifecycle counters. */
function scripted(name, statuses) {
  const log = { enter: 0, tick: 0, exit: [], name };
  let i = 0;
  const node = new Action({
    name,
    enter: () => { log.enter++; i = 0; },
    tick: () => { log.tick++; return statuses[Math.min(i++, statuses.length - 1)]; },
    exit: (_bb, status, aborted) => log.exit.push(aborted ? 'aborted' : status),
  });
  return { node, log };
}

// --- Behaviour tree -------------------------------------------------------------------------

test('bt: sequence is AND, selector is OR', () => {
  const bb = new Blackboard();
  const seq = new Sequence('s', [new Condition(() => true), new Condition(() => false), scripted('never', [SUCCESS]).node]);
  assert.equal(seq.tick(bb, DT), FAILURE);
  assert.equal(new Sequence('s', [new Condition(() => true), new Condition(() => true)]).tick(bb, DT), SUCCESS);
  const after = scripted('after', [SUCCESS]);
  const sel = new Selector('o', [new Condition(() => false), new Condition(() => true), after.node]);
  assert.equal(sel.tick(bb, DT), SUCCESS);
  assert.equal(after.log.tick, 0, 'selector stops at the first success');
  assert.equal(new Selector('o', [new Condition(() => false)]).tick(bb, DT), FAILURE);
});

test('bt: a running child resumes instead of restarting the sequence', () => {
  const bb = new Blackboard();
  const first = scripted('first', [SUCCESS]);
  const second = scripted('second', [RUNNING, RUNNING, SUCCESS]);
  const seq = new Sequence('s', [first.node, second.node]);
  assert.equal(seq.tick(bb, DT), RUNNING);
  assert.equal(seq.tick(bb, DT), RUNNING);
  assert.equal(seq.tick(bb, DT), SUCCESS);
  assert.equal(first.log.tick, 1, 'earlier child is not re-ticked while the later one runs');
  assert.equal(second.log.enter, 1);
  assert.deepEqual(second.log.exit, [SUCCESS]);
});

test('bt: reactive selector aborts a running lower branch (exit called) when a higher one wakes', () => {
  const bb = new Blackboard({ alarm: false });
  const high = scripted('high', [RUNNING]);
  const low = scripted('low', [RUNNING]);
  const root = new ReactiveSelector('r', [new Guard((b) => b.get('alarm'), high.node), low.node]);
  assert.equal(root.tick(bb, DT), RUNNING);
  assert.equal(root.tick(bb, DT), RUNNING);
  assert.equal(low.log.tick, 2);
  bb.set('alarm', true);
  assert.equal(root.tick(bb, DT), RUNNING);
  assert.deepEqual(low.log.exit, ['aborted']);
  assert.equal(high.log.enter, 1);
  bb.set('alarm', false); // guard drops: high aborted, low re-entered
  root.tick(bb, DT);
  assert.deepEqual(high.log.exit, ['aborted']);
  assert.equal(low.log.enter, 2);
});

test('bt: cooldown blocks re-runs for its duration (bb time) and survives aborts', () => {
  const bb = new Blackboard();
  const act = scripted('act', [SUCCESS]);
  const tree = new BehaviorTree(new Cooldown(1, act.node), bb);
  const results = [];
  for (let i = 0; i < 6; i++) results.push(tree.tick(0.25)); // t = 0.25 .. 1.5
  assert.deepEqual(results, [SUCCESS, FAILURE, FAILURE, FAILURE, SUCCESS, FAILURE]);
  assert.equal(act.log.tick, 2);
  tree.root.abort(bb); // not open: no-op, ready time kept
  assert.equal(tree.tick(0.25), FAILURE);
});

test('bt: repeater runs n times, one completion per tick; fails on child failure', () => {
  const bb = new Blackboard();
  const act = scripted('act', [SUCCESS]);
  const rep = new Repeater(3, act.node);
  assert.deepEqual([rep.tick(bb, DT), rep.tick(bb, DT), rep.tick(bb, DT)], [RUNNING, RUNNING, SUCCESS]);
  assert.equal(act.log.tick, 3);
  assert.equal(new Repeater(5, new Condition(() => false)).tick(bb, DT), FAILURE);
});

test('bt: decorators, wait, time limit, parallel policy and scoped blackboard', () => {
  const bb = new Blackboard();
  assert.equal(new Inverter(new Condition(() => true)).tick(bb, DT), FAILURE);
  assert.equal(new Succeeder(new Condition(() => false)).tick(bb, DT), SUCCESS);

  const w = new Wait(0.1);
  assert.equal(w.tick(bb, 0.05), RUNNING);
  assert.equal(w.tick(bb, 0.06), SUCCESS);

  const slow = scripted('slow', [RUNNING]);
  const tl = new TimeLimit(0.1, slow.node);
  assert.equal(tl.tick(bb, 0.06), RUNNING);
  assert.equal(tl.tick(bb, 0.06), FAILURE);
  assert.deepEqual(slow.log.exit, ['aborted']);

  const a = scripted('a', [RUNNING, SUCCESS]);
  const b = scripted('b', [RUNNING]);
  const any = new Parallel('p', [a.node, b.node], { success: 'one' });
  assert.equal(any.tick(bb, DT), RUNNING);
  assert.equal(any.tick(bb, DT), SUCCESS);
  assert.deepEqual(b.log.exit, ['aborted'], 'the still-running sibling is aborted');
  const all = new Parallel('p', [new Condition(() => true), new Condition(() => false)]);
  assert.equal(all.tick(bb, DT), FAILURE);

  const needs = bb.scope('needs');
  needs.set('energy', 0.5);
  assert.equal(bb.get('needs.energy'), 0.5);
  assert.ok(needs.has('energy') && !bb.has('energy'));
  assert.equal(needs.add('energy', 1, 0, 1), 1);
});

// --- Utility --------------------------------------------------------------------------------

test('utility: curves are normalized and the evaluator picks the highest score', () => {
  assert.equal(curves.linear()(0.3), 0.3);
  assert.equal(curves.quadratic(2)(0.5), 0.25);
  assert.ok(Math.abs(curves.exponential(3)(1) - 1) < 1e-9 && curves.exponential(3)(0) === 0);
  assert.ok(Math.abs(curves.logistic(10, 0.5)(0.5) - 0.5) < 1e-9);
  assert.equal(curves.inverse()(0.25), 0.75);

  const ctx = { hunger: 0.9, fear: 0.2 };
  const ev = new UtilityEvaluator([
    { name: 'eat', considerations: [{ name: 'hunger', input: (c) => c.hunger }] },
    { name: 'hide', considerations: [{ name: 'fear', input: (c) => c.fear, curve: curves.quadratic(2) }] },
    { name: 'never', considerations: [{ name: 'veto', input: () => 0 }, { name: 'x', input: () => 1 }] },
  ]);
  const r = ev.evaluate(ctx);
  assert.equal(r.best, 'eat');
  assert.equal(r.scores.never, 0, 'a zero consideration vetoes');
  assert.ok(r.scores.eat > r.scores.hide);
  assert.ok(Math.abs(r.details.hide.parts.fear - 0.04) < 1e-12);
});

test('utility: momentum keeps the current choice through near-ties (no flapping)', () => {
  const run = (momentum) => {
    const ctx = { a: 0.5, b: 0.5 };
    const ev = new UtilityEvaluator([
      new Option({ name: 'a', momentum, considerations: [{ name: 'a', input: (c) => c.a }] }),
      new Option({ name: 'b', momentum, considerations: [{ name: 'b', input: (c) => c.b }] }),
    ]);
    const picks = [];
    for (let i = 0; i < 10; i++) {
      ctx.a = 0.5 + (i % 2 ? 0.03 : -0.03); // jitter around b
      picks.push(ev.evaluate(ctx).best);
    }
    return new Set(picks).size;
  };
  assert.equal(run(0), 2, 'without momentum the choice flaps');
  assert.equal(run(0.2), 1, 'with momentum it commits');
});

// --- Steering -------------------------------------------------------------------------------

test('steer: arrive settles on the target; integrate refuses unwalkable steps', () => {
  const body = { position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, yaw: 0 };
  for (let i = 0; i < 300; i++) integrate(body, arrive(body.position, body.velocity, { x: 5, z: 0 }, 3, 1.5), DT, { maxSpeed: 3, maxAccel: 12 });
  assert.ok(dist(body.position, { x: 5, z: 0 }) < 0.1);
  assert.ok(Math.abs(body.yaw - Math.PI / 2) < 0.05, 'yaw faces +X after moving along +X');

  const wall = { position: { x: 0, z: 0 }, velocity: { x: 2, z: 0 }, yaw: 0 };
  const walkable = (x) => x < 1;
  for (let i = 0; i < 120; i++) integrate(wall, { x: 10, z: 0 }, DT, { maxSpeed: 2, walkable });
  assert.ok(wall.position.x < 1);
});

// --- Brains: fakes --------------------------------------------------------------------------

function fakeWorld({ player = { x: 0, z: 0 }, walkable = () => true } = {}) {
  const state = { player: { position: { ...player }, running: false, velocity: { x: 0, z: 0 } }, inFlight: null, landed: null, taken: 0 };
  const world = {
    player: () => state.player,
    walkable,
    heightAt: () => 0,
    ballInFlight: () => state.inFlight,
    ballLanded: () => state.landed,
    takeBall: () => { state.taken++; state.landed = null; return true; },
    timeOfDay: () => 0.5,
  };
  return { world, state };
}

function fakeBody(x = 0, z = 0) {
  return {
    position: { x, z }, yaw: 0, velocity: { x: 0, z: 0 }, pose: null, poses: [], look: undefined,
    setPose(p) { this.pose = p; this.poses.push(p); },
    lookAt(p) { this.look = p; },
  };
}

function recorder(events, types) {
  const log = [];
  for (const t of types) events.on(t, (p) => log.push({ type: t, ...p }));
  return log;
}

const run = (brain, seconds, each) => { for (let i = 0; i < Math.round(seconds / DT); i++) { each?.(i * DT); brain.tick(DT); } };
const speed = (b) => Math.hypot(b.velocity.x, b.velocity.z);

// --- Dog ------------------------------------------------------------------------------------

test('dog: follows the player to ~2.5 m, stops and sits while the player stands still', () => {
  const { world } = fakeWorld({ player: { x: 10, z: 0 } });
  const body = fakeBody(0, 0);
  const dog = createDogBrain({ rng: createRng(1), events: createEvents(), body, world });
  run(dog, 1);
  assert.equal(dog.state(), 'follow');
  run(dog, 7);
  const d = dist(body.position, world.player().position);
  assert.ok(d > 2 && d < 3.1, `distance ${d.toFixed(2)}`);
  assert.ok(speed(body) < 0.05, 'stopped');
  assert.equal(body.pose, 'sit');
  assert.equal(dog.state(), 'sit');
});

test('dog: fetch runs to the landed ball, takes it, brings it back and emits DOG_FETCHED', () => {
  const { world, state } = fakeWorld({ player: { x: 0, z: 0 } });
  const body = fakeBody(2, 0);
  const events = createEvents();
  const log = recorder(events, [EVENTS.DOG_FETCHED]);
  const dog = createDogBrain({ rng: createRng(2), events, body, world });
  run(dog, 1);
  // A throw: one second in flight toward (0, 10), then it lands.
  state.inFlight = { position: { x: 0, z: 0 } };
  const labels = new Set();
  run(dog, 1, (t) => { state.inFlight.position = { x: 0, z: t * 10 }; labels.add(dog.state()); });
  state.inFlight = null;
  state.landed = { position: { x: 0, z: 10 } };
  run(dog, 15, () => labels.add(dog.state()));
  assert.equal(state.taken, 1, 'takeBall called once');
  assert.equal(log.length, 1);
  assert.equal(log[0].creature, 'dog');
  for (const l of ['fetch:chase', 'fetch:run', 'fetch:return', 'fetch:drop']) assert.ok(labels.has(l), `went through ${l}`);
  assert.ok(dist(body.position, world.player().position) < 2.5, 'dropped near the player');
  assert.equal(dog.blackboard.get('hasBall'), false);
  run(dog, 3);
  assert.equal(log.length, 1, 'no second fetch without a new throw');
});

test('dog: petting sits + wags, raises affection and emits PETTED', () => {
  const { world } = fakeWorld({ player: { x: 2, z: 0 } });
  const body = fakeBody(0, 0);
  const events = createEvents();
  const log = recorder(events, [EVENTS.PETTED]);
  const dog = createDogBrain({ rng: createRng(3), events, body, world, affection: 0.3 });
  run(dog, 1);
  dog.onInteract();
  run(dog, 0.2);
  assert.equal(dog.state(), 'petted');
  assert.equal(body.pose, 'sit');
  run(dog, 1);
  assert.equal(body.pose, 'wag');
  assert.deepEqual(log, [{ type: EVENTS.PETTED, creature: 'dog' }]);
  assert.ok(dog.blackboard.get('affection') > 0.45);
  run(dog, 3);
  assert.notEqual(dog.state(), 'petted');
});

test('dog: barks happily when the player comes back after being away', () => {
  const { world, state } = fakeWorld({ player: { x: 30, z: 0 } });
  const body = fakeBody(0, 0);
  const events = createEvents();
  const log = recorder(events, [EVENTS.DOG_BARK]);
  // Too tired to follow (it naps), so the player stays away.
  const dog = createDogBrain({ rng: createRng(4), events, body, world, energy: 0.05, tuning: { petBarkChance: 0 } });
  run(dog, 10);
  assert.equal(dog.blackboard.get('away'), true);
  assert.equal(log.length, 0);
  state.player.position = { x: 5, z: 0 };
  run(dog, 1);
  assert.equal(log.length, 1);
  assert.equal(log[0].reason, 'greet');
});

test('dog: naps (sleep pose) when energy is low', () => {
  const { world } = fakeWorld({ player: { x: 2, z: 0 } });
  const body = fakeBody(0, 0);
  const dog = createDogBrain({ rng: createRng(5), events: createEvents(), body, world, energy: 0.1 });
  run(dog, 3);
  assert.equal(dog.state(), 'nap');
  assert.equal(body.pose, 'sleep');
  assert.ok(dog.blackboard.get('energy') > 0.1, 'recovers while asleep');
});

// --- Critter --------------------------------------------------------------------------------

test('critter: flees a running player (one squeak per flee) then calms down', () => {
  const { world, state } = fakeWorld({ player: { x: 2.5, z: 0 } });
  state.player.running = true;
  state.player.velocity = { x: -5, z: 0 };
  const body = fakeBody(0, 0);
  const events = createEvents();
  const log = recorder(events, [EVENTS.CRITTER_SQUEAK]);
  const critter = createCritterBrain({ rng: createRng(6), events, body, world, itemId: 'puffball', home: { x: 0, z: 0 } });
  run(critter, 0.3);
  assert.equal(critter.state(), 'flee');
  state.player.running = false;
  state.player.velocity = { x: 0, z: 0 };
  run(critter, 1);
  assert.equal(critter.state(), 'flee', 'keeps fleeing until at a safe distance');
  assert.ok(dist(body.position, state.player.position) > 4);
  run(critter, 6);
  assert.notEqual(critter.state(), 'flee');
  assert.equal(log.length, 1);
  assert.equal(log[0].itemId, 'puffball');
});

test('critter: approaches a still, close player and reports the sighting once', () => {
  const { world, state } = fakeWorld({ player: { x: 3, z: 0 } });
  const body = fakeBody(0, 0);
  const events = createEvents();
  const log = recorder(events, [EVENTS.CRITTER_SIGHTED]);
  const critter = createCritterBrain({ rng: createRng(7), events, body, world, itemId: 'puffball', home: { x: 0, z: 0 } });
  run(critter, 6);
  assert.equal(critter.state(), 'curious');
  assert.ok(dist(body.position, state.player.position) < 2, 'came closer');
  assert.deepEqual(log, [{ type: EVENTS.CRITTER_SIGHTED, itemId: 'puffball' }]);
  state.player.position = { x: 20, z: 0 }; // leave, come back
  run(critter, 3);
  state.player.position = { x: 3, z: 0 };
  run(critter, 4);
  assert.equal(critter.state(), 'curious');
  assert.equal(log.length, 1, 'sighting fires once');
  // A second critter of the same kind on the same bus does not re-report.
  const other = createCritterBrain({ rng: createRng(8), events, body: fakeBody(0, 1), world, itemId: 'puffball', home: { x: 0, z: 0 } });
  run(other, 4);
  assert.equal(log.length, 1);
});

test('critter: wanders only on walkable ground and keeps spacing from friends', () => {
  const walkable = (x, z) => x < 1.5 && Math.hypot(x, z) < 6;
  const { world } = fakeWorld({ player: { x: -40, z: 0 }, walkable });
  const bodies = [fakeBody(0, 0), fakeBody(0.2, 0), fakeBody(0, 0.2)];
  const critters = bodies.map((body, i) => createCritterBrain({
    rng: createRng(20 + i), events: createEvents(), body, world, itemId: 'puffball', home: { x: 0, z: 0 },
    neighbours: () => bodies,
  }));
  let offGround = 0;
  for (let i = 0; i < 30 * 20; i++) {
    for (const c of critters) c.tick(DT);
    for (const b of bodies) if (!walkable(b.position.x, b.position.z)) offGround++;
  }
  assert.equal(offGround, 0);
  assert.ok(bodies.some((b) => b.poses.includes('hop')), 'hops while wandering');
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(dist(bodies[a].position, bodies[b].position) > 0.4, 'separated');
});

// --- NPC ------------------------------------------------------------------------------------

test('npc: waves once when the player arrives within range, then respects the cooldown', () => {
  const { world, state } = fakeWorld({ player: { x: 20, z: 0 } });
  const body = fakeBody(0, 0);
  const mira = createNpcBrain({ rng: createRng(9), events: createEvents(), body, world, routine: [{ x: 0, z: 0 }, { x: 3, z: 0 }], tuning: { waveCooldown: 20 } });
  const waves = () => body.poses.filter((p) => p === 'wave').length;
  run(mira, 2);
  assert.equal(waves(), 0);
  state.player.position = { x: 0, z: 4 };
  run(mira, 0.5);
  assert.equal(mira.state(), 'wave');
  run(mira, 5);
  assert.equal(waves(), 1, 'one wave while the player stays');
  assert.ok(body.look, 'looks at the player within range');
  state.player.position = { x: 30, z: 0 }; // leave and return inside the cooldown
  run(mira, 2);
  assert.equal(body.look, null, 'stops looking out of range');
  state.player.position = { x: 0, z: 4 };
  run(mira, 3);
  assert.equal(waves(), 1, 'cooldown');
  state.player.position = { x: 30, z: 0 }; // after the cooldown she waves again
  run(mira, 15);
  state.player.position = { x: 0, z: 4 };
  run(mira, 2);
  assert.equal(waves(), 2);
});

test('npc: walks her routine, and stands still facing the player in conversation', () => {
  const { world, state } = fakeWorld({ player: { x: 40, z: 0 } });
  const body = fakeBody(0, 0);
  const mira = createNpcBrain({ rng: createRng(10), events: createEvents(), body, world, routine: [{ x: 0, z: 0, idle: 1 }, { x: 4, z: 0, idle: 1 }] });
  const visited = new Set();
  run(mira, 12, () => { if (dist(body.position, { x: 4, z: 0 }) < 0.5) visited.add('b'); if (dist(body.position, { x: 0, z: 0 }) < 0.5) visited.add('a'); });
  assert.deepEqual([...visited].sort(), ['a', 'b']);
  state.player.position = { x: body.position.x, z: body.position.z + 2 };
  mira.blackboard.set('inConversation', true);
  run(mira, 3);
  assert.equal(mira.state(), 'talk');
  assert.ok(speed(body) < 0.05);
  const toPlayer = Math.atan2(state.player.position.x - body.position.x, state.player.position.z - body.position.z);
  assert.ok(Math.abs(body.yaw - toPlayer) < 0.1, 'faces the player');
  mira.blackboard.set('inConversation', false);
  run(mira, 0.5);
  assert.notEqual(mira.state(), 'talk');
});
