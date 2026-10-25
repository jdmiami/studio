#!/usr/bin/env node
// Builds a Minecraft 1.21.x resource pack folder from a JSON spec.
//
// Usage:
//   node tools/create-pack.mjs <spec.json> [--out <dir>]
//
// The spec (see examples/example-pack.json):
//   {
//     "name": "Ruby Pack",            // used for the description and default folder name
//     "namespace": "rubypack",        // lowercase asset namespace for your new content
//     "minecraft": "1.21.8",          // target version, mapped to pack_format / min_format
//     "description": "optional",
//     "icon": "#3c8d2f",              // optional pack.png colour (64x64)
//     "blocks": [{ "id": "ruby_block", "color": "#c0392b" }],
//     "items":  [{ "id": "ruby", "texture": "path/to/ruby.png" }],
//     "lang":   { "block.rubypack.ruby_block": "Ruby Block" }
//   }
//
// Each block gets a textures/block PNG, a cube_all model, a blockstate and an item model.
// Each item gets a textures/item PNG and a generated item model.
// A texture is either a solid "color" or a "texture" path to an existing 16x16 PNG to copy.

import { deflateSync } from 'node:zlib';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Minecraft version -> pack.mcmeta fields (from the skill's version table).
const FORMATS = {
  '1.21': { pack_format: 34 },
  '1.21.1': { pack_format: 34 },
  '1.21.2': { pack_format: 42 },
  '1.21.3': { pack_format: 42 },
  '1.21.4': { pack_format: 46 },
  '1.21.5': { pack_format: 55 },
  '1.21.6': { pack_format: 63 },
  '1.21.7': { pack_format: 64 },
  '1.21.8': { pack_format: 64 },
  '1.21.9': { min_format: '69.0', max_format: '69.0' },
  '1.21.10': { min_format: '69.0', max_format: '69.0' },
  '1.21.11': { min_format: '75.0', max_format: '75.0' },
};

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out');
  const specPath = argv.find((arg, i) => !arg.startsWith('--') && i !== outIndex + 1);
  return { specPath, outDir: outIndex === -1 ? null : argv[outIndex + 1] };
}

function parseColor(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) fail(`colour must be #rrggbb, got "${hex}"`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

// --- Minimal PNG encoder (RGBA, 8-bit, no filtering) -------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function solidPng(width, height, [r, g, b, a]) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * rowBytes + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Generation ---------------------------------------------------------------

function formatBlock(version) {
  const format = FORMATS[version];
  if (!format) fail(`unsupported minecraft version "${version}". Known: ${Object.keys(FORMATS).join(', ')}`);
  // Values are written unquoted so 69.0 / 75.0 stay numeric, as the skill's examples show.
  return Object.entries(format)
    .map(([key, value]) => `"${key}": ${value}`)
    .join(',\n    ');
}

function main() {
  const { specPath, outDir } = parseArgs(process.argv.slice(2));
  if (!specPath) fail('usage: node tools/create-pack.mjs <spec.json> [--out <dir>]');

  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const namespace = spec.namespace;
  if (!/^[a-z0-9_.-]+$/.test(namespace ?? '')) fail('"namespace" must be lowercase letters, digits, _ . or -');
  for (const entry of [...(spec.blocks ?? []), ...(spec.items ?? [])]) {
    if (!/^[a-z0-9_]+$/.test(entry.id ?? '')) fail(`id must be lowercase letters, digits or _: "${entry.id}"`);
  }

  const root = resolve(outDir ?? join('build', namespace));
  const written = [];
  const write = (relPath, data) => {
    const fullPath = join(root, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, data);
    written.push(relPath);
  };
  const writeJson = (relPath, value) => write(relPath, JSON.stringify(value, null, 2) + '\n');

  const description = spec.description ?? `${spec.name ?? namespace} resource pack`;
  write(
    'pack.mcmeta',
    `{\n  "pack": {\n    ${formatBlock(spec.minecraft)},\n    "description": ${JSON.stringify(description)}\n  }\n}\n`
  );
  write('pack.png', solidPng(64, 64, parseColor(spec.icon ?? '#3c8d2f')));

  const writeTexture = (kind, entry) => {
    const relPath = `assets/${namespace}/textures/${kind}/${entry.id}.png`;
    if (entry.texture) {
      if (!existsSync(entry.texture)) fail(`texture not found: ${entry.texture}`);
      const fullPath = join(root, relPath);
      mkdirSync(dirname(fullPath), { recursive: true });
      copyFileSync(entry.texture, fullPath);
      written.push(relPath);
    } else {
      write(relPath, solidPng(16, 16, parseColor(entry.color)));
    }
  };

  for (const block of spec.blocks ?? []) {
    writeTexture('block', block);
    const ref = `${namespace}:block/${block.id}`;
    writeJson(`assets/${namespace}/models/block/${block.id}.json`, {
      parent: 'minecraft:block/cube_all',
      textures: { all: ref },
    });
    writeJson(`assets/${namespace}/blockstates/${block.id}.json`, {
      variants: { '': { model: ref } },
    });
    writeJson(`assets/${namespace}/models/item/${block.id}.json`, { parent: ref });
  }

  for (const item of spec.items ?? []) {
    writeTexture('item', item);
    writeJson(`assets/${namespace}/models/item/${item.id}.json`, {
      parent: 'minecraft:item/generated',
      textures: { layer0: `${namespace}:item/${item.id}` },
    });
  }

  if (spec.lang && Object.keys(spec.lang).length > 0) {
    writeJson(`assets/${namespace}/lang/en_us.json`, spec.lang);
  }

  console.log(`built ${root}`);
  for (const relPath of written) console.log(`  ${relPath}`);
  console.log(`validate with: node tools/validate-pack.mjs ${root}`);
}

main();
