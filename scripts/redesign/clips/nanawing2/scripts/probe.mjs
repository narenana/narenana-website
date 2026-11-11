// Probe: load the fixture, report renderer/back-buffer, time renders at 1x and 2x, save a still.
import { buildFixture, serveFixture, chromium } from './fixture-server.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'frames');
const tier = process.argv[2] ?? 'ultra';
await buildFixture();
const { server, url } = await serveFixture();
const browser = await chromium.launch({
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  let t = Date.now();
  await page.goto(`${url}?tier=${tier}`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready, null, { timeout: 600000, polling: 1000 });
  console.log('ready after', (Date.now() - t) / 1000, 's', errors);
  const info = await page.evaluate(() => {
    const s = window.sim;
    return {
      renderer: s.engine.getGlInfo(),
      quality: s.quality,
      buffer: [s.engine.getRenderWidth(), s.engine.getRenderHeight()],
      scaling: s.engine.getHardwareScalingLevel(),
      cameraChildren: s.camera.getChildren().map((c) => c.name),
      fov: s.camera.fov,
      pilot: s.camera.position.asArray(),
      aircraft: s.aircraftId,
      phase: s.model.phase,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  for (const scale of [1, 0.5]) {
    const r = await page.evaluate((scale) => {
      const s = window.sim;
      s.setMenu(false);
      s.engine.setHardwareScalingLevel(scale);
      s.engine.resize();
      const times = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        s.scene.render();
        s.engine._gl.finish();
        times.push(performance.now() - t);
      }
      return { scale, buffer: [s.engine.getRenderWidth(), s.engine.getRenderHeight()], times };
    }, scale);
    console.log(JSON.stringify(r));
    t = Date.now();
    await page.locator('canvas').screenshot({ path: `${OUT}/probe-${tier}-${scale}.png` });
    console.log('screenshot ms', Date.now() - t);
  }
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
