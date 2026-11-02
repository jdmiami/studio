# Phluph Graphics Plan: "Living Plush"

Goal: make every surface read as touchable, hand-dyed, backlit fluff, in a candy-saturated
world that feels like a toy diorama photographed at golden hour.

Target: real-time in a browser (Three.js, WebGL2) on a mid-range GPU. Every phase is
checked by a headless screenshot before moving on.

## Art direction in one paragraph

Golden-hour sun low behind the island so every fiber edge glows. Fluff is two-tone
hand-dyed yarn: deep, saturated roots fading to pale, sunlit tips. Strands clump into
soft curls, not uniform needles. A silky sheen slides along the fibers as the camera moves.
A few glitter fibers twinkle. Distance melts into pink-violet haze. The camera behaves like a
macro lens on a toy set: shallow focus, soft bokeh, a hint of film grain.

## Pillar A: Fur 2.0 shader (the signature look)

| # | Feature | Technique | Why it matters |
|---|---|---|---|
| A1 | Silky fiber sheen | Kajiya-Kay anisotropic specular, two lobes (white primary, tinted secondary shifted toward the root) along a combed strand tangent | The single biggest jump from "fuzzy" to "real fur" |
| A2 | Clumped, curly strands | Clump noise pulls strands toward clump centers; curl twists the tips around the normal | Breaks the uniform pin-cushion look |
| A3 | Hand-dyed yarn color | Root color, tip color, per-strand hue and value jitter | Reads as crafted textile, not a flat paint |
| A4 | Glitter fibers | Sparse strands with HDR twinkle driven by view angle and time | Bloom turns them into sparkles; candy-plush signature |
| A5 | Iridescent fleece | Thin-film-style hue shift by view angle on chosen materials (creature, comb) | Hero objects pop against the meadow |
| A6 | Backlit glow | Stronger translucency toward the sun, deeper root occlusion | Cotton-candy glow at golden hour |
| A7 | Aerial perspective | Distance haze blended to the horizon color inside the fur shader | Depth and scale for free |

## Pillar B: Light and atmosphere

- B1 Golden-hour key light low and behind the island, cool sky fill, pink ground bounce.
- B2 Screen-space god rays from the sun through the canopies and clouds.
- B3 Drifting dandelion seed puffs (fluff particles) with soft HDR edges.
- B4 Sky retuned for sunset: peach horizon, violet zenith, sun-lit cloud edges.

## Pillar C: Lens and grade

- C1 Tilt-shift depth of field (BokehPass) focused on the Fluffalo, for the toy-diorama look.
- C2 Filmic split-tone grade: warm highlights, violet shadows, saturation boost.
- C3 Subtle chromatic aberration at the frame edge and fine film grain.

## Pillar D: Hero set dressing

- D1 Dew pond: glossy syrup water with a fresnel sky reflection and soft ripples, set into the island.
- D2 Distant floating islets for scale.
- D3 Fluffalo upgrade: iridescent two-tone fleece and glossy button eyes.

## Performance budget

- Shell counts: hero objects 32–40, terrain 28–36, cloud sea 20–28.
- Post chain: render → god rays → bloom → bokeh → grade → output. Each pass is a single full-screen draw.
- Ship flags in the URL for profiling: `?lowfx=1` disables bokeh and god rays.

## Status

| Item | State |
|---|---|
| A1–A7 Fur 2.0 | Done (`src/fur.js`) |
| B1 golden-hour light, B2 god rays, B3 dandelion seeds, B4 sunset sky | Done |
| C1 tilt-shift, C2 split-tone grade, C3 aberration and grain | Done (`src/post.js`). Tilt-shift used instead of depth-based bokeh: cheaper, and shell fur has no reliable depth |
| D1 Dew pond, D2 distant islets | Done |
| D3 Fluffalo upgrade | Done (iridescent fleece, glitter) |
| Real-GPU frame-rate check | Not done: no GPU in the build container |

## QA

After each pillar, take a frozen screenshot (`node scripts/screenshot.mjs ... --shot=4`) and
compare it with the previous one. Look for banding, popping, noise, and loss of readability.
Real-GPU frame rate can't be measured in this container and is flagged in the report.
