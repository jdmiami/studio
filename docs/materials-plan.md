# Phluph Materials Plan: "The Textile World"

Decisions from the art direction Q&A (2026-10-25):

| Topic | Decision |
|---|---|
| Materials | Felt, knitted yarn, velvet/chenille, cotton wool |
| Trees | Tassel-and-fringe willows: hanging yarn tassels that sway |
| Ground | Mixed by biome (below) |
| Clouds | Felt cutout layers, stop-motion stage-set style |
| Accents | Velvet flowers and fruit, knitted hills and rocks, creature outfits, cotton-wool waterfall |
| Palette | Light pastels close to real wool dyes; color only as small accents |

## Palette

Soft, light, natural wool dyes. Saturation lives in a few accents (velvet blooms, scarf
stripes); everything else is chalky pastel with warm light.

| Family | Colors |
|---|---|
| Felt meadow | blush `#f2c9d4`, sage `#cfe3d4`, lavender `#d9d0f0`, peach `#f6dcc0`, butter `#f3e9c6`, powder blue `#c9dcef`, oatmeal `#efe6dc` |
| Knit stripes | cream `#f4e8da`, blue `#c9d9ec`, rose `#efc3cf`, sage `#cfe2cf` |
| Velvet accents | dusty rose `#d98fa6`, apricot `#f0b48c`, plum `#a98bc9`, sage stem `#9db89c` |
| Wool trunks | oatmeal `#d9c3a8` |
| Sky | powder `#b9c6ee` zenith, blush `#f7dbe4` horizon, cream `#ffe6cc` toward the sun |

## Materials (one shader, four modes: `src/textile.js`)

| Mode | Look | How |
|---|---|---|
| Felt | Matte, dense, speckled fibers, soft fuzzy rim; running stitches along patch edges | Fiber noise, grazing-angle fuzz sheen, dashed stitch lines on Tuft tops, plus a few very short fur shells |
| Knit | Stockinette V stitches with plied yarn, colored stripe bands | Two leaning lobes per stitch cell in UV space, ply twist stripes, gap occlusion |
| Velvet | Dark core, bright silvery edge that shifts with angle | Inverse-fresnel sheen with subdued center |
| Yarn wrap | Yarn coiled around a form | Helical stripes with grooves and ply twist |

Shell fur (`src/fur.js`) stays for shag, pom-pom crowns, creature fleece, and cotton wool, with
pastel roots and a new flow option for the waterfall.

## Biomes on the island

| Zone | Ground | Dressing |
|---|---|---|
| Felt patchwork meadow (center, back-right) | Felt Tufts, each a stitched patch | Tassel willows, the Fluffalo, the Comb |
| Velvet flower beds (front-right) | Blush and peach felt | Velvet tulips, berries, mushrooms; the Dew pond and the cotton-wool waterfall |
| Knitted hills (back-left) | Sage felt | Striped knitted mounds with pom-pom tops, knitted rocks |
| Shag wild zone (front-left) | Long pastel shag Tufts | Swaying pile |

## Sky and clouds

- Pastel gradient sky; the volumetric clouds are switched off in favor of felt.
- Felt cutout clouds in rings of flat, bevelled cloud shapes around and below the island, for stage-set parallax.
- A felt sun disc with a stitched rim, bright enough to drive the god rays.

## Grade

Khronos PBR Neutral tone mapping (ACES greyed bright front-lit pastels into a milky wash),
saturation 0.92, gentle log contrast, lavender shadow tint by multiplication, bloom only above
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
| Real-GPU frame-rate check | Not done: no GPU in the build container |
