// Demo / screenshot harness for the UI: mounts every screen against fake data and fake game
// actions. Open /src/game/ui/demo.html (Vite). ?screen=<name> opens one state directly and
// ?shot=1 hides the demo chrome. Names: title, slots, slots-new, pause, settings, settings-controls,
// settings-video, journal, journal-done, collection, collection-sightings, credits, dialogue,
// dialogue-choices, toasts, decorate, confirm, prompt, code.
import { ACTIONS, EVENTS, defaultSettings, newGameState } from '../core/contracts.js';
import { createEvents } from '../core/events.js';
import { ITEMS } from '../data/items.js';
import { createUI, attachInputBridge } from './index.js';

const qs = new URLSearchParams(location.search);
const SHOT = qs.has('shot');
if (SHOT) document.body.classList.add('shot');
const NOW = Date.now();
const DAY = 86400000;

// ------------------------------------------------------------------ fake world
const CATALOGUE = [
  { id: 'felt-lock', title: 'The Felt Lock', giver: 'Mira', description: 'The great cave door is sewn shut with a lock of felt. Mira thinks three of the Nest’s own treasures will open it.',
    steps: [{ id: 'look', text: 'Inspect the great cave door' }, { id: 'ask', text: 'Ask Mira about the lock' }, { id: 'keys', text: 'Bring three treasures to the lock (1/3)' }, { id: 'open', text: 'Open the door' }] },
  { id: 'best-friend', title: 'A Best Friend', giver: 'Biscuit the dog', description: 'Biscuit wants someone to throw the felt ball. Again. And again.',
    steps: [{ id: 'ball', text: 'Find the felt ball' }, { id: 'throw', text: 'Throw it three times' }, { id: 'pet', text: 'Give Biscuit a pat' }] },
  { id: 'lost-spools', title: 'Lost Spools', giver: 'Grandma Nell', description: 'Three spools of rose thread rolled off somewhere in the meadow.',
    steps: [{ id: 'find', text: 'Find the three spools' }, { id: 'return', text: 'Bring them back to Grandma Nell' }] },
  { id: 'first-trip', title: 'Out Into the Hills', giver: 'Mira', description: 'Take your first trip through the felt door to the meadow.',
    steps: [{ id: 'go', text: 'Step through the trip door' }, { id: 'home', text: 'Come home with a find' }] },
];

function fakeState() {
  const s = newGameState({ slot: 1, name: 'Cosy Nest', now: NOW - 40 * DAY });
  s.playTime = 1 * 3600 + 24 * 60;
  s.updatedAt = NOW - 6 * 60 * 1000;
  const got = { 'fluff-stone': 7, 'button-mushroom': 4, 'moss-tuft': 2, 'felt-leaf': 3, 'tiered-dome': 1, 'lilac-puff': 2, 'golden-button': 1, 'rainbow-pom': 1, 'felt-crown': 1, 'critter-cream': 1, 'critter-mint': 1 };
  Object.entries(got).forEach(([id, count], i) => { s.collection[id] = { count, firstAt: NOW - (30 - i * 2) * DAY }; });
  s.quests = { 'felt-lock': { status: 'active', step: 2, vars: {} }, 'lost-spools': { status: 'active', step: 0, vars: {} },
    'best-friend': { status: 'done', step: 3, vars: {} }, 'first-trip': { status: 'done', step: 2, vars: {} } };
  return s;
}

let state = qs.get('screen') === 'title' || !qs.get('screen') ? null : fakeState();
let settings = defaultSettings();
const BIND = {
  moveForward: ['W', 'Up'], moveBack: ['S', 'Down'], moveLeft: ['A', 'Left'], moveRight: ['D', 'Right'], jump: ['Space', 'Pad A'],
  run: ['Shift', 'Pad LS'], interact: ['E', 'Pad X'], throw: ['Mouse 1', 'Pad RT'], pickUp: ['F'], decorate: ['B', 'Pad Y'], rotate: ['R', 'Pad RB'],
  journal: ['J', 'Pad View'], collection: ['C'], pause: ['Esc', 'Pad Start'], uiBack: ['Esc'], uiTabPrev: ['Q'], uiTabNext: ['E'],
};
const bindings = structuredClone(BIND);
let slots = [
  { slot: 'auto', state: { ...fakeState(), updatedAt: NOW - 3 * 60 * 1000, playTime: 5100 } },
  { slot: 1, state: fakeState() },
  { slot: 2, name: 'Rosehip Hollow', playTime: 12 * 3600 + 5 * 60, area: { kind: 'trip', biome: 'grotto' }, finds: 17, total: ITEMS.length, questsDone: 6, savedAt: NOW - 3 * DAY },
  { slot: 3, empty: true },
];

const logEl = document.createElement('div');
logEl.className = 'demo-log';
document.body.appendChild(logEl);
const lines = [];
function log(...a) { lines.push(a.join(' ')); while (lines.length > 6) lines.shift(); logEl.textContent = lines.join('\n'); console.log('[demo]', ...a); }

const events = createEvents();
for (const k of ['UI_OPEN', 'UI_CLOSE', 'UI_CONFIRM', 'UI_BACK', 'SETTINGS_CHANGED']) events.on(EVENTS[k], (p) => log(EVENTS[k], p?.screen ?? ''));

const actions = {
  newGame(slot, name) { log('newGame', slot, name); state = { ...fakeState(), slot, name, collection: {}, quests: {}, playTime: 0 }; },
  continueGame() { log('continueGame'); state = fakeState(); },
  loadSlot(slot) { log('loadSlot', slot); state = fakeState(); },
  deleteSlot(slot) { log('deleteSlot', slot); slots = slots.map((s) => (String(s.slot) === String(slot) ? { slot, empty: true } : s)); },
  exportSlot(slot) { log('exportSlot', slot); return `PHLUPH1.${btoa(JSON.stringify({ slot, name: 'Cosy Nest', t: 5040 })).replace(/=+$/, '')}.k7Qm2`; },
  importSlot(slot, text) { log('importSlot', slot, text.slice(0, 12)); if (!text.startsWith('PHLUPH')) throw new Error('that code does not look like a Phluph nest'); },
  saveNow() { log('saveNow'); },
  quitToTitle() { log('quitToTitle'); state = null; },
  resume() { log('resume'); },
  pause() { log('pause'); },
  applySettings(s) { settings = s; },
  listSlots() { return slots; },
  labelFor(action) { return bindings[action] ?? []; },
  resetBindings() { Object.assign(bindings, structuredClone(BIND)); },
  startRebind(action, index) {
    return new Promise((resolve, reject) => {
      const onKey = (e) => {
        e.preventDefault(); e.stopPropagation();
        window.removeEventListener('keydown', onKey, true);
        if (e.code === 'Escape') { reject(new Error('cancelled')); return; }
        bindings[action] = [...(bindings[action] ?? [])];
        bindings[action][index] = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        resolve(bindings[action]);
      };
      window.addEventListener('keydown', onKey, true);
    });
  },
};

const ui = createUI({ events, getState: () => state, getSettings: () => settings, actions, questCatalogue: CATALOGUE });
attachInputBridge(ui);
window.__ui = ui;
window.__events = events;

// ------------------------------------------------------------------ states
const STATES = {
  title: () => ui.reset('title'),
  slots: () => { ui.reset('title'); ui.open('slots', { mode: 'load' }); },
  'slots-new': () => { ui.reset('title'); ui.open('slots', { mode: 'new' }); },
  pause: () => { ui.reset('pause'); },
  settings: () => { ui.reset('pause'); ui.open('settings'); },
  'settings-controls': () => { ui.reset('pause'); ui.open('settings', { tab: 'controls' }); },
  'settings-video': () => { ui.reset('pause'); ui.open('settings', { tab: 'video' }); },
  journal: () => ui.reset('journal'),
  'journal-done': () => ui.reset('journal', { tab: 'done' }),
  collection: () => ui.reset('collection', { itemId: 'golden-button' }),
  'collection-sightings': () => ui.reset('collection', { tab: 'sightings', itemId: 'critter-blush' }),
  credits: () => { ui.reset('title'); ui.open('credits'); },
  dialogue: async () => {
    ui.reset(null);
    const p = ui.dialogue.show({ speaker: 'Mira', text: 'Oh! You found the old door. It has been sewn shut since before I was a little ball of fluff. Maybe the Nest still has the keys tucked away somewhere?' });
    if (SHOT) ui.handleAction(ACTIONS.UI_CONFIRM);
    log('dialogue ->', await p);
  },
  'dialogue-choices': async () => {
    ui.reset(null);
    const p = ui.dialogue.show({ speaker: 'Biscuit', color: '#f1e3d4', text: 'Woof! (Biscuit drops a slightly damp felt ball at your feet and looks up, hopeful.)',
      choices: ['Throw the ball', 'Give Biscuit a pat', 'Maybe later'] });
    if (SHOT) { ui.handleAction(ACTIONS.UI_CONFIRM); ui.handleAction(ACTIONS.UI_DOWN); }
    log('choice ->', await p);
  },
  toasts: () => {
    ui.reset(null);
    const d = SHOT ? 999 : undefined;
    ui.toast('You found a Golden Button!', 'find', { itemId: 'golden-button', duration: d });
    ui.toast('New quest: Lost Spools', 'quest', { duration: d });
    ui.toast('Nest saved', 'info', { duration: d });
  },
  decorate: () => { ui.reset(null); ui.showDecorate({ item: 'golden-button', count: 3 }); },
  confirm: () => { ui.reset('pause'); ui.confirm({ title: 'Quit to title?', text: 'Anything since your last save will drift away like fluff.', confirmLabel: 'Quit', cancelLabel: 'Stay' }).then((v) => log('confirm ->', v)); },
  prompt: () => { ui.reset('title'); ui.open('slots', { mode: 'new' }); ui.prompt({ title: 'Name your nest', text: 'What should we stitch on the door?', value: 'Pebble Nest', confirmLabel: 'Start' }).then((v) => log('prompt ->', v)); },
  code: () => { ui.reset('title'); ui.open('slots'); ui.showCode({ title: 'Export code', text: 'A copy of “Cosy Nest”. Keep it safe, or paste it into Import on another computer.', code: actions.exportSlot(1).repeat(4) }); },
};

const bar = document.createElement('div');
bar.className = 'demo-bar';
for (const name of Object.keys(STATES)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => { ui.hideDecorate(); ui.dialogue.hide(); if (!['title', 'slots', 'slots-new', 'credits', 'prompt', 'code'].includes(name)) state ??= fakeState(); STATES[name](); });
  bar.appendChild(b);
}
document.body.appendChild(bar);

(STATES[qs.get('screen')] ?? STATES.title)();
window.__ready = true;
