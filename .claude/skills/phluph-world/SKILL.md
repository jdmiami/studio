---
name: phluph-world
description: "Design, build, or extend Phluph, a procedurally generated sandbox survival world where every node, item, creature, and tool is made of real 3D fluff. Use when writing gameplay systems, survival vitals, crafting, combat, creature AI, dimensions, progression, logic/automation, bosses, or fluff material and visual rules for Phluph."
---

# Phluph: Gameplay Systems & Fluff World Specification

Phluph is an emergent, non-linear sandbox survival game set in a procedurally generated
world made entirely of fluff. There are no levels and no mandatory story. Progression is
driven by inventory and gated by environment. Players explore, harvest, process, build,
and escalate, and gameplay emerges from the friction between survival needs and creative
ambition.

Assume a generic 3D grid of modifiable cells already exists. In Phluph each cell is a
**Tuft**. This document defines the rules that run on top of that grid.

**Design law: everything is fluff.** Every Tuft, item, creature, tool, projectile, liquid
surface, and UI icon is a physical 3D fluff object. Nothing is a flat texture standing in
for fluff. See section 11 for the material and visual contract.

All numbers below are starting defaults for tuning, not final balance.

---

## 1. Core Loop

1. **Explore:** traverse procedural fluff terrain to find resource-rich biomes and structures.
2. **Harvest:** comb, shear, scoop, or snip Tufts and creatures into inventory items.
3. **Process:** card, felt, spin, dye, and steep raw fluff into tools, armor, and stations.
4. **Build:** place processed Tufts back into the world as shelter, farms, machines, or art.
5. **Escalate:** better gear unlocks riskier biomes and dimensions, then boss encounters,
   then post-scarcity travel and automation.

---

## 2. Player (the Puffling) & Survival Vitals

The player is a physics-enabled entity called a **Puffling**.

### Vitals

| Vital | Range | Rule |
|---|---|---|
| **Plush** (health) | 0–20 (10 pom-poms) | At 0: Unravel state. Inventory scatters as physics items at the death point, part of the Glow is lost, and the Puffling respawns at their Nest. |
| **Fill** (hunger) | 0–20 | Drained by the Exhaustion accumulator. |
| **Cozy** (hidden saturation) | 0–Fill | Buffer that must reach 0 before Fill drops. Food restores Fill and Cozy at tier-dependent ratios. |
| **Exhaustion** | 0–4 | Sprinting, jumping, attacking, combing, and taking damage add to it. At 4: reset to 0 and remove 1 Cozy, or 1 Fill if Cozy is 0. |
| **Breath** | 0–10 bubbles | Drains while the Puffling's head is submerged in Dew. At 0: periodic drowning damage. |
| **Glow** (experience) | levels | Dropped as glowing lint motes from harvesting rare Tufts, breeding or defeating creatures, and carding. Spent on Embroidery and Patchwork repairs. Never raises base stats. |

### Vitality links

- Fill = 20 and Cozy > 0: fast Plush regeneration (spends Cozy).
- Fill ≥ 18: slow Plush regeneration.
- Fill ≤ 6: cannot sprint.
- Fill = 0: periodic starvation damage.

### Movement states

| State | Rule |
|---|---|
| **Walking** | Base speed 4.3 units/s. |
| **Sprinting** | +30% speed, slight FOV widen, faster Exhaustion, extra knockback on the first melee hit. |
| **Sneaking** | Slower, slightly shorter hitbox, hides nameplate through walls, will not step off a Tuft edge. Essential for building at height. |
| **Swimming** | Sprint while submerged in Dew. Hitbox goes horizontal (0.6 units tall). |
| **Crawling** | Forced into a 0.6-unit gap. Keeps the 0.6-unit hitbox on land. |
| **Gliding** | Late game, via the **Dandelion Glider** in the back slot. Converts falling into forward speed. Boosted by **Puff Rockets**. |

Fluff-specific: landing on a high-Loft Tuft (section 11) reduces fall damage in proportion
to its Loft. A full-Loft cloudbank negates fall damage entirely.

---

## 3. Inventory, Harvesting & Crafting

### Inventory layout

- 27 storage slots, 9 hotbar slots (keys 1–9), 4 armor slots (Cap, Wrap, Leggings, Booties),
  1 back slot (glider), 1 off-hand slot (shield, lantern, or food).

### Stacking

- Raw fluff, Tufts, and materials: 64.
- Throwables (Puff Pearls, Lint Balls, Seed Pods): 16.
- Tools, weapons, armor, tonics: 1.

### Tools and tiers

Every Tuft has a **Loft** (break time) and a **tool type**:

| Tool | Harvests |
|---|---|
| **Comb** | Dense and felted Tufts, mineral fluff |
| **Shears** | Fibrous stalks, plush trees, trunks |
| **Scoop** | Loose fluff, lint drifts, dust |
| **Rake** | Tills fluff meadow into planting beds |
| **Snips** | Threads, petals, webs, creature fleece |

**Tier ladder:** Lint → Cotton → Wool → Mohair → Cashmere → Vicuña.
**Side-grade:** Silk (fastest harvest speed, lowest durability, low harvest tier).

- **Hard gating:** some Tufts drop nothing without the minimum tier. Starspun Ore needs at
  least a Mohair Comb. Hardfelt needs a Cashmere Comb.
- **Durability (Pilling):** each use costs 1 (2 when a tool is used as a weapon). At 0 the
  item unravels and is destroyed.

### Crafting

- **Sewing Mat (2x2):** built into the inventory screen. Basics: Plush Log → Batting →
  Spindles; 4 Batting → Loom.
- **Loom (3x3):** unlocked by using a placed Loom.
- **Shaped patterns:** ingredient layout matters (3 mineral fluff across the top + 2 Spindles
  down the middle = Comb).
- **Shapeless patterns:** only ingredients matter (Book + Ink Bloom + Plume = Journal).

### Processing stations

- **Carder / Blast Carder / Fluffer:** need **Warmth** fuel (Ember Lint, Plush Wood, a Hot
  Syrup bucket) and an input (raw ore fluff, raw meat, sand fluff). Runs on a real-time
  timer whether or not the player is present.
- **Felting Press:** instant 1-to-1 conversion of felt Tufts into stairs, slabs, and walls,
  with no lossy 3x3 ratios.

---

## 4. Combat

Real-time, first person with optional third person. Built on spacing, timing, and gear.

### Melee

- **Recharge:** every weapon has an attack speed. Swinging starts a recharge bar. Attacking
  early scales damage linearly from 20% to 100%.
- **Sweep:** a fully charged **Pillow Blade** swung while still or slow hits everything in a
  horizontal arc.
- **Critical hit:** attacking while falling (not sprinting, not in Dew, not on a ladder)
  deals 1.5x damage.
- **Knockback:** each hit pushes the target away. Sprinting first greatly increases it.

### Ranged and tactical

- **Yarn Bow:** hold to charge. Draw affects velocity, arc, and damage. Full draw is critical.
- **Spring Sling:** load, carry charged in inventory, fire instantly when selected. Can fire
  Puff Rockets for area damage.
- **Quilted Shield:** off-hand. Raising it slows movement to a crawl and blocks 100% of
  frontal physical and projectile damage, converted into shield durability loss. Heavy
  Shears have a chance to briefly disable a raised shield.

### Defense

- **Quilting** (armor points): max 20. Each point reduces physical damage, scaled so bigger
  single hits penetrate more.
- **Toughness:** from Cashmere and Vicuña armor. Reduces that penetration.
- **Anchoring:** Vicuña only. Reduces knockback received.

---

## 5. Creatures & Spawning

### Spawning sphere

| Distance from player | Rule |
|---|---|
| 0–24 units | No natural spawning. |
| 24–32 units | Spawn with full AI. |
| 32–128 units | Spawn, freeze AI after a short idle timer, random per-tick despawn chance. |
| > 128 units | Hostiles despawn immediately unless marked persistent (Name Ribbon, holding a player item, or part of a generated structure). |

### Spawn conditions

- **Passive creatures** (Fluffalo, Cottonsheep, Puffhens, Bramblebuns): rare spawns on bright
  meadow fluff, persistent by default. Fed their favorite crop (Cloudwheat, Sugarpuffs,
  Dandeseed), they enter **Snuggle Mode**, produce offspring, and drop Glow.
- **Hostile creatures:** spawn at Light 0, in unlit hollows underground or on the surface at
  night.

### Hostile archetypes

| Creature | Role | Behavior |
|---|---|---|
| **Matted Shambler** | Pursuer | Slow melee, paths straight to the player, calls reinforcements when hurt, dries out and crumbles in sunlight, hunts Tufties. |
| **Pinner** | Strafe shooter | Fires needles with predictive aim, strafes to keep range, hides in shade or Dew by day. |
| **Overstuffed** | Terrain hazard | Silent approach. Within 3 units it swells over a 1.5 s fuse with an audible creak, then bursts, dealing heavy damage and tearing nearby Tufts into loose lint. Fears Purrballs. |
| **Felt Crawler** | Climber | Neutral by day, hostile at night. Treats walls as ladders. Wide 1.4-unit hitbox. |
| **Static Wraith** | Conditional teleporter | 3 units tall, neutral until the crosshair meets its head or it is hit. Teleports by static discharge, dodges projectiles, is hurt by Dew and rain, and moves Tufts around. |

---

## 6. World Cycles & Dimensions

### Time and weather (Meadowfluff)

- **Day/night:** 20 real minutes (10 day, 1.5 dusk, 7 night, 1.5 dawn).
- **Nests:** sleeping at night skips to dawn if every player sleeps, and sets the respawn point.
- **Weather:** Clear → Drizzle or Snowpuff (lowers light, puts out fires, waters planting
  beds, raises Tuft Dampness) → Static Storm (dark enough for daytime hostile spawns;
  lightning transforms some creatures, e.g. a Cottonsheep into a Shocksheep, an Overstuffed
  into a Supercharged Overstuffed).

### Dimensions

| Dimension | Access | Rules | Purpose |
|---|---|---|---|
| **The Meadowfluff** | Default spawn | Day/night, sky, Dew liquid, temperature biomes. Depth layers: Topfluff → Feltstone → Deepfelt → Bedfelt floor. | Building, farming, Tuftie economy, early-to-Mohair mining. |
| **The Lintbelly** | Build a Hardfelt frame (4x5 minimum) and ignite it with a Static Spark. | Enclosed hot cavern with a Bedfelt floor and ceiling. No day/night. Dew evaporates instantly. Nests explode. 1 unit here = 8 in the Meadowfluff. | High-risk combat, tonic ingredients, bartering, Ancient Fleece (Vicuña) mining. |
| **The Driftveil** | Find the Spindle Keep with Seeker Eyes and complete its 12-frame Seam Gate. | Floating cloud islands over the void (the Unstitched). No light cycle. Nests explode. | Final boss arena and post-game exploration (gliders, Pocket Pouches). |

---

## 7. Enhancement Systems

### Embroidery and patchwork

- **Embroidery Hoop:** surrounded by up to 15 **Spool Shelves** for up to level 30. Costs
  Starthread and 1–3 Glow levels to stitch semi-random passive buffs onto gear.
  - **Bounty:** multiplies ore drops.
  - **Gentle Touch:** harvests the exact Tuft instead of its broken drop.
  - **Self-Darning:** Glow motes repair the item instead of going to the player.
  - **Swiftcomb:** much faster harvesting.
- **Patchwork Bench:** combine two matching items to sum durability and merge stitches, or
  apply Pattern Books to gear.
- **Wear penalty:** each patchwork pass raises a hidden counter exponentially. Once the cost
  exceeds 39 levels the item shows "Too Worn!" and can no longer be modified.

### Steeping (tonics)

- **Kettle:** crafted from a Blaze Thread, fueled by Ember Lint.
- **Base:** Dew Bottle + Lintbelly Bloom → Plain Tonic.
- **Effects:** Plain Tonic + ingredient → effect (Sugarpuff → Speed, Honeyfluff → Instant
  Mending, Moth Wing → Slow Fall, Ember Gum → Heat Resistance).
- **Modifiers:**
  - Static Dust: longer duration.
  - Glowlint: stronger (I → II), shorter.
  - Pop Powder: throwable splash.
  - Moth Queen's Sigh: lingering cloud on the ground.
  - Soured Gum: inverts the effect (Mending ↔ Harm, Speed ↔ Slowness, Night Sight ↔ Unseen).

### Tuftie trading

**Tufties** are passive villagers in generated hamlets and a full renewable alternative to
mining. The currency is **Buttons**.

- **Job binding:** an unemployed Tuftie claims a free work station (Lectern, Darning Bench,
  Plume Table) and takes its profession (Scholar, Toolstitcher, Plumer).
- **Locking and levels:** trading locks a Tuftie's profession and offers and fills their
  experience, unlocking 5 tiers (Novice to Master).
- **Supply and demand:** overusing one trade inflates its price. Tufties restock by working
  at their station up to twice a day.
- **Cure discount:** a Matted Shambler can mat a Tuftie. Curing it with a Splash Tonic of
  Weakness and a Golden Puffapple gives large permanent discounts.
- **Raids and Guardians:** hamlets spawn high-health Plush Guardians. Drinking an Omen
  Tonic (from Moth Outposts) and entering a hamlet starts a multi-wave raid by militarized
  moth clans.

---

## 8. Static: Logic & Automation

Phluph's in-world logic system runs on **static charge**, carried by **Copper Thread**.

### Rules

- **Charge:** integers 0 (off) to 15 (max).
- **Attenuation:** loses 1 per unit of Copper Thread, dying after 15 units unless boosted.
- **Strong vs. weak charge:** a solid opaque Tuft charged directly by a Relay or Inverter is
  strongly charged and can charge adjacent thread. One charged only by thread running into
  it is weakly charged: it activates adjacent devices but not adjacent thread.

### Components

**Sources (output 15):**
- Manual: Pull-Cord (toggle), Press-Button (pulse), Squeak Plate (detects entities).
- Passive: Inverter Bobbin (on unless its Tuft is charged; a NOT gate), Sunlint Sensor,
  Tripthread, Target Tuft, **Hush Sensor** (detects nearby vibrations and outputs a strength
  based on the sound type).

**Logic:**
- **Thread Relay:** restores charge to 15, one-way, delays 1–4 ticks (0.1–0.4 s), and can
  lock another relay when charged from the side.
- **Tension Gauge:** rear input A, side input B. Compare mode outputs A if A ≥ B, else 0.
  Subtract mode outputs A − B. Against a container it outputs 0–15 in proportion to how full
  the container is.

**Devices:**
- **Plunger / Burr Plunger:** pushes (and pulls, if Burr) up to 12 connected Tufts by 1 unit.
  **Burr Tufts** and **Gum Tufts** stick neighbors together while moving, enabling
  self-propelled flying machines.
- **Watcher:** pulses for 1 tick from its back when the Tuft in front of it changes.
- **Funnel:** pulls floating items in from above, pulls from containers above, pushes into
  the container it faces. A charge freezes it, which is the basis of all item filters.
- **Spitter vs. Tosser:** a Tosser always ejects the item, or pushes it into a container.
  A Spitter uses the item (fires needles, places or picks up Dew, ignites Pop Kegs, snips
  fleece, dresses players).
- **Auto-Loom:** a 3x3 loom that crafts and ejects its recipe on each pulse.

---

## 9. Bosses & Endgame

### The Great Moth Queen (credits boss)

- **Arena:** the central island of the Driftveil.
- **Pattern:** circles the felt spires, strafes with dust breath, then perches on the
  central Bedfelt fountain, where she ignores projectiles and must be hit in melee.
- **Healing tether:** Lantern Crystals on top of the spires heal her, some inside thread
  cages. Destroy them with ranged attacks or by climbing before dealing lethal damage.
- **Reward:** huge Glow drop, the unique **Moth Queen's Cocoon** trophy, a return gate to the
  Meadowfluff (triggering the ending poem and credits), and a gateway to the outer islands.

### The Tangle (summoned boss)

- **Summoning:** anywhere. Arrange 4 Lintstone Tufts in a T and place 3 **Snarl Heads** on
  top (a rare 2.5% drop from Snarl Pinners in Lintbelly Keeps).
- **Pattern:** invulnerable during a 10 s wind-up that ends in an explosion. Flies and fires
  exploding snarl balls that inflict **Fraying**, turning the Plush bar dark and draining it
  until death is possible. At 50% health it grows **Knot Armor**, ignoring ranged attacks.
- **Reward:** a **Heartspool**, used to craft a **Beacon Loom**: placed on a pyramid of solid
  mineral felt, it projects a permanent area buff (Haste II, Speed, Strength, Regeneration,
  Jump Boost, Resistance) to everyone nearby.

### The Hush (stealth boss)

- **Location:** Silent Depths, far underground.
- **Design:** meant to be avoided, not fought. 500 Plush, about 2.5x the Moth Queen. Melee
  and a ranged sonic thrum that bypasses armor and shields; 2–3 hits kill a Puffling in full
  Vicuña.
- **Senses:** blind. Tracks vibrations (steps, placing and breaking Tufts, opening
  containers) and scent. Summoned when a **Hush Shrieker** is triggered 3 times. Sneaking
  and muffling with dense wool Tufts prevent triggers.

---

## 10. Emergent Synergies

Systems must interact globally without special cases:

- **Creature farms:** hostiles spawn in darkness 24+ units away, follow lures, are pushed by
  Dew currents and Plungers, and drop items into Funnels after fatal falls. Players build
  sky farms producing endless Pop Powder, needles, and fluff.
- **Fleece farms:** panicked Tufties spawn Plush Guardians, and Guardians drop mineral fleece
  when defeated by hazards, so players automate metal fleece from NPC behavior.
- **Fast travel:** Puff Pearls teleport the thrower where they land, and Dew bubble columns
  can hold a pearl aloft until a charged trapdoor closes on it, enabling remote-triggered
  teleport networks.
- **Fluff physics synergies:** high-Loft landing pads, static buildup from friction powering
  circuits, and Dampness changing how Tufts burn, compress, and conduct (section 11).

**Directive:** build a deterministic rule engine first. Define strict rules for light,
fluids, spawning spheres, inventory matrices, static charge, and fluff material state. Do
not design levels. Design laws, give the player power over every Tuft, and let play emerge.

---

## 11. Fluff Material Law & Visual Contract

### Material state (per Tuft and item)

| Property | Range | Effect |
|---|---|---|
| **Loft** | 0–1 | Break time, bounce, fall-damage absorption, how much the fluff springs back. |
| **Density** | 0–1 | Weight, insulation, sound muffling, required tool tier. |
| **Dampness** | 0–1 | Raised by Dew, rain, and steam. Damp fluff compresses, conducts static, burns slowly, and darkens visually. Dries in sun and near Warmth. |
| **Static** | 0–15 | Builds from friction (walking on dry fluff, wind). Can feed the static circuit system and attracts loose lint. |
| **Felting** | 0–1 | Compression over time and pressure. Fully felted fluff becomes dense building felt. |

Gameplay must read these properties. For example, a Dampness-soaked bridge sags, dry
storms build Static on exposed Tufts, and Overstuffed bursts reduce Loft in their radius.

### Visual contract (engine-agnostic)

- Every Tuft, item, creature, tool, projectile, and icon is rendered as volumetric 3D fiber.
  No flat painted fur cards standing in for fluff at gameplay distances.
- Fiber responds to wind, player movement, impacts, and Dampness (clumping, darkening).
- Contact compresses fluff locally and it springs back at a rate set by Loft.
- Light must scatter through fluff (soft translucency, rim glow on fiber edges).
- Distant fluff may use cheaper representations, but transitions between levels of detail
  must not visibly pop.
- Inventory and UI icons are rendered from the same 3D fluff assets, not hand-drawn flats.
