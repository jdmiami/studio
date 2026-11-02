# Audio (`src/game/audio/`)

Ambience and SFX for Phluph, synthesized live with the Web Audio API: no audio files, no network,
no dependencies, no music system. Everything is meant to sound soft and felt-like: low-passed
noise, sine/triangle tones, gentle FM bells, millisecond attacks, and a warm master low-pass.

| File | What it holds |
| --- | --- |
| `index.js` | `createAudio()`: the bus graph, voices, event wiring |
| `synth.js` | one recipe per sound, plus the primitives (`tone`, `noise`, `bell`, envelopes) |
| `ambience.js` | the four looping layers and their sparse events |
| `mix.js` | pure helpers (tested): dB curves, variation, voice limiter, sound table, presets, event routing |
| `noise.js` | pure sample generators (tested): white/pink/brown noise, seamless loops, the reverb impulse |

## API

```js
import { createAudio } from './game/audio/index.js';

const audio = createAudio({ events, settings });   // settings.volume seeds the buses
addEventListener('pointerdown', () => audio.unlock(), { once: true }); // and on first keydown
// each frame:
audio.update(dt, { listenerPos: camera.position, running: player.running });
```

- `unlock()`: creates the `AudioContext` on the first call and resumes it if it is suspended. Call
  it from a user gesture. **No context exists before this**, and `play()` is a silent no-op until
  then. Volumes and ambience set before unlocking take effect when it happens. It returns `false`
  if Web Audio is unavailable.
- `setVolumes({ master, sfx, ambience, ui })`: 0..1 sliders, partial objects allowed. They map
  through a 60·log10 dB taper (the same as cubing the slider: 0.8 gives -5.8 dB, 0.5 gives
  -18 dB, 0 is silence) and glide with `setTargetAtTime` (about 150 ms), so they never click.
- `play(name, opts?)`: returns a voice id, or `false` if nothing played (still locked, unknown
  name, on cooldown, or inaudible). `opts`:
  - `gain`: linear multiplier.
  - `pitch`: rate multiplier.
  - `delay`: seconds.
  - `position`: `{x,y,z}` or `[x,y,z]`, attenuated by distance from `listenerPos`.
  - `impact`: 0..1, used by `land`.
  - `surface`: used by `land`.
  - `running`: used by steps.
  - `variant`: forces one take.
  - `reverb`: send multiplier.
- `setAmbience({ water, wind, cave, birds })`: 0..1 targets that describe the whole scene. Layers
  you leave out fade to 0. The change crossfades over about 1.5 s.
- `update(dt, { listenerPos?, running? })`: frees finished voices and schedules ambience events
  (gurgles, gusts, drips, chirps). `listenerPos` is kept for positioned one-shots. `running` means
  *the player is running*, and steps use it when their `STEP` payload has no `running` flag. If
  `update` is never called, the beds still play but the sparse events stop.
- `dispose()`: unsubscribes from the bus, stops every source and closes the context.
- `getState()`: a debug/test snapshot (`unlocked`, `volumes`, `ambience`, `paused`, `voices`, ...).
  It is not part of the game contract.

### Bus graph

```
voice ─> bus.in ─(soft LPF)──────────────┬─> duck ─> vol ─┐
   └──> wet send ─> convolver ─> return ─┘                ├─> master ─> -3 dB trim ─> 9.5 kHz LPF
ambience layers ─> amb.in ─> duck ─> vol ─────────────────┤     ─> glue comp (2.5:1) ─> limiter ─> out
ui voices ─> ui.in (+ own reverb) ─> vol ─────────────────┘
```

The reverb impulse is procedural: decaying noise that darkens as it fades. The sfx reverb amount
follows the area: the hub cave is the wettest and the meadow the driest. Pause (`PAUSED`) glides
the **sfx and ambience duck gains** to -9 dB, and `RESUMED` brings them back. The duck gains are
separate from the slider gains, so ducking never overwrites the player's settings, and **ui is
never ducked**.

## Event wiring

`createAudio` subscribes to the bus itself (`routeEvent` in `mix.js` holds the mapping):

| Event | Sound |
| --- | --- |
| `STEP {surface, running}` | `step-felt` / `-stone` / `-grass` / `-water` (unknown surfaces play felt). Running steps are +2 dB and brighter/shorter |
| `JUMPED` / `LANDED {impact, surface}` | `jump` / `land` (thump scaled by impact, plus a texture for the surface) |
| `FIND_COLLECTED {rarity}` | `pickup`, or `pickup-rare` for `rare` / `legendary` |
| `CRITTER_SIGHTED` | `sighting` |
| `UI_MOVE` / `UI_CONFIRM` / `UI_BACK` / `UI_CLOSE` | `ui-move` / `ui-confirm` / `ui-back` / `ui-close` |
| `UI_OPEN {screen}` | `ui-open`, or `page-turn` for `journal` / `collection` / `book` |
| `QUEST_STARTED`, `QUEST_STEP` / `QUEST_DONE` | `quest-step` / `quest-done` |
| `PUZZLE_TURN` / `PUZZLE_SOLVED` | `puzzle-turn` / `puzzle-solve` |
| `DOOR_OPENED` | `door-open` |
| `DECOR_PLACED` / `DECOR_REMOVED` | `place` / `pickup-decor` |
| `DOG_BARK` / `DOG_FETCHED` / `PETTED` / `CRITTER_SQUEAK` | `dog-bark` / `dog-pant` / `pet` / `critter-squeak` |
| `SAVED` / `SAVE_FAILED` | `save` / `error` |
| `SETTINGS_CHANGED {settings}` | `setVolumes(settings.volume)` |
| `AREA_ENTERED {area, biome}` | ambience preset (below) and the reverb amount |
| `PAUSED` / `RESUMED` | duck sfx and ambience by -9 dB / restore them |

Nothing emits `throw` or `splash` yet. Call them directly with `audio.play('throw')` and
`audio.play('splash')`.

## Sounds

- **Steps:** `step-felt` (low-passed pink puff + soft thump), `step-stone` (band-passed tick + tiny
  wooden tock), `step-grass` (two brushes of high noise), `step-water` (rising band sweep + bloop).
- **Movement and handling:**
  - `jump`: an upward whoosh.
  - `land`: a thump.
  - `throw`: a whoosh.
  - `place`: a soft thud.
  - `pickup-decor`: a rustle and a rising pluck.
  - `pet`: fluffy grains.
  - `splash`: a noise burst followed by droplets.
- **Finds:**
  - `pickup`: two triangle plucks.
  - `pickup-rare`: a pentatonic FM-bell arpeggio with sparkles.
  - `sighting`: a soft two-note chirp.
- **World:**
  - `door-open`: a brown-noise rumble, a 46 Hz swell, two wobbly creaks and a felt settle.
  - `puzzle-turn`: a wooden double click.
  - `puzzle-solve`: a strummed Cmaj9 with a bell on top.
- **Creatures:**
  - `dog-bark`: a soft "boof", a voiced glide through a closing low-pass.
  - `dog-pant`: breathy puffs.
  - `critter-squeak`: a tiny vibrato glide.
- **UI:**
  - `ui-move`: a tick.
  - `ui-confirm` / `ui-back`: an up / down pluck pair.
  - `ui-open` / `ui-close`: a swish and plucks.
  - `page-turn`: a fluttering felt page.
  - `quest-step`: a two-bell chime.
  - `quest-done`: an arpeggio landing on a ringing chord.
  - `save`: a tiny chime.
  - `error`: a muted low bonk.

## Ambience

| Layer | Bed | Sparse events (from `update`) |
| --- | --- | --- |
| `water` | two band-passed pink-noise bands plus a deep low-passed stream | every 0.35-1.8 s the bands' centres and Q wander (gurgles), sometimes with a bubble bloop |
| `wind` | low-passed brown and pink noise under two slow LFOs (0.07 and 0.023 Hz) | random swells and cutoff drifts every 2.5-7 s |
| `cave` | very low room tone (brown noise, 28-150 Hz, slow "breathing") plus a faint 49 Hz hum | a soft drip every 3.5-11 s into a 230 ms felt echo |
| `birds` | none | chirp phrases of 2-4 notes every 1.6-6.5 s, panned, sometimes answered |

The noise loops are 8 s long and made seamless (equal-power crossfade of tail into head), and each
starts at a random offset. Presets (`AMBIENCE_PRESETS` in `mix.js`):

| Area | Ambience |
| --- | --- |
| hub | cave 0.7, water 0.5 |
| meadow trip | wind 0.6, birds 0.5 |
| grotto trip | cave 0.5, wind 0.3 |
| lake trip | water 0.8, birds 0.3 |

Unknown biomes use meadow.

## Variation and voice limiting

- **Pitch and gain jitter:** every play draws a playback-rate multiplier within ±`pitch` (3-8%
  per sound) and a gain offset within ±`gainDb` (0.5-2 dB). Every frequency in a recipe is
  multiplied by that rate, and noise bursts start at a random offset in their buffer, so no two
  plays share a waveform.
- **Takes:** footsteps have 4 hand-tuned takes, and the clicks, barks, squeaks, splashes and page
  turns have 3. `createNoRepeatPicker` never picks the same take twice in a row and still reaches
  every take.
- **Cooldowns:** each sound has its own cooldown (35 ms for `ui-move`, 70 ms for steps, up to
  1.5 s for `door-open`). A re-trigger inside the cooldown is dropped, so spammed events don't
  stack.
- **Voice limits:** `createVoiceLimiter` caps each sound (1-3 voices) and all sounds together (24).
  At a cap it steals the **oldest** voice: that sound's oldest first, then the oldest overall. A
  stolen voice fades out over about 40 ms rather than cutting off. Finished voices are
  disconnected on the next `play`/`update`.

## Levels

These were measured by rendering every sound through Chromium's `OfflineAudioContext` at default
settings:

- Steps peak around -25 dBFS, pickups around -18, rare finds and fanfares around -14, and ui ticks
  between -31 and -21.
- The ambience beds sit at about -37 to -42 dBFS RMS.
- No render produced a NaN or a click. The master limiter (-3 dB, 20:1) is only a safety net.

To rebalance, change `levelDb` in `SOUNDS` (`mix.js`), which is relative to `VOICE_MAKEUP_DB`.

## Tests

`tests/audio.test.js` (`npm test`, Node 22, no browser) covers:

- the pure helpers;
- the noise generators;
- `createAudio` against a strict fake `AudioContext` that throws on the mistakes real browsers
  reject, such as non-positive exponential ramps, non-finite values, or starting a source twice.

That fake context checks:

- that nothing is created before `unlock`;
- that every sound renders at 44.1 and 48 kHz;
- cooldowns and voice caps;
- the event wiring, presets, pause ducking and smoothed volumes.
