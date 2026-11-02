// Creature brains: a behaviour tree (structure, priorities, interrupts) whose bottom layer is a
// utility choice (moods / needs), driving an abstract body through a steering motor. No three.js:
// the brain writes body.position.{x,z}, body.velocity.{x,z} and body.yaw, and calls the optional
// body.setPose(name) / body.lookAt(point|null) on changes; the game renders (and sets y from
// world.heightAt). See README.md for each tree.
//
// Every factory: create<X>Brain({ rng, events, body, world, ...options })
//   -> { tick(dt), blackboard, state(), tree, debug(), onInteract?() }

import { EVENTS } from '../core/contracts.js';
import { createRng } from '../core/rng.js';
import { Blackboard, BehaviorTree, Status, bt } from './bt.js';
import { UtilityEvaluator, UtilityNode, curves } from './utility.js';
import { add, createMotor, dist, fromYaw, len, normalize, pickWalkablePoint, scale, sub } from './steer.js';

const { SUCCESS, FAILURE, RUNNING } = Status;
const { reactive, seq, action, guard, repeat, succeed, limit, cooldown, hook } = bt;
const MAX_DT = 0.1;

// ---------------------------------------------------------------------------------------------
// Shared plumbing

function setup({ rng, events, body, world }, label) {
  if (!body?.position) throw new Error(`${label} brain: body.position is required`);
  if (!world?.player) throw new Error(`${label} brain: world.player() is required`);
  return {
    rng: rng ?? createRng(label),
    emit: (type, payload) => events?.emit?.(type, payload),
    walkable: world.walkable ? (x, z) => world.walkable(x, z) : null,
  };
}

/** Writes the player's position/velocity/speed/distance/stillness into the blackboard each tick. */
function createPlayerSense(world, body) {
  let last = null;
  return (bb, dt) => {
    const p = world.player();
    const pos = { x: p.position.x, z: p.position.z };
    let vel;
    if (p.velocity) vel = { x: p.velocity.x ?? 0, z: p.velocity.z ?? 0 };
    else vel = last && dt > 0 ? { x: (pos.x - last.x) / dt, z: (pos.z - last.z) / dt } : { x: 0, z: 0 };
    last = pos;
    const speed = len(vel);
    const running = !!p.running;
    bb.set('playerPos', pos);
    bb.set('playerVel', vel);
    bb.set('playerSpeed', speed);
    bb.set('playerRunning', running);
    bb.set('playerDist', dist(body.position, pos));
    bb.set('playerStill', speed < 0.25 && !running ? bb.get('playerStill', 0) + dt : 0);
  };
}

/** A point `radius` from `center` on the side of `from` (keeps the approach direction). */
function standOff(center, from, radius) {
  const d = sub(from, center);
  const dir = len(d) > 1e-4 ? normalize(d) : { x: 0, z: 1 };
  return add(center, scale(dir, radius));
}

/** Pulls p back inside a circle (center, radius). */
function clampToCircle(p, center, radius) {
  const d = sub(p, center);
  const l = len(d);
  return l <= radius ? p : add(center, scale(d, radius / l));
}

function makeBrain({ bb, tree, motor, sense, before, after, onInteract, extra = {} }) {
  return {
    blackboard: bb,
    tree,
    tick(dt) {
      dt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
      if (dt === 0) return;
      motor.reset();
      sense(bb, dt);
      before?.(bb, dt);
      tree.tick(dt);
      after?.(bb, dt);
      motor.finish(dt);
    },
    state: () => bb.get('label', 'idle'),
    debug: () => ({ label: bb.get('label'), path: tree.activePath(), pose: motor.currentPose, blackboard: bb.toJSON() }),
    ...(onInteract ? { onInteract } : {}),
    ...extra,
  };
}

/** Timed pose leaf: stop, hold `pose` for sec (number or bb => number), label it. */
function holdPose(motor, bb, { name, pose, sec, label, face }) {
  const key = `${name}.t`;
  return action({
    name,
    enter: (b) => b.set(key, typeof sec === 'function' ? sec(b) : sec),
    tick: (b, dt) => {
      motor.stop();
      motor.setPose(pose);
      if (face) motor.faceToward(face(b));
      b.set('label', label);
      return b.add(key, -dt) <= 0 ? SUCCESS : RUNNING;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Dog

export const DOG_TUNING = {
  walkSpeed: 2.6, trotSpeed: 4.2, runSpeed: 6.8, maxAccel: 16, turnRate: 8,
  followDist: 2.5, followStart: 3.6, sitAfterStill: 1.2,
  pickupDist: 0.7, dropDist: 1.6,
  petTime: 3.2, petBarkChance: 0.3, fetchBarkChance: 0.5,
  awayDist: 15, awayTime: 8, greetDist: 9,
  energyDrain: 0.0015, energyRunDrain: 0.005, energyRecover: 0.03,
  affectionDecay: 0.004, curiosityGrow: 0.025, curiosityDrop: 0.045,
  moodInterval: 0.5,
};

/**
 * The dog: follows at ~2.5 m (sits when the player stands still), fetches thrown balls, loves
 * pets, sniffs around when bored, naps when tired and barks when the player comes back.
 * Options: tuning (overrides DOG_TUNING), energy/affection/curiosity (0..1 starting needs).
 */
export function createDogBrain(opts = {}) {
  const { body, world } = opts;
  const { rng, emit, walkable } = setup(opts, 'dog');
  const T = { ...DOG_TUNING, ...opts.tuning };
  const bb = new Blackboard({
    energy: opts.energy ?? 0.9, affection: opts.affection ?? 0.5, curiosity: opts.curiosity ?? 0.1,
    petTimer: 0, hasBall: false, fetching: false, awaitThrow: false,
    away: false, awayTimer: 0, greetPending: false, greeting: false, sleeping: false, label: 'idle',
  });
  const motor = createMotor(body, world, {
    walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxAccel: T.maxAccel, turnRate: T.turnRate,
    movePose: 'walk', runPose: 'run', idlePose: 'idle', lookAhead: 0.9,
  });
  const playerSense = createPlayerSense(world, body);
  const label = (s) => bb.set('label', s);
  const P = () => bb.get('playerPos');
  /** A landed ball the dog is willing to chase (not one it just dropped, until the next throw). */
  const ballAvailable = () => (bb.get('awaitThrow') ? null : world.ballLanded?.() ?? null);
  const ballInFlight = () => world.ballInFlight?.() ?? null;

  function sense(b, dt) {
    playerSense(b, dt);
    if (ballInFlight()) b.set('awaitThrow', false);
    const d = b.get('playerDist');
    if (d > T.awayDist) { if (b.add('awayTimer', dt) > T.awayTime) b.set('away', true); }
    else b.set('awayTimer', 0);
    if (b.get('away') && d < T.greetDist) { b.set('away', false); b.set('greetPending', true); }
  }

  function needs(b, dt) {
    const speed = len(body.velocity);
    if (b.get('sleeping')) b.add('energy', T.energyRecover * dt, 0, 1);
    else b.add('energy', -(T.energyDrain + T.energyRunDrain * (speed / T.runSpeed)) * dt, 0, 1);
    b.add('affection', -T.affectionDecay * dt, 0, 1);
    if (!b.get('sleeping')) b.add('curiosity', (b.get('mood') === 'sniff' ? -T.curiosityDrop : T.curiosityGrow) * dt, 0, 1);
  }

  // Moods (utility layer)
  const moods = new UtilityEvaluator([
    { name: 'follow', momentum: 0.15, considerations: [
      { name: 'affection', input: (b) => b.get('affection'), curve: curves.linear(0.5, 0.5) },
      { name: 'distance', input: (b) => b.get('playerDist'), min: 0, max: 15, curve: curves.linear(0.6, 0.4) },
      { name: 'energy', input: (b) => b.get('energy'), curve: curves.logistic(12, 0.12) },
    ] },
    { name: 'sniff', momentum: 0.3, considerations: [
      { name: 'curiosity', input: (b) => b.get('curiosity'), curve: curves.quadratic(2) },
      { name: 'playerResting', input: (b) => b.get('playerStill'), min: 0, max: 6, curve: curves.smoothstep(0.2, 1) },
      { name: 'nearPlayer', input: (b) => b.get('playerDist'), min: 0, max: 12, curve: curves.inverse() },
      { name: 'energy', input: (b) => b.get('energy'), curve: curves.logistic(10, 0.3) },
    ] },
    { name: 'nap', weight: 1.2, momentum: 0.15, considerations: [
      // +0.35 while asleep: inertia, so a nap lasts until energy is well recovered.
      { name: 'tiredness', input: (b) => 1 - b.get('energy') + (b.get('sleeping') ? 0.35 : 0), curve: curves.logistic(12, 0.7) },
      { name: 'calm', input: (b) => (b.get('playerRunning') && b.get('playerDist') < 6 ? 0.3 : 1) },
    ] },
  ]);

  const follow = action({
    name: 'follow player',
    enter: (b) => b.set('following', b.get('playerDist') > T.followStart),
    tick: (b) => {
      const p = P(), d = b.get('playerDist');
      if (!b.get('following') && d > T.followStart) b.set('following', true);
      if (b.get('following')) {
        const speed = d > 8 ? T.runSpeed : d > 4.5 ? T.trotSpeed : T.walkSpeed;
        const rem = motor.moveTo(standOff(p, body.position, T.followDist), { speed, slowRadius: 1.8, stopRadius: 0.15 });
        label('follow');
        if (rem < 0.3 || d < T.followDist + 0.15) b.set('following', false);
      } else {
        motor.stop();
        motor.faceToward(p);
        const sit = b.get('playerStill') > T.sitAfterStill && len(body.velocity) < 0.4;
        motor.setPose(sit ? 'sit' : 'idle');
        label(sit ? 'sit' : 'wait');
      }
      motor.lookAt(p);
      return RUNNING;
    },
  });

  const sniff = repeat(Infinity, seq('sniff around', [
    action({ name: 'pick spot', tick: (b) => {
      b.set('sniffSpot', pickWalkablePoint(rng, P(), 5, walkable, { minR: 1.5 }));
      return SUCCESS;
    } }),
    succeed(limit(6, action({ name: 'trot to spot', tick: (b) => {
      label('sniff');
      motor.lookAt(null);
      return motor.moveTo(b.get('sniffSpot'), { speed: T.walkSpeed, slowRadius: 1, stopRadius: 0.2 }) < 0.35 ? SUCCESS : RUNNING;
    } }))),
    holdPose(motor, bb, { name: 'sniff ground', pose: 'look', label: 'sniff', sec: () => rng.range(1.5, 3) }),
  ]));

  const nap = seq('nap', [
    holdPose(motor, bb, { name: 'lie down', pose: 'sit', label: 'nap', sec: 0.8 }),
    action({
      name: 'sleep',
      enter: (b) => b.set('sleeping', true),
      tick: () => { motor.stop(); motor.setPose('sleep'); motor.lookAt(null); label('nap'); return RUNNING; },
      exit: (b) => b.set('sleeping', false),
    }),
  ]);

  const petted = action({
    name: 'being petted',
    tick: (b, dt) => {
      const t = b.add('petTimer', -dt, 0);
      motor.stop();
      motor.faceToward(P());
      motor.lookAt(P());
      motor.setPose(T.petTime - t < 0.5 ? 'sit' : 'wag');
      label('petted');
      return t <= 0 ? SUCCESS : RUNNING;
    },
  });

  const fetch = hook(seq('fetch', [
    action({ name: 'watch ball', tick: (b) => {
      if (b.get('hasBall') || ballAvailable()) return SUCCESS;
      const f = ballInFlight();
      if (!f) return FAILURE;
      label('fetch:chase');
      motor.moveTo(f.position, { speed: T.runSpeed, slowRadius: 0.5, stopRadius: 0.3 });
      motor.lookAt(f.position);
      return RUNNING;
    } }),
    limit(15, action({ name: 'run to ball', tick: (b) => {
      if (b.get('hasBall')) return SUCCESS;
      const ball = ballAvailable();
      if (!ball) return FAILURE;
      label('fetch:run');
      motor.lookAt(ball.position);
      const d = motor.moveTo(ball.position, { speed: T.runSpeed, slowRadius: 1.2, stopRadius: 0.2 });
      if (d > T.pickupDist) return RUNNING;
      if (world.takeBall?.() === false) return FAILURE;
      b.set('hasBall', true);
      return SUCCESS;
    } })),
    limit(25, action({ name: 'bring back', tick: (b) => {
      const p = P(), d = b.get('playerDist');
      label('fetch:return');
      motor.moveTo(standOff(p, body.position, T.dropDist * 0.8), { speed: d > 5 ? T.runSpeed : T.trotSpeed, slowRadius: 1.5, stopRadius: 0.1 });
      motor.lookAt(p);
      return d <= T.dropDist ? SUCCESS : RUNNING;
    } })),
    action({ name: 'drop ball', enter: (b) => {
      b.set('hasBall', false);
      b.set('awaitThrow', true);
      b.add('affection', 0.12, 0, 1);
      emit(EVENTS.DOG_FETCHED, { creature: 'dog', position: { x: body.position.x, z: body.position.z } });
      if (rng.chance(T.fetchBarkChance)) emit(EVENTS.DOG_BARK, { creature: 'dog', reason: 'fetch' });
      b.set('dropT', 1.2);
    }, tick: (b, dt) => {
      motor.stop();
      motor.faceToward(P());
      motor.setPose('wag');
      label('fetch:drop');
      return b.add('dropT', -dt) <= 0 ? SUCCESS : RUNNING;
    } }),
  ]), {
    enter: (b) => b.set('fetching', true),
    exit: (b, status) => {
      b.set('fetching', false);
      if (status === FAILURE && !b.get('hasBall')) b.set('awaitThrow', true); // unreachable ball: wait for the next throw
    },
  });

  const greet = hook(seq('greet', [
    action({ name: 'happy bark', enter: (b) => {
      b.set('greetPending', false);
      emit(EVENTS.DOG_BARK, { creature: 'dog', reason: 'greet' });
      b.set('barkT', 0.6);
    }, tick: (b, dt) => {
      motor.stop(); motor.faceToward(P()); motor.lookAt(P()); motor.setPose('wag'); label('greet');
      return b.add('barkT', -dt) <= 0 ? SUCCESS : RUNNING;
    } }),
    succeed(limit(8, action({ name: 'run to player', tick: (b) => {
      label('greet');
      if (b.get('playerDist') <= T.followDist + 0.3) return SUCCESS;
      motor.moveTo(standOff(P(), body.position, T.followDist), { speed: T.runSpeed, slowRadius: 1.5 });
      return RUNNING;
    } }))),
    holdPose(motor, bb, { name: 'wag hello', pose: 'wag', label: 'greet', sec: 1.5, face: P }),
  ]), {
    enter: (b) => { b.set('greeting', true); b.add('affection', 0.05, 0, 1); },
    exit: (b) => b.set('greeting', false),
  });

  const root = reactive('dog', [
    guard((b) => b.get('petTimer') > 0, petted, 'petted?'),
    guard((b) => b.get('fetching') || b.get('hasBall') || !!ballAvailable() || !!ballInFlight(), fetch, 'ball?'),
    guard((b) => b.get('greetPending') || b.get('greeting'), greet, 'player back?'),
    new UtilityNode('mood', moods, { follow, sniff, nap }, { interval: T.moodInterval, key: 'mood' }),
  ]);
  const tree = new BehaviorTree(root, bb);

  return makeBrain({
    bb, tree, motor, sense, before: needs,
    onInteract() {
      bb.set('petTimer', T.petTime);
      bb.add('affection', 0.2, 0, 1);
      emit(EVENTS.PETTED, { creature: 'dog' });
      if (rng.chance(T.petBarkChance)) emit(EVENTS.DOG_BARK, { creature: 'dog', reason: 'petted' });
    },
    extra: { moods: () => moods.last },
  });
}

// ---------------------------------------------------------------------------------------------
// Critter (puffball)

export const CRITTER_TUNING = {
  hopSpeed: 1.6, fleeSpeed: 5, curiousSpeed: 0.9, maxAccel: 14, turnRate: 9,
  threatDist: 3, threatSpeed: 3, safeDist: 7, fleeMax: 6, waryTime: 3,
  curiousDist: 5, curiousStill: 1.2, approachDist: 1.3,
  hungerGrow: 0.015, eatRate: 0.12, separationRadius: 0.9, needsInterval: 0.75,
};

// Sightings already reported, per event bus (so several critters of one kind report once).
const SIGHTINGS = new WeakMap();
function sightingSet(events, explicit) {
  if (explicit) return explicit;
  if (!events || typeof events !== 'object') return new Set();
  if (!SIGHTINGS.has(events)) SIGHTINGS.set(events, new Set());
  return SIGHTINGS.get(events);
}

/**
 * A puffball critter. Options: itemId (for CRITTER_SIGHTED), id (dedupe key for the sighting;
 * defaults to itemId), home {x,z} (defaults to the spawn position), homeRadius (4),
 * food: {x,z} | () => {x,z}|null (falls back to world.food?.()), neighbours: () => [{x,z}|{position}]
 * (the other critters; the brain filters out its own body), sighted: Set (shared dedupe set;
 * default one per event bus), tuning.
 */
export function createCritterBrain(opts = {}) {
  const { body, world, events } = opts;
  const { rng, emit, walkable } = setup(opts, `critter:${opts.id ?? opts.itemId ?? ''}`);
  const C = { ...CRITTER_TUNING, ...opts.tuning };
  const home = { x: opts.home?.x ?? body.position.x, z: opts.home?.z ?? body.position.z };
  const homeRadius = opts.homeRadius ?? 4;
  const sightKey = opts.id ?? opts.itemId;
  const sighted = sightingSet(events, opts.sighted);
  const neighbours = () => {
    const list = typeof opts.neighbours === 'function' ? opts.neighbours() : opts.neighbours ?? [];
    return list.filter((n) => n && n !== body && n !== body.position && (n.position ?? n) !== body.position).map((n) => n.position ?? n);
  };
  const foodPoint = () => {
    const f = typeof opts.food === 'function' ? opts.food() : opts.food ?? world.food?.() ?? null;
    return f ? { x: f.x, z: f.z } : null;
  };

  const bb = new Blackboard({ hunger: opts.hunger ?? 0.2, fleeing: false, returning: false, waryUntil: -Infinity, label: 'idle' });
  const motor = createMotor(body, world, {
    walkSpeed: C.hopSpeed, runSpeed: C.fleeSpeed, maxAccel: C.maxAccel, turnRate: C.turnRate,
    movePose: 'hop', runPose: 'run', idlePose: 'idle', lookAhead: 0.6,
    neighbours, separationRadius: C.separationRadius,
  });
  const playerSense = createPlayerSense(world, body);
  const label = (s) => bb.set('label', s);
  const P = () => bb.get('playerPos');

  function sense(b, dt) {
    playerSense(b, dt);
    const d = b.get('playerDist');
    b.set('threat', d < C.threatDist && (b.get('playerRunning') || b.get('playerSpeed') > C.threatSpeed));
    b.set('homeDist', dist(body.position, home));
    const others = neighbours().filter((n) => dist(n, body.position) < 10);
    if (others.length) {
      const c = others.reduce((a, n) => add(a, n), { x: 0, z: 0 });
      b.set('friendCenter', scale(c, 1 / others.length));
      b.set('friendDist', dist(b.get('friendCenter'), body.position));
    } else { b.set('friendCenter', null); b.set('friendDist', 0); }
    const food = foodPoint();
    b.set('food', food);
    b.set('foodDist', food ? dist(food, body.position) : Infinity);
    b.add('hunger', (b.get('mood') === 'gather' && b.get('foodDist') < 1.2 ? -C.eatRate : C.hungerGrow) * dt, 0, 1);
  }

  const needs = new UtilityEvaluator([
    { name: 'wander', considerations: [{ name: 'restless', input: () => 1, curve: curves.constant(0.4) }] },
    { name: 'gather', considerations: [
      { name: 'food', input: (b) => (b.get('food') ? 1 : 0), curve: curves.step(0.5) },
      { name: 'hunger', input: (b) => b.get('hunger'), curve: curves.logistic(8, 0.45) },
      { name: 'reach', input: (b) => (b.get('food') ? dist(b.get('food'), home) : Infinity), min: 0, max: homeRadius * 3, curve: curves.inverse() },
    ] },
    { name: 'cluster', weight: 0.6, considerations: [
      { name: 'friends', input: (b) => (b.get('friendCenter') ? 1 : 0), curve: curves.step(0.5) },
      { name: 'lonely', input: (b) => b.get('friendDist'), min: 0, max: 6, curve: curves.logistic(8, 0.4) },
    ] },
  ]);

  const flee = hook(limit(C.fleeMax, action({
    name: 'flee',
    enter: (b) => { b.set('calmT', 0); emit(EVENTS.CRITTER_SQUEAK, { itemId: opts.itemId, position: { x: body.position.x, z: body.position.z } }); },
    tick: (b, dt) => {
      label('flee');
      motor.flee(P(), C.fleeSpeed);
      if (b.get('playerDist') > C.safeDist) { if (b.add('calmT', dt) > 0.5) return SUCCESS; }
      else b.set('calmT', 0);
      return RUNNING;
    },
  })), {
    enter: (b) => b.set('fleeing', true),
    exit: (b) => { b.set('fleeing', false); b.set('waryUntil', b.now() + C.waryTime); },
  });

  const goHome = hook(action({ name: 'hop home', tick: () => {
    label('home');
    motor.lookAt(null);
    return motor.moveTo(home, { speed: C.hopSpeed * 1.3, slowRadius: 1 }) < homeRadius * 0.5 ? SUCCESS : RUNNING;
  } }), { enter: (b) => b.set('returning', true), exit: (b) => b.set('returning', false) });

  const curious = action({
    name: 'curious approach',
    enter: () => {
      if (opts.itemId != null && !sighted.has(sightKey)) {
        sighted.add(sightKey);
        emit(EVENTS.CRITTER_SIGHTED, { itemId: opts.itemId });
      }
    },
    tick: () => {
      const p = P();
      const target = clampToCircle(standOff(p, body.position, C.approachDist), home, homeRadius * 1.6);
      const far = dist(body.position, target) > 2;
      const rem = motor.moveTo(target, { speed: far ? C.hopSpeed : C.curiousSpeed, slowRadius: 0.8, stopRadius: 0.1 });
      motor.faceToward(p);
      motor.lookAt(p);
      if (rem < 0.25) motor.setPose('look');
      label('curious');
      return RUNNING;
    },
  });

  const wanderAround = repeat(Infinity, seq('wander', [
    action({ name: 'pick spot', tick: (b) => { b.set('spot', pickWalkablePoint(rng, home, homeRadius, walkable)); return SUCCESS; } }),
    succeed(limit(5, action({ name: 'hop to spot', tick: (b) => {
      label('wander');
      motor.lookAt(null);
      return motor.moveTo(b.get('spot'), { speed: C.hopSpeed, slowRadius: 0.6, stopRadius: 0.15 }) < 0.3 ? SUCCESS : RUNNING;
    } }))),
    holdPose(motor, bb, { name: 'rest', pose: 'idle', label: 'wander', sec: () => rng.range(1, 3) }),
  ]));

  const gather = action({ name: 'gather at food', tick: (b) => {
    const food = b.get('food');
    if (!food) return FAILURE;
    label('gather');
    const rem = motor.moveTo(food, { speed: C.hopSpeed, slowRadius: 0.8, stopRadius: 0.6 });
    if (rem < 1.0) { motor.faceToward(food); motor.setPose('look'); }
    return RUNNING;
  } });

  const cluster = action({ name: 'join friends', tick: (b) => {
    const c = b.get('friendCenter');
    if (!c) return FAILURE;
    label('cluster');
    return motor.moveTo(c, { speed: C.hopSpeed, slowRadius: 1, stopRadius: 1.2 }) < 1.4 ? SUCCESS : RUNNING;
  } });

  const root = reactive('critter', [
    guard((b) => b.get('threat') || b.get('fleeing'), flee, 'threatened?'),
    guard((b) => b.get('returning') || b.get('homeDist') > homeRadius * 1.8, goHome, 'far from home?'),
    guard((b) => b.get('playerStill') > C.curiousStill && b.get('playerDist') < C.curiousDist && b.now() >= b.get('waryUntil'), curious, 'player calm & close?'),
    new UtilityNode('needs', needs, { wander: wanderAround, gather, cluster }, { interval: C.needsInterval, key: 'mood' }),
  ]);
  const tree = new BehaviorTree(root, bb);
  return makeBrain({ bb, tree, motor, sense, extra: { home, needs: () => needs.last } });
}

// ---------------------------------------------------------------------------------------------
// NPC (Mira)

export const NPC_TUNING = {
  walkSpeed: 1.3, runSpeed: 2.6, maxAccel: 6, turnRate: 4,
  lookRadius: 6, waveRadius: 5, waveExit: 5.8, waveCooldown: 25, waveTime: 1.8, arrivedWindow: 1.5,
  idleMin: 3, idleMax: 7,
};

/**
 * Mira's routine. Options: routine: [{ x, z, idle?: seconds, yaw?: radians }] (2-3 points; the
 * first is her terrace spot; defaults to her spawn position), tuning. The game sets
 * blackboard 'inConversation' (true/false) around dialogue; she then stands still facing the player.
 * If world.timeOfDay() (0..1, 0 = midnight) says night, she stays on the terrace.
 */
export function createNpcBrain(opts = {}) {
  const { body, world } = opts;
  const { rng } = setup(opts, `npc:${opts.name ?? 'mira'}`);
  const N = { ...NPC_TUNING, ...opts.tuning };
  const routine = (opts.routine?.length ? opts.routine : [{ x: body.position.x, z: body.position.z }]).map((p) => ({ ...p }));
  const bb = new Blackboard({ inConversation: false, routineIndex: 0, inRange: false, arrivedAt: -Infinity, waving: false, label: 'idle' });
  const motor = createMotor(body, world, {
    walkSpeed: N.walkSpeed, runSpeed: N.runSpeed, maxAccel: N.maxAccel, turnRate: N.turnRate,
    movePose: 'walk', runPose: 'walk', idlePose: 'idle', lookAhead: 0.6,
  });
  const playerSense = createPlayerSense(world, body);
  const label = (s) => bb.set('label', s);
  const P = () => bb.get('playerPos');
  const near = () => bb.get('playerDist') < N.lookRadius;
  const isNight = () => { const t = world.timeOfDay?.(); return typeof t === 'number' && (t < 0.23 || t > 0.85); };
  const point = () => routine[bb.get('routineIndex') % routine.length];

  function sense(b, dt) {
    playerSense(b, dt);
    const d = b.get('playerDist');
    if (!b.get('inRange') && d < N.waveRadius) { b.set('inRange', true); b.set('arrivedAt', b.now()); }
    else if (b.get('inRange') && d > N.waveExit) b.set('inRange', false);
  }

  const converse = action({ name: 'talk', tick: () => {
    motor.stop(); motor.faceToward(P()); motor.lookAt(P()); motor.setPose('idle'); label('talk');
    return RUNNING;
  } });

  const wave = action({
    name: 'wave',
    enter: (b) => { b.set('waving', true); b.set('arrivedAt', -Infinity); b.set('waveT', N.waveTime); },
    tick: (b, dt) => {
      motor.stop(); motor.faceToward(P()); motor.lookAt(P()); motor.setPose('wave'); label('wave');
      return b.add('waveT', -dt) <= 0 ? SUCCESS : RUNNING;
    },
    exit: (b) => b.set('waving', false),
  });

  const daily = repeat(Infinity, seq('routine', [
    succeed(limit(30, action({ name: 'walk to point', tick: () => {
      label('walk');
      return motor.moveTo(point(), { speed: N.walkSpeed, slowRadius: 1, stopRadius: 0.1 }) < 0.3 ? SUCCESS : RUNNING;
    } }))),
    action({
      name: 'pause',
      enter: (b) => b.set('pauseT', point().idle ?? rng.range(N.idleMin, N.idleMax)),
      tick: (b, dt) => {
        motor.stop();
        if (near()) { motor.faceToward(P()); motor.setPose('look'); label('look'); }
        else {
          const pt = point();
          if (pt.yaw != null) motor.faceToward(add(body.position, fromYaw(pt.yaw)));
          motor.setPose('idle');
          label('idle');
        }
        return b.add('pauseT', -dt) <= 0 ? SUCCESS : RUNNING;
      },
    }),
    action({ name: 'next point', tick: (b) => {
      b.set('routineIndex', isNight() ? 0 : (b.get('routineIndex') + 1) % routine.length);
      return SUCCESS;
    } }),
  ]));

  const root = reactive('mira', [
    guard((b) => !!b.get('inConversation'), converse, 'in conversation?'),
    guard((b) => b.get('waving') || b.now() - b.get('arrivedAt') < N.arrivedWindow, cooldown(N.waveCooldown, wave), 'player arrived?'),
    daily,
  ]);
  const tree = new BehaviorTree(root, bb);
  return makeBrain({
    bb, tree, motor, sense,
    after: () => { if (motor.look === undefined) motor.lookAt(near() ? P() : null); },
    extra: { routine },
  });
}
