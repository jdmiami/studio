// The quest engine: advances data-driven quests (src/game/data/quests.js) from game events, state
// checks and dialogue, keeps their progress in state.quests, and emits QUEST_STARTED / QUEST_STEP /
// QUEST_DONE, a toast and an immediate autosave request on every change.
import { EVENTS } from '../core/contracts.js';
import { t } from './strings.js';

export function createQuestEngine({ state, events, catalogue, rewards }) {
  const byId = Object.fromEntries(catalogue.map((q) => [q.id, q]));
  const get = () => state();
  const entry = (id) => get().quests[id];
  const textOf = (step) => (typeof step.text === 'function' ? step.text(get()) : step.text);

  function save(reason = 'quest') { events.emit(EVENTS.SAVE_REQUESTED, { reason }); }

  function start(id, vars = {}) {
    const q = byId[id];
    const s = get();
    if (!q) return false;
    const e = s.quests[id];
    if (e && (e.status === 'active' || (e.status === 'done' && !q.repeatable))) return false;
    s.quests[id] = { status: 'active', step: 0, counts: {}, vars, startedAt: Date.now() };
    events.emit(EVENTS.QUEST_STARTED, { questId: id });
    events.emit(EVENTS.TOAST, { text: t('quest.new', { title: q.title }), kind: 'quest' });
    settle(id);
    save();
    return true;
  }

  function complete(id) {
    const q = byId[id];
    const s = get();
    const e = s.quests[id];
    e.status = 'done';
    e.doneAt = Date.now();
    e.timesDone = (e.timesDone ?? 0) + 1;
    events.emit(EVENTS.QUEST_DONE, { questId: id });
    events.emit(EVENTS.TOAST, { text: t('quest.done', { title: q.title }), kind: 'quest' });
    q.reward?.(rewards);
    if (q.next) start(typeof q.next === 'function' ? q.next(s) : q.next);
    save();
  }

  function advance(id) {
    const q = byId[id];
    const e = entry(id);
    e.step += 1;
    e.counts = {};
    if (e.step >= q.steps.length) { complete(id); return; }
    events.emit(EVENTS.QUEST_STEP, { questId: id, step: q.steps[e.step].id });
    save();
    settle(id);
  }

  /** Advances through every step already satisfied by the state. */
  function settle(id) {
    const q = byId[id];
    const e = entry(id);
    if (!e || e.status !== 'active') return;
    const step = q.steps[e.step];
    if (step?.check && step.check(get())) advance(id);
  }

  function onEvent(type, payload) {
    for (const [id, e] of Object.entries(get().quests)) {
      if (e.status !== 'active' || !byId[id]) continue;
      const step = byId[id].steps[e.step];
      if (!step) continue;
      if (step.on?.event === type && (!step.on.match || step.on.match(payload, get()))) {
        e.counts[step.id] = (e.counts[step.id] ?? 0) + 1;
        if (e.counts[step.id] >= (step.count ?? 1)) { advance(id); continue; }
      }
      settle(id);
    }
  }

  // The step events, plus the events after which state checks may have turned true.
  const subscribed = new Set([
    ...catalogue.flatMap((q) => q.steps.map((s) => s.on?.event).filter(Boolean)),
    EVENTS.FIND_COLLECTED, EVENTS.DECOR_PLACED, EVENTS.DECOR_REMOVED, EVENTS.PETTED, EVENTS.DOG_FETCHED,
    EVENTS.CRITTER_SIGHTED, EVENTS.AREA_ENTERED,
  ]);
  const unsubscribe = [...subscribed].map((ev) => events.on(ev, (p) => onEvent(ev, p)));

  return {
    start,
    /** Completes the current step of a quest if its id matches (dialogue-driven steps). */
    completeStep(id, stepId) {
      const e = entry(id);
      if (!e || e.status !== 'active') return false;
      if (byId[id].steps[e.step]?.id !== stepId) return false;
      advance(id);
      return true;
    },
    status: (id) => entry(id)?.status ?? 'none',
    stepId: (id) => (entry(id)?.status === 'active' ? byId[id].steps[entry(id).step]?.id : null),
    /** Re-checks every active quest against the state (after loading a save). */
    resettle() { for (const id of Object.keys(get().quests)) settle(id); },
    /** The tracked quest for the HUD: the most recent active one. */
    tracked() {
      const active = Object.entries(get().quests).filter(([, e]) => e.status === 'active')
        .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0));
      if (!active.length) return null;
      const [id, e] = active[0];
      const q = byId[id];
      return { id, title: q.title, step: textOf(q.steps[e.step]), index: e.step, total: q.steps.length };
    },
    /** The journal's view: every started quest with its steps' text and done flags. */
    journal() {
      return Object.entries(get().quests).filter(([id]) => byId[id]).map(([id, e]) => {
        const q = byId[id];
        return {
          id, title: q.title, giver: q.giver, description: q.description, status: e.status,
          steps: q.steps.map((s, i) => ({ id: s.id, text: textOf(s), done: e.status === 'done' || i < e.step })),
        };
      });
    },
    dispose() { for (const off of unsubscribe) off(); },
    catalogueForUi() {
      return catalogue.map((q) => ({ id: q.id, title: q.title, giver: q.giver, description: q.description,
        steps: q.steps.map((s) => ({ id: s.id, text: textOf(s) })) }));
    },
  };
}
