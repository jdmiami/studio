// A play session: one save slot's state with its rules wired together (quests, dialogue, the
// collection, decorating, the felt lock), independent of rendering, so the whole game's logic runs
// and is tested in Node (tests/session.test.js). The game (src/game/main.js) feeds it what happens
// in the world (a find touched, a critter seen, a dialogue choice) and renders what it reports.
import { EVENTS } from '../core/contracts.js';
import { createRng } from '../core/rng.js';
import { ITEMS, ITEM_BY_ID, RARITY } from '../data/items.js';
import { QUESTS, wishItemFor } from '../data/quests.js';
import { MIRA, GATE } from '../data/dialogues.js';
import { createQuestEngine } from './quests.js';
import { createDialogueRunner } from './dialogue.js';
import { collect, placeable, progress, take } from './collection.js';
import { createFeltLock } from './puzzles.js';
import { canPlace, nearestDecor } from './decor.js';
import { t } from './strings.js';

export function createSession({ state, events, labels = () => ({}), now = Date.now }) {
  const rng = createRng(state.createdAt ?? 1).fork('session');
  const toast = (text, kind = 'info') => events.emit(EVENTS.TOAST, { text, kind });

  function give(itemId, { quiet = false, position = null } = {}) {
    const r = collect(state, itemId, now());
    const item = ITEM_BY_ID[itemId];
    events.emit(EVENTS.FIND_COLLECTED, { itemId, rarity: item.rarity, first: r.first, position });
    if (!quiet) toast(r.first ? t('find.new', { name: item.name }) : t('find.again', { name: item.name, count: r.count }), 'find');
    return r;
  }
  const rewards = {
    flag: (k, v) => { state.flags[k] = v; },
    friendship: (who, n) => { state.friendship[who] = (state.friendship[who] ?? 0) + n; },
    give: (id) => give(id),
    giveRandom: (rarity = 'uncommon') => {
      const pool = ITEMS.filter((i) => !i.story && !i.sighting && i.rarity === rarity);
      return give(rng.pick(pool).id);
    },
  };
  // Counters some quests read (subscribed before the quest engine, so its checks see them).
  const off = [
    events.on(EVENTS.PETTED, (p) => { if (p?.creature === 'dog') state.flags.pets = (state.flags.pets ?? 0) + 1; }),
    events.on(EVENTS.DOG_FETCHED, () => { state.flags.fetches = (state.flags.fetches ?? 0) + 1; }),
  ];
  const quests = createQuestEngine({ state: () => state, events, catalogue: QUESTS, rewards });
  const api = {
    ...rewards,
    has: (id) => (state.inventory[id] ?? 0) > 0,
    take: (id) => take(state, id),
    startQuest: (id, vars) => quests.start(id, vars),
    completeStep: (id, step) => quests.completeStep(id, step),
    wishItem: (n) => wishItemFor(n),
  };
  const ctx = { state, quests, api, result: null, vars: () => ({ player: 'friend', ...labels() }) };

  const lock = createFeltLock({ dials: state.flags.lockDials ?? [0, 3, 1] });

  return {
    state, events, quests, ctx,
    /** A world find touched (the world removes it). inTrip counts it toward the trip quest. */
    collectFind(itemId, { inTrip = false, position = null } = {}) {
      if (inTrip) state.flags.tripFinds = (state.flags.tripFinds ?? 0) + 1;
      const r = give(itemId, { position });
      quests.resettle();
      return r;
    },
    /** A critter seen up close: catalogued once per kind (the AI emits CRITTER_SIGHTED). */
    sight(itemId) {
      if (state.collection[itemId]) return false;
      collect(state, itemId, now());
      toast(t('find.sighting', { name: ITEM_BY_ID[itemId].name }), 'find');
      events.emit(EVENTS.FIND_COLLECTED, { itemId, rarity: ITEM_BY_ID[itemId].rarity, first: true, sighting: true });
      quests.resettle();
      return true;
    },
    /** A dialogue runner over Mira or a gate graph; ctx.result is reset for the run. */
    dialogue(graph) {
      ctx.result = null;
      return createDialogueRunner(graph, ctx, { rng: () => rng.float() });
    },
    graphs: { MIRA, GATE },
    lock,
    /** Pulls the lock's lever: 'open' | 'wrong' | 'hint'. */
    tryLock() {
      state.flags.lockDials = [...lock.state.dials];
      const r = lock.attempt();
      if (r === 'open') {
        state.flags.doorOpen = true;
        events.emit(EVENTS.PUZZLE_SOLVED, { puzzleId: 'great-door' });
        events.emit(EVENTS.DOOR_OPENED, {});
        toast(t('door.open'), 'quest');
      } else {
        toast(t(r === 'hint' ? 'door.hint' : 'door.wrong'));
      }
      return r;
    },
    /** Starts a trip: the seed counted and remembered. */
    beginTrip(seed, code, biome) {
      state.trips.taken += 1;
      state.trips.lastSeed = seed;
      if (!state.trips.visited.includes(code)) state.trips.visited.push(code);
      state.area = { kind: 'trip', seed, biome };
      events.emit(EVENTS.AREA_ENTERED, { area: 'trip', seed, biome });
      quests.resettle();
    },
    endTrip() {
      state.area = { kind: 'hub', seed: null, biome: null };
      events.emit(EVENTS.AREA_ENTERED, { area: 'hub' });
      quests.resettle();
    },
    // Decorating.
    placeable: () => placeable(state),
    progress: () => progress(state, ITEMS),
    canPlace: (spot, world) => canPlace(spot, { ...world, decor: state.decor }),
    placeDecor(itemId, position, yaw) {
      if (!take(state, itemId)) return null;
      const d = { id: `d${now().toString(36)}${Math.floor(rng.float() * 1e4)}`, itemId, position: [position.x, position.y, position.z], yaw };
      state.decor.push(d);
      events.emit(EVENTS.DECOR_PLACED, { decor: d });
      events.emit(EVENTS.SAVE_REQUESTED, { reason: 'decor' });
      return d;
    },
    pickUpDecor(point) {
      const d = nearestDecor(state.decor, point);
      if (!d) return null;
      state.decor.splice(state.decor.indexOf(d), 1);
      state.inventory[d.itemId] = (state.inventory[d.itemId] ?? 0) + 1;
      events.emit(EVENTS.DECOR_REMOVED, { decor: d });
      events.emit(EVENTS.SAVE_REQUESTED, { reason: 'decor' });
      return d;
    },
    rarityColor: (itemId) => RARITY[ITEM_BY_ID[itemId]?.rarity]?.color ?? '#fff',
    dispose() { quests.dispose(); for (const f of off) f(); },
  };
}
