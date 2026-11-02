# src/game/sdf: the SDF renderer

The game can draw its world two ways, chosen before anything loads (`renderer-choice.js`;
`?renderer=threejs|sdf`; Settings, Video, Renderer):

- **Painted (three.js)**: meshes. The cave's kit blocks, the projection-painted props and the
  traced door; trips stream instanced block chunks and place the painted glTF assets.
- **Soft (SDF)**: one full-screen fragment shader raymarches the whole static world from signed
  distance fields. Creatures, finds, Mira, the gate, the chime mushrooms, the ball and particles
  stay meshes. The SDF pass writes real depth, so they sit inside the raymarched world and the
  ink-outline post pass outlines both.

Both renderers read the same data as the physics: the column map behind `heightAt`.

| File | What |
|---|---|
| `scene-data.js` | Packs columns into a float texture (top, kind, ceiling, random) and props into texels. Pure; tested in `tests/sdf.test.js`. |
| `shader.js` | The raymarcher: the SDFs, materials, lighting and depth. |
| `world.js` | The quad, its uniforms and textures. `setArea()` per area; `update(camera)` per frame; quality presets. |

## The distance field

- **Terrain**: every column is a stack of rounded cubes from y = -2 to its top. That is the kit's
  pillow blocks, with seams where cubes meet. A half-step top ends in a half cube.
  - The cave's ceiling is a second stack, from its slab bottom up to y = 10.
  - Door cells leave the doorway open.
  - A point only tests its own cell and the three nearest neighbours, so the step is capped at half
    a cell inside the terrain layer. Above the tallest column, the ray steps straight to it.
- **Props**: the cave's placements and trips' landmarks become felt shapes in a unit frame, scaled
  by their height and turned by their yaw.

  | Shape | Built from |
  |---|---|
  | Cube trees | A clamped grid of rounded cubes, on a trunk |
  | Willows | A dome, caps and drips (angular repetition) |
  | Broom trees | A noisy ellipsoid head |
  | Domes | Three stacked cushions |
  | Mushrooms | A stem with a cut cap |
  | Fences | Repeated posts and rails |
  | Poms, stones, knit domes | Simple primitives |

  Props blend into the ground with a smooth minimum (k = 0.06), as if felted on. Per pixel, only the
  props whose bounding spheres the ray meets are marched (up to 10, of the 48 nearest the viewer).
- **The door**: a slab textured with the painting's door (`/cave/door-albedo.png`), lifted as it
  opens.

## Shading

- **Lighting**: the felt shader's own lighting (`src/textile.js`):
  - the wrapped sun on the shared cel ramp;
  - sky and ground ambient, with a painterly saturated shadow side;
  - fibre grain and a fine bumped normal;
  - a soft silhouette sheen;
  - the same fog.
- **Added in SDF mode**: soft shadows (penumbra by the closest miss) and ambient occlusion
  (5-tap), from the distance field itself.
- **Materials**: earth walls with a scalloped grass hem on their tops, stone floors and steps,
  marbled water, the grey door frame and the ceiling. Per-block tone jitter follows the painting.

## Cost

The pass runs per pixel, so it renders below screen resolution and is scaled up. The pixel ratio
is 0.6 / 0.8 / 1.25 for low / medium / high.

| Quality | March steps | Shadow steps | AO taps | Far |
|---|---|---|---|---|
| low | 72 | none | none | 60 |
| medium | 110 | 20 | 3 | 80 |
| high | 150 | 36 | 5 | 110 |
