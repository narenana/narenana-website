// Render one clip frame by frame:  node render.mjs <shot> [--frames N] [--ss S] [--auto]
// 1. load the game (DEV build) once, tier knobs overridden for the capture; 2. REHEARSAL (if the shot has one): fly the
// whole clip without rendering on a stand-in target, print the flight log, render a few stills to
// ../frames/<shot>-rehearsal/; 3. wait for ../control-<shot>.json ({"go":true, "over":{...}} or {"abort":true});
// --auto skips the wait; 4. fly + render every frame to ../frames/<shot>/f00000.png (SS x backbuffer, lanczos3 down).
import { startServer, launchBrowser, openGame, SCRATCH, sharp } from "./lib.mjs";
import { SHOTS } from "./shots.mjs";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";

const name = process.argv[2];
const shot = SHOTS[name];
if (!shot) { console.error(`unknown shot "${name}"; have: ${Object.keys(SHOTS).join(", ")}`); process.exit(2); }
const arg = (k, def) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : def; };
const SS = arg("--ss", shot.ss ?? 1);
const W = 1920, H = 1080, FPS = 30;
const TOTAL = arg("--frames", shot.frames + (shot.loopFrames ?? 0));
const EVERY = arg("--every", 1); // --every K: scout the shot, rendering only every Kth frame as a small still + a contact sheet
const dir = `${SCRATCH}/frames/${name}${EVERY > 1 ? "-scout" : ""}`;
const ctlFile = `${SCRATCH}/control-${name}.json`;
if (!process.argv.includes("--keep-control")) rmSync(ctlFile, { force: true });
mkdirSync(`${SCRATCH}/out`, { recursive: true });
const t = () => ((Date.now() - T0) / 60000).toFixed(1) + " min";
const T0 = Date.now();
const { server, base } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors, foreign } = await openGame(browser, base, { map: shot.map, aircraft: shot.aircraft, width: W, height: H, dpr: SS, camMode: "chase", knobs: shot.knobs });
  console.log(`[${t()}] loaded; knobs now`, await page.evaluate(() => { const k = window.__dbg.knobs; return { treeMeshDist: k.treeMeshDist, treeRadius: k.treeRadius, msaa: k.msaa }; }));
  await page.evaluate(() => {
    const d = window.__dbg;
    d.teleport(0, 400, 0, 0, 0, 20); // FLYING far above home: the in-flight render path (SSAO detached), thrower released
    window.__frame(1 / 30); window.__frame(1 / 30);
    d.engine.stopRenderLoop();
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__clock.freeze());
  await page.evaluate(readFileSync(new URL("./pageRuntime.js", import.meta.url), "utf8"));
  const shoot = async (file) => {
    // CLIP_CAPTURE=jpeg: a quality-98 JPEG grab re-saved as PNG (about 0.5 s a frame instead of 5 s for a PNG grab)
    const jpg = process.env.CLIP_CAPTURE === "jpeg" || file.endsWith(".jpg");
    const png = await page.screenshot(jpg ? { type: "jpeg", quality: 98, timeout: 300000 } : { type: "png", timeout: 300000 });
    if (file.endsWith(".jpg")) await sharp(png).resize(960, 540).jpeg({ quality: 85 }).toFile(file);
    else if (SS !== 1 || jpg) await sharp(png).resize(W, H, { kernel: "lanczos3" }).png({ compressionLevel: 1 }).toFile(file);
    else writeFileSync(file, png);
  };
  const settle = (n) => page.evaluate(async (n) => { // real renders at a held clock (dt = 0): streamed props land
    const d = window.__dbg;
    for (let i = 0; i < n; i++) { d.engine.beginFrame(); d.scene.render(); d.engine.endFrame(); await new Promise((r) => setTimeout(r, 300)); }
  }, n);
  const summarize = (log) => {
    const k = (f) => log.map(f);
    const mm = (a) => `${Math.min(...a).toFixed(1)}..${Math.max(...a).toFixed(1)}`;
    return { frames: log.length, agl: mm(k((r) => r.agl)), v: mm(k((r) => r.v)), bank: mm(k((r) => r.bank)), thr: mm(k((r) => r.thr)), phases: [...new Set(k((r) => r.phase))] };
  };
  // a control file written BEFORE the run (with --keep-control) sets the overrides for the rehearsal too
  let over = {};
  if (existsSync(ctlFile)) { try { over = JSON.parse(readFileSync(ctlFile, "utf8")).over ?? {}; } catch { /* none */ } }
  const goFile = `${SCRATCH}/go-${name}.json`;
  rmSync(goFile, { force: true });
  if (shot.rehearse) {
    const R = shot.rehearse;
    console.log(`[${t()}] rehearse prepare`, await page.evaluate(shot.prepare, R.prepareArgs));
    console.log("[rehearse setup]", await page.evaluate((o) => window.__clipSetup(o), { ...R.opts(over), aircraft: shot.aircraft, fps: FPS, ss: SS }));
    await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__clipStep(false); }, shot.preroll ?? 45);
    const rdir = `${dir}-rehearsal`; rmSync(rdir, { recursive: true, force: true }); mkdirSync(rdir, { recursive: true });
    for (let i = 0; i < TOTAL; i++) {
      const still = R.stills?.includes(i);
      if (still) await page.evaluate(() => window.__clipStep(false)); // pose for frame i, then render it with dt = 0
      else { await page.evaluate(() => window.__clipStep(false)); continue; }
      await settle(2);
      await shoot(`${rdir}/r${String(i).padStart(5, "0")}.png`);
      console.log(`[${t()}] rehearsal still ${i}`);
    }
    const log = await page.evaluate(() => window.__clipLog());
    writeFileSync(`${SCRATCH}/out/${name}-rehearsal.log.json`, JSON.stringify(log));
    console.log("[rehearsal flight]", summarize(log.slice(shot.preroll ?? 45)));
    if (!process.argv.includes("--auto")) {
      console.log(`[${t()}] waiting for ${goFile}`);
      let ctl = null;
      while (!ctl) { await new Promise((r) => setTimeout(r, 3000)); if (existsSync(goFile)) { try { ctl = JSON.parse(readFileSync(goFile, "utf8")); } catch { /* partial write */ } } }
      if (ctl.abort) throw new Error("aborted by go file");
      if (ctl.over) over = ctl.over;
      console.log("[control]", JSON.stringify(ctl));
    }
  }
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  if (shot.prepare) console.log(`[${t()}] prepare`, await page.evaluate(shot.prepare, shot.prepareArgs ?? null));
  const opts = typeof shot.opts === "function" ? shot.opts(over) : shot.opts;
  console.log("[setup]", await page.evaluate((o) => window.__clipSetup(o), { ...opts, aircraft: shot.aircraft, fps: FPS, ss: SS }));
  console.log("[preroll]", await page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = window.__clipStep(false); return r; }, shot.preroll ?? 45));
  console.log("[diag]", JSON.stringify(await page.evaluate(() => window.__clipDiag())));
  await settle(4);
  await shoot(`${SCRATCH}/out/${name}-check.png`); // the pose of frame -1, for a composition check while the rest renders
  console.log(`[${t()}] check frame written`);
  console.log(`[${t()}] rendering ${TOTAL} frames at ${W}x${H} from a ${Math.round(W * SS)}x${Math.round(H * SS)} backbuffer`);
  const tR = Date.now();
  const stills = [];
  for (let i = 0; i < TOTAL; i++) {
    if (EVERY > 1 && i % EVERY !== 0) { await page.evaluate(() => window.__clipStep(false)); continue; }
    const rec = await page.evaluate(() => window.__clipStep(true));
    if (EVERY > 1) { stills.push(`${dir}/s${String(i).padStart(5, "0")}.jpg`); await shoot(stills.at(-1)); }
    else await shoot(`${dir}/f${String(i).padStart(5, "0")}.png`);
    if (i % 10 === 0 || i === TOTAL - 1) {
      const per = (Date.now() - tR) / 1000 / (i + 1);
      console.log(`[${t()}] frame ${i}/${TOTAL} ${per.toFixed(1)} s/frame, eta ${((TOTAL - i - 1) * per / 60).toFixed(1)} min ${JSON.stringify(rec)}`);
    }
  }
  if (EVERY > 1) { // scouting: a contact sheet of the stills, 4 across
    const rows = Math.ceil(stills.length / 4);
    await sharp({ create: { width: 1920, height: rows * 270, channels: 3, background: "#000" } })
      .composite(await Promise.all(stills.map(async (f, k) => ({ input: await sharp(f).resize(480, 270).toBuffer(), left: (k % 4) * 480, top: Math.floor(k / 4) * 270 }))))
      .jpeg({ quality: 85 }).toFile(`${SCRATCH}/out/${name}-scout.jpg`);
  }
  const log = await page.evaluate(() => window.__clipLog());
  writeFileSync(`${SCRATCH}/out/${name}.log.json`, JSON.stringify(log));
  console.log("[flight]", summarize(log.slice(shot.preroll ?? 45)));
  console.log(`[${t()}] done: ${TOTAL} frames, ${((Date.now() - tR) / 1000 / TOTAL).toFixed(1)} s/frame`);
  console.log("page errors:", errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e)).slice(0, 6), `(+ ${errors.filter((e) => /ERR_CONNECTION_REFUSED/.test(e)).length} refused loopback calls: the local leaderboard/stats sinks are not running)`);
  if (foreign.length) console.log("non-loopback requests aborted:", foreign.length, [...new Set(foreign)].slice(0, 4));
} finally {
  await browser.close();
  await server.close();
}
