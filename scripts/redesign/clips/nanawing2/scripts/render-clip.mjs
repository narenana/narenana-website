// Render a short video loop of Nanawing 2 from the real renderer, frame by frame.
//
//   node render-clip.mjs <shot> [--plan] [--stills=6] [--scale=1] [--tier=ultra] [--keep-frames]
//                               [--frames=a-b]  (render only that frame range, for split renders)
//
//   --plan     dry-run the flight only (no drawing) and print/save the trace + chosen window
//   --stills=N draw N frames spread over the window into frames/<shot>-still-*.png (composition check)
//   (default)  draw every frame of the window into frames/<shot>/%04d.png, then encode.sh does the rest
//
// Shots live in shots.mjs. Output: ../frames/<shot>/ and ../out/.
import { buildFixture, serveFixture, chromium, REPO } from './fixture-server.mjs';
import { SHOTS } from './shots.mjs';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const arg = (name, fallback) => {
  const a = process.argv.find((v) => v.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const shotName = process.argv[2];
const shot = SHOTS[shotName];
if (!shot) throw Error(`Unknown shot. Choose: ${Object.keys(SHOTS).join(', ')}`);
const tier = arg('tier', shot.tier ?? 'ultra');
const scale = Number(arg('scale', shot.scale ?? 1)); // hardware scaling: 0.5 = 2x supersampling
const fps = 30;
// Frame transfer format: png (lossless, slower to encode in the page) or jpeg (quality 0.98).
const imageType = arg('image', 'png') === 'jpeg' ? 'image/jpeg' : 'image/png';
const imageQuality = imageType === 'image/jpeg' ? 0.98 : undefined;
const ext = imageType === 'image/jpeg' ? 'jpg' : 'png';
const stepsPerFrame = 120 / fps;
const frameCount = Math.round(shot.duration * fps) + Math.round((shot.loopFade ?? 0) * fps);
const framesDir = resolve(ROOT, 'frames', shotName);
const trims = JSON.parse(readFileSync(resolve(REPO, 'tests/fixtures/cruise-trim.json'), 'utf8')).reports;
const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

await buildFixture();
const { server, url } = await serveFixture();
const browser = await chromium.launch({
  // Headless (Playwright default) and muted, per the repo's local test etiquette.
  args: ['--mute-audio', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  // Load small (the Simulator's own startup warmup draws 32 frames), then resize to 1080p.
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}?tier=${tier}`, { timeout: 120000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ready, null, { timeout: 900000, polling: 1000 });
  console.log(`[${elapsed()}] fixture ready (tier ${tier})`, errors);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await page.addScriptTag({ content: readFileSync(resolve(here, 'page-driver.js'), 'utf8') });
  const physics =
    shot.physics ??
    (await page.evaluate((id) => window.fieldCheck.AIRCRAFT[id].defaultPhysics, shot.aircraft));
  const trim = trims.find((r) => r.aircraft === shot.aircraft && r.physics === physics);
  if (!trim) throw Error(`No cruise trim for ${shot.aircraft} physics ${physics}`);
  const setup = {
    aircraft: shot.aircraft,
    physics,
    trim,
    gains: shot.gains ?? {},
    route: shot.route,
    land: shot.land ?? true,
    smoke: shot.smoke ?? false,
    radio: shot.radio ?? false,
    scale,
  };

  // Pass 1: fly the whole thing without drawing, to find the window.
  let info = await page.evaluate((o) => window.clip.setup(o), setup);
  console.log(`[${elapsed()}] setup`, JSON.stringify({ buffer: info.buffer, physics: info.physics, phase: info.phase }));
  let r;
  for (let t = 0; t < (shot.maxSeconds ?? 240); t += 10) {
    r = await page.evaluate(() => window.clip.fly(10));
    if (r.phase === 'landed' || r.phase === 'crashed') {
      r = await page.evaluate(() => window.clip.fly(4)); // let the rollout settle in the trace
      break;
    }
  }
  const trace = await page.evaluate(() => window.clip.trace());
  const start = shot.pick(trace);
  console.log(`[${elapsed()}] dry run: ended ${r.phase} at ${r.time.toFixed(1)} s, landing ${JSON.stringify(r.landing && { outcome: r.landing.outcome, onRunway: r.landing.onRunway, reason: r.landing.reason })}`);
  console.log(`window: ${start.toFixed(2)} s .. ${(start + frameCount / fps).toFixed(2)} s (${frameCount} frames)`);
  mkdirSync(resolve(ROOT, 'out'), { recursive: true });
  writeFileSync(
    resolve(ROOT, 'out', `${shotName}-trace.json`),
    JSON.stringify({ shot: shotName, aircraft: shot.aircraft, physics, start, frameCount, fps, trace }),
  );
  if (flag('plan')) {
    const at = (time) => trace.reduce((b, x) => (Math.abs(x[0] - time) < Math.abs(b[0] - time) ? x : b));
    for (let k = 0; k <= 6; k++) console.log(JSON.stringify(at(start + (k / 6) * (frameCount / fps))));
    process.exit(0);
  }

  // Pass 2: same deterministic flight from reset, drawing only the window.
  info = await page.evaluate((o) => window.clip.setup(o), setup);
  await page.evaluate((c) => window.clip.setCamera(c), shot.camera ?? { mode: 'game' });
  // Land exactly on a frame boundary: start is a multiple of 1/30 s from launch.
  const startSteps = Math.round(start * fps) * stepsPerFrame;
  await page.evaluate((n) => window.clip.fly(n / 120), startSteps);
  const check = await page.evaluate(() => window.clip.state());
  const ref = trace.reduce((b, x) => (Math.abs(x[0] - check.time) < Math.abs(b[0] - check.time) ? x : b));
  console.log(`[${elapsed()}] at window start: t=${check.time.toFixed(3)} pos=${check.position.map((v) => v.toFixed(2))} (dry run ${ref.slice(3, 6)}), phase ${check.phase}`);

  const stills = Number(arg('stills', 0));
  const range = arg('frames', null)?.split('-').map(Number) ?? [0, frameCount - 1];
  const wanted = stills
    ? Array.from({ length: stills }, (_, k) => Math.round((k / (stills - 1)) * (frameCount - 1)))
    : Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k);
  mkdirSync(framesDir, { recursive: true });
  let frame = 0;
  const times = [];
  for (const target of wanted) {
    // Advance (without drawing) to the frame before the target, then shoot the target.
    if (target > frame) await page.evaluate((n) => window.clip.fly(n / 120), (target - frame) * stepsPerFrame);
    const t = Date.now();
    const dataUrl = await page.evaluate(([spf, type, q]) => window.clip.shoot(spf, type, q), [stepsPerFrame, imageType, imageQuality]);
    frame = target + 1;
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    const name = stills ? resolve(ROOT, 'frames', `${shotName}-still-${String(target).padStart(4, '0')}.${ext}`) : resolve(framesDir, `${String(target).padStart(4, '0')}.${ext}`);
    if (scale < 1) {
      // Supersampled: box-filter down to 1920x1080 right away (keeps disk use low).
      const big = name + '.big.png';
      writeFileSync(big, png);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', big, '-vf', 'scale=1920:1080:flags=area', name]);
      rmSync(big);
    } else writeFileSync(name, png);
    times.push(Date.now() - t);
    if (times.length % 10 === 1 || stills)
      console.log(`[${elapsed()}] frame ${target}: ${(times.at(-1) / 1000).toFixed(1)} s`, JSON.stringify(await page.evaluate(() => { const s = window.clip.state(); return { t: +s.time.toFixed(2), phase: s.phase, d: +s.distance.toFixed(1), fov: +s.fov.toFixed(3), ...window.clip.lastTiming }; })));
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length / 1000;
  console.log(`[${elapsed()}] drew ${times.length} frames, mean ${mean.toFixed(2)} s/frame`, errors.length ? errors : '');
  writeFileSync(resolve(ROOT, 'out', `${shotName}-render${arg('frames', null) ? '-' + arg('frames', null) : ''}.json`), JSON.stringify({ shot: shotName, tier, scale, start, frames: times.length, meanSecondsPerFrame: mean, totalSeconds: (Date.now() - t0) / 1000, errors }, null, 1));
} finally {
  await browser.close();
  await server.close();
}
