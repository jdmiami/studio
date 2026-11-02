# src/game/save

Saves for Phluph: 3 manual slots, 1 autosave slot and global settings, in `localStorage` (or any
`{ getItem, setItem, removeItem }` adapter). No dependencies; runs in the browser and in Node tests.

```js
import { createSaveSystem } from './save/index.js';
const saves = createSaveSystem({ events, getState: () => game.state });
saves.listSlots();            // [{ slot: 1, empty, meta: { name, updatedAt, playTime, area, biome, finds, questsDone, version } }, 2, 3, 'auto']
saves.save(1, state);         // crash-safe write; throws SaveError and emits SAVE_FAILED on failure
saves.load(1);                // state migrated to SAVE_VERSION, or null if the slot is empty
saves.loadDetailed(1);        // { state, source: 'current'|'backup'|'temp', recovered, storedVersion, warning? }
saves.autosave(state, 'find');// throttled (10 s); 'quest' | 'area' | 'quit' write at once. Never throws.
saves.flush();                // write a deferred autosave now (page hide)
saves.exportSlot(1);          // base64 save code; saves.importSlot(2, code) validates, migrates, saves
saves.delete(1);
saves.loadSettings(); saves.saveSettings(s);   // merged over defaultSettings()
```

Events: listens to `SAVE_REQUESTED { reason, state?, slot? }` (no slot → autosave, no state → `getState()`)
and `SETTINGS_CHANGED { settings }` (persists them). Emits `SAVED { slot, at, reason }` and
`SAVE_FAILED { error, code, slot, recovered, source? }`; `recovered: true` means the load worked from a backup.

Errors are `SaveError` with `code`: `CORRUPT`, `NEWER_VERSION`, `MISSING`, `QUOTA`, `STORAGE`, `BAD_SLOT`, `NO_STATE`.

## Format

Keys (prefix `phluph`): `phluph:save:<1|2|3|auto>` (current), `…:bak` (previous good save), `…:tmp`
(only exists mid-write or after a crash), `phluph:settings`.

Each value is an envelope:

```json
{ "magic": "phluph-save", "version": 3, "savedAt": 1730000000000, "checksum": "crc32:1a2b3c4d", "data": { …state… } }
```

`checksum` is CRC-32 of the UTF-8 bytes of `JSON.stringify(data)`. It detects truncation and stray edits,
not cheating. Settings use the same envelope with magic `phluph-settings`. An export code is plain base64
of the envelope JSON.

## Writes and recovery

`save()` writes the envelope to `tmp`, reads it back and verifies it, copies `current` to `bak` (only if
`current` itself verifies, so a corrupt save never overwrites the good backup), writes `current`, then
removes `tmp`. Each `setItem` replaces a whole key, so a crash at any point leaves a verified `current`
or `bak`.

`load()` tries `current`, then `bak`, then a verified `tmp` (a fully written save that a crash stopped before commit).
If a fallback is used it emits `SAVE_FAILED { recovered: true }` and still returns the state. It throws
`CORRUPT` only when nothing is readable. If the newest readable copy is from a newer build it throws
`NEWER_VERSION` instead of falling back to an older backup.

Every loaded or imported save goes through `migrate()` and then `repairState()`, which fills anything
missing or mistyped from `newGameState()` so partial or hand-edited saves never crash the game.

## Adding a migration

When the state shape in `core/contracts.js` changes:

1. Bump `SAVE_VERSION` (say to 4) and update `newGameState()`.
2. Append `{ from: 3, to: 4, migrate(data) { … } }` to `MIGRATIONS` in `migrations.js`. Make it pure
   (clone, don't mutate), set new fields to defaults, and move renamed fields; never leave old names for
   game code to read.
3. Update `repairState()` if the new fields need type checks beyond "missing → default".
4. Add a test that loads a v3 fixture and checks the v4 result. Never edit or delete a shipped migration,
   because that strands every save of that version.
