#!/usr/bin/env node
// Preview a generated trip as an SVG map (or ASCII), for eyeballing the generator.
//
//   node scripts/proc/preview.mjs <seed|code> [out.svg] [--biome meadow|grotto|lake] [--ascii] [--sheet N]
//
// With an output path an SVG is written there (with --sheet N: a contact sheet of N consecutive
// seeds); without one, an ASCII map goes to stdout. --ascii forces ASCII to stdout.

import { writeFileSync } from 'node:fs';
import { generateTrip, normalizeSeed } from '../../src/game/proc/index.js';
import { ITEM_BY_ID, RARITY } from '../../src/game/data/items.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const biome = flag('--biome') ?? undefined;
const sheet = Number(flag('--sheet') ?? 0);
const asciiIdx = args.indexOf('--ascii');
const forceAscii = asciiIdx >= 0;
if (forceAscii) args.splice(asciiIdx, 1);
const [seedArg = '1', out] = args;
const seed = /^\d+$/.test(seedArg) ? Number(seedArg) : normalizeSeed(seedArg);

const KIND_COLOR = {
  meadow: { wall: [148, 184, 122], floor: [214, 200, 192], step: [192, 178, 189], water: [127, 159, 212] },
  grotto: { wall: [214, 168, 158], floor: [216, 195, 187], step: [191, 177, 189], water: [127, 159, 212] },
  lake: { wall: [156, 190, 150], floor: [222, 210, 196], step: [191, 177, 189], water: [117, 150, 204] },
};
const LM_STYLE = {
  'cube-tree': { fill: '#6f9a5c', r: 0.42, shape: 'square' },
  willow: { fill: '#86b07a', r: 0.48, shape: 'circle' },
  dome: { fill: '#d8c4a9', r: 0.6, shape: 'circle' },
  mushroom: { fill: '#e49c94', r: 0.18, shape: 'circle' },
  pom: { fill: '#f1c0c8', r: 0.3, shape: 'circle' },
  stone: { fill: '#b9b2aa', r: 0.22, shape: 'circle' },
};
const CRITTER_COLOR = { cream: '#f1e8dc', mint: '#bfe3cc', blush: '#f3b9b9' };

function shade([r, g, b], top, kind) {
  const k = kind === 'water' ? 1 : 0.78 + Math.min(9, Math.max(0, top)) * 0.055;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function tripSvg(trip, ox = 0, oy = 0, cell = 14) {
  const { w, d } = trip.size;
  const { x0, z0 } = trip.origin;
  const px = (x) => ox + (x - x0 + 0.5) * cell;
  const pz = (z) => oy + 34 + (z - z0 + 0.5) * cell;
  const parts = [];
  const pal = KIND_COLOR[trip.biome];
  for (const [key, c] of Object.entries(trip.columns)) {
    const [x, z] = key.split(',').map(Number);
    const edge = c.top >= 6;
    const fill = edge ? shade([150, 130, 140], c.top, 'wall') : shade(pal[c.kind] ?? [255, 0, 255], c.top, c.kind);
    parts.push(`<rect x="${px(x) - cell / 2}" y="${pz(z) - cell / 2}" width="${cell}" height="${cell}" fill="${fill}"/>`);
    if (!edge && c.kind !== 'water' && c.top > 0) {
      parts.push(`<text x="${px(x)}" y="${pz(z) + cell * 0.18}" font-size="${cell * 0.45}" text-anchor="middle" fill="rgba(0,0,0,0.28)">${c.top % 1 ? '·' : c.top}</text>`);
    }
  }
  // Cliffs: a dark line between neighbours more than one block apart (needs a jump of > 1).
  for (const [key, c] of Object.entries(trip.columns)) {
    const [x, z] = key.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const n = trip.columns[`${x + dx},${z + dz}`];
      if (!n) continue;
      const diff = Math.abs(n.top - c.top);
      if (diff < 0.75) continue;
      const sw = diff > 1 ? 2.2 : 1;
      const col = diff > 1 ? 'rgba(60,30,40,0.75)' : 'rgba(60,30,40,0.3)';
      if (dx) parts.push(`<line x1="${px(x) + cell / 2}" y1="${pz(z) - cell / 2}" x2="${px(x) + cell / 2}" y2="${pz(z) + cell / 2}" stroke="${col}" stroke-width="${sw}"/>`);
      else parts.push(`<line x1="${px(x) - cell / 2}" y1="${pz(z) + cell / 2}" x2="${px(x) + cell / 2}" y2="${pz(z) + cell / 2}" stroke="${col}" stroke-width="${sw}"/>`);
    }
  }
  // Tile grid.
  for (const r of trip.rooms) {
    parts.push(`<rect x="${px(r.x0) - cell / 2}" y="${pz(r.z0) - cell / 2}" width="${r.size * cell}" height="${r.size * cell}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-dasharray="3 3"/>`);
    parts.push(`<text x="${px(r.x0) - cell / 2 + 2}" y="${pz(r.z0) - cell / 2 + 9}" font-size="8" fill="rgba(255,255,255,0.8)">${r.tile}${r.rot ? '@' + r.rot : ''}</text>`);
  }
  for (const lm of trip.landmarks) {
    if (lm.kind === 'fence') {
      parts.push(`<line x1="${px(lm.from[0])}" y1="${pz(lm.from[1])}" x2="${px(lm.to[0])}" y2="${pz(lm.to[1])}" stroke="#9a6b4f" stroke-width="3" stroke-linecap="round"/>`);
      continue;
    }
    const s = LM_STYLE[lm.kind];
    const r = s.r * cell;
    if (s.shape === 'square') parts.push(`<rect x="${px(lm.x) - r}" y="${pz(lm.z) - r}" width="${2 * r}" height="${2 * r}" rx="2" fill="${s.fill}" stroke="#3c5a32" stroke-width="1"/>`);
    else parts.push(`<circle cx="${px(lm.x)}" cy="${pz(lm.z)}" r="${r}" fill="${s.fill}" stroke="rgba(0,0,0,0.45)" stroke-width="0.8"/>`);
  }
  for (const f of trip.finds) {
    const col = RARITY[ITEM_BY_ID[f.itemId].rarity].color;
    const x = px(f.x);
    const y = pz(f.z);
    const r = cell * 0.42;
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI * k) / 5 - Math.PI / 2;
      const rr = k % 2 ? r * 0.45 : r;
      pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
    }
    parts.push(`<polygon points="${pts.join(' ')}" fill="${col}" stroke="#4a3b2f" stroke-width="1"/>`);
  }
  for (const c of trip.critters) {
    parts.push(`<circle cx="${px(c.x)}" cy="${pz(c.z)}" r="${cell * 0.36}" fill="${CRITTER_COLOR[c.kind]}" stroke="#4a3b2f" stroke-width="1.2"/>`);
    parts.push(`<circle cx="${px(c.x)}" cy="${pz(c.z)}" r="${cell * 2.5}" fill="none" stroke="rgba(74,59,47,0.25)" stroke-dasharray="2 2"/>`);
  }
  // Gate and spawn (an arrow along the spawn's facing: yaw 0 looks toward -z).
  parts.push(`<rect x="${px(trip.gate.x) - cell * 0.45}" y="${pz(trip.gate.z) - cell * 0.45}" width="${cell * 0.9}" height="${cell * 0.9}" fill="#7a6ad8" stroke="#fff" stroke-width="1.5"/>`);
  const fx = -Math.sin(trip.spawn.yaw);
  const fz = -Math.cos(trip.spawn.yaw);
  const sx = px(trip.spawn.x);
  const sy = pz(trip.spawn.z);
  parts.push(`<polygon points="${sx + fx * cell * 0.6},${sy + fz * cell * 0.6} ${sx - fz * cell * 0.4 - fx * cell * 0.3},${sy + fx * cell * 0.4 - fz * cell * 0.3} ${sx + fz * cell * 0.4 - fx * cell * 0.3},${sy - fx * cell * 0.4 - fz * cell * 0.3}" fill="#ffffff" stroke="#222" stroke-width="1.2"/>`);
  const st = trip.stats;
  parts.push(`<text x="${ox + 4}" y="${oy + 14}" font-size="14" font-weight="bold" fill="#3a2f2a">${trip.name} · ${trip.biome} · ${trip.code} (seed ${trip.seed})</text>`);
  parts.push(`<text x="${ox + 4}" y="${oy + 28}" font-size="10" fill="#5a4f4a">reach ${st.reachableCells}/${st.walkableCells} · finds ${st.finds} · critters ${st.critters} · props ${st.landmarks} · wfc ${st.wfcAttempts} · attempt ${st.attempt} · ramps ${st.repairs.ramps} · pits ${st.repairs.pitsLifted}</text>`);
  return { svg: parts.join('\n'), width: w * cell, height: d * cell + 34 };
}

function ascii(trip) {
  const { w, d } = trip.size;
  const { x0, z0 } = trip.origin;
  const grid = [];
  for (let z = 0; z < d; z++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const c = trip.columns[`${x0 + x},${z0 + z}`];
      row += c.top >= 6 ? '█' : c.kind === 'water' ? '~' : c.kind === 'floor' ? (c.top >= 1 ? String(Math.floor(c.top)) : '=') : c.kind === 'step' ? '/' : c.top % 1 ? '·' : String(c.top);
    }
    grid.push([...row]);
  }
  const put = (x, z, ch) => { grid[z - z0][x - x0] = ch; };
  for (const lm of trip.landmarks) {
    const ch = { 'cube-tree': 'T', willow: 'Y', dome: 'D', mushroom: 'm', pom: 'o', stone: 's', fence: '+' }[lm.kind];
    if (lm.kind === 'fence') { put(Math.round(lm.from[0]), Math.round(lm.from[1]), ch); put(Math.round(lm.to[0]), Math.round(lm.to[1]), ch); } else put(Math.round(lm.x), Math.round(lm.z), ch);
  }
  for (const f of trip.finds) put(f.x, f.z, '*');
  for (const c of trip.critters) put(c.x, c.z, '@');
  put(trip.gate.x, trip.gate.z, 'G');
  put(trip.spawn.x, trip.spawn.z, 'S');
  const st = trip.stats;
  return [
    `${trip.name} - ${trip.biome} - ${trip.code} (seed ${trip.seed})`,
    `reach ${st.reachableCells}/${st.walkableCells}  finds ${st.finds}  critters ${st.critters}  props ${st.landmarks}  wfc ${st.wfcAttempts}  attempt ${st.attempt}`,
    'legend: digits = grass top, · = half step, = stone floor, / stair, ~ water, █ edge, T cube tree, Y willow, D dome, m mushroom, o pom, s stone, + fence, * find, @ critter, S spawn, G gate',
    ...grid.map((r) => r.join('')),
  ].join('\n');
}

if (!out || forceAscii) {
  console.log(ascii(generateTrip({ seed, biome })));
} else {
  const n = Math.max(1, sheet);
  const cols = Math.ceil(Math.sqrt(n));
  const pieces = [];
  let W = 0;
  let H = 0;
  for (let k = 0; k < n; k++) {
    const trip = generateTrip({ seed: seed + k, biome });
    const { svg, width, height } = tripSvg(trip, (k % cols) * (40 * 14 + 16), Math.floor(k / cols) * (40 * 14 + 50));
    pieces.push(svg);
    W = Math.max(W, (k % cols) * (40 * 14 + 16) + width);
    H = Math.max(H, Math.floor(k / cols) * (40 * 14 + 50) + height);
  }
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">\n<rect width="100%" height="100%" fill="#f6efe6"/>\n${pieces.join('\n')}\n</svg>\n`;
  writeFileSync(out, doc);
  console.log(`wrote ${out} (${n} trip${n > 1 ? 's' : ''})`);
}
