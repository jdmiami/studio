#!/usr/bin/env node
// Checks a Minecraft 1.21.x resource pack folder before you ship it.
//
// Usage:
//   node tools/validate-pack.mjs <pack-dir> [--strict]
//
// Checks:
//   - pack.mcmeta parses and has pack_format, or min_format and max_format
//   - every assets/**/*.json parses
//   - model parents and texture references inside the pack resolve to real files
//   - blockstate model references resolve to real model files
//   - every PNG has a valid signature and a readable size
//   - every *.png.mcmeta has a matching *.png
// References to the minecraft namespace are vanilla and are not checked.
// --strict turns warnings into failures.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const packDir = args.find((arg) => !arg.startsWith('--'));
if (!packDir) {
  console.error('usage: node tools/validate-pack.mjs <pack-dir> [--strict]');
  process.exit(2);
}

const errors = [];
const warnings = [];
const error = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file) => relative(packDir, file).split(sep).join('/');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    error(rel(file), `invalid JSON (${e.message})`);
    return null;
  }
}

// "ns:path/name" -> assets/ns/<kind>/path/name<ext>
function assetPath(ref, kind, ext) {
  const [namespace, path] = ref.includes(':') ? ref.split(':') : ['minecraft', ref];
  return { namespace, file: join(packDir, 'assets', namespace, kind, `${path}${ext}`) };
}

function checkReference(where, ref, kind, ext) {
  const { namespace, file } = assetPath(ref, kind, ext);
  if (namespace === 'minecraft') return;
  if (!existsSync(file)) error(where, `missing ${kind} "${ref}" (expected ${rel(file)})`);
}

function checkPng(file) {
  const bytes = readFileSync(file);
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return error(rel(file), 'not a PNG (bad signature)');
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') error(rel(file), 'PNG has no IHDR chunk');
}

// 1. pack.mcmeta
const mcmetaPath = join(packDir, 'pack.mcmeta');
if (!existsSync(mcmetaPath)) {
  error('pack.mcmeta', 'missing');
} else {
  const mcmeta = readJson(mcmetaPath);
  const pack = mcmeta?.pack;
  if (!pack) error('pack.mcmeta', 'missing "pack" object');
  else if (pack.pack_format === undefined && (pack.min_format === undefined || pack.max_format === undefined)) {
    error('pack.mcmeta', 'needs pack_format, or min_format and max_format');
  }
  if (pack && !pack.description) warn('pack.mcmeta', 'no description');
}

// 2. Every JSON file under assets
const files = walk(join(packDir, 'assets'));
for (const file of files.filter((f) => f.endsWith('.json'))) {
  const json = readJson(file);
  if (json === null) continue;
  const where = rel(file);
  const parts = rel(file).split('/'); // assets/<ns>/<kind>/...
  const kind = parts[2];

  if (kind === 'models' && json.parent) {
    if (!json.parent.startsWith('#')) checkReference(where, json.parent, 'models', '.json');
  }
  if (kind === 'models' && json.textures) {
    for (const value of Object.values(json.textures)) {
      if (typeof value === 'string' && !value.startsWith('#')) checkReference(where, value, 'textures', '.png');
    }
  }
  if (kind === 'blockstates') {
    const models = [];
    for (const variant of Object.values(json.variants ?? {})) {
      for (const entry of Array.isArray(variant) ? variant : [variant]) models.push(entry.model);
    }
    for (const part of json.multipart ?? []) {
      for (const entry of Array.isArray(part.apply) ? part.apply : [part.apply]) models.push(entry?.model);
    }
    for (const model of models.filter(Boolean)) checkReference(where, model, 'models', '.json');
  }
}

// 3. PNG files and animation metadata
const pngs = files.filter((f) => f.endsWith('.png'));
for (const png of [...pngs, join(packDir, 'pack.png')].filter((f) => existsSync(f))) {
  checkPng(png);
}
for (const meta of files.filter((f) => f.endsWith('.png.mcmeta'))) {
  const texture = meta.slice(0, -'.mcmeta'.length);
  if (!existsSync(texture)) error(rel(meta), 'animation metadata has no matching .png');
  readJson(meta);
}

// 4. Report
for (const message of warnings) console.warn(`warning: ${message}`);
for (const message of errors) console.error(`error: ${message}`);
const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log(
  `${failed ? 'FAILED' : 'OK'}: ${errors.length} error(s), ${warnings.length} warning(s), ${files.length} asset file(s)`
);
process.exit(failed ? 1 : 0);
