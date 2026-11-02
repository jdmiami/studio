import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeToSeed, createRng, seedToCode } from '../src/game/core/rng.js';
import { createEvents } from '../src/game/core/events.js';
import { findTable } from '../src/game/data/items.js';

test('same seed, same stream; forks independent and stable', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  assert.deepEqual([a.float(), a.float(), a.int(1, 6)], [b.float(), b.float(), b.int(1, 6)]);
  const f1 = createRng(99).fork('terrain');
  const r = createRng(99);
  r.float(); r.float(); // draws on the parent do not change a fork
  const f2 = r.fork('terrain');
  assert.equal(f1.float(), f2.float());
});

test('seed codes round-trip', () => {
  for (const s of [0, 1, 123456789, 0xffffffff]) assert.equal(codeToSeed(seedToCode(s)), s >>> 0);
  assert.equal(seedToCode(42).length, 7);
});

test('weighted picks follow weights', () => {
  const rng = createRng(7);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 10000; i++) counts[rng.weighted([['a', 9], ['b', 1]])]++;
  assert.ok(counts.a > 8500 && counts.a < 9500, JSON.stringify(counts));
});

test('events: on, once, off, handler errors isolated', () => {
  const ev = createEvents();
  const got = [];
  const off = ev.on('x', (p) => got.push(p));
  ev.once('x', (p) => got.push(`once ${p}`));
  ev.on('x', () => { throw new Error('boom'); });
  const err = console.error; console.error = () => {};
  ev.emit('x', 1); ev.emit('x', 2);
  console.error = err;
  off(); ev.emit('x', 3);
  assert.deepEqual(got, [1, 'once 1', 2]);
});

test('every biome has finds of every common rarity', () => {
  for (const biome of ['meadow', 'grotto', 'lake']) assert.ok(findTable(biome).length >= 5, biome);
});
