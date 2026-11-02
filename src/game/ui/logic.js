// Pure UI logic (no DOM): focus navigation, time and date formatting, collection progress, slot
// summaries, quest views and control stepping. Everything here is unit-tested in tests/ui.test.js.

const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------
// Time & dates

/** Play time in seconds → "h:mm" (0:05, 12:30). Negative / missing → "0:00". */
export function formatPlayTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${pad2(m)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A timestamp → "12 Oct 2026" (locale-free so tests and screenshots are stable). */
export function formatDate(ts) {
  if (ts == null || !Number.isFinite(Number(ts))) return '';
  const d = new Date(Number(ts));
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A timestamp relative to now → "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
export function formatRelativeTime(ts, now = Date.now()) {
  if (ts == null || !Number.isFinite(Number(ts))) return 'never';
  const diff = Math.max(0, (now - Number(ts)) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 90) return '1 min ago';
  const min = Math.round(diff / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(diff / 3600);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(ts);
}

// ---------------------------------------------------------------------------------------------
// Collection

/**
 * Progress through the collection book.
 * @param collection state.collection (itemId -> { count, firstAt })
 * @param items ITEMS
 * @param filter { sighting?: boolean, story?: boolean } — undefined = don't filter on that key
 */
export function collectionProgress(collection = {}, items = [], filter = {}) {
  const pool = items.filter((i) => (filter.sighting === undefined || !!i.sighting === filter.sighting)
    && (filter.story === undefined || !!i.story === filter.story));
  const found = pool.filter((i) => (collection[i.id]?.count ?? 0) > 0 || collection[i.id]?.firstAt != null).length;
  const total = pool.length;
  const ratio = total ? found / total : 0;
  return { found, total, ratio, percent: Math.round(ratio * 100), label: `${found} / ${total}` };
}

/** The book's entries for one page, in catalogue order, with their found status. */
export function collectionEntries(collection = {}, items = [], { sighting = false } = {}) {
  return items.filter((i) => !!i.sighting === sighting).map((item) => {
    const rec = collection[item.id];
    const found = !!rec && ((rec.count ?? 0) > 0 || rec.firstAt != null);
    return { item, found, count: found ? rec.count ?? 1 : 0, firstAt: found ? rec.firstAt ?? null : null };
  });
}

// ---------------------------------------------------------------------------------------------
// Save slots

const BIOME_NAMES = { meadow: 'Meadow Hills', grotto: 'Rose Grotto', lake: 'Blue Lake' };

/** state.area → a place name for slot cards and the pause screen. */
export function locationLabel(area) {
  if (!area) return 'The Nest';
  if (typeof area === 'string') return area;
  if (area.kind === 'trip') return BIOME_NAMES[area.biome] ? `Trip · ${BIOME_NAMES[area.biome]}` : 'On a trip';
  return 'The Nest';
}

const SLOT_NAMES = ['Cosy Nest', 'Mossy Nest', 'Pebble Nest', 'Button Nest'];
export function defaultSlotName(slot) {
  const n = Number(slot);
  return SLOT_NAMES[(Number.isFinite(n) && n > 0 ? n - 1 : 0) % SLOT_NAMES.length];
}

/**
 * Normalises one entry of actions.listSlots() into what a slot card shows. Accepts either a summary
 * ({ slot, name, playTime, location, finds, total, questsDone, savedAt|updatedAt, empty }) or
 * { slot, state } with a full save state (finds and quests are then counted from it).
 */
export function summarizeSlot(raw, items = []) {
  if (!raw) return { slot: null, empty: true };
  const st = raw.state ?? null;
  const slot = raw.slot ?? st?.slot ?? null;
  const auto = slot === 'auto' || slot === 'autosave' || !!raw.auto;
  const empty = !!raw.empty || (!st && raw.name == null && raw.playTime == null && raw.updatedAt == null && raw.savedAt == null);
  if (empty) return { slot, auto, empty: true };
  const prog = st ? collectionProgress(st.collection, items) : null;
  const questsDone = raw.questsDone ?? (st ? Object.values(st.quests ?? {}).filter((q) => q.status === 'done').length : 0);
  const savedAt = raw.savedAt ?? raw.updatedAt ?? st?.updatedAt ?? null;
  return {
    slot, auto, empty: false,
    name: raw.name ?? st?.name ?? defaultSlotName(slot),
    playTime: raw.playTime ?? st?.playTime ?? 0,
    location: raw.location ?? locationLabel(raw.area ?? st?.area),
    finds: raw.finds ?? prog?.found ?? 0,
    total: raw.total ?? prog?.total ?? items.length,
    questsDone,
    savedAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Quests

const prettyId = (id) => String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Joins state.quests (questId -> { status, step }) with the quest catalogue
 * ([{ id, title, giver, description, steps: [{ id, text }] }]). `step` may be an index or a step id;
 * steps before it are done, it is the current one. Returns { active, done } in catalogue order
 * (unknown quests last).
 */
export function questView(quests = {}, catalogue = []) {
  const order = new Map(catalogue.map((q, i) => [q.id, i]));
  const byId = new Map(catalogue.map((q) => [q.id, q]));
  const out = { active: [], done: [] };
  const ids = Object.keys(quests).sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  for (const id of ids) {
    const q = quests[id];
    if (!q || (q.status !== 'active' && q.status !== 'done')) continue;
    const def = byId.get(id) ?? { id, title: prettyId(id), steps: [] };
    const steps = def.steps ?? [];
    let at = typeof q.step === 'number' ? q.step : steps.findIndex((s) => s.id === q.step);
    if (at < 0) at = 0;
    const isDone = q.status === 'done';
    const view = {
      id, title: def.title ?? prettyId(id), giver: def.giver ?? '', description: def.description ?? '',
      status: q.status,
      steps: steps.map((s, i) => ({ id: s.id, text: s.text, done: isDone || i < at, current: !isDone && i === at })),
    };
    view.doneCount = view.steps.filter((s) => s.done).length;
    view.progress = `${view.doneCount}/${steps.length}`;
    out[isDone ? 'done' : 'active'].push(view);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Focus navigation

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** Gap between two 1-D intervals (0 when they overlap). */
function gap(a0, alen, b0, blen) {
  if (b0 > a0 + alen) return b0 - (a0 + alen);
  if (a0 > b0 + blen) return a0 - (b0 + blen);
  return 0;
}

/** Best rect strictly in direction `dir` from rects[index] among those passing `allow(i)`; -1 if none. */
function bestInDir(rects, index, dir, allow) {
  const [dx, dy] = DIRS[dir];
  const a = rects[index];
  const ac = center(a);
  const horizontal = dx !== 0;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === index || !allow(i)) continue;
    const b = rects[i];
    const bc = center(b);
    // Must lie in the direction: centre further along, and its far edge beyond ours.
    // Tolerance (a quarter of the smaller size) so a focused, lifted / scaled control doesn't make
    // its own row look like it lies below it.
    const tol = Math.max(1, (horizontal ? Math.min(a.w, b.w) : Math.min(a.h, b.h)) / 4);
    const along = horizontal ? (bc.x - ac.x) * dx : (bc.y - ac.y) * dy;
    if (along <= tol) continue;
    const edge = horizontal
      ? (dx > 0 ? b.x + b.w - (a.x + a.w) : a.x - b.x)
      : (dy > 0 ? b.y + b.h - (a.y + a.h) : a.y - b.y);
    if (edge <= 1) continue;
    const distEdge = horizontal
      ? Math.max(0, dx > 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w))
      : Math.max(0, dy > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h));
    const orthGap = horizontal ? gap(a.y, a.h, b.y, b.h) : gap(a.x, a.w, b.x, b.w);
    const orthCenter = horizontal ? Math.abs(bc.y - ac.y) : Math.abs(bc.x - ac.x);
    const score = distEdge + orthGap * 4 + orthCenter * 0.35 + along * 0.05;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Wrap: among rects (passing allow) lined up with rects[index], the one farthest the other way; -1 if none. */
function wrapInDir(rects, index, dir, allow) {
  const [dx, dy] = DIRS[dir];
  const a = rects[index];
  const ac = center(a);
  const horizontal = dx !== 0;
  let far = -1;
  let farAlong = 0;
  for (let i = 0; i < rects.length; i++) {
    if (i === index || !allow(i)) continue;
    const b = rects[i];
    if ((horizontal ? gap(a.y, a.h, b.y, b.h) : gap(a.x, a.w, b.x, b.w)) > 0) continue;
    const bc = center(b);
    const along = horizontal ? (bc.x - ac.x) * dx : (bc.y - ac.y) * dy;
    if (along < farAlong - 1) { farAlong = along; far = i; }
  }
  return far;
}

/**
 * Spatial focus move. rects: [{ x, y, w, h, group?, wrap? }] in screen space; index: the focused one;
 * dir: 'up' | 'down' | 'left' | 'right'. Order of preference:
 *   1. the nearest rect in that direction within the same focus group (ungrouped rects form one group),
 *      preferring ones that line up on the other axis;
 *   2. wrapping within the group to the far end of the same row / column, when the group wraps on
 *      that axis (rect.wrap: 'x' | 'y' | 'both' | 'none', default 'x' for groups; ungrouped rects
 *      wrap both ways when opts.wrap);
 *   3. the nearest rect in that direction anywhere (leaving the group).
 * Returns the new index (the same index when nothing qualifies; 0 when nothing was focused; -1 for
 * an empty list).
 */
export function navigate(rects, index, dir, { wrap = true } = {}) {
  if (!rects.length) return -1;
  if (index == null || index < 0 || index >= rects.length) return 0;
  if (!DIRS[dir]) return index;
  const g = rects[index].group ?? null;
  const same = (i) => (rects[i].group ?? null) === g;
  const inGroup = bestInDir(rects, index, dir, same);
  if (inGroup >= 0) return inGroup;
  const axes = g == null ? (wrap ? 'both' : 'none') : (rects[index].wrap ?? 'x');
  const axis = DIRS[dir][0] ? 'x' : 'y';
  if (axes === 'both' || axes === axis) {
    const w = wrapInDir(rects, index, dir, same);
    if (w >= 0) return w;
  }
  const any = bestInDir(rects, index, dir, () => true);
  return any >= 0 ? any : index;
}

/** List-order step: index + delta, wrapping (or clamping) within count. */
export function listStep(count, index, delta, wrap = true) {
  if (count <= 0) return -1;
  if (index == null || index < 0) return delta < 0 ? count - 1 : 0;
  const n = index + delta;
  if (wrap) return ((n % count) + count) % count;
  return clamp(n, 0, count - 1);
}

/** Maps a UI action name to a navigation direction (or null). */
export function actionToDir(action) {
  return { uiUp: 'up', uiDown: 'down', uiLeft: 'left', uiRight: 'right' }[action] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Controls

/** One slider step (dir -1 / +1), snapped to the step grid and clamped. */
export function stepValue(value, { min = 0, max = 1, step = 0.05 } = {}, dir = 1) {
  const n = Math.round(((Number(value) || 0) - min) / step) + Math.sign(dir);
  const v = clamp(min + n * step, min, max);
  return Number(v.toFixed(6));
}

/** Snap a raw value (e.g. from a pointer drag) to the slider's grid. */
export function snapValue(value, { min = 0, max = 1, step = 0.05 } = {}) {
  const v = clamp(min + Math.round((value - min) / step) * step, min, max);
  return Number(v.toFixed(6));
}

/** Cycles through options ([{ value }] or values) from the current value; wraps. */
export function cycleOption(options, value, dir = 1) {
  const vals = options.map((o) => (o && typeof o === 'object' ? o.value : o));
  const i = vals.indexOf(value);
  return vals[listStep(vals.length, i < 0 ? 0 : i, dir, true)];
}

/** Characters revealed by a typewriter after `elapsed` seconds at `cps` characters per second. */
export function typewriterCount(length, elapsed, cps = 48) {
  return clamp(Math.floor(Math.max(0, elapsed) * cps), 0, length);
}

const ACTION_LABELS = {
  moveForward: 'Move forward', moveBack: 'Move back', moveLeft: 'Step left', moveRight: 'Step right',
  jump: 'Jump', run: 'Run', interact: 'Interact', throw: 'Throw', decorate: 'Decorate',
  rotate: 'Rotate', pickUp: 'Pick up', journal: 'Journal', collection: 'Collection', pause: 'Pause',
  uiUp: 'Menu up', uiDown: 'Menu down', uiLeft: 'Menu left', uiRight: 'Menu right',
  uiConfirm: 'Confirm', uiBack: 'Back', uiTabPrev: 'Previous tab', uiTabNext: 'Next tab',
};
/** A friendly name for an ACTIONS value. */
export function prettyAction(action) {
  return ACTION_LABELS[action] ?? prettyId(action).replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** A stable pastel colour for a speaker without one. */
export function speakerColor(name = '') {
  const palette = ['#f3c6c2', '#a9c89b', '#a9c6ea', '#f4d68e', '#c2b3dc', '#f0c3a8', '#a7d0c0'];
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

/** A tiny deterministic PRNG (mulberry32) for decorative layouts that must not jump between renders. */
export function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
