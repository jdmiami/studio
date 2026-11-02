// Utility AI: score every option with normalized 0..1 response curves and pick the best.
//
//   raw fact --(input fn, normalized to 0..1 by [min, max])--> curve --clamp--> consideration score
//   option score = weight * compensate(product of considerations)   (a 0 still vetoes)
//   the option already chosen gets a momentum bonus (score * (1 + momentum)) so near-ties do not flap.
//
// UtilityNode plugs an evaluator into a behaviour tree: it re-scores every `interval` seconds and
// ticks the child mapped to the winning option, aborting the previous one on a change.

import { Node, Status } from './bt.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

/** Response curves: x in 0..1 -> y (Consideration clamps the result to 0..1). */
export const curves = {
  /** y = m*x + b */
  linear: (m = 1, b = 0) => (x) => m * x + b,
  /** y = x^k (k > 1 eases in, k < 1 eases out) */
  quadratic: (k = 2) => (x) => Math.pow(Math.max(0, x), k),
  /** normalized exponential: 0 -> 0, 1 -> 1, steepness k (k < 0 bows the other way) */
  exponential: (k = 3) => (x) => (Math.abs(k) < 1e-6 ? x : (Math.exp(k * x) - 1) / (Math.exp(k) - 1)),
  /** S-curve centred on `mid` with slope k */
  logistic: (k = 10, mid = 0.5) => (x) => 1 / (1 + Math.exp(-k * (x - mid))),
  /** y = 1 - x, or 1 - curve(x) when given a curve */
  inverse: (curve = null) => (x) => 1 - (curve ? curve(x) : x),
  /** smooth 0 -> 1 between edges a and b */
  smoothstep: (a = 0, b = 1) => (x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); },
  /** 0 below t, 1 at or above */
  step: (t = 0.5) => (x) => (x >= t ? 1 : 0),
  /** a constant (for a base desire) */
  constant: (c = 0.5) => () => c,
};
curves.sigmoid = curves.logistic;

/** Maps v from [min, max] to 0..1 (clamped). */
export function normalize(v, min = 0, max = 1) {
  return max === min ? (v >= max ? 1 : 0) : clamp01((v - min) / (max - min));
}

/**
 * One factor of an option: input(ctx) -> raw value, normalized from [min, max] to 0..1, shaped by
 * the curve, clamped to 0..1 (clamp: false leaves the curve output raw — only for debugging).
 */
export class Consideration {
  constructor({ name = 'consideration', input, curve = curves.linear(), min = 0, max = 1, clamp = true }) {
    if (typeof input !== 'function') throw new Error(`utility: consideration ${name} needs an input fn`);
    Object.assign(this, { name, input, curve, min, max, clamp });
  }
  score(ctx) {
    const y = this.curve(normalize(this.input(ctx), this.min, this.max));
    return this.clamp ? clamp01(y) : y;
  }
}

/** Dave Mark's compensation: offsets the shrinkage of multiplying n factors in 0..1. */
export function compensate(product, n) {
  if (n <= 1) return product;
  const mod = 1 - 1 / n;
  return product + (1 - product) * mod * product;
}

/** A choice: weight * compensated product of its considerations, + momentum while chosen. */
export class Option {
  constructor({ name, considerations = [], weight = 1, momentum = 0.15 }) {
    this.name = name;
    this.considerations = considerations.map((c) => (c instanceof Consideration ? c : new Consideration(c)));
    this.weight = weight;
    this.momentum = momentum;
  }
  /** Returns { score, base, parts: { [consideration]: 0..1 } }. */
  evaluate(ctx, isCurrent = false) {
    const parts = {};
    let product = 1;
    for (const c of this.considerations) {
      const s = c.score(ctx);
      parts[c.name] = s;
      product *= s;
      if (product === 0) break; // vetoed
    }
    const base = this.weight * compensate(product, this.considerations.length);
    return { score: isCurrent ? base * (1 + this.momentum) : base, base, parts };
  }
}

/**
 * Scores options and keeps the current choice. evaluate(ctx) -> { best, score, scores, details }
 * where scores is { [option]: final score } (momentum included), for debug overlays.
 */
export class UtilityEvaluator {
  constructor(options, { minScore = 0 } = {}) {
    this.options = options.map((o) => (o instanceof Option ? o : new Option(o)));
    this.minScore = minScore;
    this.current = null;
    this.last = null;
  }
  evaluate(ctx) {
    let best = null, bestScore = -Infinity;
    const scores = {}, details = {};
    for (const o of this.options) {
      const r = o.evaluate(ctx, o.name === this.current);
      scores[o.name] = r.score;
      details[o.name] = r;
      if (r.score > bestScore) { best = o.name; bestScore = r.score; } // ties keep list order
    }
    if (bestScore <= this.minScore) best = null;
    this.current = best;
    this.last = { best, score: bestScore, scores, details };
    return this.last;
  }
  reset() { this.current = null; this.last = null; }
}

/**
 * BT node: picks a child by utility. children = { [optionName]: Node }. Re-scores on enter and every
 * `interval` seconds; switching aborts the old child; a child that finishes (either way) triggers a
 * re-score next tick, so the layer stays RUNNING. Fails only when no option scores above minScore
 * or the winner has no child. The winner is written to bb[`key`] (default 'utility').
 */
export class UtilityNode extends Node {
  constructor(name, evaluator, children, { interval = 0.5, key = 'utility', context = (bb) => bb } = {}) {
    super(name);
    this.evaluator = evaluator;
    this.map = children;
    this.children = Object.values(children);
    this.interval = interval;
    this.key = key;
    this.context = context;
    this.nextAt = -Infinity;
    this.active = null;
  }
  onEnter() { this.nextAt = -Infinity; }
  onTick(bb, dt) {
    if (bb.now() >= this.nextAt) {
      this.nextAt = bb.now() + this.interval;
      const r = this.evaluator.evaluate(this.context(bb));
      bb.set(this.key, r.best);
      bb.set(`${this.key}Scores`, r.scores);
      if (r.best !== this.active) {
        if (this.active && this.map[this.active]) this.map[this.active].abort(bb);
        this.active = r.best;
      }
    }
    const child = this.active && this.map[this.active];
    if (!child) return Status.FAILURE;
    const s = child.tick(bb, dt);
    if (s !== Status.RUNNING) this.nextAt = -Infinity; // finished either way: choose again next tick
    return Status.RUNNING; // the mood layer itself keeps running
  }
  onAbort(bb) { super.onAbort(bb); this.active = null; this.evaluator.current = null; }
}
