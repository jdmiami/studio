# Minecraft Texture Pack Creator

Builds Minecraft 1.21.x resource packs from a JSON spec, and checks them before you ship them.
Uses only Node built-in modules, so there is nothing to install.

## Quick start

```bash
# 1. Write a spec (start from the example)
cp examples/example-pack.json my-spec.json

# 2. Build the pack folder
node tools/create-pack.mjs my-spec.json --out build/my-pack

# 3. Validate it
node tools/validate-pack.mjs build/my-pack
```

Copy `build/my-pack` into `~/.minecraft/resourcepacks/` (or zip the folder) to try it in game.

## Spec format

| Field | Required | Meaning |
|---|---|---|
| `namespace` | yes | Lowercase asset namespace for your content, e.g. `rubypack` |
| `minecraft` | yes | Target version, e.g. `1.21.8` or `1.21.11` |
| `name`, `description` | no | Pack description |
| `icon` | no | `#rrggbb` colour for `pack.png` |
| `blocks` | no | `{ "id", "color" }` or `{ "id", "texture" }`; each becomes a full block with item model |
| `items` | no | `{ "id", "color" }` or `{ "id", "texture" }`; each becomes a generated item |
| `lang` | no | Translation keys written to `lang/en_us.json` |

A `texture` value is a path to an existing PNG, copied as-is. Use 16x16 PNGs for blocks and items.

## Files

- `tools/create-pack.mjs`: builds the pack folder
- `tools/validate-pack.mjs`: checks JSON, pack format, references, and PNG headers (`--strict` also fails on warnings)
- `examples/example-pack.json`: sample spec
- `.claude/skills/minecraft-resource-pack/SKILL.md`: reference for the resource pack format, used by Claude Code in this repo
