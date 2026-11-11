// Dry-run several shots' flights in ONE page load (no drawing) and summarise the windows.
//   node plan.mjs pass,takeoff,landing [--tier=ultra]
import { buildFixture, serveFixture, chromium, REPO } from './fixture-server.mjs';
import { SHOTS } from './shots.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const names = process.argv[2].split(',');
const tier = process.argv.find((v) => v.startsWith('--tier='))?.slice(7) ?? 'ultra';
const trims = JSON.parse(readFileSync(resolve(REPO, 'tests/fixtures/cruise-trim.json'), 'utf8')).reports;
await buildFixture();
const { server, url } = await serveFixture();
const browser = await chromium.launch({ args: ['--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
try {
  // Physics does not depend on the viewport; a small one loads much faster under SwiftShader.
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?tier=${tier}`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready, null, { timeout: 900000, polling: 1000 });
  console.log(`ready after ${(Date.now() - t0) / 1000} s`);
  await page.addScriptTag({ content: readFileSync(resolve(here, 'page-driver.js'), 'utf8') });
  mkdirSync(resolve(ROOT, 'out'), { recursive: true });
  for (const name of names) {
    const shot = SHOTS[name];
    const physics = shot.physics ?? (await page.evaluate((id) => window.fieldCheck.AIRCRAFT[id].defaultPhysics, shot.aircraft));
    const trim = trims.find((r) => r.aircraft === shot.aircraft && r.physics === physics);
    const ts = Date.now();
    await page.evaluate((o) => window.clip.setup(o), {
      aircraft: shot.aircraft, physics, trim, gains: shot.gains ?? {}, route: shot.route, land: shot.land ?? true,
    });
    let r;
    for (let t = 0; t < (shot.maxSeconds ?? 240); t += 10) {
      r = await page.evaluate(() => window.clip.fly(10));
      if (r.phase === 'landed' || r.phase === 'crashed') break;
    }
    const trace = await page.evaluate(() => window.clip.trace());
    writeFileSync(resolve(ROOT, 'out', `${name}-plan-trace.json`), JSON.stringify(trace));
    const start = shot.pick(trace);
    console.log(`\n== ${name} (${shot.aircraft} p${physics}) dry run ${(Date.now() - ts) / 1000}s: end ${r.phase} t=${r.time.toFixed(1)} landing=${JSON.stringify(r.landing && { o: r.landing.outcome, rw: r.landing.onRunway, why: r.landing.reason })}`);
    // phase changes and leg changes
    let prev = null;
    for (const row of trace) {
      const key = row[1] + ':' + row[2];
      if (key !== prev) console.log('  ', JSON.stringify(row));
      prev = key;
    }
    console.log(`  window start ${start}`);
    const at = (time) => trace.reduce((b, x) => (Math.abs(x[0] - time) < Math.abs(b[0] - time) ? x : b));
    for (let k = 0; k <= 8; k++) console.log('   ', JSON.stringify(at(start + k)));
  }
  console.log('errors', errors);
} finally {
  await browser.close();
  await server.close();
}
