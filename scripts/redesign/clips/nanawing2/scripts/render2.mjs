// Round 2 renderer: several shots in ONE page load.
//
//   node render2.mjs hero,hero-portrait [--stills=6] [--plan] [--tier=ultra]
//
// Per shot (shots2.mjs): viewport = render size, out = frame size written (downscaled with an
// area filter when smaller, i.e. supersampled). Frames: ../frames/<name>/%04d.png. Logs/traces:
// ../out2/. Encoding is separate (encode2.sh).
import { buildFixture, serveFixture, chromium, REPO } from './fixture-server.mjs';
import { SHOTS } from './shots2.mjs';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OUT = resolve(ROOT, 'out2');
const arg = (name, fallback) => {
  const a = process.argv.find((v) => v.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const names = process.argv[2].split(',');
for (const n of names) if (!SHOTS[n]) throw Error(`Unknown shot ${n}. Choose: ${Object.keys(SHOTS).join(', ')}`);
const tier = arg('tier', 'ultra');
const stills = Number(arg('stills', 0));
const fps = 30;
const spf = 120 / fps;
const trims = JSON.parse(readFileSync(resolve(REPO, 'tests/fixtures/cruise-trim.json'), 'utf8')).reports;
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(5) + 's';
mkdirSync(OUT, { recursive: true });

await buildFixture();
const { server, url } = await serveFixture();
const browser = await chromium.launch({
  // Headless (Playwright default) and muted, per the repo's local test etiquette.
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}?tier=${tier}`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready, null, { timeout: 900000, polling: 1000 });
  await page.addScriptTag({ content: readFileSync(resolve(here, 'page-driver.js'), 'utf8') });
  console.log(`[${el()}] fixture ready (tier ${tier})`, errors);

  for (const name of names) {
    const shot = SHOTS[name];
    const [vw, vh] = shot.viewport ?? [1920, 1080];
    const [ow, oh] = shot.out ?? [vw, vh];
    await page.setViewportSize({ width: vw, height: vh });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    const physics = shot.physics ?? (await page.evaluate((id) => window.fieldCheck.AIRCRAFT[id].defaultPhysics, shot.aircraft));
    const trim = trims.find((r) => r.aircraft === shot.aircraft && r.physics === physics);
    if (!trim) throw Error(`No cruise trim for ${shot.aircraft} physics ${physics}`);
    const setup = {
      aircraft: shot.aircraft, physics, trim, gains: shot.gains ?? {}, route: shot.route,
      land: shot.land ?? true, smoke: false, radio: false, scale: 1,
    };
    let frameCount = Math.round(shot.duration * fps) + Math.round((shot.loopFade ?? 0) * fps);

    // Pass 1: dry run (no drawing) to choose the window.
    let info = await page.evaluate((o) => window.clip.setup(o), setup);
    let r;
    for (let t = 0; t < (shot.maxSeconds ?? 240); t += 10) {
      r = await page.evaluate(() => window.clip.fly(10));
      if (r.phase === 'landed' || r.phase === 'crashed') {
        r = await page.evaluate(() => window.clip.fly(3));
        break;
      }
    }
    const trace = await page.evaluate(() => window.clip.trace());
    writeFileSync(resolve(OUT, `${name}-trace.json`), JSON.stringify({ name, trace }));
    {
      let prev = null;
      for (const row of trace) {
        const key = row[1] + ':' + row[2];
        if (key !== prev) console.log('    ', JSON.stringify(row));
        prev = key;
      }
    }
    let start = shot.pick(trace, shot);
    if (typeof start === 'object') {
      // pick chose the duration too (a manoeuvre-length window)
      shot.duration = start.duration;
      frameCount = Math.round(shot.duration * fps) + Math.round((shot.loopFade ?? 0) * fps);
      start = start.start;
    }
    console.log(`[${el()}] ${name}: ${shot.aircraft} p${physics} buffer ${info.buffer} -> out ${ow}x${oh}; dry run ended ${r.phase} t=${r.time.toFixed(1)} landing=${JSON.stringify(r.landing && { o: r.landing.outcome, rw: r.landing.onRunway })}; window ${start.toFixed(2)}..${(start + frameCount / fps).toFixed(2)} s (${frameCount} frames)`);
    writeFileSync(resolve(OUT, `${name}-trace.json`), JSON.stringify({ name, aircraft: shot.aircraft, physics, start, frameCount, fps, trace }));
    if (flag('plan')) {
      const at = (time) => trace.reduce((b, x) => (Math.abs(x[0] - time) < Math.abs(b[0] - time) ? x : b));
      for (let k = 0; k <= 5; k++) console.log('   ', JSON.stringify(at(start + (k / 5) * (frameCount / fps))));
      continue;
    }

    // Pass 2: replay from reset, camera on, draw the window.
    info = await page.evaluate((o) => window.clip.setup(o), setup);
    const startSteps = Math.round(start * fps) * spf;
    const preroll = Math.min(startSteps, 4 * 120); // let smoothed cameras settle before frame 0
    await page.evaluate((n) => window.clip.fly(n / 120), startSteps - preroll);
    const camera = { ...(shot.camera ?? { mode: 'game' }) };
    if (camera.mode === 'chase') {
      const rows = trace.filter((r) => r[0] >= start && r[0] <= start + frameCount / fps);
      camera.aimXY = [rows.reduce((a, r) => a + r[3], 0) / rows.length, rows.reduce((a, r) => a + r[4], 0) / rows.length];
      console.log(`  chase aim at mean x/y ${camera.aimXY.map((v) => v.toFixed(3))}`);
    }
    await page.evaluate((c) => window.clip.setCamera(c), camera);
    await page.evaluate((n) => window.clip.fly(n / 120), preroll);
    const dir = resolve(ROOT, 'frames', name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const wanted = stills
      ? Array.from({ length: stills }, (_, k) => Math.round((k / (stills - 1)) * (frameCount - 1)))
      : Array.from({ length: frameCount }, (_, k) => k);
    let frame = 0;
    const times = [];
    for (const target of wanted) {
      if (target > frame) await page.evaluate((n) => window.clip.fly(n / 120), (target - frame) * spf);
      const t = Date.now();
      const dataUrl = await page.evaluate((n) => window.clip.shoot(n), spf);
      frame = target + 1;
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      const file = stills
        ? resolve(ROOT, 'frames', `${name}-still-${String(target).padStart(4, '0')}.png`)
        : resolve(dir, `${String(target).padStart(4, '0')}.png`);
      if (ow !== vw || oh !== vh) {
        const big = file + '.big.png';
        writeFileSync(big, png);
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', big, '-vf', `scale=${ow}:${oh}:flags=area`, file]);
        rmSync(big);
      } else writeFileSync(file, png);
      times.push(Date.now() - t);
      if (stills || times.length % 15 === 1) {
        const st = await page.evaluate(() => { const s = window.clip.state(); return { t: +s.time.toFixed(2), phase: s.phase, d: +s.distance.toFixed(1), fov: +s.fov.toFixed(3), pos: s.position.map((v) => +v.toFixed(2)), ndc: s.ndc, myNdc: s.myNdc, rot: s.rot, chaseRot: s.chaseRot, quat: s.quat, camPos: s.camPos, fovMode: s.fovMode, aspect: +s.aspect.toFixed(3), ms: Math.round(window.clip.lastTiming.drawMs) }; });
        console.log(`[${el()}] ${name} frame ${target}: ${(times.at(-1) / 1000).toFixed(1)} s`, JSON.stringify(st));
      }
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length / 1000;
    console.log(`[${el()}] ${name}: drew ${times.length} frames, mean ${mean.toFixed(2)} s/frame`, errors.length ? errors : '');
    writeFileSync(resolve(OUT, `${name}-render${stills ? '-stills' : ''}.json`), JSON.stringify({ name, tier, viewport: [vw, vh], out: [ow, oh], start, frames: times.length, meanSecondsPerFrame: mean, errors }, null, 1));
  }
} finally {
  await browser.close();
  await server.close();
}
