// Bundles index.html + css + js into one self-contained HTML file.
//   node tools/bundle.mjs                 -> dist/stickerwild.html (full page)
//   node tools/bundle.mjs --fragment out  -> page body only (for hosts that add their own <html> wrapper)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outArg = args.find((a) => !a.startsWith('--'));
const out = outArg || join(root, 'dist', 'stickerwild.html');

const html = read('index.html');
const body = html.split('<!--GAME-BODY-START-->')[1].split('<!--GAME-BODY-END-->')[0];
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => read(m[1]));
const css = read('css/style.css');
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const desc = html.match(/<meta name="description"[^>]+>/)[0];

const head = `<title>Stickerwild</title>
${desc}
${fonts}
<style>
${css}
</style>
`;
const tail = `${body}
<script>
${scripts.join('\n')}
</script>
`;

const page = fragment
  ? head + tail
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
${head}</head>
<body>
${tail}</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(1)} KB)`);
