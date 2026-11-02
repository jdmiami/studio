// The dialogue runner: walks a conversation graph (src/game/data/dialogues.js) one step at a time.
// A graph is { start, nodes: { id: node } }; a node is
//   { speaker, text: stringId | [stringId, ...] (a variant picked with the rng), vars?: ctx => {},
//     if?: ctx => bool (skip the node to `else` when false), do?: ctx => void (on entering),
//     choices?: [{ text: stringId, to, if?: ctx => bool, do?: ctx => void }], next?: id, end?: true }
// `next` may be a function of ctx returning an id (branching on state without a choice).
// The runner never touches the UI: `start()` and `choose(i)` return the next step to show,
// { speaker, text, choices: [text] } or null when the conversation ends. Conditions and effects
// are plain functions over the context the game passes (its state and helpers), so there is no
// expression language to parse.
import { t } from './strings.js';

export function createDialogueRunner(graph, ctx, { rng = Math.random, maxSteps = 200 } = {}) {
  let node = null;
  let shown = [];
  let steps = 0;

  const resolve = (id) => (typeof id === 'function' ? id(ctx) : id);

  /** Enters node `id`, skipping nodes whose `if` fails, running `do`; returns the step or null. */
  function enter(id) {
    while (id) {
      if (++steps > maxSteps) throw new Error('dialogue: too many steps (a loop without a line?)');
      const n = graph.nodes[id];
      if (!n) throw new Error(`dialogue: no node "${id}"`);
      if (n.if && !n.if(ctx)) { id = resolve(n.else); continue; }
      n.do?.(ctx);
      if (n.end) { node = null; return null; }
      if (!n.text) { id = resolve(n.next); continue; } // a pure branching/effect node
      node = n;
      const key = Array.isArray(n.text) ? n.text[Math.floor(rng() * n.text.length)] : n.text;
      const vars = { ...(ctx.vars?.() ?? {}), ...(n.vars?.(ctx) ?? {}) };
      shown = (n.choices ?? []).filter((c) => !c.if || c.if(ctx));
      return {
        speaker: n.speaker ?? '',
        text: t(key, vars),
        choices: shown.map((c) => t(c.text, vars)),
      };
    }
    node = null;
    return null;
  }

  return {
    start(id = graph.start) { steps = 0; return enter(resolve(id)); },
    /** Advances: with choices, `index` picks one; without, it continues to `next`. */
    choose(index = 0) {
      if (!node) return null;
      if (shown.length) {
        const c = shown[Math.max(0, Math.min(index, shown.length - 1))];
        c.do?.(ctx);
        return enter(resolve(c.to));
      }
      return enter(resolve(node.next));
    },
    get active() { return node !== null; },
  };
}

/** Every node id reachable from start, and any dangling references (for tests and authoring). */
export function lintGraph(graph, sampleCtx = {}) {
  const problems = [];
  const ids = Object.keys(graph.nodes);
  for (const [id, n] of Object.entries(graph.nodes)) {
    const targets = [];
    if (typeof n.next === 'string') targets.push(n.next);
    if (typeof n.else === 'string') targets.push(n.else);
    for (const c of n.choices ?? []) if (typeof c.to === 'string') targets.push(c.to);
    for (const to of targets) if (!ids.includes(to)) problems.push(`${id} -> missing "${to}"`);
    if (!n.end && !n.text && n.next === undefined) problems.push(`${id}: no text, no next, not an end`);
    if (n.text && !n.choices && n.next === undefined && !n.end) problems.push(`${id}: a line with no way on`);
  }
  if (!graph.nodes[graph.start]) problems.push(`start "${graph.start}" missing`);
  void sampleCtx;
  return problems;
}
