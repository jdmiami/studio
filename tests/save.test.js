import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, SAVE_VERSION, defaultSettings, newGameState } from '../src/game/core/contracts.js';
import { createEvents } from '../src/game/core/events.js';
import {
  SaveError,
  browserStorage,
  checksumOf,
  crc32,
  createSaveSystem,
  decodeEnvelope,
  encodeEnvelope,
  fromBase64,
  memoryStorage,
  migrate,
  toBase64,
  upgradeSave,
} from '../src/game/save/index.js';

const KEY = (slot, suffix = '') => `phluph:save:${slot}${suffix}`;

function setup(opts = {}) {
  const storage = opts.storage ?? memoryStorage();
  const events = createEvents();
  const log = [];
  for (const type of [EVENTS.SAVED, EVENTS.SAVE_FAILED]) events.on(type, (p) => log.push({ type, ...p }));
  let t = opts.t ?? 1_000_000;
  const clock = { now: () => t, set: (v) => (t = v), advance: (ms) => (t += ms) };
  const timers = [];
  const schedule = (fn, ms) => {
    const timer = { at: t + ms, fn, cancelled: false };
    timers.push(timer);
    return () => (timer.cancelled = true);
  };
  const runTimers = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled && timer.at <= t) timer.fn();
  };
  const saves = createSaveSystem({ storage, events, now: clock.now, schedule, ...opts.system });
  return { storage, events, log, clock, saves, timers, runTimers };
}

function sampleState(overrides = {}) {
  const s = newGameState({ slot: 1, name: 'Burrow', now: 500 });
  s.playTime = 1234;
  s.collection = { pebble: { count: 3, firstAt: 600 }, feather: { count: 1, firstAt: 700 } };
  s.inventory = { pebble: 2, feather: 1 };
  s.quests = { lostBall: { status: 'done', step: 3, vars: {} }, mira: { status: 'active', step: 1, vars: { asked: true } } };
  s.flags = { doorOpen: true };
  s.decor = [{ id: 'd1', itemId: 'pebble', position: [1, 0, 2], yaw: 0.5 }];
  s.player = { position: [1, 2, 3], yaw: 1.5, pitch: -0.1 };
  s.name = 'Burrow ✿ nest'; // non-ASCII survives checksum + base64
  return Object.assign(s, overrides);
}

const expectCode = (code) => (e) => e instanceof SaveError && e.code === code;

test('crc32 matches the standard check value', () => {
  assert.equal(crc32('123456789'), 'cbf43926');
  assert.equal(crc32(''), '00000000');
});

test('save/load round trip, metadata, SAVED event', () => {
  const { saves, log, storage } = setup();
  const state = sampleState();
  const r = saves.save(1, state);
  assert.equal(r.slot, 1);
  assert.equal(r.at, 1_000_000);

  const loaded = saves.load(1);
  assert.deepEqual(loaded, { ...state, updatedAt: 1_000_000 });
  assert.notEqual(loaded, state);
  assert.equal(state.updatedAt, 500, 'caller state is not mutated');
  assert.equal(saves.load(2), null, 'empty slot loads as null');

  const env = JSON.parse(storage.getItem(KEY(1)));
  assert.equal(env.magic, 'phluph-save');
  assert.equal(env.version, SAVE_VERSION);
  assert.equal(env.checksum, checksumOf(JSON.stringify(env.data)));
  assert.equal(storage.getItem(KEY(1, ':tmp')), null, 'temp key cleaned up');

  assert.deepEqual(log, [{ type: EVENTS.SAVED, slot: 1, at: 1_000_000, reason: 'manual' }]);

  const list = saves.listSlots();
  assert.deepEqual(list.map((e) => e.slot), [1, 2, 3, 'auto']);
  assert.deepEqual(list[0], {
    slot: 1,
    empty: false,
    meta: { name: 'Burrow ✿ nest', updatedAt: 1_000_000, playTime: 1234, area: 'hub', biome: null, finds: 2, questsDone: 1, version: 3 },
  });
  assert.deepEqual(list[1], { slot: 2, empty: true, meta: null });
  assert.equal(list[3].empty, true);
});

test('checksum corruption falls back to the backup and reports it', () => {
  const { saves, log, storage, clock } = setup();
  saves.save(1, sampleState({ playTime: 10 }));
  clock.advance(1000);
  saves.save(1, sampleState({ playTime: 20 }));

  // Flip a value inside the current save without fixing the checksum.
  const env = JSON.parse(storage.getItem(KEY(1)));
  env.data.playTime = 999_999;
  storage.setItem(KEY(1), JSON.stringify(env));

  log.length = 0;
  const detailed = saves.loadDetailed(1);
  assert.equal(detailed.state.playTime, 10, 'previous save restored from backup');
  assert.equal(detailed.source, 'backup');
  assert.equal(detailed.recovered, true);
  assert.match(detailed.warning, /recovered from backup/);
  assert.equal(log.length, 1);
  assert.equal(log[0].type, EVENTS.SAVE_FAILED);
  assert.equal(log[0].recovered, true);
  assert.equal(log[0].slot, 1);
  assert.equal(saves.listSlots()[0].recovered, true);

  // A new save must not rotate the corrupt current over the good backup.
  clock.advance(1000);
  saves.save(1, sampleState({ playTime: 30 }));
  assert.equal(decodeEnvelope(storage.getItem(KEY(1, ':bak'))).data.playTime, 10);
  assert.equal(saves.load(1).playTime, 30);

  // Truncated JSON in current, garbage in backup: nothing recoverable -> CORRUPT.
  storage.setItem(KEY(1), storage.getItem(KEY(1)).slice(0, 40));
  storage.setItem(KEY(1, ':bak'), 'not json');
  log.length = 0;
  assert.throws(() => saves.load(1), expectCode('CORRUPT'));
  assert.equal(log.at(-1).type, EVENTS.SAVE_FAILED);
  assert.equal(log.at(-1).recovered, false);
  assert.equal(saves.listSlots()[0].error, 'CORRUPT');
});

test('interrupted write (temp written, never committed) leaves the previous save intact', () => {
  const base = memoryStorage();
  let crashAfterTemp = false;
  let dead = false;
  // A storage that "loses power" right after the temp copy is written and verified.
  const storage = {
    getItem: (k) => {
      if (dead) throw new Error('power cut');
      const v = base.getItem(k);
      if (crashAfterTemp && k === KEY(1, ':tmp') && v != null) dead = true; // the verify read-back was the last op
      return v;
    },
    setItem: (k, v) => {
      if (dead) throw new Error('power cut');
      base.setItem(k, v);
    },
    removeItem: (k) => {
      if (dead) throw new Error('power cut');
      base.removeItem(k);
    },
  };
  const { saves } = setup({ storage });
  saves.save(1, sampleState({ playTime: 111 }));

  crashAfterTemp = true;
  assert.throws(() => saves.save(1, sampleState({ playTime: 222 })));
  // "Reboot".
  crashAfterTemp = false;
  dead = false;
  assert.notEqual(base.getItem(KEY(1, ':tmp')), null, 'the uncommitted temp is still there');
  assert.equal(saves.load(1).playTime, 111);

  // A half-written temp is ignored too, and the next save goes through and clears it.
  base.setItem(KEY(1, ':tmp'), '{"magic":"phluph-save","ver');
  assert.equal(saves.load(1).playTime, 111);
  saves.save(1, sampleState({ playTime: 333 }));
  assert.equal(saves.load(1).playTime, 333);
  assert.equal(base.getItem(KEY(1, ':tmp')), null);
  assert.equal(decodeEnvelope(base.getItem(KEY(1, ':bak'))).data.playTime, 111);
});

test('a verified temp is the last resort when current and backup are both unusable', () => {
  const { saves, storage } = setup();
  storage.setItem(KEY(2, ':tmp'), encodeEnvelope(sampleState({ slot: 2, playTime: 5 })));
  const r = saves.loadDetailed(2);
  assert.equal(r.source, 'temp');
  assert.equal(r.state.playTime, 5);
});

test('quota errors are typed, reported and leave the previous save intact', () => {
  const storage = memoryStorage({ quota: 9000 });
  const { saves, log } = setup({ storage });
  saves.save(1, sampleState({ playTime: 1 }));
  const big = sampleState({ flags: { blob: 'x'.repeat(5000) } });
  assert.throws(() => saves.save(1, big), expectCode('QUOTA'));
  assert.equal(log.at(-1).type, EVENTS.SAVE_FAILED);
  assert.equal(log.at(-1).code, 'QUOTA');
  assert.equal(saves.load(1).playTime, 1);
  assert.equal(storage.getItem(KEY(1, ':tmp')), null);
});

test('browserStorage maps QuotaExceededError to SaveError QUOTA', () => {
  const fake = {
    data: new Map(),
    getItem(k) {
      return this.data.get(k) ?? null;
    },
    setItem(k, v) {
      if (v.length > 10) throw new DOMException('full', 'QuotaExceededError');
      this.data.set(k, v);
    },
    removeItem(k) {
      this.data.delete(k);
    },
  };
  const s = browserStorage(fake);
  s.setItem('a', 'short');
  assert.equal(s.getItem('a'), 'short');
  assert.throws(() => s.setItem('a', 'much too long'), expectCode('QUOTA'));
  assert.equal(s.persistent, true);
  // No localStorage in Node: falls back to memory and says so.
  const fallback = browserStorage();
  assert.equal(fallback.persistent, false);
  fallback.setItem('k', 'v');
  assert.equal(fallback.getItem('k'), 'v');
});

// ---- Migrations ------------------------------------------------------------------------------------

const V1 = {
  version: 1,
  slot: 2,
  name: 'Old nest',
  createdAt: 100,
  updatedAt: 200,
  playTime: 50,
  area: 'trip',
  tripSeed: 4242,
  player: { position: [1, 0, 1], yaw: 0.3 },
  found: ['pebble', 'pebble', 'acorn'],
  quests: { lostBall: { status: 'done', step: 2 } },
  flags: { metMira: true, tripsTaken: 2 },
};

const V2 = {
  version: 2,
  slot: 3,
  name: 'Mid nest',
  createdAt: 100,
  updatedAt: 300,
  playTime: 75,
  area: { kind: 'hub', seed: null, biome: null },
  player: { position: null, yaw: null, pitch: 0 },
  collection: { acorn: { count: 1, firstAt: 150 } },
  inventory: { acorn: 1 },
  quests: {},
  flags: { dogFriend: true, tripsTaken: 1 },
  decor: [{ id: 'd1', itemId: 'acorn', position: [0, 0, 1], yaw: 0 }],
};

test('migration v1 -> v3', () => {
  const input = structuredClone(V1);
  const out = upgradeSave(input);
  assert.deepEqual(input, V1, 'migrations are pure');
  assert.equal(out.version, 3);
  assert.equal('found' in out, false);
  assert.equal('tripSeed' in out, false);
  assert.deepEqual(out.collection, { pebble: { count: 2, firstAt: 100 }, acorn: { count: 1, firstAt: 100 } });
  assert.deepEqual(out.inventory, { pebble: 2, acorn: 1 });
  assert.deepEqual(out.decor, []);
  assert.deepEqual(out.area, { kind: 'trip', seed: 4242, biome: null });
  assert.deepEqual(out.player, { position: [1, 0, 1], yaw: 0.3, pitch: 0 });
  assert.deepEqual(out.friendship, { mira: 1, dog: 0 });
  assert.deepEqual(out.trips, { taken: 2, lastSeed: 4242, visited: [] });
  assert.deepEqual(out.quests.lostBall, { status: 'done', step: 2, vars: {} });
  // Every field of a new game is present.
  for (const k of Object.keys(newGameState())) assert.ok(k in out, `missing ${k}`);
  // No version at all is treated as v1.
  const { version, ...noVersion } = V1;
  assert.deepEqual(upgradeSave(noVersion), out);
});

test('migration v2 -> v3', () => {
  const out = migrate(structuredClone(V2));
  assert.equal(out.version, 3);
  assert.deepEqual(out.friendship, { mira: 0, dog: 1 });
  assert.deepEqual(out.trips, { taken: 1, lastSeed: null, visited: [] });
  assert.deepEqual(out.collection, V2.collection);
  assert.deepEqual(out.decor, V2.decor);
  assert.equal(out.flags.tripsTaken, 1, 'flags are kept');
});

test('old saves in storage load migrated, and listSlots reports their stored version', () => {
  const { saves, storage } = setup();
  storage.setItem(KEY(2), encodeEnvelope(V1, { version: 1, savedAt: 1 }));
  storage.setItem(KEY(3), encodeEnvelope(V2, { version: 2, savedAt: 1 }));
  assert.equal(saves.load(2).version, 3);
  assert.deepEqual(saves.load(2).friendship, { mira: 1, dog: 0 });
  assert.deepEqual(saves.load(3).trips.taken, 1);
  const list = saves.listSlots();
  assert.equal(list[1].meta.version, 1);
  assert.equal(list[1].meta.finds, 2);
  assert.equal(list[1].meta.area, 'trip');
  assert.equal(list[2].meta.version, 2);
});

test('partial or mistyped saves are repaired, never crash', () => {
  const { saves, storage } = setup();
  storage.setItem(
    KEY(1),
    encodeEnvelope({ version: 3, name: '', playTime: 'lots', collection: { a: 2, b: 'x' }, decor: [null, { itemId: 'a' }], quests: { q: 5 } }),
  );
  const s = saves.load(1);
  assert.equal(s.name, 'Nest');
  assert.equal(s.playTime, 0);
  assert.deepEqual(s.collection, { a: { count: 2, firstAt: null } });
  assert.deepEqual(s.decor, [{ itemId: 'a', id: 'decor-0', position: [0, 0, 0], yaw: 0 }]);
  assert.deepEqual(s.quests, {});
  assert.deepEqual(s.trips, { taken: 0, lastSeed: null, visited: [] });
  assert.deepEqual(s.area, { kind: 'hub', seed: null, biome: null });
});

test('saves from a newer version are refused', () => {
  assert.throws(() => migrate({ version: SAVE_VERSION + 1 }), expectCode('NEWER_VERSION'));
  const { saves, storage, log } = setup();
  saves.save(1, sampleState());
  saves.save(1, sampleState()); // a good backup exists...
  storage.setItem(KEY(1), encodeEnvelope({ ...sampleState(), version: SAVE_VERSION + 1 }));
  // ...but the newest copy is from a newer build, so loading the older backup silently would lose progress.
  assert.throws(() => saves.load(1), (e) => expectCode('NEWER_VERSION')(e) && e.version === SAVE_VERSION + 1);
  assert.equal(log.at(-1).code, 'NEWER_VERSION');
  assert.equal(saves.listSlots()[0].error, 'NEWER_VERSION');
});

// ---- Export / import ---------------------------------------------------------------------------------

test('export/import round trip', () => {
  const { saves } = setup();
  saves.save(1, sampleState());
  const code = saves.exportSlot(1);
  assert.match(code, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(JSON.parse(fromBase64(code)).magic, 'phluph-save');

  const imported = saves.importSlot(2, `\n  ${code}  \n`);
  assert.equal(imported.slot, 2);
  assert.deepEqual(saves.load(2), { ...saves.load(1), slot: 2 });
  assert.throws(() => saves.exportSlot(3), expectCode('MISSING'));

  // An exported v1 save imports migrated.
  const v1code = toBase64(encodeEnvelope(V1, { version: 1 }));
  const s = saves.importSlot(3, v1code);
  assert.equal(s.version, 3);
  assert.equal(s.slot, 3);
  assert.deepEqual(saves.load(3).inventory, { pebble: 2, acorn: 1 });
});

test('tampered, foreign or newer imports are rejected and change nothing', () => {
  const { saves } = setup();
  saves.save(1, sampleState());
  const code = saves.exportSlot(1);

  const env = JSON.parse(fromBase64(code));
  env.data.inventory.pebble = 9999; // edited without the checksum
  assert.throws(() => saves.importSlot(2, toBase64(JSON.stringify(env))), expectCode('CORRUPT'));

  const foreign = { ...JSON.parse(fromBase64(code)), magic: 'other-game' };
  assert.throws(() => saves.importSlot(2, toBase64(JSON.stringify(foreign))), expectCode('CORRUPT'));
  assert.throws(() => saves.importSlot(2, '%%% not base64 %%%'), expectCode('CORRUPT'));
  assert.throws(() => saves.importSlot(2, toBase64('{"magic":')), expectCode('CORRUPT'));
  assert.throws(() => saves.importSlot(2, ''), expectCode('CORRUPT'));
  const newer = toBase64(encodeEnvelope({ ...sampleState(), version: SAVE_VERSION + 1 }));
  assert.throws(() => saves.importSlot(2, newer), expectCode('NEWER_VERSION'));
  assert.throws(() => saves.importSlot(7, code), expectCode('BAD_SLOT'));

  assert.equal(saves.load(2), null);
});

test('delete clears a slot (and its backup) and nothing else', () => {
  const { saves } = setup();
  saves.save(1, sampleState());
  saves.save(1, sampleState());
  saves.save(2, sampleState());
  saves.saveSettings({ fov: 90 });
  saves.delete(1);
  assert.equal(saves.load(1), null);
  assert.equal(saves.listSlots()[0].empty, true);
  assert.notEqual(saves.load(2), null);
  assert.equal(saves.loadSettings().fov, 90);
  assert.throws(() => saves.delete(0), expectCode('BAD_SLOT'));
  assert.throws(() => saves.save('4', sampleState()), expectCode('BAD_SLOT'));
});

// ---- Settings ----------------------------------------------------------------------------------------

test('settings merge over defaults: unknown dropped, missing filled, bad types reset', () => {
  const { saves, storage, events } = setup();
  assert.deepEqual(saves.loadSettings(), defaultSettings());

  const merged = saves.saveSettings({
    volume: { master: 0.3, sfx: 7, bogus: 1 },
    fov: 90,
    invertY: 'yes',
    quality: 'ultra',
    mouseSensitivity: NaN,
    bindings: { jump: ['Space'] },
    unknownKey: 1,
  });
  const expected = defaultSettings();
  expected.volume.master = 0.3;
  expected.volume.sfx = 1; // clamped
  expected.fov = 90;
  expected.bindings = { jump: ['Space'] };
  assert.deepEqual(merged, expected);
  assert.deepEqual(saves.loadSettings(), expected);
  assert.equal('unknownKey' in saves.loadSettings(), false);

  // Stored separately from slots.
  assert.notEqual(storage.getItem('phluph:settings'), null);
  assert.equal(saves.load(1), null);

  // SETTINGS_CHANGED persists.
  events.emit(EVENTS.SETTINGS_CHANGED, { settings: { ...expected, showFps: true } });
  assert.equal(saves.loadSettings().showFps, true);

  // Corrupt settings fall back to defaults.
  storage.setItem('phluph:settings', '{oops');
  assert.deepEqual(saves.loadSettings(), defaultSettings());

  // A different keyPrefix is a different namespace.
  const other = createSaveSystem({ storage, keyPrefix: 'phluph-dev' });
  assert.deepEqual(other.loadSettings(), defaultSettings());
});

// ---- Autosave ------------------------------------------------------------------------------------------

test('autosave is throttled to one write per 10 s, with a trailing write of the latest state', () => {
  const { saves, log, clock, timers, runTimers } = setup({ t: 0 });
  const saved = () => log.filter((e) => e.type === EVENTS.SAVED);

  assert.deepEqual(saves.autosave(sampleState({ playTime: 1 }), 'timer'), { saved: true, deferred: false, at: 0 });
  assert.deepEqual(saved().at(-1), { type: EVENTS.SAVED, slot: 'auto', at: 0, reason: 'timer' });

  clock.set(3000);
  assert.deepEqual(saves.autosave(sampleState({ playTime: 2 }), 'find'), { saved: false, deferred: true, dueAt: 10_000 });
  clock.set(6000);
  assert.equal(saves.autosave(sampleState({ playTime: 3 }), 'find').deferred, true);
  assert.equal(timers.length, 1, 'one trailing timer, not one per call');
  assert.equal(saved().length, 1);
  assert.equal(saves.load('auto').playTime, 1);

  clock.set(10_000);
  runTimers();
  assert.equal(saved().length, 2);
  assert.deepEqual(saved().at(-1), { type: EVENTS.SAVED, slot: 'auto', at: 10_000, reason: 'find' });
  assert.equal(saves.load('auto').playTime, 3, 'the latest deferred state was written');

  // 'quest' and 'area' bypass the throttle.
  clock.set(11_000);
  assert.equal(saves.autosave(sampleState({ playTime: 4 }), 'quest').saved, true);
  clock.set(11_500);
  assert.equal(saves.autosave(sampleState({ playTime: 5 }), 'area').saved, true);
  assert.equal(saves.load('auto').playTime, 5);

  // An immediate save cancels a pending trailing write.
  clock.set(12_000);
  assert.equal(saves.autosave(sampleState({ playTime: 6 }), 'timer').deferred, true);
  clock.set(12_100);
  saves.autosave(sampleState({ playTime: 7 }), 'quest');
  clock.set(30_000);
  runTimers();
  assert.equal(saves.load('auto').playTime, 7);

  // After the interval a throttled reason writes at once; flush() forces a pending one.
  clock.set(40_000);
  assert.equal(saves.autosave(sampleState({ playTime: 8 }), 'timer').saved, true);
  clock.set(41_000);
  saves.autosave(sampleState({ playTime: 9 }), 'timer');
  assert.equal(saves.flush().saved, true);
  assert.equal(saves.load('auto').playTime, 9);
  assert.equal(saves.flush(), null);

  // Autosave never clobbers manual slots.
  assert.equal(saves.load(1), null);
});

test('SAVE_REQUESTED saves to the requested slot, or autosaves without one', () => {
  const live = sampleState({ playTime: 77 });
  const { saves, events, log } = setup({ system: { getState: () => live } });

  events.emit(EVENTS.SAVE_REQUESTED, { reason: 'menu', state: sampleState({ playTime: 42 }), slot: 2 });
  assert.equal(saves.load(2).playTime, 42);
  assert.equal(saves.load(2).slot, 2);
  assert.deepEqual(log.at(-1), { type: EVENTS.SAVED, slot: 2, at: 1_000_000, reason: 'menu' });

  events.emit(EVENTS.SAVE_REQUESTED, { reason: 'area' }); // no state: uses getState(), no slot: autosave
  assert.equal(saves.load('auto').playTime, 77);
  assert.equal(log.at(-1).slot, 'auto');

  events.emit(EVENTS.SAVE_REQUESTED, { reason: 'menu', state: live, slot: 9 });
  assert.equal(log.at(-1).type, EVENTS.SAVE_FAILED);
  assert.equal(log.at(-1).code, 'BAD_SLOT');

  saves.dispose();
  events.emit(EVENTS.SAVE_REQUESTED, { reason: 'menu', state: live, slot: 3 });
  assert.equal(saves.load(3), null, 'disposed systems stop listening');
});

test('without state or getState a request fails cleanly', () => {
  const { events, log } = setup();
  events.emit(EVENTS.SAVE_REQUESTED, { reason: 'quest' });
  assert.equal(log.at(-1).type, EVENTS.SAVE_FAILED);
  assert.equal(log.at(-1).code, 'NO_STATE');
});
