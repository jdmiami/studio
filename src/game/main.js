// Phluph, the game: the orchestrator. It owns the renderer and the frame loop and wires the systems
// together; the systems never import each other, they talk on the event bus (core/events.js) with
// the names in core/contracts.js.
//
//   input (input/)  ->  player (player/controller.js), menus (ui/), the lock overlay (lock-ui.js)
//   session (play/session.js): the save slot's state with quests, dialogue, collection, decor
//   world: the hub (the painted cave, src/cave/) or a trip (proc/ generates, world/trip.js builds)
//   creatures: painted bodies (world/creatures.js) driven by brains (ai/)
//   audio (audio/) and saves (save/) listen on the bus
//
// Flow: loading veil -> title (the Nest drifting behind it) -> new game / continue / load -> the
// Nest -> (the great door's felt lock opens the Wander Gate) -> trips -> home again.
//
// URL flags: ?seed=<code> next trip's seed; ?autostart=1 skip the title (new game in slot 1, for
// tests); ?fps=1 performance overlay; ?quality=low|medium|high.
import * as THREE from 'three';
import { sharedFurUniforms } from '../fur.js';
import { createSky } from '../sky.js';
import { createPost } from '../post.js';
import { buildCave } from '../cave/index.js';
import { applyCaveLook } from '../cave/look.js';
import { DOOR } from '../cave/level.js';
import { createEvents } from './core/events.js';
import { ACTIONS, EVENTS, defaultSettings, newGameState } from './core/contracts.js';
import { createRng, codeToSeed, seedToCode, hashString } from './core/rng.js';
import { ITEMS, ITEM_BY_ID, findTable } from './data/items.js';
import { QUESTS } from './data/quests.js';
import { createSession } from './play/session.js';
import { createChimeRing } from './play/puzzles.js';
import { t } from './play/strings.js';
import { createSaveSystem } from './save/index.js';
import { createInput } from './input/index.js';
import { createTouchControls } from './input/touch.js';
import { touchWanted } from './input/touch-math.js';
import { createAudio } from './audio/index.js';
import { createUI } from './ui/index.js';
import { createDogBrain, createCritterBrain, createNpcBrain } from './ai/index.js';
import { generateTrip } from './proc/index.js';
import { loadModels, hasModel } from './world/models.js';
import { buildTripWorld } from './world/trip.js';
import { createFindPool, buildFindModel } from './world/finds.js';
import { createCreature } from './world/creatures.js';
import { createFluff } from './world/fluff.js';
import { createAmbient } from './world/ambient.js';
import { createBall } from './world/ball.js';
import { applyTripLook } from './world/look.js';
import { createPlayerController, EYE_HEIGHT, fovFor } from './player/controller.js';
import { createGameHud } from './hud.js';
import { chooseRenderer } from './renderer-choice.js';
import { createSdfWorld } from './sdf/world.js';
import { propsFromPlacement, propsFromLandmarks } from './sdf/scene-data.js';
import { createLockUi } from './lock-ui.js';

const params = new URLSearchParams(location.search);
const BUDGET = { ms: 16.7, calls: 600, tris: 3e6 };
// Block mesh density per quality (subdivisions per unit; the painting-matching viewer uses 14):
// ~6 * res^2 * 2 triangles a block, thousands of blocks per area.
const BLOCK_RES = { low: 5, medium: 7, high: 9 };
const blockRes = () => BLOCK_RES[settings.quality] ?? 7;
const REACH = 4.5;
const CRITTER_KINDS = { cream: 'critter-cream', mint: 'critter-mint', blush: 'critter-blush' };
const CRITTER_MODELS = { 'critter-cream': 'critter-0', 'critter-mint': 'critter-1', 'critter-blush': 'critter-2' };
const HUB_FINDS = ['fluff-stone', 'button-mushroom', 'tiered-dome', 'fluff-stone', 'button-mushroom', 'critter-cream'];

// --- Core systems -------------------------------------------------------------------------------

const events = createEvents();
const saves = createSaveSystem({ events, getState: () => session?.state ?? null });
let settings = saves.loadSettings?.() ?? defaultSettings();
if (params.has('fps')) settings.showFps = true;
// Art comparison flags (scripts/game/sdf-compare.mjs): ?nohud=1 hides every overlay, ?fov= sets
// the vertical field of view (the cave painting's solved camera is 58.3 degrees).
const noHud = params.has('nohud');
if (noHud) {
  const s = document.createElement('style');
  s.textContent = '.ghud, .phl-ui, .ptouch { display: none !important; }';
  document.head.appendChild(s);
}
if (params.has('fov') && Number(params.get('fov')) > 0) settings.fov = Number(params.get('fov'));
// Touch screens (phones, tablets): on-screen controls, no pointer lock, and on a first run a
// lighter quality preset (smaller render target, simpler blocks, no bloom).
const coarsePointer = params.has('touch') || !!globalThis.matchMedia?.('(pointer: coarse)').matches;
let touchSeen = coarsePointer;
const firstRun = (() => { try { return !localStorage.getItem('phluph:settings'); } catch { return true; } })();
if (coarsePointer && firstRun) settings.quality = 'low';
if (params.has('touch')) settings.touchControls = 'on';
if (params.has('quality')) settings.quality = params.get('quality');
const touchActive = () => touchWanted(settings.touchControls, { coarse: coarsePointer, touched: touchSeen });

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.info.autoReset = false; // counted over the whole frame (scene + post passes), reset per frame
document.body.appendChild(renderer.domElement);
renderer.domElement.classList.add('game-canvas');
// How the world is drawn ('threejs' painted meshes or 'sdf' raymarched; chosen before loading).
let renderMode = 'threejs';
let sdfWorld = null;
let rendererChoice = null;
// The SDF pass costs per pixel, so it renders below the screen's resolution and is scaled up.
const pixelRatio = () => (renderMode === 'sdf'
  ? ({ low: 0.6, medium: 0.8, high: Math.min(devicePixelRatio, 1.25) }[settings.quality] ?? 0.8)
  : ({ low: 1, medium: Math.min(devicePixelRatio, 1.5), high: Math.min(devicePixelRatio, 2) }[settings.quality] ?? 1.5));
renderer.setPixelRatio(pixelRatio());
/** The visible viewport (the visual viewport on phones, where browser bars come and go). */
const viewSize = () => ({ width: Math.round(globalThis.visualViewport?.width ?? innerWidth), height: Math.round(globalThis.visualViewport?.height ?? innerHeight) });
renderer.setSize(viewSize().width, viewSize().height);

const scene = new THREE.Scene();
const sky = createSky();
scene.add(sky);
const camera = new THREE.PerspectiveCamera(fovFor(settings.fov, viewSize().width / viewSize().height), viewSize().width / viewSize().height, 0.03, 600);
scene.add(camera);
const caveGrade = applyCaveLook(renderer, new URLSearchParams(), sky);
let post = createPost(renderer, scene, camera, { ...caveGrade, bloomStrength: 0.25 });
post.setBloom(settings.quality === 'low' ? 0 : 0.25);

const input = createInput({ dom: renderer.domElement, events, settings, autoLock: !touchActive(), pauseOnUnlock: !touchActive() });
const touchUi = createTouchControls({ input, getSettings: () => settings, onNext: () => { wheel += 1; } });
document.body.classList.toggle('touch-ui', touchActive());
addEventListener('touchstart', () => {
  if (touchSeen) return;
  touchSeen = true;
  input.setAutoLock(!touchActive());
  document.body.classList.toggle('touch-ui', touchActive());
  sdfWorld?.setQuality(settings.quality);
}, { passive: true });
const audio = createAudio({ events, settings });
const unlockAudio = () => { audio.unlock(); audio.setVolumes(settings.volume); };
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

const hud = createGameHud();
const lockUi = createLockUi({ events });
const fluff = createFluff();
scene.add(fluff.points);
const ambient = createAmbient();
scene.add(ambient.points);
const pool = createFindPool();
const ball = createBall();
scene.add(ball.mesh);

// --- State ---------------------------------------------------------------------------------------

let session = null; // the play session (null on the title screen)
let mode = 'loading'; // 'loading' | 'title' | 'play'
let area = null; // the current area: { kind: 'hub'|'trip', ...world }
let hub = null; // the Nest, built once
let trip = null; // the current trip (rebuilt each visit)
let creatures = []; // [{ creature, brain, kind, itemId? }]
let dog = null;
let busy = false; // a transition or a dialogue in progress
let decorating = null; // { index, yaw, ghost, ring } in decorate mode
let chime = null; // the trip's chime ring state
let sighted = new Set();
const player = createPlayerController({ camera, input, events, settings: () => settings });

const getState = () => session?.state ?? null;
const labels = () => ({ decorate: input.labelFor(ACTIONS.DECORATE), throw: input.labelFor(ACTIONS.THROW), interact: input.labelFor(ACTIONS.INTERACT) });

// --- UI ------------------------------------------------------------------------------------------

const ui = createUI({
  root: document.body, events, getState, getSettings: () => settings,
  actions: {
    newGame: (slot, name) => startGame(newGameState({ slot, name: name || `Nest ${slot}` })),
    continueGame: () => { const s = latestSave(); if (s) startGame(s); },
    loadSlot: (slot) => { const s = saves.load(slot); if (s) startGame(s); },
    deleteSlot: (slot) => saves.delete(slot),
    exportSlot: (slot) => saves.exportSlot(slot),
    importSlot: (slot, text) => saves.importSlot(slot, text),
    saveNow: () => {
      if (!session) return;
      snapshotPlayer();
      saves.save(session.state.slot ?? 1, session.state);
      events.emit(EVENTS.TOAST, { text: t('save.done'), kind: 'info' });
    },
    quitToTitle: () => quitToTitle(),
    resume: () => resume(),
    applySettings: (next) => applySettings(next),
    startRebind: (action, index) => input.startRebind(action, index),
    resetBindings: () => input.resetBindings(),
    listSlots: () => saves.listSlots(),
    labelFor: (a) => input.labelFor(a),
    getBindings: () => input.getBindings(),
    conflicts: () => input.conflicts(),
  },
});
/** The journal's quest catalogue, with step text resolved against the current state. */
function refreshQuestCatalogue() {
  const name = (g) => (g ? g[0].toUpperCase() + g.slice(1) : g);
  const list = session
    ? session.quests.catalogueForUi()
    : QUESTS.map((q) => ({ id: q.id, title: q.title, giver: q.giver, description: q.description, steps: q.steps.map((st) => ({ id: st.id, text: typeof st.text === 'function' ? '' : st.text })) }));
  ui.setQuestCatalogue?.(list.map((q) => ({ ...q, giver: name(q.giver) })));
}
refreshQuestCatalogue();
for (const e of [EVENTS.QUEST_STARTED, EVENTS.QUEST_STEP, EVENTS.QUEST_DONE, EVENTS.FIND_COLLECTED]) events.on(e, () => { if (session) refreshQuestCatalogue(); });
ui.setHud?.(hud.el);

function latestSave() {
  const slots = saves.listSlots().filter((s) => !s.empty).sort((a, b) => (b.meta?.updatedAt ?? 0) - (a.meta?.updatedAt ?? 0));
  for (const s of slots) { try { const st = saves.load(s.slot); if (st) return st; } catch (e) { console.warn(e); } }
  return null;
}

function applySettings(next) {
  settings = { ...settings, ...next };
  input.setSettings(settings);
  audio.setVolumes(settings.volume);
  renderer.setPixelRatio(pixelRatio());
  fitView();
  input.setAutoLock(!touchActive());
  document.body.classList.toggle('touch-ui', touchActive());
  post.setBloom(settings.quality === 'low' ? 0 : renderMode === 'sdf' ? 0.42 : 0.25);
  events.emit(EVENTS.SETTINGS_CHANGED, { settings });
}

// --- Loading ---------------------------------------------------------------------------------------

async function boot() {
  // First, before anything heavy loads: how the world is drawn (menus read the UI actions).
  input.setContext('menu');
  rendererChoice = chooseRenderer({
    setting: settings.renderer, params, heavyHint: coarsePointer,
    onRemember: (choice) => applySettings({ renderer: choice }),
  });
  renderMode = await rendererChoice.promise;
  if (renderMode === 'sdf') {
    sdfWorld = createSdfWorld({ quality: settings.quality });
    scene.add(sdfWorld.mesh);
    renderer.setPixelRatio(pixelRatio());
    // The soft renderer's glow: bloom on the shafts and highlights, a gentle diorama blur above and
    // below the eye line (medium and high), the cave's warm grade.
    post = createPost(renderer, scene, camera, {
      ...caveGrade, bloomStrength: settings.quality === 'low' ? 0 : 0.42, bloomThreshold: 0.92,
      tiltShift: settings.quality !== 'low', tilt: { focus: 0.48, band: 0.3, radius: 1.5 },
    });
    fitView();
  }
  hud.loading(0.05, renderMode === 'sdf' ? 'Shaping the distance fields…' : 'Fluffing the felt…');
  // The SDF world draws its own scenery: only the creatures' models are needed.
  const modelIdsNeeded = renderMode === 'sdf' ? ['dog-0', 'critter-0', 'critter-1', 'critter-2'] : undefined;
  const modelsReady = loadModels(modelIdsNeeded, (p) => hud.loading(0.05 + p * 0.55, 'Stitching the finds…'));
  hub = buildHub();
  await modelsReady;
  hud.loading(0.65, 'Painting the Nest…');
  await hub.ready.catch((e) => console.error(e));
  hud.loading(0.95, 'Waking Biscuit…');
  enterHub({ spawn: true, title: true });
  hud.loaded();
  window.__phluphReady = true;
  if (params.has('autostart')) startGame(newGameState({ slot: 1, name: 'Test Nest' }));
  else showTitle();
}

// --- The hub -------------------------------------------------------------------------------------

function buildHub() {
  const group = new THREE.Group();
  group.name = 'hub';
  scene.add(group);
  const cave = buildCave(group, { creatures: false, blockRes: blockRes(), sdf: renderMode === 'sdf' });
  const decorGroup = new THREE.Group();
  decorGroup.name = 'decor';
  group.add(decorGroup);
  const findsGroup = new THREE.Group();
  group.add(findsGroup);

  // The Wander Gate swirl in the doorway, shown once the door is open.
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.xMax - DOOR.xMin + 0.6, DOOR.height - 0.4),
    new THREE.MeshBasicMaterial({ color: '#fff4ea', transparent: true, opacity: 0, depthWrite: false }));
  portal.position.set((DOOR.xMin + DOOR.xMax) / 2, DOOR.height / 2, DOOR.z + 0.2);
  group.add(portal);
  let door = null;
  cave.door.then((d) => { door = d; });
  const doorBase = () => door?.userData.baseY ?? (door ? (door.userData.baseY = door.position.y) : 0);
  let doorOpen = 0;

  // Hub finds: spots reachable from the spawn by walking and jumping, spaced, away from the door.
  const spots = reachableSpots(cave.columns, cave.spawn.position, 20261028);
  const heightAt = (x, z) => {
    if (doorOpen > 0.99 && Math.round(z) === DOOR.z && Math.round(x) >= DOOR.xMin && Math.round(x) <= DOOR.xMax) return cave.columns.get(`${Math.round(x)},${DOOR.z + 1}`)?.top ?? 0;
    return cave.heightAt(x, z);
  };
  const kindAt = (x, z) => cave.columns.get(`${Math.round(x)},${Math.round(z)}`)?.kind ?? null;
  const protect = [
    { x: 0, z: DOOR.z + 1.5, r: 2.8 },
    { x: cave.npcPosition.x, z: cave.npcPosition.z, r: 1.4 },
    { x: cave.spawn.position.x, z: cave.spawn.position.z, r: 1.2 },
  ];
  let finds = [];

  return {
    kind: 'hub', group, cave, decorGroup, protect, spots,
    ready: cave.ready,
    heightAt, kindAt, ceilingAt: cave.ceilingAt,
    walkable: (x, z) => { const k = kindAt(x, z); return !!k && k !== 'water' && cave.heightAt(x, z) < 7; },
    get finds() { return finds; },
    /** Lays out the hub's finds not yet taken this visit. */
    layFinds(taken) {
      for (const f of finds) pool.release(f);
      finds = [];
      HUB_FINDS.forEach((itemId, i) => {
        if (taken.includes(i) || !spots[i] || ITEM_BY_ID[itemId].sighting) return;
        const s = spots[i];
        const wf = pool.get(itemId, ITEM_BY_ID[itemId].rarity);
        wf.root.position.set(s.x, cave.heightAt(s.x, s.z), s.z);
        wf.data = { id: `hub-${i}`, index: i, itemId };
        findsGroup.add(wf.root);
        finds.push(wf);
      });
    },
    takeNear(feet) {
      const out = [];
      for (let i = finds.length - 1; i >= 0; i--) {
        const f = finds[i];
        if (Math.hypot(f.root.position.x - feet.x, f.root.position.z - feet.z) < 0.95 && Math.abs(f.root.position.y - feet.y) < 1.4) {
          finds.splice(i, 1);
          pool.release(f);
          out.push(f.data);
        }
      }
      return out;
    },
    /** Rebuilds the placed decorations from the state. */
    syncDecor(decor) {
      decorGroup.clear();
      for (const d of decor) {
        const m = buildFindModel(d.itemId);
        m.position.fromArray(d.position);
        m.rotation.y = d.yaw ?? 0;
        m.userData.decorId = d.id;
        decorGroup.add(m);
      }
    },
    setDoor(open, instant = false) { doorOpen = instant ? (open ? 1 : 0) : doorOpen; this.doorTarget = open ? 1 : 0; },
    doorTarget: 0,
    get doorOpen() { return doorOpen; },
    interactables() {
      const list = [
        { id: 'door', kind: 'door', label: doorOpen > 0.99 ? 'Step through the gate' : 'Inspect the door', position: new THREE.Vector3(0, 1.5, DOOR.z + 1), radius: 3.4 },
        { id: 'npc', kind: 'npc', label: 'Talk to Mira', position: cave.npcPosition.clone().add(new THREE.Vector3(0, 0.8, 0)), radius: 2.8 },
      ];
      return list;
    },
    update(time, dt) {
      for (const f of finds) f.update(time);
      // The door rises into the ceiling like a felt curtain, the gate's glow fading in behind it.
      const target = this.doorTarget;
      if (Math.abs(doorOpen - target) > 0.001) doorOpen += Math.sign(target - doorOpen) * Math.min(Math.abs(target - doorOpen), dt / 3.2);
      if (door) {
        const ease = doorOpen * doorOpen * (3 - 2 * doorOpen);
        door.position.y = doorBase() + ease * (DOOR.height - 0.3);
        door.scale.y = 1 - ease * 0.15;
      }
      portal.material.opacity = doorOpen * (0.55 + 0.15 * Math.sin(time * 2));
      portal.material.color.setHSL(0.92 + 0.04 * Math.sin(time * 0.7), 0.6, 0.9);
    },
  };
}

/** Walk/jump-reachable floor cells from the spawn (BFS over columns), spaced by Poisson-like rejection. */
function reachableSpots(columns, spawn, seed) {
  const rng = createRng(seed);
  const start = `${Math.round(spawn.x)},${Math.round(spawn.z)}`;
  const seen = new Set([start]);
  const queue = [start];
  const cells = [];
  while (queue.length) {
    const k = queue.shift();
    const [x, z] = k.split(',').map(Number);
    const c = columns.get(k);
    cells.push({ x, z, top: c.top, kind: c.kind });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = `${x + dx},${z + dz}`;
      const n = columns.get(nk);
      if (!n || seen.has(nk) || n.kind === 'water' || n.kind === 'stream') continue;
      if (n.top - c.top > 1.0 || c.top - n.top > 3) continue;
      if (z + dz === DOOR.z) continue;
      seen.add(nk);
      queue.push(nk);
    }
  }
  const out = [];
  for (const c of rng.shuffle(cells)) {
    if (Math.hypot(c.x - spawn.x, c.z - spawn.z) < 2.5 || c.z < DOOR.z + 3) continue;
    if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= 3)) out.push(c);
    if (out.length >= HUB_FINDS.length) break;
  }
  return out;
}

// --- Areas -----------------------------------------------------------------------------------------

function setArea(a) {
  area = a;
  player.setWorld({ heightAt: a.heightAt, kindAt: a.kindAt, ceilingAt: a.ceilingAt });
  ball.setWorld(a.heightAt);
  ball.pickUp();
}

function enterHub({ spawn = false, title = false, fromTrip = false } = {}) {
  if (trip) { trip.dispose(); trip = null; }
  hub.group.visible = true;
  const grade = applyCaveLook(renderer, new URLSearchParams(), sky);
  post.setGrade(grade);
  setArea(hub);
  sdfWorld?.setArea({ columns: hub.cave.columns, ceilingAt: hub.cave.ceilingAt, door: DOOR, props: (hub.sdfProps ??= propsFromPlacement(hub.cave.props)), tint: 'hub', shafts: hub.cave.shafts });
  ambient.setArea({ kind: 'hub', shafts: hub.cave.shafts });
  const s = getState();
  hub.setDoor(!!s?.flags.doorOpen, true);
  hub.syncDecor(s?.decor ?? []);
  hub.layFinds(s?.flags.hubTaken ?? []);
  spawnCreatures('hub');
  const sp = hub.cave.spawn;
  if (fromTrip) {
    player.teleport(new THREE.Vector3(0, 0, DOOR.z + 2.5), Math.PI, -0.1); // out of the doorway, facing the Nest
  } else if (!spawn && s?.player?.position && s.area?.kind === 'hub') {
    player.teleport(new THREE.Vector3().fromArray(s.player.position), s.player.yaw ?? sp.yaw, s.player.pitch ?? 0);
  } else {
    player.teleport(sp.position, sp.yaw, sp.pitch);
  }
  hud.setArea({ name: 'The Nest' });
  if (!title) {
    audio.setAmbience?.({ cave: 0.7, water: 0.5 });
  }
}

function enterTrip(seed, biome = null) {
  const data = generateTrip({ seed, ...(biome ? { biome } : {}) });
  hub.group.visible = false;
  if (trip) trip.dispose();
  trip = buildTripWorld(data, { pool, blockRes: blockRes(), sdf: renderMode === 'sdf' });
  sdfWorld?.setArea({ columns: data.columns, props: propsFromLandmarks(data.landmarks, data.biome), tint: data.biome });
  ambient.setArea({ kind: data.biome }, trip.spawn.position);
  trip.data = data;
  scene.add(trip.group);
  post.setGrade(applyTripLook(renderer, data.biome, sky));
  setArea(trip);
  // Stream the chunks round the spawn before the first frame.
  trip.world.update(trip.spawn.position, 200);
  spawnCreatures('trip', data);
  player.teleport(trip.spawn.position, trip.spawn.yaw, trip.spawn.pitch);
  hud.setArea({ name: data.name, code: data.code });
  chime = trip.chimes ? { ring: createChimeRing({ rng: createRng(data.seed).fork('chime-seq') }), noticed: false, show: null } : null;
  session.beginTrip(data.seed, data.code, data.biome);
  events.emit(EVENTS.TOAST, { text: t('trip.arrive', { name: data.name, code: data.code }), kind: 'info' });
}

// --- Creatures ---------------------------------------------------------------------------------------

function brainWorld() {
  return {
    player: () => ({ position: player.position, running: player.running, velocity: player.velocity }),
    walkable: (x, z) => area.walkable(x, z),
    heightAt: (x, z) => area.heightAt(x, z),
    ballInFlight: () => (ball.state === 'flying' ? { position: ball.position } : null),
    ballLanded: () => (ball.state === 'landed' ? { position: ball.position } : null),
    takeBall: () => { if (ball.state !== 'landed') return false; ball.take(); return true; },
    timeOfDay: () => 0.5,
  };
}

function clearCreatures() {
  for (const c of creatures) c.creature.root.removeFromParent();
  creatures = [];
  dog = null;
}

function spawnCreatures(kind, data = null) {
  clearCreatures();
  if (!session) return;
  const rng = createRng(hashString(`${session.state.createdAt}:${kind}:${data?.seed ?? 0}`));
  const world = brainWorld();
  const parent = kind === 'hub' ? hub.group : trip.group;
  // Biscuit comes along everywhere, a little behind the player.
  const dogAt = kind === 'hub'
    ? new THREE.Vector3(hub.cave.dogSpot.x, 0, hub.cave.dogSpot.z)
    : trip.spawn.position.clone().add(new THREE.Vector3(1.2, 0, 1.2));
  if (hasModel('dog-0')) {
    const c = createCreature({ modelId: 'dog-0', height: 0.9, position: dogAt, heightAt: area.heightAt, name: 'Biscuit' });
    const brain = createDogBrain({ rng: rng.fork('dog'), events, body: c.body, world, affection: Math.min(1, 0.4 + (session.state.friendship.dog ?? 0) * 0.05) });
    parent.add(c.root);
    dog = { creature: c, brain, kind: 'dog' };
    creatures.push(dog);
  }
  // Critters.
  const spots = kind === 'hub'
    ? hub.cave.critterSpots.map((p, i) => ({ id: `hub-critter-${i}`, itemId: ['critter-cream', 'critter-mint', 'critter-blush'][i % 3], x: p.x, z: p.z, home: { x: p.x, z: p.z }, height: p.height }))
    : data.critters.map((c) => ({ ...c, itemId: c.itemId ?? CRITTER_KINDS[c.kind] }));
  const all = [];
  for (const s of spots) {
    const modelId = CRITTER_MODELS[s.itemId] ?? 'critter-0';
    if (!hasModel(modelId)) continue;
    const c = createCreature({ modelId, height: s.height ?? 0.42, position: new THREE.Vector3(s.x, 0, s.z), heightAt: area.heightAt, hopScale: 1.4 });
    const brain = createCritterBrain({
      rng: rng.fork(s.id), events, body: c.body, world, itemId: s.itemId, id: s.id, home: s.home ?? { x: s.x, z: s.z },
      neighbours: () => all.filter((o) => o !== c).map((o) => o.body.position), sighted,
    });
    all.push(c);
    parent.add(c.root);
    creatures.push({ creature: c, brain, kind: 'critter', itemId: s.itemId });
  }
  // Mira (hub only): her painted figure stays at her railing; her brain turns, looks and waves.
  if (kind === 'hub') {
    const npc = hub.cave.npc;
    const body = {
      position: { x: hub.cave.npcPosition.x, z: hub.cave.npcPosition.z }, yaw: hub.cave.npcFacing, velocity: { x: 0, z: 0 },
      pose: 'idle', look: null,
      setPose(p) { body.pose = p; }, lookAt(p) { body.look = p ? { x: p.x, z: p.z } : null; },
    };
    const home = { x: body.position.x, z: body.position.z };
    const brain = createNpcBrain({ rng: rng.fork('mira'), events, body, world: { ...world, walkable: (x, z) => Math.hypot(x - home.x, z - home.z) < 0.6 }, routine: [{ ...home, idle: 6 }] });
    let wave = 0;
    let turn = hub.cave.npcFacing;
    creatures.push({
      kind: 'npc', brain, body,
      creature: {
        root: npc.group,
        update(time, dt) {
          wave += ((body.pose === 'wave' ? 1 : 0.0) - wave) * (1 - Math.exp(-dt * 6));
          const face = body.look ? Math.atan2(body.look.x - home.x, body.look.z - home.z) : hub.cave.npcFacing;
          let d = face - turn;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          turn += d * (1 - Math.exp(-dt * 3));
          npc.group.rotation.y = turn;
          npc.update(time, wave);
        },
      },
    });
  }
}

// --- Flow --------------------------------------------------------------------------------------

function showTitle() {
  mode = 'title';
  hud.setVisible(false);
  input.setContext('menu');
  input.unlockPointer?.();
  ui.reset('title');
}

function startGame(state) {
  goFullscreen(); // inside the tap that chose New Game / Continue / Load
  session?.dispose();
  session = createSession({ state, events, labels });
  refreshQuestCatalogue();
  sighted = new Set(Object.keys(state.collection).filter((id) => ITEM_BY_ID[id]?.sighting));
  mode = 'play';
  ui.reset(); // the stack cleared without a resume: play starts here
  hud.setVisible(true);
  if (state.area?.kind === 'trip' && state.area.seed != null) {
    enterHub({ spawn: true });
    enterTrip(state.area.seed, state.area.biome);
  } else {
    enterHub({ spawn: !state.player?.position });
  }
  session.quests.resettle();
  events.emit(EVENTS.GAME_STARTED, { slot: state.slot, state });
  if (state.area?.kind !== 'trip') events.emit(EVENTS.AREA_ENTERED, { area: 'hub' });
  input.setContext('gameplay');
  input.lockPointer?.();
  if (!state.flags.metMira && !state.quests.welcome) {
    events.emit(EVENTS.TOAST, { text: 'Welcome to the Nest! Say hello to Mira on the terrace.', kind: 'quest' });
  }
}

function quitToTitle() {
  if (session) {
    snapshotPlayer();
    saves.autosave(session.state, 'quit');
  }
  session?.dispose();
  session = null;
  clearCreatures();
  if (trip) enterHub({ spawn: true, title: true });
  hub.syncDecor([]);
  showTitle();
}

function pause(screen = 'pause') {
  if (mode !== 'play' || ui.isOpen?.()) return;
  input.setContext('menu');
  input.unlockPointer?.();
  events.emit(EVENTS.PAUSED, {});
  ui.open(screen);
}
function resume() {
  while (ui.isOpen?.()) ui.close();
  if (mode !== 'play') return;
  input.setContext('gameplay');
  input.lockPointer?.();
  events.emit(EVENTS.RESUMED, {});
}

function snapshotPlayer() {
  const s = getState();
  if (!s) return;
  s.player = { position: player.position.toArray(), yaw: player.yaw, pitch: player.pitch };
}

let fading = null;
async function fadeTo(fn) {
  busy = true;
  fading ??= Object.assign(document.createElement('div'), { className: 'game-fade' });
  if (!fading.isConnected) {
    fading.style.cssText = 'position:fixed;inset:0;background:#fbefe6;opacity:0;transition:opacity .45s;pointer-events:none;z-index:15';
    document.body.appendChild(fading);
  }
  fading.style.opacity = '1';
  await new Promise((r) => setTimeout(r, 480));
  try { fn(); } catch (e) { console.error(e); }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  fading.style.opacity = '0';
  busy = false;
}

// --- Interactions ------------------------------------------------------------------------------

async function talk(graph, { speaker = null, face = null } = {}) {
  busy = true;
  player.setFrozen(true);
  input.setContext('dialogue');
  input.unlockPointer?.();
  const mira = creatures.find((c) => c.kind === 'npc');
  if (speaker === 'mira') mira?.brain.blackboard.set('inConversation', true);
  events.emit(EVENTS.DIALOGUE_OPEN, { speaker });
  const runner = session.dialogue(graph);
  let step = runner.start();
  while (step) {
    if (face) faceTarget = face;
    const choice = await ui.dialogue.show({ speaker: step.speaker, text: step.text, choices: step.choices });
    step = runner.choose(step.choices.length ? (choice ?? step.choices.length - 1) : 0);
  }
  ui.dialogue.hide();
  faceTarget = null;
  mira?.brain.blackboard.set('inConversation', false);
  events.emit(EVENTS.DIALOGUE_CLOSE, { speaker });
  player.setFrozen(false);
  input.setContext('gameplay');
  input.lockPointer?.();
  busy = false;
  return session.ctx.result;
}
let faceTarget = null;

async function interact(target) {
  const s = session.state;
  events.emit(EVENTS.INTERACTED, { id: target.id, kind: target.kind });
  if (target.kind === 'npc') {
    await talk(session.graphs.MIRA, { speaker: 'mira', face: target.position });
  } else if (target.kind === 'door') {
    if (s.flags.doorOpen) {
      const r = await talk(session.graphs.GATE(false), { face: target.position });
      if (r === 'go') fadeTo(() => enterTrip(nextSeed()));
    } else if (!s.flags.lockNotes) {
      events.emit(EVENTS.TOAST, { text: t('door.sealed'), kind: 'info' });
    } else {
      openLock();
    }
  } else if (target.kind === 'dog') {
    dog.brain.onInteract?.();
    fluff.puff(dog.creature.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 14, colors: ['#fbeee0', '#f6c9cf', '#fff'] });
    const n = 1 + Math.floor(Math.random() * 3);
    events.emit(EVENTS.TOAST, { text: t(`dog.pet.${n}`), kind: 'info' });
    if (!s.flags.hasBall) {
      s.flags.hasBall = true;
      setTimeout(() => events.emit(EVENTS.TOAST, { text: t('dog.ball', labels()), kind: 'quest' }), 1400);
      if (!s.quests.biscuit) session.quests.start('biscuit');
    }
  } else if (target.kind === 'gate') {
    const r = await talk(session.graphs.GATE(true), { face: target.position });
    if (r === 'go') fadeTo(() => { snapshotPlayer(); session.endTrip(); s.flags.hubTaken = []; enterHub({ fromTrip: true }); });
  } else if (target.kind === 'chime') {
    touchChime(target.index);
  }
}

function openLock() {
  busy = true;
  player.setFrozen(true);
  input.setContext('menu');
  input.unlockPointer?.();
  lockUi.show(session.lock, () => session.tryLock()).then((r) => {
    player.setFrozen(false);
    input.setContext('gameplay');
    input.lockPointer?.();
    busy = false;
    if (r === 'open') {
      hub.setDoor(true);
      player.addTrauma(0.35);
      setTimeout(() => { if (area?.kind === 'hub') events.emit(EVENTS.TOAST, { text: t('door.through'), kind: 'quest' }); }, 2600);
    }
  });
}

function nextSeed() {
  if (params.has('seed')) {
    const forced = codeToSeed(params.get('seed'));
    params.delete('seed');
    if (forced != null) return forced;
  }
  const s = session.state;
  return hashString(`${s.createdAt}:trip:${s.trips.taken}`) >>> 0;
}

function touchChime(i) {
  if (!chime || chime.ring.state.solved) return;
  trip.chimes.userData.lit(i, 1);
  events.emit(EVENTS.PUZZLE_TURN, { puzzleId: 'chime', index: i });
  const r = chime.ring.touch(i);
  if (r === 'wrong') {
    events.emit(EVENTS.TOAST, { text: t('trip.chime.wrong'), kind: 'info' });
    playChimes(1.2);
  } else if (r === 'round') {
    playChimes(0.9);
  } else if (r === 'solved') {
    events.emit(EVENTS.PUZZLE_SOLVED, { puzzleId: 'chime' });
    events.emit(EVENTS.TOAST, { text: t('trip.chime.solved'), kind: 'quest' });
    const table = findTable(trip.data.biome).filter((e) => ['rare', 'legendary'].includes(ITEM_BY_ID[e.item].rarity));
    const pick = createRng(trip.data.seed).fork('chime-reward').weighted(table.length ? table : findTable(trip.data.biome));
    const at = trip.chimes.position.clone();
    trip.addFind(pick, at, `chime-${trip.data.seed}`);
    fluff.puff(at.clone().add(new THREE.Vector3(0, 0.4, 0)), { count: 30, colors: ['#ffe9a8', '#f6c9cf', '#c6c0ec', '#fff'], spread: 2, lift: 2.4 });
  }
}

/** Plays the chime ring's sequence after a delay (the player watches, then repeats it). */
function playChimes(delay = 0.6) {
  const seq = chime.ring.sequence();
  chime.show = { seq, t: -delay, i: 0 };
}

// --- Decorating ----------------------------------------------------------------------------------

function toggleDecorate() {
  const s = session.state;
  if (decorating) { endDecorate(); return; }
  if (area.kind !== 'hub' || !s.flags.basket) return;
  const items = session.placeable();
  if (!items.length) { events.emit(EVENTS.TOAST, { text: t('decor.none'), kind: 'info' }); return; }
  decorating = { index: 0, yaw: 0, ghost: null, ring: null, spot: null, ok: false };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#a8e6b9', transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(ring);
  decorating.ring = ring;
  setGhost();
}
function setGhost() {
  const items = session.placeable();
  if (!items.length) { endDecorate(); return; }
  decorating.index = (decorating.index + items.length) % items.length;
  decorating.ghost?.removeFromParent();
  const it = items[decorating.index];
  decorating.ghost = buildFindModel(it.item.id);
  scene.add(decorating.ghost);
  ui.showDecorate?.({ item: it.item, count: it.count, prompts: [
    { key: input.labelFor(ACTIONS.INTERACT), label: 'Place' }, { key: input.labelFor(ACTIONS.ROTATE), label: 'Turn' },
    { key: 'Wheel / Q', label: 'Next' }, { key: input.labelFor(ACTIONS.PICK_UP), label: 'Pick up' }, { key: input.labelFor(ACTIONS.DECORATE), label: 'Done' },
  ] });
}
function endDecorate() {
  if (!decorating) return;
  decorating.ghost?.removeFromParent();
  decorating.ring?.removeFromParent();
  decorating = null;
  ui.hideDecorate?.();
}
let wheel = 0;
addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('keydown', (e) => { if (decorating && !e.repeat && (e.code === 'KeyQ' || e.code === 'Tab')) { wheel += e.code === 'KeyQ' ? -1 : 1; e.preventDefault(); } });

/** The block top the view ray first meets within reach, or null. */
function aimSpot() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const p = camera.position.clone();
  let prevY = p.y;
  for (let d = 0; d < REACH; d += 0.04) {
    p.addScaledVector(dir, 0.04);
    const h = area.heightAt(p.x, p.z);
    if (h >= 50) return null;
    if (p.y <= h) {
      if (prevY < h - 0.08) return null; // hit a side
      return { x: p.x, y: h, z: p.z };
    }
    prevY = p.y;
  }
  return null;
}

function updateDecorate() {
  if (wheel !== 0) { decorating.index += wheel; wheel = 0; setGhost(); events.emit(EVENTS.UI_MOVE, {}); }
  if (!decorating) return;
  if (input.pressed(ACTIONS.ROTATE)) decorating.yaw += Math.PI / 4;
  const spot = aimSpot();
  const items = session.placeable();
  const it = items[decorating.index];
  let ok = false;
  if (spot) {
    const r = session.canPlace(spot, { heightAt: area.heightAt, kindAt: area.kindAt, protect: hub.protect, player: player.position, reach: REACH });
    ok = r.ok;
    decorating.reason = r.reason;
    decorating.ghost.visible = true;
    decorating.ghost.position.set(spot.x, spot.y, spot.z);
    decorating.ghost.rotation.y = decorating.yaw;
    decorating.ring.visible = true;
    decorating.ring.position.set(spot.x, spot.y + 0.02, spot.z);
  } else {
    decorating.ghost.visible = false;
    decorating.ring.visible = false;
  }
  decorating.ring.material.color.set(ok ? '#a8e6b9' : '#f2a3a3');
  if (input.pressed(ACTIONS.INTERACT)) {
    if (ok && it) {
      session.placeDecor(it.item.id, spot, decorating.yaw);
      hub.syncDecor(session.state.decor);
      fluff.puff(new THREE.Vector3(spot.x, spot.y, spot.z), { count: 12, colors: ['#fbeee0', '#e9dccb'] });
      events.emit(EVENTS.TOAST, { text: t('decor.placed', { item: it.item.name }), kind: 'info' });
      setGhost();
    } else {
      events.emit(EVENTS.TOAST, { text: t('decor.blocked'), kind: 'info' });
    }
  }
  if (decorating && input.pressed(ACTIONS.PICK_UP) && spot) {
    const d = session.pickUpDecor(new THREE.Vector3(spot.x, spot.y, spot.z));
    if (d) {
      hub.syncDecor(session.state.decor);
      events.emit(EVENTS.TOAST, { text: t('decor.picked', { item: ITEM_BY_ID[d.itemId].name }), kind: 'info' });
      setGhost();
    }
  }
}

// --- Bus reactions (juice) -------------------------------------------------------------------------

events.on(EVENTS.LANDED, ({ impact }) => {
  fluff.puff(player.position, { count: 6 + Math.round(impact * 14), colors: ['#fbf3ea', '#f1e2d4'], spread: 0.8 + impact, lift: 0.6 });
});
events.on(EVENTS.STEP, ({ running, surface }) => {
  if (running) fluff.puff(player.position, { count: 2, colors: [surface === 'water' ? '#d8e8f6' : '#f6ece2'], spread: 0.4, lift: 0.4, size: 0.06, life: 0.5 });
});
events.on(EVENTS.FIND_COLLECTED, ({ itemId, position, sighting }) => {
  if (sighting || !position) return;
  const item = ITEM_BY_ID[itemId];
  const c = { common: ['#fff6ea'], uncommon: ['#bfe6cc', '#fff'], rare: ['#bcd4f2', '#fff'], legendary: ['#ffe39a', '#f6c9cf', '#fff'] }[item.rarity];
  fluff.puff(new THREE.Vector3(...position), { count: item.rarity === 'common' ? 10 : 24, colors: c, spread: 1.4, lift: 2 });
  if (item.rarity === 'legendary') player.addTrauma(0.2);
});
events.on(EVENTS.CRITTER_SIGHTED, ({ itemId }) => session?.sight(itemId));
events.on(EVENTS.DOG_FETCHED, () => {
  // Biscuit dropped the ball at the player's feet: it's back in hand.
  if (ball.state === 'landed' || ball.state === 'carried') ball.pickUp();
});
events.on(EVENTS.SETTINGS_CHANGED, ({ settings: s }) => { if (s && s !== settings) settings = { ...settings, ...s }; });

// --- Frame ---------------------------------------------------------------------------------------

const clock = new THREE.Clock();
const perf = { frames: [], last: 0 };
const tmp = new THREE.Vector3();
let time = 0;
let titleT = 0;
let playClock = 0;

/** The current area's interactables (the Nest computes its own: the door's label changes; a trip lists them). */
function areaInteractables() {
  if (!area) return [];
  return typeof area.interactables === 'function' ? area.interactables() : area.interactables ?? [];
}

function nearestInteractable() {
  const list = [...areaInteractables()];
  if (dog) list.push({ id: 'dog', kind: 'dog', label: 'Pet Biscuit', position: dog.creature.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)), radius: 1.9 });
  const eye = camera.position;
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  let best = null;
  let bestScore = Infinity;
  for (const it of list) {
    const d = tmp.copy(it.position).sub(eye);
    const dist = Math.hypot(d.x, d.z);
    if (dist > it.radius + 0.6) continue;
    const facing = d.normalize().dot(fwd);
    if (facing < 0.35 && dist > 1.2) continue;
    const score = dist - facing * 1.5;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  time += dt;
  sharedFurUniforms.uTime.value = time;
  const t0 = performance.now();
  renderer.info.reset();
  input.update(dt);

  if (rendererChoice?.open) {
    for (const a of [ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT, ACTIONS.UI_CONFIRM]) if (input.pressed(a)) rendererChoice.handle(a);
  } else if (mode === 'title' || mode === 'loading') {
    // The title's backdrop: the Nest from the painter's corner, drifting softly.
    titleT += dt;
    const sp = hub?.cave.spawn;
    if (sp) {
      camera.position.set(sp.position.x - 0.6 + Math.sin(titleT * 0.13) * 0.8, 4.1 + Math.sin(titleT * 0.21) * 0.15, sp.position.z + 0.4);
      camera.rotation.set(sp.pitch + 0.02, sp.yaw + Math.sin(titleT * 0.1) * 0.12, 0, 'YXZ');
    }
    for (const a of [ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT, ACTIONS.UI_CONFIRM, ACTIONS.UI_BACK, ACTIONS.UI_TAB_PREV, ACTIONS.UI_TAB_NEXT]) {
      if (input.pressed(a)) ui.handleAction(a);
    }
  } else if (mode === 'play') {
    playClock += dt;
    session.state.playTime = (session.state.playTime ?? 0) + dt;
    updatePlay(dt);
  }
  if (hub?.group.visible) hub.update(time, dt);
  // The on-screen controls show only while playing (menus, dialogue and the lock take taps).
  touchUi.setVisible(mode === 'play' && touchActive() && input.context === 'gameplay' && !busy && !ui.isOpen?.() && !lockUi.open);
  ui.update?.(dt);
  fluff.update(dt);
  ambient.update(dt, time, area ? player.position : null);
  sky.position.copy(camera.position);
  if (sdfWorld) {
    // The great door rises like a felt curtain (the mesh renderer animates its door mesh the same way).
    const d = hub?.doorOpen ?? 0;
    sdfWorld.setDoorLift(d * d * (3 - 2 * d) * (DOOR.height - 0.3));
    sdfWorld.update(camera);
  }
  post.render(time, sharedFurUniforms.uSunDir.value, sharedFurUniforms.uSunColor.value);

  // Profiling.
  const ms = performance.now() - t0;
  perf.frames.push(ms);
  if (perf.frames.length > 120) perf.frames.shift();
  if (settings.showFps && time - perf.last > 0.5) {
    perf.last = time;
    const sorted = [...perf.frames].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    hud.setPerf(true, {
      fps: 1 / Math.max(dt, 1e-3), ms: avg, p95: sorted[Math.floor(sorted.length * 0.95)] ?? avg,
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      chunks: area?.kind === 'trip' ? `${trip.world.stats().built}/${trip.world.stats().chunks}` : 'hub',
    }, BUDGET);
  } else if (!settings.showFps) hud.setPerf(false);
}

function updatePlay(dt) {
  const s = session.state;
  const uiOpen = ui.isOpen?.() || lockUi.open;
  // Menus and overlays take UI actions.
  if (uiOpen || input.context !== 'gameplay') {
    for (const a of [ACTIONS.UI_UP, ACTIONS.UI_DOWN, ACTIONS.UI_LEFT, ACTIONS.UI_RIGHT, ACTIONS.UI_CONFIRM, ACTIONS.UI_BACK, ACTIONS.UI_TAB_PREV, ACTIONS.UI_TAB_NEXT]) {
      if (!input.pressed(a)) continue;
      if (lockUi.open) lockUi.handle(a);
      else if (ui.handleAction(a)) { /* consumed */ }
    }
    if (input.context === 'menu' && !ui.isOpen?.() && !lockUi.open && !busy) resume();
  } else if (!busy) {
    if (input.pressed(ACTIONS.PAUSE)) { endDecorate(); pause('pause'); }
    else if (input.pressed(ACTIONS.JOURNAL)) { endDecorate(); pause('journal'); }
    else if (input.pressed(ACTIONS.COLLECTION)) { endDecorate(); pause('collection'); }
    else if (input.pressed(ACTIONS.DECORATE)) toggleDecorate();
    if (decorating) updateDecorate();
    else {
      const near = nearestInteractable();
      const prompts = [];
      if (near) prompts.push({ key: input.labelFor(ACTIONS.INTERACT), text: near.label });
      if (s.flags.hasBall && ball.state === 'held' && area) prompts.push({ key: input.labelFor(ACTIONS.THROW), text: 'Throw the ball' });
      // On touch the buttons say it themselves (the interact button's bubble).
      hud.setPrompt(touchUi.visible ? [] : prompts);
      touchUi.setState({ interact: near?.label ?? null, canThrow: !!s.flags.hasBall && ball.state === 'held', canDecorate: area.kind === 'hub' && !!s.flags.basket });
      if (near && input.pressed(ACTIONS.INTERACT)) interact(near);
      if (s.flags.hasBall && ball.state === 'held' && input.pressed(ACTIONS.THROW)) {
        const dir = camera.getWorldDirection(new THREE.Vector3());
        ball.throw(camera.position.clone().addScaledVector(dir, 0.5).add(new THREE.Vector3(0, -0.25, 0)), dir, 9);
        audio.play?.('throw');
      }
    }
    if (decorating) {
      hud.setPrompt([]);
      touchUi.setState({ decorating: true, canDecorate: true });
    }
  } else {
    hud.setPrompt([]);
  }
  if (faceTarget) player.faceToward(faceTarget, 0.08);
  player.update(dt);

  // Finds underfoot.
  const taken = area.takeNear(player.position);
  for (const f of taken) {
    const pos = [player.position.x, player.position.y + 0.3, player.position.z];
    session.collectFind(f.itemId, { inTrip: area.kind === 'trip', position: pos });
    if (area.kind === 'hub' && f.index != null) s.flags.hubTaken = [...(s.flags.hubTaken ?? []), f.index];
    events.emit(EVENTS.SAVE_REQUESTED, { reason: 'find' });
  }
  // A ball lying by the player (not the dog's to fetch any more) is picked up.
  if (ball.state === 'landed' && Math.hypot(ball.position.x - player.position.x, ball.position.z - player.position.z) < 0.8 && (!dog || dog.brain.state() !== 'fetch:run')) ball.pickUp();

  // Creatures.
  for (const c of creatures) {
    c.brain.tick(dt);
    c.creature.update(time, dt);
  }
  if (ball.state === 'carried' && dog) ball.mesh.position.copy(dog.creature.mouth(tmp));
  ball.update(dt);

  // Area updates.
  if (area.kind === 'trip') {
    trip.update(time, dt, player.position);
    updateChime(dt);
  }
  hud.setQuest(session.quests.tracked());
  // Same count as the collection book: every catalogued kind, the story badge included.
  hud.setFinds(ITEMS.filter((i) => s.collection[i.id]).length, ITEMS.length);

  // Autosave (throttled by the save system).
  if (playClock > 12) {
    playClock = 0;
    snapshotPlayer();
    saves.autosave(s, 'tick');
  }
}

function updateChime(dt) {
  if (!chime) return;
  const at = trip.chimes.position;
  const d = Math.hypot(at.x - player.position.x, at.z - player.position.z);
  if (!chime.noticed && d < 6) {
    chime.noticed = true;
    events.emit(EVENTS.TOAST, { text: t('trip.chime.found'), kind: 'quest' });
    playChimes(1.0);
  }
  if (chime.show) {
    chime.show.t += dt;
    const k = Math.floor(chime.show.t / 0.75);
    if (chime.show.t >= 0 && k >= chime.show.i && k < chime.show.seq.length) {
      trip.chimes.userData.lit(chime.show.seq[k], 1);
      events.emit(EVENTS.PUZZLE_TURN, { puzzleId: 'chime', index: chime.show.seq[k] });
      chime.show.i = k + 1;
    }
    if (chime.show.t > chime.show.seq.length * 0.75 + 0.3) {
      chime.show = null;
      chime.ring.state.showing = false;
      chime.ring.shown?.();
    }
  }
}

/** Fits the canvas, post targets and camera to the visible viewport (resize, rotation, browser bars). */
function fitView() {
  const { width, height } = viewSize();
  camera.aspect = width / height;
  if (mode !== 'play') camera.fov = fovFor(settings.fov, camera.aspect); // in play the controller eases it
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  post.setSize(width, height);
}
addEventListener('resize', fitView);
// iOS Safari ignores user-scalable=no for pinches; stop the page zooming under two thumbs.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());
/** On touch screens, starting play asks for fullscreen (Android hides the browser bars; iPhone declines quietly). */
function goFullscreen() {
  if (!touchActive() || params.has('nofs') || document.fullscreenElement) return;
  try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* not allowed here */ }
}
addEventListener('orientationchange', () => setTimeout(fitView, 120));
globalThis.visualViewport?.addEventListener('resize', fitView);
addEventListener('pagehide', () => { if (session) { snapshotPlayer(); saves.autosave(session.state, 'quit'); saves.flush?.(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && session) { snapshotPlayer(); saves.flush?.(); } });

// Read-only handles and test hooks (scripts/game/playtest.mjs).
window.__phluphGame = {
  get mode() { return mode; },
  get state() { return getState(); },
  get area() { return area?.kind; },
  get _area() { return area; },
  get _feet() { return player.position; },
  get settingsNow() { return settings; },
  get renderMode() { return renderMode; },
  get touchControls() { return touchUi; },
  get trip() { return trip?.data ? { code: trip.data.code, biome: trip.data.biome, name: trip.data.name, finds: trip.finds.length } : null; },
  get player() { return { position: player.position.toArray(), yaw: player.yaw }; },
  get creatures() { return creatures.map((c) => ({ kind: c.kind, state: c.brain.state(), position: [c.body?.position.x ?? c.creature.body.position.x, c.body?.position.z ?? c.creature.body.position.z] })); },
  get hubFinds() { return hub?.finds.map((f) => ({ itemId: f.data.itemId, position: f.root.position.toArray() })) ?? []; },
  get tripFinds() { return trip?.finds.map((f) => ({ itemId: f.data.itemId, position: f.root.position.toArray() })) ?? []; },
  teleport: (x, z, yaw = player.yaw, pitch = 0) => player.teleport(new THREE.Vector3(x, 0, z), yaw, pitch),
  interact: (id) => { const list = areaInteractables(); const it = list.find((i) => i.id === id) ?? (id === 'dog' && dog ? { id: 'dog', kind: 'dog' } : null); return it ? interact(it) : null; },
  enterTrip: (code) => enterTrip(codeToSeed(code)),
  goHome: () => { session.endTrip(); enterHub({ fromTrip: true }); },
  startGame: (slot = 1) => startGame(newGameState({ slot, name: 'Test Nest' })),
  ui, input, events, session: () => session, saves, perf: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, frames: [...perf.frames] }),
  seedToCode,
  /** Triangles per named group under the scene (profiling: where the budget goes). */
  triangles() {
    const out = {};
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints) return;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      let p = o;
      const path = [];
      while (p && p !== scene) { if (p.name) path.unshift(p.name); p = p.parent; }
      const key = (path.slice(0, 2).join('/') || '(unnamed)') + (path.length < 2 ? ` <${g.type}${o.isInstancedMesh ? ' inst' : ''} ${o.material?.type}>` : '');
      out[key] = (out[key] ?? 0) + n;
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}: ${Math.round(v / 1000)}k`);
  },
};

renderer.setAnimationLoop(frame);
boot().catch((e) => {
  console.error(e);
  hud.loading(1, `Something unravelled: ${e.message}`);
});
