// Studio stills of the selectable aircraft from the game's own renderer and models.
//   node studio.mjs [ids] [--scale=0.5] [--clear=transparent|dark]
// Out: ../out2/aircraft/<id>.png (+ .webp) at 1600x900, rendered at 1/scale x and box-filtered down
// with premultiplied alpha. One camera direction, lens and light for all.
import { buildFixture, serveFixture, chromium } from './fixture-server.mjs';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'out2', 'aircraft');
mkdirSync(OUT, { recursive: true });
const arg = (n, f) => process.argv.find((v) => v.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const ids = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'sky-surfer,nanatrainer,nanajet,nana3d,nanasoar,nanaedge,nanadelta,nanaracer').split(',');
const scale = Number(arg('scale', 0.5));
const clear = arg('clear', 'transparent') === 'dark' ? [11 / 255, 15 / 255, 20 / 255, 1] : [0, 0, 0, 0];
await buildFixture();
const { server, url } = await serveFixture();
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?tier=ultra`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready, null, { timeout: 900000, polling: 1000 });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await page.addScriptTag({ content: readFileSync(resolve(here, 'page-driver.js'), 'utf8') });
  await page.evaluate((sc) => { window.sim.engine.setHardwareScalingLevel(sc); window.sim.engine.resize(); }, scale);
  for (const id of ids) {
    const t = Date.now();
    const r = await page.evaluate((o) => window.clip.studio(o), { aircraft: id, clear });
    const big = resolve(OUT, `${id}.big.png`);
    writeFileSync(big, Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'));
    const png = resolve(OUT, `${id}.png`);
    // Premultiply before the box filter so transparent (black) pixels do not darken the edges.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', big, '-vf',
      'format=rgba,premultiply=inplace=1,scale=1600:900:flags=area,unpremultiply=inplace=1,format=rgba', png]);
    rmSync(big);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '85', '-pix_fmt', 'yuva420p', resolve(OUT, `${id}.webp`)]);
    // Does the PNG really carry alpha? Count fully transparent and partly transparent pixels.
    const stats = execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'alphaextract,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
    let clearPx = 0, edge = 0;
    for (const a of stats) { if (a === 0) clearPx++; else if (a < 255) edge++; }
    console.log(`${id}: ${((Date.now() - t) / 1000).toFixed(1)} s, dist ${r.dist.toFixed(2)} m, box ${r.box}, size ${r.size}, meshes ${r.meshes}, transparent ${(100 * clearPx / stats.length).toFixed(1)}%, edge ${edge}`);
  }
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
