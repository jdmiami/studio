# Phluph roadmap: after the graphics pass

Status: **on hold until the graphics are mastered** (the kit elements and the cave frame match
their references). Nothing here is built yet. Choices made with the owner on 2026-10-26, after
mapping the app against the installed gamedev skills (`.claude/skills/`, router: `gamedev-router`).

## Where the app stands

Built: first-person cave (walk, run, jump, step-up collision), HUD (hearts, level, stamina ring,
compass, quest tracker, timer, minimap, prompts), gloved hands with compass, two interactions
(inspect door, pet dog), a procedural island showcase, the element kit matched to the asset sheet.

Missing: inventory or collection, quests beyond the one tracker line, creature behaviour, NPC
dialogue, save/load, audio, menus, a world to explore beyond the cave.

## Decisions

| Area | Choice | Skills to load |
|---|---|---|
| World | **Hub + procedural trips**: the hand-matched cave is the home Nest; doors lead to seeded procedural areas built from kit pieces | procedural-gen, level-design |
| Core loop | **Cozy exploration + quests** (no hunger or death pressure) | rpg, dialogue-systems |
| Approach | **Vertical slice first**, keep/kill checks, then widen | prototype-fast |
| Saving | **Autosave + slots**, versioned format with migrations, crash-safe writes | save-systems |
| Trip activities | **Collect & catalogue; quests from NPCs; light puzzles; decorate the hub** | rpg, dialogue-systems, puzzle, survival-crafting (build part only) |
| Creatures | **Behaviour trees** with utility scoring for moods (dog follows/fetches/is petted; critters wander, flee, gather; NPC routines) | ai-behavior-trees-utility-ai, game-ai |
| Feel | **Game feel/juice; camera polish; gamepad & rebinding; stable physics** | game-feel, camera-systems, input-systems, physics-tuning, fps-shooter (controller section) |
| Audio | **Ambience + SFX only** (water, wind, felt footsteps and pickups with variation; volume settings); no music system | audio-design |
| Generation | **Seeded and shareable; noise terrain; room assembly by wave-function collapse from kit chunks; scattered finds** (Poisson-disc, weighted rarity) | procedural-gen |
| Interface | **Collection book; quest journal; pause + settings; title screen** | game-ui-ux |
| Tech | **Profiling + budgets; chunk streaming (instancing, pooling); glTF export of kit elements** | performance-optimization, threejs-scene-setup, threejs-gltf-loading, threejs-materials-lighting |
| Shipping | **Vercel only** (phluph.vercel.app) | |

Not chosen (kept out of scope): survival vitals and hunger, combat, fully procedural infinite
world, music system, mobile/low-end mode, itch.io and Steam.

## Build order (vertical slice, then widen)

1. **Slice in the cave hub**: collect three finds (fluff stone, mushroom, critter sighting) into a
   minimal collection book; the scaffold kid gives one branching quest; a felt-lock puzzle opens the
   great door; autosave on quest steps. Keep/kill check: is walking, finding and talking pleasant?
2. **Feel pass** on the slice: fixed-timestep controller with interpolation, coyote time and jump
   buffering, camera collision and landing dip, fluff puffs and soft squash, gamepad action map with
   rebinding; ambience and footstep/pickup SFX with variation.
3. **Creatures**: behaviour-tree runtime with blackboard; dog (follow, fetch, petted), critters
   (wander, flee, gather), the NPC's routine.
4. **First procedural trip** behind the great door: seeded noise terrain snapped to the block grid,
   WFC assembly of kit chunks, scattered finds by rarity table; seed shown and shareable.
5. **Interface**: title screen, pause and settings (volumes, controls, graphics, save slots), quest
   journal linked to the HUD tracker, the full collection book.
6. **Hub decorating**: carry finds home and place them in the Nest; saved with the slot.
7. **Scale and tech**: chunk streaming with instancing and pooling, profiling budgets checked in
   CI, glTF export of kit elements.
8. Deploy each milestone to Vercel.
