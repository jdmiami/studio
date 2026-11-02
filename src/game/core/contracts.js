// The game's shared contracts: the names every system agrees on. Systems never import each other;
// they talk through the event bus (src/game/core/events.js) with these event names, read input
// through these action names, and persist this state shape (src/game/save/ migrates older ones).

/** Input actions (src/game/input/ maps keys, mouse and gamepad onto these). */
export const ACTIONS = {
  // Gameplay
  MOVE_FORWARD: 'moveForward', MOVE_BACK: 'moveBack', MOVE_LEFT: 'moveLeft', MOVE_RIGHT: 'moveRight',
  JUMP: 'jump', RUN: 'run', INTERACT: 'interact', THROW: 'throw', DECORATE: 'decorate',
  ROTATE: 'rotate', PICK_UP: 'pickUp',
  JOURNAL: 'journal', COLLECTION: 'collection', PAUSE: 'pause',
  // Menus (also driven by arrows / d-pad / stick)
  UI_UP: 'uiUp', UI_DOWN: 'uiDown', UI_LEFT: 'uiLeft', UI_RIGHT: 'uiRight', UI_CONFIRM: 'uiConfirm', UI_BACK: 'uiBack',
  UI_TAB_PREV: 'uiTabPrev', UI_TAB_NEXT: 'uiTabNext',
};

/** Event names on the bus, with their payloads. */
export const EVENTS = {
  // Flow
  GAME_STARTED: 'game:started', // { slot, state }
  AREA_ENTERED: 'area:entered', // { area: 'hub' | 'trip', seed?, biome? }
  PAUSED: 'game:paused', RESUMED: 'game:resumed',
  // Player
  STEP: 'player:step', // { surface: 'felt' | 'stone' | 'water' | 'grass', running }
  JUMPED: 'player:jumped', LANDED: 'player:landed', // landed: { impact: 0..1, surface }
  // Gameplay
  FIND_COLLECTED: 'find:collected', // { itemId, rarity, first: bool, position }
  CRITTER_SIGHTED: 'critter:sighted', // { itemId }
  INTERACTED: 'interact', // { id, kind }
  QUEST_STARTED: 'quest:started', QUEST_STEP: 'quest:step', QUEST_DONE: 'quest:done', // { questId, step? }
  DIALOGUE_OPEN: 'dialogue:open', DIALOGUE_CLOSE: 'dialogue:close', // { speaker }
  PUZZLE_TURN: 'puzzle:turn', PUZZLE_SOLVED: 'puzzle:solved', // { puzzleId }
  DOOR_OPENED: 'door:opened',
  DECOR_PLACED: 'decor:placed', DECOR_REMOVED: 'decor:removed',
  DOG_BARK: 'dog:bark', DOG_FETCHED: 'dog:fetched', PETTED: 'creature:petted', // { creature }
  CRITTER_SQUEAK: 'critter:squeak',
  TOAST: 'ui:toast', // { text, kind?: 'info' | 'find' | 'quest' }
  // Persistence
  SAVE_REQUESTED: 'save:requested', // { reason }
  SAVED: 'save:saved', // { slot, at }
  SAVE_FAILED: 'save:failed', // { error }
  // UI
  UI_OPEN: 'ui:open', UI_CLOSE: 'ui:close', // { screen }
  UI_MOVE: 'ui:move', UI_CONFIRM: 'ui:confirm', UI_BACK: 'ui:back',
  SETTINGS_CHANGED: 'settings:changed', // { settings }
};

export const SAVE_VERSION = 3;

/** Settings (global, not per slot), with defaults. */
export function defaultSettings() {
  return {
    volume: { master: 0.8, sfx: 0.8, ambience: 0.6, ui: 0.7 },
    mouseSensitivity: 1, invertY: false, fov: 70, gamepadDeadzone: 0.18, lookSensitivityPad: 1,
    quality: 'high', // 'low' | 'medium' | 'high'
    showFps: false, headBob: true, cameraShake: true,
    // Touch screens: 'auto' shows the on-screen controls on touch devices; 'on' / 'off' force it.
    touchControls: 'auto', touchLookSensitivity: 1, touchButtonScale: 1,
    // How the world is drawn: 'threejs' (painted meshes), 'sdf' (raymarched), or 'ask' before loading.
    renderer: 'ask',
    camera: 'third', // 'third' (over the shoulder) | 'first'
    bindings: null, // null = the input system's defaults; else { [action]: [binding, ...] }
  };
}

/** A new game's state (one save slot). */
export function newGameState({ slot = 1, name = 'Nest', now = Date.now() } = {}) {
  return {
    version: SAVE_VERSION,
    slot, name,
    createdAt: now, updatedAt: now, playTime: 0,
    area: { kind: 'hub', seed: null, biome: null },
    player: { position: null, yaw: null, pitch: 0 },
    // Collection: itemId -> { count, firstAt }
    collection: {},
    // What the player carries home to decorate with: itemId -> count (finds go here too).
    inventory: {},
    // Quests: questId -> { status: 'active' | 'done', step, vars: {} }
    quests: {},
    // Story flags and counters (doorOpen, metMira, dogFriend, tripsTaken...).
    flags: {},
    friendship: { mira: 0, dog: 0 },
    // Hub decorations: [{ id, itemId, position: [x, y, z], yaw }]
    decor: [],
    trips: { taken: 0, lastSeed: null, visited: [] },
  };
}
