import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPlayTime, formatDate, formatRelativeTime, collectionProgress, collectionEntries, summarizeSlot,
  locationLabel, defaultSlotName, questView, navigate, listStep, actionToDir, stepValue, snapValue,
  cycleOption, typewriterCount, prettyAction, speakerColor, prng,
} from '../src/game/ui/logic.js';
import { glyph, GLYPH_KINDS, shade } from '../src/game/ui/glyphs.js';
import { bindingLabels, REBINDABLE } from '../src/game/ui/screens/settings.js';
import { ITEMS } from '../src/game/data/items.js';
import { ACTIONS, newGameState } from '../src/game/core/contracts.js';

test('play time formats as h:mm', () => {
  assert.equal(formatPlayTime(0), '0:00');
  assert.equal(formatPlayTime(59), '0:00');
  assert.equal(formatPlayTime(5 * 60 + 30), '0:05');
  assert.equal(formatPlayTime(3600 + 24 * 60), '1:24');
  assert.equal(formatPlayTime(12 * 3600 + 5 * 60 + 59), '12:05');
  assert.equal(formatPlayTime(-10), '0:00');
  assert.equal(formatPlayTime(undefined), '0:00');
});

test('relative times and dates', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0).getTime();
  assert.equal(formatRelativeTime(now - 10e3, now), 'just now');
  assert.equal(formatRelativeTime(now - 60e3, now), '1 min ago');
  assert.equal(formatRelativeTime(now - 5 * 60e3, now), '5 min ago');
  assert.equal(formatRelativeTime(now - 3 * 3600e3, now), '3 h ago');
  assert.equal(formatRelativeTime(now - 30 * 3600e3, now), 'yesterday');
  assert.equal(formatRelativeTime(now - 4 * 86400e3, now), '4 days ago');
  assert.equal(formatRelativeTime(now - 20 * 86400e3, now), '8 Oct 2026');
  assert.equal(formatRelativeTime(now + 5000, now), 'just now', 'clock skew never goes negative');
  assert.equal(formatRelativeTime(null, now), 'never');
  assert.equal(formatDate(new Date(2026, 0, 3).getTime()), '3 Jan 2026');
  assert.equal(formatDate(undefined), '');
});

test('collection progress counts found items, filterable by sightings', () => {
  const finds = ITEMS.filter((i) => !i.sighting);
  const sightings = ITEMS.filter((i) => i.sighting);
  const col = { 'fluff-stone': { count: 3, firstAt: 1 }, 'felt-crown': { count: 1, firstAt: 2 }, 'critter-mint': { count: 1, firstAt: 3 },
    'nope-not-an-item': { count: 9 }, 'moss-tuft': { count: 0 } };
  const all = collectionProgress(col, ITEMS);
  assert.deepEqual([all.found, all.total], [3, ITEMS.length]);
  assert.equal(all.label, `3 / ${ITEMS.length}`);
  const f = collectionProgress(col, ITEMS, { sighting: false });
  assert.deepEqual([f.found, f.total], [2, finds.length]);
  const s = collectionProgress(col, ITEMS, { sighting: true });
  assert.deepEqual([s.found, s.total], [1, sightings.length]);
  assert.equal(collectionProgress({}, []).ratio, 0);
  assert.equal(collectionProgress(Object.fromEntries(ITEMS.map((i) => [i.id, { count: 1 }])), ITEMS).percent, 100);

  const entries = collectionEntries(col, ITEMS, { sighting: false });
  assert.equal(entries.length, finds.length);
  assert.deepEqual(entries.map((e) => e.item.id), finds.map((i) => i.id), 'catalogue order');
  const stone = entries.find((e) => e.item.id === 'fluff-stone');
  assert.deepEqual([stone.found, stone.count, stone.firstAt], [true, 3, 1]);
  assert.equal(entries.find((e) => e.item.id === 'moss-tuft').found, false);
});

test('slot summaries from summaries or full states', () => {
  assert.deepEqual(summarizeSlot({ slot: 3, empty: true }, ITEMS), { slot: 3, auto: false, empty: true });
  assert.equal(summarizeSlot({ slot: 2 }, ITEMS).empty, true, 'nothing saved there');
  const st = newGameState({ slot: 1, name: 'Moss', now: 1000 });
  st.playTime = 4000;
  st.collection = { 'fluff-stone': { count: 1, firstAt: 1 }, 'golden-button': { count: 2, firstAt: 2 } };
  st.quests = { a: { status: 'done' }, b: { status: 'active' }, c: { status: 'done' } };
  st.area = { kind: 'trip', biome: 'lake' };
  const s = summarizeSlot({ slot: 1, state: st }, ITEMS);
  assert.deepEqual(
    [s.empty, s.name, s.playTime, s.location, s.finds, s.total, s.questsDone, s.savedAt],
    [false, 'Moss', 4000, 'Trip · Blue Lake', 2, ITEMS.length, 2, 1000]);
  const auto = summarizeSlot({ slot: 'auto', name: 'X', playTime: 5, finds: 4, total: 9, questsDone: 1, savedAt: 7, location: 'Somewhere' }, ITEMS);
  assert.deepEqual([auto.auto, auto.location, auto.finds, auto.total, auto.savedAt], [true, 'Somewhere', 4, 9, 7]);
  assert.equal(locationLabel(null), 'The Nest');
  assert.equal(locationLabel({ kind: 'hub' }), 'The Nest');
  assert.equal(locationLabel({ kind: 'trip', biome: 'unknown' }), 'On a trip');
  assert.equal(defaultSlotName(1), 'Cosy Nest');
  assert.notEqual(defaultSlotName(2), defaultSlotName(3));
  assert.equal(typeof defaultSlotName('auto'), 'string');
});

test('quest view joins state with the catalogue', () => {
  const catalogue = [
    { id: 'q1', title: 'One', giver: 'Mira', description: 'd1', steps: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] },
    { id: 'q2', title: 'Two', steps: [{ id: 'x', text: 'X' }] },
  ];
  const v = questView({ q2: { status: 'done', step: 1 }, q1: { status: 'active', step: 'b' }, 'lost-cat': { status: 'active', step: 0 }, q9: { status: 'locked' } }, catalogue);
  assert.deepEqual(v.active.map((q) => q.id), ['q1', 'lost-cat'], 'catalogue order, unknown last, inactive skipped');
  assert.deepEqual(v.done.map((q) => q.id), ['q2']);
  const q1 = v.active[0];
  assert.deepEqual(q1.steps.map((s) => [s.done, s.current]), [[true, false], [false, true], [false, false]]);
  assert.equal(q1.progress, '1/3');
  assert.equal(q1.giver, 'Mira');
  assert.equal(v.active[1].title, 'Lost Cat', 'unknown quests get a readable title');
  assert.deepEqual(v.done[0].steps.map((s) => s.done), [true]);
  assert.deepEqual(questView(undefined, undefined), { active: [], done: [] });
  // Numeric step index
  assert.equal(questView({ q1: { status: 'active', step: 2 } }, catalogue).active[0].steps[2].current, true);
});

// A 3x2 grid of 100px cells (10px gaps) with a "back" button top right and a wide button below.
const cell = (c, r, extra = {}) => ({ x: c * 110, y: 100 + r * 110, w: 100, h: 100, ...extra });
const GRID = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1), cell(2, 1)];

test('spatial navigation moves to the nearest aligned neighbour', () => {
  assert.equal(navigate(GRID, 0, 'right'), 1);
  assert.equal(navigate(GRID, 1, 'down'), 4);
  assert.equal(navigate(GRID, 4, 'left'), 3);
  assert.equal(navigate(GRID, 5, 'up'), 2);
  assert.equal(navigate(GRID, -1, 'down'), 0, 'nothing focused: first');
  assert.equal(navigate([], 0, 'down'), -1);
  assert.equal(navigate(GRID, 0, 'sideways'), 0);
});

test('spatial navigation wraps within rows and columns (or not)', () => {
  assert.equal(navigate(GRID, 2, 'right'), 0, 'row wraps to its first cell');
  assert.equal(navigate(GRID, 3, 'left'), 5);
  assert.equal(navigate(GRID, 4, 'down'), 1, 'column wraps to its top');
  assert.equal(navigate(GRID, 2, 'right', { wrap: false }), 2);
  // A vertical menu wraps both ways.
  const menu = [0, 1, 2, 3].map((i) => ({ x: 0, y: i * 50, w: 200, h: 40 }));
  assert.equal(navigate(menu, 3, 'down'), 0);
  assert.equal(navigate(menu, 0, 'up'), 3);
});

test('spatial navigation prefers aligned targets and tolerates a lifted focused control', () => {
  // Two buttons below: one directly under, one far right but nearer vertically.
  const rects = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 120, w: 100, h: 40 }, { x: 400, y: 60, w: 100, h: 40 }];
  assert.equal(navigate(rects, 0, 'down'), 1);
  // The focused card is lifted 4px and scaled: its neighbours are not "below" it.
  const cards = [{ x: -2, y: 96, w: 104, h: 104 }, { x: 110, y: 100, w: 100, h: 100 }, { x: 0, y: 260, w: 200, h: 40 }];
  assert.equal(navigate(cards, 0, 'down'), 2);
});

test('focus groups: stay in the group, wrap along its axis, then leave', () => {
  const g = GRID.map((r) => ({ ...r, group: 'cells', wrap: 'x' }));
  const back = { x: 500, y: 0, w: 80, h: 40 }; // ungrouped, up and to the right
  const tabs = { x: 0, y: 40, w: 150, h: 40 };
  const rects = [...g, back, tabs];
  assert.equal(navigate(rects, 2, 'right'), 0, 'right edge wraps in the row instead of jumping to Back');
  assert.equal(navigate(rects, 0, 'up'), 7, 'top row leaves the group upward (no y wrap)');
  assert.equal(navigate(rects, 7, 'down'), 0, 'from the tabs into the grid');
  const yWrap = GRID.map((r) => ({ ...r, group: 'list', wrap: 'y' }));
  assert.equal(navigate([...yWrap, back], 4, 'down'), 1);
});

test('list steps, directions and control stepping', () => {
  assert.equal(listStep(3, 2, 1), 0);
  assert.equal(listStep(3, 0, -1), 2);
  assert.equal(listStep(3, 2, 1, false), 2);
  assert.equal(listStep(3, -1, -1), 2);
  assert.equal(listStep(0, 0, 1), -1);
  assert.equal(actionToDir(ACTIONS.UI_UP), 'up');
  assert.equal(actionToDir(ACTIONS.UI_RIGHT), 'right');
  assert.equal(actionToDir(ACTIONS.JUMP), null);
  assert.equal(stepValue(0.8, { min: 0, max: 1, step: 0.05 }, 1), 0.85);
  assert.equal(stepValue(1, { min: 0, max: 1, step: 0.05 }, 1), 1, 'clamped');
  assert.equal(stepValue(0.83, { min: 0, max: 1, step: 0.05 }, -1), 0.8, 'snaps to grid');
  assert.equal(stepValue(70, { min: 60, max: 100, step: 1 }, -1), 69);
  assert.equal(snapValue(0.333, { min: 0, max: 1, step: 0.05 }), 0.35);
  assert.equal(snapValue(140, { min: 60, max: 100, step: 1 }), 100);
  assert.equal(cycleOption(['low', 'medium', 'high'], 'high', 1), 'low');
  assert.equal(cycleOption([{ value: 1 }, { value: 2 }], 1, -1), 2);
  assert.equal(cycleOption(['a', 'b'], 'zzz', 1), 'b');
});

test('typewriter, labels, colours and deterministic noise', () => {
  assert.equal(typewriterCount(100, 0), 0);
  assert.equal(typewriterCount(100, 1, 48), 48);
  assert.equal(typewriterCount(10, 5, 48), 10);
  assert.equal(typewriterCount(10, -1), 0);
  assert.equal(prettyAction(ACTIONS.PICK_UP), 'Pick up');
  assert.equal(prettyAction('someNewAction'), 'Some New Action');
  assert.match(speakerColor('Mira'), /^#[0-9a-f]{6}$/);
  assert.equal(speakerColor('Mira'), speakerColor('Mira'));
  const a = prng(7); const b = prng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('every find has a glyph; silhouettes hide the colours', () => {
  for (const item of ITEMS) {
    assert.ok(GLYPH_KINDS.includes(item.look.kind), `${item.id} kind ${item.look.kind} has a glyph`);
    const svg = glyph(item.look);
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(svg.includes(item.look.color), `${item.id} uses its colour`);
    assert.ok(!svg.includes('<style'), 'no global <style> leaks from inline SVG');
    const sil = glyph(item.look, { silhouette: true });
    assert.ok(!sil.includes(item.look.color), `${item.id} silhouette hides its colour`);
    assert.ok(sil.includes('is-sil'));
  }
  assert.match(glyph({ kind: 'mystery' }), /<svg/, 'unknown kinds fall back');
  assert.equal(shade('#808080', 0.5), '#404040');
  assert.equal(shade('#000000', 2), '#ffffff');
  assert.equal(shade('nope', 0.5), 'nope');
});

test('binding labels accept arrays or "A / B" strings', () => {
  assert.deepEqual(bindingLabels(() => ['W', 'Up'], 'moveForward'), ['W', 'Up']);
  assert.deepEqual(bindingLabels(() => 'W / Up', 'moveForward'), ['W', 'Up']);
  assert.deepEqual(bindingLabels(() => null, 'x'), []);
  assert.deepEqual(bindingLabels(undefined, 'x'), []);
  assert.deepEqual(bindingLabels(() => { throw new Error('boom'); }, 'x'), []);
  assert.ok(REBINDABLE.every((a) => Object.values(ACTIONS).includes(a)));
});
