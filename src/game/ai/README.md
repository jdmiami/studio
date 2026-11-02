# Creature AI (`src/game/ai/`)

The dog, the puffball critters and Mira all run on one small, engine-agnostic stack: there is no
three.js here, only plain `{x, z}` maths, so every brain runs and is tested in Node
(`tests/ai.test.js`).

```
decide   bt.js       behaviour tree: priorities, interrupts, multi-frame actions, blackboard memory
  └─ utility.js      utility scoring for the bottom "what do I feel like doing" layer (moods / needs)
move     steer.js    seek / arrive / flee / wander / separation / containment + a body integrator
brains   brains.js   createDogBrain, createCritterBrain, createNpcBrain
```

Each tick, a brain does the following:

1. It **senses** and writes the player's position, velocity, speed, distance and stillness time into the blackboard (plus any brain-specific facts).
2. It updates its **needs** (the dog's energy, affection and curiosity; the critter's hunger).
3. It **ticks the tree**. Actions only add steering forces to a per-tick *motor* and request a pose, a facing or a look target.
4. `motor.finish(dt)` **integrates once**. When nothing steered, it brakes. It adds containment (steers away from unwalkable ground ahead) and separation (critters). It refuses or slides any step onto ground where `world.walkable(x, z)` is false, and turns yaw toward the velocity at the turn rate. It calls `body.setPose` / `body.lookAt` **only when they change**.

`dt` is clamped to 0.1 s per tick.

## Interfaces

```js
const brain = createDogBrain({ rng, events, body, world, ...options });
brain.tick(dt);            // advance (call every frame)
brain.blackboard;          // Blackboard (the game may set flags, e.g. Mira's 'inConversation')
brain.state();             // short debug label: 'follow' | 'sit' | 'fetch:run' | 'flee' | 'wave' ...
brain.onInteract?.();      // dog only: a pet
brain.tree.describe();     // indented outline, '*' marks the running path
brain.debug();             // { label, path, pose, blackboard }
```

- `rng`: an Rng from `core/rng.js`; fork one per creature, e.g. `rng.fork('dog')`. If you leave it out, the brain uses a fixed seed.
- `events`: the bus from `core/events.js`. The brains emit `DOG_BARK {creature, reason}`, `DOG_FETCHED {creature, position}`, `PETTED {creature:'dog'}`, `CRITTER_SQUEAK {itemId, position}` and `CRITTER_SIGHTED {itemId}`.
- `body`: `{ position:{x,z}, yaw, velocity:{x,z}, setPose?(name), lookAt?(point|null) }`.
  - The brain mutates `position.x/z`, `velocity.x/z` and `yaw` in place, so a `THREE.Vector3` works as `position`. It never touches `y`: set it from `world.heightAt` when rendering.
  - Yaw follows three.js `rotation.y` for a model facing +Z: `yaw = atan2(dx, dz)`.
  - Poses: `idle walk run sit sleep wag hop wave look`.
- `world`:
  ```js
  {
    player(): { position:{x,z}, running:bool, velocity?:{x,z} }, // velocity is derived from motion if absent
    walkable(x, z): bool,
    heightAt(x, z),
    ballInFlight(): { position } | null,
    ballLanded():   { position } | null,  // a thrown ball resting on the ground
    takeBall(),                           // the dog picked it up; return false to refuse
    timeOfDay?(): 0..1,                   // 0 = midnight
    food?(): {x,z} | null,                // critter fallback for options.food
  }
  ```
  After the dog drops a ball, it ignores `ballLanded()` until it sees `ballInFlight()` again. So the game can leave the dropped ball lying at the dog's feet. A ball the dog cannot reach within 15 s is also ignored until the next throw.

## bt.js: behaviour-tree runtime

- **Status** is one of `SUCCESS`, `FAILURE` or `RUNNING`. Leaves may also return `true`, `false` or `undefined` (which means RUNNING).
- **Lifecycle:** the first tick of a run calls `onEnter`. A finishing tick calls `onExit(bb, status, false)`. When a parent abandons a running node, it calls `node.abort(bb)`: the node aborts its open children (`onAbort`), then gets `onExit(bb, RUNNING, true)`. Every enter gets exactly one exit.
- **Blackboard:** `get(key, fallback)`, `set`, `has`, `delete`, `add(key, delta, min, max)`, and `scope('needs')`, which returns a view whose keys are prefixed `needs.` over the same storage. `now()` returns the tree time.
- **Composites:**
  - `Sequence` and `Selector` have memory: they resume at the running child.
  - `ReactiveSelector` re-checks from the top every tick and aborts a running lower child when a higher one succeeds or runs.
  - `ReactiveSequence` re-checks its guards every tick.
  - `Parallel(name, children, { success: 'all'|'one', failure: 'one'|'all' })` aborts its still-running children when it finishes.
- **Decorators:**
  - `Inverter` and `Succeeder`.
  - `Repeater(n)`: at most one completion per tick; `Infinity` repeats forever.
  - `Cooldown(sec)`: uses blackboard time, so it keeps counting while not ticked and survives aborts. It starts on SUCCESS, or on any result with `{ on: 'any' }`.
  - `TimeLimit(sec)`: aborts the child and fails.
  - `Guard(fn, child)`: the condition guard. A false check aborts the running child.
  - `Hook(child, {enter, exit})`: flags that span a subtree.
- **Leaves:** `Action({ enter, tick, exit, abort })`, `Condition(fn)` and `Wait(sec | bb => sec)`.
- **Runner:** `BehaviorTree(root, bb).tick(dt)` advances `bb.time`. It also has `activePath()` and `describe()`.
- The `bt` object holds short factories (`bt.seq`, `bt.reactive`, `bt.guard`, ...) so trees read as outlines.

A `ReactiveSelector` can only ask a child by ticking it, so a taking-over branch has already entered when the displaced branch's exit runs. Exits must therefore only clear their own flags.

## utility.js: utility layer

- **`curves`:** `linear(m, b)`, `quadratic(k)`, `exponential(k)`, `logistic(k, mid)` (also available as `sigmoid`), `inverse(curve?)`, `smoothstep(a, b)`, `step(t)` and `constant(c)`.
- **`Consideration({ name, input(ctx), min, max, curve, clamp })`:** normalizes the raw value from `[min, max]` to 0..1, applies the curve, then clamps to 0..1.
- **`Option({ name, considerations, weight, momentum })`:**
  - score = `weight × compensate(Π considerations)`. A 0 vetoes the option. Compensation (Dave Mark's) stops many factors from dragging every score toward 0.
  - The current choice scores `× (1 + momentum)`. This hysteresis stops near-ties from flapping.
- **`UtilityEvaluator(options).evaluate(ctx)`:** returns `{ best, score, scores, details }`, where `details[option].parts` holds the per-consideration scores for debug overlays.
- **`UtilityNode(name, evaluator, { option: node }, { interval, key })`:** the BT leaf that bridges to the utility layer. It re-scores every `interval` seconds and on a change aborts the old child and runs the new one. It writes the winner to `bb[key]` and the scores to `bb[key + 'Scores']`.

## steer.js: steering

- **Steering functions:** `seek`, `arrive(pos, vel, target, maxSpeed, slowRadius, stopRadius)`, `flee(..., panicRadius)`, `wander(state, ...)` (a jittered circle ahead; make the state with `createWander(rng)`), `separation(pos, neighbours, radius)`, and `containment(pos, vel, walkable, ...)` (feelers that turn away from unwalkable ground).
- **`pickWalkablePoint(rng, center, maxR, walkable, { minR })`:** chooses wander targets on walkable ground.
- **`integrate(body, force, dt, { maxSpeed, maxAccel, turnRate, walkable, face })`:** applies the force under the limits. When a step is blocked, it slides along the free axis or stops.
- **`createMotor(body, world, params)`:** the per-tick accumulator the brains use.

## Dog: `createDogBrain`

Options:

- `energy`, `affection`, `curiosity`: the starting needs, each 0..1.
- `tuning`: overrides `DOG_TUNING`. For example `followDist` is 2.5, `followStart` is 3.6, `runSpeed` is 6.8, `petTime` is 3.2 s, `awayDist` is 15 m and `awayTime` is 8 s.

```
ReactiveSelector dog
  Guard petted? (petTimer > 0)              <- onInteract(): petTimer = 3.2 s, affection +0.2, PETTED, 30% DOG_BARK
    Action being petted                     stop, face + look at player; 'sit' for 0.5 s then 'wag'
  Guard ball? (fetching | hasBall | ballLanded | ballInFlight)
    Hook fetch (fetching flag; a failed fetch ignores that ball until the next throw)
      Sequence fetch
        Action watch ball                   run under the ball in flight; SUCCESS once landed / carried
        TimeLimit 15s > Action run to ball  arrive, 'run'; within 0.7 m: world.takeBall(), hasBall
        TimeLimit 25s > Action bring back   to 1.6 m of the player
        Action drop ball                    DOG_FETCHED, 50% DOG_BARK, affection +0.12, 'wag' 1.2 s
  Guard player back? (greetPending | greeting)   <- set when player was >15 m away for 8 s and returns within 9 m
    Hook greet
      Sequence greet
        Action happy bark                   DOG_BARK {reason:'greet'}, 'wag'
        Succeeder > TimeLimit 8s > Action run to player
        Action wag hello (1.5 s)
  UtilityNode mood (every 0.5 s, momentum)
    follow: Action follow player            hysteresis: go when > 3.6 m, stop at ~2.5 m;
                                            stopped: 'sit' once the player is still > 1.2 s, else 'idle'
    sniff:  Repeater(inf) > Sequence        pick a walkable spot 1.5-5 m from the player,
              pick spot, Succeeder > TimeLimit 6s > trot to spot, sniff ground ('look', 1.5-3 s)
    nap:    Sequence                        'sit' 0.8 s, then 'sleep' (sleeping flag) until the mood changes
```

Needs per second:

- **Energy:** −(0.0015 + 0.005 × speed / runSpeed) while awake, +0.03 while asleep.
- **Affection:** −0.004.
- **Curiosity:** +0.025, or −0.045 while sniffing.

| Mood | Considerations (each 0..1) | Notes |
|---|---|---|
| follow | affection, linear 0.5→1; distance to player over 0..15 m, linear 0.4→1; energy, logistic(12, 0.12) | the default, being with the player |
| sniff | curiosity, quadratic; player resting time over 0..6 s, smoothstep; near player over 0..12 m, inverse; energy, logistic(10, 0.3) | momentum 0.3; wins after about 25 s of the player standing still |
| nap | tiredness (1 − energy, +0.35 while asleep), logistic(12, 0.7); calm (0.3 if the player runs within 6 m) | weight 1.2. The asleep bonus is inertia: falls asleep near 0.3 energy, wakes near 0.7 |

## Critter: `createCritterBrain`

Options:

- `itemId`: used in the events.
- `id`: the dedupe key for the sighting; defaults to `itemId`.
- `home`: defaults to the spawn position.
- `homeRadius`: 4.
- `food`: a point, or a function returning `{x,z}` or null.
- `neighbours()`: the other critters' bodies or positions. The brain filters out its own body.
- `sighted`: a shared `Set`. By default there is one per event bus, so several critters of one kind report once.
- `tuning`: overrides `CRITTER_TUNING`.

```
ReactiveSelector critter
  Guard threatened? (player < 3 m and running or > 3 m/s) | fleeing
    Hook (fleeing flag; on exit: wary for 3 s)
      TimeLimit 6s > Action flee            enter: CRITTER_SQUEAK (once per flee); flee at 5 m/s ('run')
                                            until > 7 m away for 0.5 s
  Guard far from home? (> 1.8 x homeRadius) | returning
    Hook > Action hop home                  until within 0.5 x homeRadius
  Guard player calm & close? (still > 1.2 s, < 5 m, not wary)
    Action curious approach                 enter: CRITTER_SIGHTED {itemId} once per id;
                                            approach to 1.3 m (leashed to home), 'look' when there
  UtilityNode needs (every 0.75 s)
    wander:  Repeater(inf) > Sequence       walkable spot in the home radius, hop to it ('hop'), rest 1-3 s
    gather:  Action gather at food          arrive near the food, nibble ('look'); hunger falls while there
    cluster: Action join friends            move toward the friends' centroid until within ~1.4 m
  (every move adds separation from neighbours, radius 0.9 m)
```

| Need | Considerations | Notes |
|---|---|---|
| wander | constant 0.4 | the base desire |
| gather | food exists (step); hunger, logistic(8, 0.45); food distance from home over 0..3 × homeRadius, inverse | hunger +0.015/s, −0.12/s while eating |
| cluster | has friends within 10 m (step); distance to the friends' centroid over 0..6 m, logistic(8, 0.4) | weight 0.6, so only a far-off friend draws it |

## NPC (Mira): `createNpcBrain`

Options:

- `routine`: 2-3 points, each `{ x, z, idle?: s, yaw? }`. The first is her terrace spot. Defaults to the spawn position.
- `tuning`: overrides `NPC_TUNING`. For example `lookRadius` is 6, `waveRadius` is 5 (with exit hysteresis at 5.8) and `waveCooldown` is 25 s.

The game sets `brain.blackboard.set('inConversation', true | false)` around dialogue.

```
ReactiveSelector mira
  Guard in conversation? (bb.inConversation)
    Action talk                             stop, turn to face and look at the player
  Guard player arrived? (crossed into 5 m within the last 1.5 s) | waving
    Cooldown 25s > Action wave              'wave' 1.8 s facing the player (fails while cooling -> routine)
  Repeater(inf) > Sequence routine
    Succeeder > TimeLimit 30s > Action walk to point   'walk' at 1.3 m/s
    Action pause                            idle s (or 3-7 s): 'look' and face the player if within 6 m,
                                            else 'idle' facing the point's yaw
    Action next point                       (at night, timeOfDay < 0.23 or > 0.85: stay on the terrace)
  (always: body.lookAt(player) within 6 m, lookAt(null) outside)
```

## Wiring sketch (game side)

```js
const dog = createDogBrain({ rng: tripRng.fork('dog'), events, body: dogBody, world });
// each frame
dog.tick(dt);
dogMesh.position.set(dogBody.position.x, world.heightAt(dogBody.position.x, dogBody.position.z), dogBody.position.z);
dogMesh.rotation.y = dogBody.yaw;
// interact key while aiming at the dog
dog.onInteract();
```
