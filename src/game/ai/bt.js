// Behaviour-tree runtime. Engine-agnostic: nodes see only a Blackboard and dt, never three.js.
//
// Lifecycle (every node): the first tick of a run calls onEnter; a tick that returns SUCCESS or
// FAILURE closes the run and calls onExit(bb, status, false). A parent that abandons a RUNNING
// child calls child.abort(bb): the child aborts its own open children (onAbort), then gets
// onExit(bb, RUNNING, true). So exit always runs exactly once per enter.
//
// Composites with memory (Sequence, Selector) resume at the RUNNING child next tick; the reactive
// ones (ReactiveSelector, ReactiveSequence) re-check from the first child each tick and abort a
// running lower-priority child when a higher one takes over.
//
// Time: BehaviorTree.tick(dt) advances bb.time, which Cooldown reads (a cooldown keeps counting
// while its branch is not ticked, and survives aborts).

export const Status = Object.freeze({ SUCCESS: 'success', FAILURE: 'failure', RUNNING: 'running' });
const { SUCCESS, FAILURE, RUNNING } = Status;

/** Coerces a leaf's return: true -> SUCCESS, false -> FAILURE, undefined -> RUNNING. */
function toStatus(v) {
  if (v === SUCCESS || v === FAILURE || v === RUNNING) return v;
  if (v === true) return SUCCESS;
  if (v === false) return FAILURE;
  if (v === undefined || v === null) return RUNNING;
  throw new Error(`bt: invalid status ${String(v)}`);
}

const resolve = (v, bb) => (typeof v === 'function' ? v(bb) : v);

// ---------------------------------------------------------------------------------------------
// Blackboard

/**
 * Key/value memory shared by a tree's nodes. `scope(name)` returns a view whose keys are prefixed
 * with `name.` over the same storage (so `bb.scope('needs').get('energy')` is `bb.get('needs.energy')`).
 */
export class Blackboard {
  constructor(initial = {}, { store = new Map(), prefix = '', root = null } = {}) {
    this._store = store;
    this._prefix = prefix;
    this._root = root ?? this;
    if (!root) this.time = 0;
    for (const [k, v] of Object.entries(initial)) this.set(k, v);
  }
  _k(key) { return this._prefix + key; }
  get(key, fallback = undefined) { const k = this._k(key); return this._store.has(k) ? this._store.get(k) : fallback; }
  set(key, value) { this._store.set(this._k(key), value); return value; }
  has(key) { return this._store.has(this._k(key)); }
  delete(key) { return this._store.delete(this._k(key)); }
  /** Adds `delta` to a numeric key (missing = 0), optionally clamped to [min, max]. */
  add(key, delta, min = -Infinity, max = Infinity) {
    return this.set(key, Math.min(max, Math.max(min, this.get(key, 0) + delta)));
  }
  /** A prefixed view (`name.`) over the same storage; nests. */
  scope(name) { return new Blackboard({}, { store: this._store, prefix: `${this._prefix}${name}.`, root: this._root }); }
  /** Seconds since the tree started (advanced by BehaviorTree.tick). */
  now() { return this._root.time; }
  /** Plain-object snapshot of this view's keys (unprefixed), for debugging. */
  toJSON() {
    const out = {};
    for (const [k, v] of this._store) if (k.startsWith(this._prefix)) out[k.slice(this._prefix.length)] = v;
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Base node

export class Node {
  constructor(name = 'node') {
    this.name = name;
    this.children = [];
    this.open = false; // between enter and exit
    this.lastStatus = null;
  }
  tick(bb, dt) {
    if (!this.open) { this.open = true; this.onEnter(bb); }
    const s = toStatus(this.onTick(bb, dt));
    this.lastStatus = s;
    if (s !== RUNNING) { this.open = false; this.onExit(bb, s, false); }
    return s;
  }
  /** Abandons a running node: aborts its open descendants, then onExit(bb, RUNNING, true). */
  abort(bb) {
    if (!this.open) return;
    this.open = false;
    this.onAbort(bb);
    this.lastStatus = null;
    this.onExit(bb, RUNNING, true);
  }
  onEnter(_bb) {}
  onTick(_bb, _dt) { return SUCCESS; }
  onExit(_bb, _status, _aborted) {}
  /** Default: abort every open child. */
  onAbort(bb) { for (const c of this.children) c.abort(bb); }
}

// ---------------------------------------------------------------------------------------------
// Leaves

/**
 * Action({ name, enter(bb), tick(bb, dt) -> Status|bool|undefined, exit(bb, status, aborted), abort(bb) }).
 * `tick` returning undefined means RUNNING. A plain function is shorthand for { tick }.
 */
export class Action extends Node {
  constructor(spec, name) {
    const s = typeof spec === 'function' ? { tick: spec } : spec;
    super(name ?? s.name ?? 'action');
    this.spec = s;
  }
  onEnter(bb) { this.spec.enter?.(bb); }
  onTick(bb, dt) { return this.spec.tick ? this.spec.tick(bb, dt) : SUCCESS; }
  onAbort(bb) { this.spec.abort?.(bb); }
  onExit(bb, status, aborted) { this.spec.exit?.(bb, status, aborted); }
}

/** Condition leaf: SUCCESS when fn(bb) is truthy, else FAILURE. */
export class Condition extends Node {
  constructor(fn, name = 'condition?') { super(name); this.fn = fn; }
  onTick(bb) { return this.fn(bb) ? SUCCESS : FAILURE; }
}

/** RUNNING for `sec` seconds (a number or bb => number, drawn on enter), then SUCCESS. */
export class Wait extends Node {
  constructor(sec, name = 'wait') { super(name); this.sec = sec; this.elapsed = 0; this.duration = 0; }
  onEnter(bb) { this.elapsed = 0; this.duration = resolve(this.sec, bb); }
  onTick(_bb, dt) { this.elapsed += dt; return this.elapsed >= this.duration ? SUCCESS : RUNNING; }
}

// ---------------------------------------------------------------------------------------------
// Composites

class Composite extends Node {
  constructor(name, children) { super(name); this.children = children; this.index = 0; }
  onEnter() { this.index = 0; }
  onAbort(bb) { for (const c of this.children) c.abort(bb); this.index = 0; }
}

/** AND with memory: runs children in order, resumes at a RUNNING child, fails at the first failure. */
export class Sequence extends Composite {
  constructor(name, children) { super(name ?? 'sequence', children); }
  onTick(bb, dt) {
    while (this.index < this.children.length) {
      const s = this.children[this.index].tick(bb, dt);
      if (s === RUNNING) return RUNNING;
      if (s === FAILURE) { this.index = 0; return FAILURE; }
      this.index++;
    }
    this.index = 0;
    return SUCCESS;
  }
}

/** OR with memory: first child that does not fail wins; resumes at a RUNNING child. */
export class Selector extends Composite {
  constructor(name, children) { super(name ?? 'selector', children); }
  onTick(bb, dt) {
    while (this.index < this.children.length) {
      const s = this.children[this.index].tick(bb, dt);
      if (s === RUNNING) return RUNNING;
      if (s === SUCCESS) { this.index = 0; return SUCCESS; }
      this.index++;
    }
    this.index = 0;
    return FAILURE;
  }
}

/**
 * Priority selector that re-evaluates from the first child every tick. When a higher-priority
 * child succeeds or runs, the previously running lower child is aborted (its exit is called).
 */
export class ReactiveSelector extends Composite {
  constructor(name, children) { super(name ?? 'reactive-selector', children); this.running = -1; }
  onEnter() { this.running = -1; }
  onTick(bb, dt) {
    for (let i = 0; i < this.children.length; i++) {
      // Ticking is the only way to ask a child, so a taking-over child has already entered when the
      // displaced one is aborted: keep exits free of state a sibling's enter sets.
      const s = this.children[i].tick(bb, dt);
      if (s === FAILURE) continue;
      if (this.running !== -1 && this.running !== i) this.children[this.running].abort(bb);
      this.running = s === RUNNING ? i : -1;
      return s;
    }
    if (this.running !== -1) { this.children[this.running].abort(bb); this.running = -1; }
    return FAILURE;
  }
  onAbort(bb) { super.onAbort(bb); this.running = -1; }
}

/** Sequence that re-checks from the first child every tick (guards stay live); a failure aborts the running child. */
export class ReactiveSequence extends Composite {
  constructor(name, children) { super(name ?? 'reactive-sequence', children); this.running = -1; }
  onEnter() { this.running = -1; }
  onTick(bb, dt) {
    for (let i = 0; i < this.children.length; i++) {
      const s = this.children[i].tick(bb, dt);
      if (s === SUCCESS) continue;
      if (this.running !== -1 && this.running !== i) this.children[this.running].abort(bb);
      this.running = s === RUNNING ? i : -1;
      return s;
    }
    this.running = -1;
    return SUCCESS;
  }
  onAbort(bb) { super.onAbort(bb); this.running = -1; }
}

/**
 * Ticks every unfinished child each tick. policy = { success: 'all' | 'one', failure: 'one' | 'all' }
 * (default: succeed when all succeed, fail as soon as one fails). Still-running children are
 * aborted when the parallel completes.
 */
export class Parallel extends Composite {
  constructor(name, children, policy = {}) {
    super(name ?? 'parallel', children);
    this.policy = { success: policy.success ?? 'all', failure: policy.failure ?? 'one' };
    this.results = [];
  }
  onEnter() { this.results = this.children.map(() => RUNNING); }
  onTick(bb, dt) {
    let ok = 0, bad = 0;
    this.children.forEach((c, i) => {
      if (this.results[i] === RUNNING) this.results[i] = c.tick(bb, dt);
      if (this.results[i] === SUCCESS) ok++;
      else if (this.results[i] === FAILURE) bad++;
    });
    const n = this.children.length;
    const failed = this.policy.failure === 'one' ? bad > 0 : bad === n;
    const succeeded = this.policy.success === 'one' ? ok > 0 : ok === n;
    let s = RUNNING;
    if (failed) s = FAILURE;
    else if (succeeded) s = SUCCESS;
    else if (ok + bad === n) s = FAILURE; // everything finished without meeting the success policy
    if (s !== RUNNING) for (const c of this.children) c.abort(bb);
    return s;
  }
}

// ---------------------------------------------------------------------------------------------
// Decorators

class Decorator extends Node {
  constructor(name, child) { super(name); this.child = child; this.children = [child]; }
}

/** SUCCESS <-> FAILURE; RUNNING passes through. */
export class Inverter extends Decorator {
  constructor(child, name = 'invert') { super(name, child); }
  onTick(bb, dt) {
    const s = this.child.tick(bb, dt);
    return s === SUCCESS ? FAILURE : s === FAILURE ? SUCCESS : RUNNING;
  }
}

/** Always SUCCESS once the child finishes (RUNNING passes through). */
export class Succeeder extends Decorator {
  constructor(child, name = 'succeed') { super(name, child); }
  onTick(bb, dt) { return this.child.tick(bb, dt) === RUNNING ? RUNNING : SUCCESS; }
}

/**
 * Runs the child `n` times (Infinity = forever), one completion per tick at most (so an instant
 * child cannot spin the frame). Fails as soon as the child fails.
 */
export class Repeater extends Decorator {
  constructor(n, child, name = `repeat(${n})`) { super(name, child); this.n = n; this.count = 0; }
  onEnter() { this.count = 0; }
  onTick(bb, dt) {
    const s = this.child.tick(bb, dt);
    if (s === FAILURE) return FAILURE;
    if (s === SUCCESS && ++this.count >= this.n) return SUCCESS;
    return RUNNING;
  }
}

/**
 * After the child finishes (SUCCESS by default; `{ on: 'any' }` for either result) the decorator
 * FAILS without ticking the child for `sec` seconds of bb time. The ready time survives aborts.
 */
export class Cooldown extends Decorator {
  constructor(sec, child, { on = 'success', name = `cooldown(${typeof sec === 'number' ? sec : 'fn'})` } = {}) {
    super(name, child);
    this.sec = sec;
    this.on = on;
    this.readyAt = -Infinity;
  }
  ready(bb) { return bb.now() >= this.readyAt; }
  onTick(bb, dt) {
    if (!this.child.open && !this.ready(bb)) return FAILURE;
    const s = this.child.tick(bb, dt);
    if (s === SUCCESS || (s === FAILURE && this.on === 'any')) this.readyAt = bb.now() + resolve(this.sec, bb);
    return s;
  }
}

/** Aborts the child and FAILS if it is still RUNNING after `sec` seconds. */
export class TimeLimit extends Decorator {
  constructor(sec, child, name = `limit(${typeof sec === 'number' ? sec : 'fn'})`) { super(name, child); this.sec = sec; this.elapsed = 0; this.limit = 0; }
  onEnter(bb) { this.elapsed = 0; this.limit = resolve(this.sec, bb); }
  onTick(bb, dt) {
    this.elapsed += dt;
    const s = this.child.tick(bb, dt);
    if (s === RUNNING && this.elapsed >= this.limit) { this.child.abort(bb); return FAILURE; }
    return s;
  }
}

/**
 * Condition guard: each tick checks fn(bb); false -> aborts a running child and FAILS, true -> ticks
 * the child. Inside a ReactiveSelector this is a conditional-abort priority branch.
 */
export class Guard extends Decorator {
  constructor(fn, child, name = 'guard?') { super(name, child); this.fn = fn; }
  onTick(bb, dt) {
    if (!this.fn(bb)) { this.child.abort(bb); return FAILURE; }
    return this.child.tick(bb, dt);
  }
}

/** Runs enter(bb) / exit(bb, status, aborted) around a subtree's run (flags that span a sequence). */
export class Hook extends Decorator {
  constructor(child, { enter, exit, name = child.name } = {}) { super(name, child); this.enterFn = enter; this.exitFn = exit; }
  onEnter(bb) { this.enterFn?.(bb); }
  onTick(bb, dt) { return this.child.tick(bb, dt); }
  onExit(bb, status, aborted) { this.exitFn?.(bb, status, aborted); }
}

// ---------------------------------------------------------------------------------------------
// Runner + debugging

/** Owns a root and its blackboard; tick(dt) advances bb.time and ticks the root. */
export class BehaviorTree {
  constructor(root, bb = new Blackboard()) { this.root = root; this.blackboard = bb; this.status = null; }
  tick(dt) {
    this.blackboard._root.time += dt;
    this.status = this.root.tick(this.blackboard, dt);
    return this.status;
  }
  /** Names along the currently open (running) path, root first. */
  activePath() {
    const path = [];
    let n = this.root;
    while (n && n.open) {
      path.push(n.name);
      n = n.children.find((c) => c.open);
    }
    return path;
  }
  /** Indented outline of the tree, marking open nodes with '*'. */
  describe() { return describeNode(this.root); }
}

export function describeNode(node, depth = 0) {
  const line = `${'  '.repeat(depth)}${node.open ? '* ' : '- '}${node.name}`;
  return [line, ...node.children.map((c) => describeNode(c, depth + 1))].join('\n');
}

// Short factory aliases, so trees read as outlines.
export const bt = {
  seq: (name, children) => new Sequence(name, children),
  sel: (name, children) => new Selector(name, children),
  reactive: (name, children) => new ReactiveSelector(name, children),
  reactiveSeq: (name, children) => new ReactiveSequence(name, children),
  parallel: (name, children, policy) => new Parallel(name, children, policy),
  action: (spec, name) => new Action(spec, name),
  cond: (fn, name) => new Condition(fn, name),
  wait: (sec, name) => new Wait(sec, name),
  guard: (fn, child, name) => new Guard(fn, child, name),
  invert: (child) => new Inverter(child),
  succeed: (child) => new Succeeder(child),
  repeat: (n, child) => new Repeater(n, child),
  cooldown: (sec, child, opts) => new Cooldown(sec, child, opts),
  limit: (sec, child) => new TimeLimit(sec, child),
  hook: (child, hooks) => new Hook(child, hooks),
};
