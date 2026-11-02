// Collecting finds: the collection book (kinds and counts, first-found time) and the carried
// inventory (what can be placed in the Nest). Sightings are catalogued but not carried.
import { ITEM_BY_ID } from '../data/items.js';

/** Records a find in the state; returns { first, count, item }. */
export function collect(state, itemId, now = Date.now()) {
  const item = ITEM_BY_ID[itemId];
  if (!item) throw new Error(`unknown item ${itemId}`);
  const entry = state.collection[itemId] ?? { count: 0, firstAt: now };
  const first = entry.count === 0;
  entry.count += 1;
  state.collection[itemId] = entry;
  if (!item.sighting) state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1;
  return { first, count: entry.count, item };
}

/** Takes one of an item from the inventory; false when there is none. */
export function take(state, itemId) {
  if (!(state.inventory[itemId] > 0)) return false;
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] === 0) delete state.inventory[itemId];
  return true;
}

/** Carried items that can be placed, in a stable order (most recent kinds last). */
export function placeable(state) {
  return Object.entries(state.inventory).filter(([id, n]) => n > 0 && ITEM_BY_ID[id] && !ITEM_BY_ID[id].sighting)
    .map(([id, n]) => ({ item: ITEM_BY_ID[id], count: n }));
}

/** Collection progress: kinds found / all catalogued kinds (story items count once found). */
export function progress(state, items) {
  const total = items.filter((i) => !i.story).length;
  const found = items.filter((i) => !i.story && state.collection[i.id]).length;
  return { found, total, ratio: total ? found / total : 0 };
}
