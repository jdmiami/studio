// Save-data migrations, oldest first. Each step is a pure function from one version's shape to the next;
// never edit or delete a shipped step (that strands every save of that version), only append new ones.
//
// Shapes:
//   v1  { version: 1, slot, name, createdAt, updatedAt, playTime,
//         area: 'hub' | 'trip', tripSeed?, player: { position, yaw }, found: string[], quests, flags }
//   v2  adds collection (itemId -> { count, firstAt }) replacing `found`, inventory, decor;
//       area becomes { kind, seed, biome }
//   v3  adds friendship { mira, dog } and trips { taken, lastSeed, visited }  (= newGameState())
import { SAVE_VERSION, newGameState } from '../core/contracts.js';
import { SaveError } from './errors.js';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** @type {{ from: number, to: number, migrate: (data: object) => object }[]} */
export const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    // `found` (one entry per pickup, duplicates allowed) becomes the collection map, and the same counts seed
    // the new inventory (finds go into the inventory too). Area string becomes an object.
    migrate(v1) {
      const { found, area, tripSeed, ...rest } = clone(v1);
      const collection = {};
      for (const itemId of Array.isArray(found) ? found : []) {
        if (typeof itemId !== 'string' || !itemId) continue;
        collection[itemId] ??= { count: 0, firstAt: isFiniteNum(rest.createdAt) ? rest.createdAt : null };
        collection[itemId].count++;
      }
      const inventory = Object.fromEntries(Object.entries(collection).map(([id, c]) => [id, c.count]));
      const kind = area === 'trip' || area?.kind === 'trip' ? 'trip' : 'hub';
      return {
        ...rest,
        version: 2,
        area: { kind, seed: kind === 'trip' ? (tripSeed ?? area?.seed ?? null) : null, biome: area?.biome ?? null },
        collection,
        inventory,
        decor: [],
      };
    },
  },
  {
    from: 2,
    to: 3,
    // Friendship and trips were tracked loosely in flags; lift them into their own records.
    // The flags themselves stay (other systems may still read them).
    migrate(v2) {
      const data = clone(v2);
      const flags = isPlainObject(data.flags) ? data.flags : {};
      const taken = isFiniteNum(flags.tripsTaken) ? Math.max(0, Math.floor(flags.tripsTaken)) : 0;
      const onTrip = data.area?.kind === 'trip';
      return {
        ...data,
        version: 3,
        friendship: { mira: flags.metMira ? 1 : 0, dog: flags.dogFriend ? 1 : 0 },
        trips: { taken, lastSeed: onTrip ? (data.area.seed ?? null) : null, visited: [] },
      };
    },
  },
];

/**
 * Migrates raw save data to SAVE_VERSION by applying MIGRATIONS in order. Pure: returns a new object.
 * Data with no version is treated as v1. Throws SaveError('NEWER_VERSION') for data from a newer build,
 * SaveError('CORRUPT') when no migration path exists.
 */
export function migrate(data, { migrations = MIGRATIONS, target = SAVE_VERSION } = {}) {
  if (!isPlainObject(data)) throw new SaveError('CORRUPT', 'save data is not an object');
  let v = data.version === undefined ? 1 : Number(data.version);
  if (!Number.isInteger(v) || v < 1) throw new SaveError('CORRUPT', `bad save version ${data.version}`);
  if (v > target) throw new SaveError('NEWER_VERSION', `save is from a newer version (v${v} > v${target})`, { version: v });
  let out = clone(data);
  while (v < target) {
    const step = migrations.find((m) => m.from === v);
    if (!step) throw new SaveError('CORRUPT', `no migration from save v${v}`, { version: v });
    out = step.migrate(out);
    v = step.to;
    out.version = v;
  }
  return out;
}

// ---- Validation / repair ---------------------------------------------------------------------------

const AREA_KINDS = new Set(['hub', 'trip']);
const QUEST_STATUS = new Set(['active', 'done']);
const isSeed = (v) => v === null || isFiniteNum(v) || typeof v === 'string';
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isFiniteNum);
const nonNeg = (v, d) => (isFiniteNum(v) && v >= 0 ? v : d);

/**
 * Fills anything missing or mistyped from newGameState() so older, partial or hand-edited saves never crash
 * the game. Keeps unknown top-level keys (forward tolerance) and drops only entries that cannot be used.
 * Expects current-version data (run migrate() first). Pure: returns a new object.
 */
export function repairState(data, { now = Date.now() } = {}) {
  const src = isPlainObject(data) ? clone(data) : {};
  const t = newGameState({ now: isFiniteNum(src.createdAt) ? src.createdAt : now });
  const out = { ...t, ...src, version: SAVE_VERSION };

  out.slot = Number.isInteger(src.slot) && src.slot >= 1 && src.slot <= 3 ? src.slot : t.slot;
  out.name = typeof src.name === 'string' && src.name.trim() ? src.name : t.name;
  out.createdAt = nonNeg(src.createdAt, t.createdAt);
  out.updatedAt = nonNeg(src.updatedAt, out.createdAt);
  out.playTime = nonNeg(src.playTime, 0);

  const a = isPlainObject(src.area) ? src.area : {};
  out.area = {
    ...a,
    kind: AREA_KINDS.has(a.kind) ? a.kind : 'hub',
    seed: isSeed(a.seed) ? a.seed : null,
    biome: typeof a.biome === 'string' ? a.biome : null,
  };

  const p = isPlainObject(src.player) ? src.player : {};
  out.player = {
    ...p,
    position: isVec3(p.position) ? p.position : null,
    yaw: isFiniteNum(p.yaw) ? p.yaw : null,
    pitch: isFiniteNum(p.pitch) ? p.pitch : 0,
  };

  out.collection = {};
  for (const [id, c] of Object.entries(isPlainObject(src.collection) ? src.collection : {})) {
    if (isFiniteNum(c)) out.collection[id] = { count: Math.max(0, c), firstAt: null };
    else if (isPlainObject(c) && isFiniteNum(c.count)) {
      out.collection[id] = { ...c, count: Math.max(0, c.count), firstAt: isFiniteNum(c.firstAt) ? c.firstAt : null };
    }
  }

  out.inventory = {};
  for (const [id, n] of Object.entries(isPlainObject(src.inventory) ? src.inventory : {})) {
    if (isFiniteNum(n) && n > 0) out.inventory[id] = n;
  }

  out.quests = {};
  for (const [id, q] of Object.entries(isPlainObject(src.quests) ? src.quests : {})) {
    if (!isPlainObject(q)) continue;
    out.quests[id] = {
      ...q,
      status: QUEST_STATUS.has(q.status) ? q.status : 'active',
      step: Number.isInteger(q.step) && q.step >= 0 ? q.step : 0,
      vars: isPlainObject(q.vars) ? q.vars : {},
    };
  }

  out.flags = isPlainObject(src.flags) ? src.flags : {};

  const f = isPlainObject(src.friendship) ? src.friendship : {};
  out.friendship = { ...t.friendship };
  for (const [k, v] of Object.entries(f)) if (isFiniteNum(v)) out.friendship[k] = v;

  out.decor = (Array.isArray(src.decor) ? src.decor : [])
    .filter((d) => isPlainObject(d) && typeof d.itemId === 'string' && d.itemId)
    .map((d, i) => ({
      ...d,
      id: typeof d.id === 'string' && d.id ? d.id : `decor-${i}`,
      position: isVec3(d.position) ? d.position : [0, 0, 0],
      yaw: isFiniteNum(d.yaw) ? d.yaw : 0,
    }));

  const tr = isPlainObject(src.trips) ? src.trips : {};
  out.trips = {
    ...tr,
    taken: Number.isInteger(tr.taken) && tr.taken >= 0 ? tr.taken : 0,
    lastSeed: isSeed(tr.lastSeed) ? tr.lastSeed : null,
    visited: Array.isArray(tr.visited) ? tr.visited : [],
  };

  return out;
}

/** migrate() then repairState(): any loadable save becomes a complete current-version state. */
export const upgradeSave = (data, opts = {}) => repairState(migrate(data, opts), opts);
