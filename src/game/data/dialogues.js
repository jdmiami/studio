// Conversation graphs (run by src/game/play/dialogue.js). Node `if`/`do`/`next` functions receive
// the dialogue context the game builds: { state, quests, api, vars() } where api has flag, give,
// take, has, friendship, startQuest, completeStep, wishItem.
import { ITEM_BY_ID } from './items.js';

const q = (ctx, id) => ctx.quests.status(id);
const at = (ctx, id) => ctx.quests.stepId(id);

/** Mira: what she says depends on where the story is. */
export const MIRA = {
  start: 'root',
  nodes: {
    root: {
      next: (ctx) => {
        const s = ctx.state;
        if (!s.flags.metMira) return 'first';
        if (q(ctx, 'welcome') === 'active') return at(ctx, 'welcome') === 'report' ? 'welcomeDone' : 'welcomeProgress';
        if (q(ctx, 'felt-lock') === 'active') return 'lockProgress';
        if (q(ctx, 'first-trip') === 'active') return at(ctx, 'first-trip') === 'report' ? 'tripDone' : 'tripProgress';
        if (q(ctx, 'nest-maker') === 'active') return 'nestProgress';
        if (q(ctx, 'curator') === 'active') return at(ctx, 'curator') === 'report' ? 'curatorDone' : 'curatorProgress';
        if (q(ctx, 'wish') === 'active') return ctx.api.has(s.quests.wish.vars.itemId) ? 'wishDone' : 'wishProgress';
        if (q(ctx, 'first-trip') === 'done' && (s.trips.taken ?? 0) > (s.flags.wishesAsked ?? 0)) return 'wishAsk';
        return 'idle';
      },
    },
    first: { speaker: 'Mira', text: 'mira.hello.first', do: (ctx) => ctx.api.flag('metMira', true), next: 'ask' },
    ask: {
      speaker: 'Mira', text: 'mira.welcome.ask',
      choices: [
        { text: 'mira.choice.sure', to: 'task' },
        { text: 'mira.choice.what', to: 'place' },
        { text: 'mira.choice.joke', to: 'joke', do: (ctx) => ctx.api.friendship('mira', 1) },
      ],
    },
    place: { speaker: 'Mira', text: 'mira.place', next: 'ask2' },
    ask2: {
      speaker: 'Mira', text: 'mira.welcome.ask',
      choices: [{ text: 'mira.choice.sure', to: 'task' }, { text: 'mira.choice.joke', to: 'joke', do: (ctx) => ctx.api.friendship('mira', 1) }],
    },
    joke: { speaker: 'Mira', text: 'mira.joke', next: 'task' },
    task: {
      speaker: 'Mira', text: 'mira.welcome.task',
      do: (ctx) => { ctx.api.startQuest('welcome'); ctx.api.completeStep('welcome', 'talk'); },
      choices: [{ text: 'mira.choice.ok', to: 'end' }],
    },
    welcomeProgress: { speaker: 'Mira', text: 'mira.welcome.progress', next: 'end' },
    welcomeDone: { speaker: 'Mira', text: 'mira.welcome.done', next: 'note' },
    note: { speaker: 'Mira', text: 'mira.note', do: (ctx) => ctx.api.completeStep('welcome', 'report'), choices: [{ text: 'mira.choice.ok', to: 'end' }] },
    lockProgress: { speaker: 'Mira', text: 'mira.lock.progress', next: 'end' },
    tripProgress: { speaker: 'Mira', text: 'mira.trip.progress', next: 'end' },
    tripDone: {
      speaker: 'Mira', text: 'mira.trip.done', do: (ctx) => ctx.api.completeStep('first-trip', 'report'),
      choices: [{ text: 'mira.choice.ok', to: 'end' }],
    },
    nestProgress: { speaker: 'Mira', text: 'mira.nest.progress', next: 'end' },
    curatorProgress: {
      speaker: 'Mira', text: 'mira.curator.progress', vars: (ctx) => ({ count: Object.keys(ctx.state.collection).length }), next: 'end',
    },
    curatorDone: { speaker: 'Mira', text: 'mira.curator.done', do: (ctx) => ctx.api.completeStep('curator', 'report'), next: 'end' },
    wishAsk: {
      speaker: 'Mira', text: 'mira.wish.ask',
      do: (ctx) => {
        const s = ctx.state;
        s.flags.wishesAsked = (s.flags.wishesAsked ?? 0) + 1;
        ctx.api.startQuest('wish', { itemId: ctx.api.wishItem(s.flags.wishesAsked) });
      },
      vars: (ctx) => ({ item: ITEM_BY_ID[ctx.api.wishItem((ctx.state.flags.wishesAsked ?? 0) + 1)]?.name }),
      choices: [{ text: 'mira.choice.ok', to: 'end' }],
    },
    wishProgress: { speaker: 'Mira', text: 'mira.wish.progress', vars: (ctx) => ({ item: ITEM_BY_ID[ctx.state.quests.wish.vars.itemId]?.name }), next: 'end' },
    wishDone: {
      speaker: 'Mira', text: 'mira.wish.done',
      vars: (ctx) => ({ item: ITEM_BY_ID[ctx.state.quests.wish.vars.itemId]?.name }),
      do: (ctx) => { ctx.api.take(ctx.state.quests.wish.vars.itemId); ctx.api.completeStep('wish', 'bring'); },
      next: 'end',
    },
    idle: { speaker: 'Mira', text: ['mira.idle', 'mira.idle.2', 'mira.idle.3'], choices: [{ text: 'mira.choice.bye', to: 'end' }] },
    end: { end: true },
  },
};

/** The Wander Gate: a confirmation. */
export const GATE = (toHub) => ({
  start: 'ask',
  nodes: {
    ask: {
      speaker: 'Wander Gate', text: toHub ? 'gate.leave' : 'gate.enter',
      choices: [
        { text: 'mira.choice.ok', to: 'go', do: (ctx) => { ctx.result = 'go'; } },
        { text: 'mira.choice.bye', to: 'end' },
      ],
    },
    go: { end: true },
    end: { end: true },
  },
});
