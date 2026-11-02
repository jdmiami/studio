# Phluph Materials Plan: "The Textile World"

Decisions from the art direction Q&A (2026-10-25):

| Topic | Decision |
|---|---|
| Materials | Felt, knitted yarn, velvet/chenille, cotton wool |
| Trees | Tassel-and-fringe willows: hanging yarn tassels that sway |
| Ground | Mixed by biome (below) |
| Clouds | Felt cutout layers, stop-motion stage-set style |
| Accents | Velvet flowers and fruit, knitted hills and rocks, creature outfits, cotton-wool waterfall |
| Palette | Real-world colors (revised from an initial pastel pass) |

## Palette

Revised 2026-10-25: real-world colors, not pastels. Grass is green, the sky is blue, clouds are
white, trunks are brown; flowers carry the bright accents.

| Family | Colors |
|---|---|
| Felt meadow (grass) | `#7fb85a`, `#8cc063`, `#76b052`, `#93c56a`, `#86bb5d` |
| Earth (cliff sides) | `#9a7652` |
| Shag grass | `#79b04e`, `#8fc25e`, `#6fa646`, `#9ccb6b` |
| Knitted hills | green stripes `#6fa84a`, `#86bc5e`, `#5f9a40`, `#97c96d` |
| Velvet flowers | red `#d64545`, yellow `#f2c230`, purple `#8a5cc2`, pink `#e86fa0`, orange `#f58a3c` |
| Willows | brown wool trunks `#8a6644`, green crowns and tassels |
| Rocks | greys `#9e9c97`, `#aaa69e`, `#918f8b` |
| Sky | zenith `#4f8fdc`, horizon `#bcd9f2`, warm white toward the sun |
| Water | deep `#2f7fb8`, shallow `#7cc6d6` |

## Materials (one shader, four modes: `src/textile.js`)

| Mode | Look | How |
|---|---|---|
| Felt | Matte, dense, speckled fibers, soft fuzzy rim; running stitches along patch edges | Fiber noise, grazing-angle fuzz sheen, dashed stitch lines on Tuft tops, plus a few very short fur shells |
| Knit | Stockinette V stitches with plied yarn, colored stripe bands | Two leaning lobes per stitch cell in UV space, ply twist stripes, gap occlusion |
| Velvet | Dark core, bright silvery edge that shifts with angle | Inverse-fresnel sheen with subdued center |
| Yarn wrap | Yarn coiled around a form | Helical stripes with grooves and ply twist |

Shell fur (`src/fur.js`) stays for shag, pom-pom crowns, creature fleece, and cotton wool, with
softer roots and a new flow option for the waterfall.

## Biomes on the island

| Zone | Ground | Dressing |
|---|---|---|
| Felt patchwork meadow (center, back-right) | Felt Tufts, each a stitched patch | Tassel willows, the Fluffalo, the Comb |
| Velvet flower beds (front-right) | Blush and peach felt | Velvet tulips, berries, mushrooms; the Dew pond and the cotton-wool waterfall |
| Knitted hills (back-left) | Sage felt | Striped knitted mounds with pom-pom tops, knitted rocks |
| Shag wild zone (front-left) | Long green shag grass | Swaying pile |

## Sky and clouds

- Blue gradient sky; the volumetric clouds are switched off in favor of felt.
- Felt cutout clouds in rings of flat, bevelled cloud shapes around and below the island, for stage-set parallax.
- A felt sun disc with a stitched rim, bright enough to drive the god rays.

## Grade

Khronos PBR Neutral tone mapping (ACES greyed bright front-lit colors into a milky wash),
saturation 1.0, gentle log contrast, cool shadow tint by multiplication, bloom only above
lit surfaces, light grain.

## Status

| Item | State |
|---|---|
| Textile shader: felt, knit, velvet, yarn wrap | Done (`src/textile.js`) |
| Biomes: felt meadow, velvet flower beds, knitted hills, shag zone | Done (`src/world/terrain.js`, `biomeAt` in `src/world/util.js`) |
| Tassel willows | Done (`src/world/trees.js`), about 1,080 swaying strands in one instanced draw |
| Velvet tulips, berries, mushrooms | Done (`src/world/flora.js`) |
| Knitted hills with pom-poms, knitted rocks | Done (`src/world/hills.js`) |
| Felt cutout clouds and felt sun | Done (`src/world/clouds.js`) |
| Cotton-wool waterfall | Built (`src/world/water.js`), but reads as a mound from current views; needs a longer visible drop and a better camera |
| Fluffalo knitted scarf | Built (`src/world/creatures.js`), mostly hidden by fleece; needs to sit outside the fur |
| Solid terrain | Fixed: columns used to skip "buried" Tufts, which left the island hollow where the ground steps down. Felt Tufts are now one instanced draw (one 1,764-vertex cushion) instead of a 1.39M-vertex merged mesh |
| Real-GPU frame-rate check | Not done: no GPU in the build container |
