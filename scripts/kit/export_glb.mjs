// Exports the kit's finished elements (baked and warped on the kit page) as glTF, for the models
// the game places (src/cave/kit-assets.js). With the dev server up, export the families the game
// uses, then compress (meshopt + quantization, about 30 MB -> 9 MB; three's GLTFLoader decodes it):
//   node scripts/kit/export_glb.mjs --families=trees,domes,mushrooms,fences,creatures --out=raw.glb
//   npx @gltf-transform/cli@4 meshopt raw.glb public/kit/kit-props.glb --level medium
// Env: BASE_URL (default http://127.0.0.1:5173)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const families = opt('families', 'trees,domes,mushrooms,fences,creatures');
const out = opt('out', 'public/kit/kit-props.glb');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node-tools/package.json')('playwright'));
}
const browser = await chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 572 } });
page.on('pageerror', (e) => console.error(`pageerror: ${e.message}`));
await page.goto(`${base}/kit.html?shot=4&family=${families}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__phluphReady === true, null, { timeout: 900000 });
const errors = await page.evaluate(() => window.__kitErrors ?? []);
if (errors.length) console.error('kit errors:', errors);
const { names, base64 } = await page.evaluate(() => window.__kitExportGLB());
mkdirSync(dirname(out), { recursive: true });
const buf = Buffer.from(base64, 'base64');
writeFileSync(out, buf);
console.log(`wrote ${out}: ${(buf.length / 1e6).toFixed(2)} MB, ${names.length} elements: ${names.join(' ')}`);
await browser.close();
