// Shared harness for rendering Nanawing clips frame by frame from the DEV build (window.__dbg).
// Local only: own Vite dev server on a random loopback port (cache dir outside the repo), headless + muted
// Chromium (SwiftShader), every request to a non-loopback host aborted, service workers blocked.
import { createRequire } from "node:module";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO = process.env.FPVSIM_REPO ?? resolve(HERE, "../../../../../../fpvsim"); // sibling checkout of narenana-website
const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");
const { createServer } = await import(join(REPO, "node_modules/vite/dist/node/index.js"));
export const sharp = require("sharp");
const { launchFromMenu } = await import(join(REPO, "tools/probeKit.mjs"));
export const SCRATCH = resolve(HERE, ".."); // frames/ and out/ land next to scripts/ (gitignored)

const LOOPBACK = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

export async function startServer() {
  const port = 20000 + Math.floor(Math.random() * 40000);
  const server = await createServer({
    root: REPO,
    cacheDir: join(SCRATCH, ".vite-cache"), // never write into the repo
    server: { host: "127.0.0.1", port, strictPort: true, open: false, hmr: false },
    logLevel: "warn",
    clearScreen: false,
  });
  await server.listen();
  return { server, base: `http://127.0.0.1:${port}` };
}

export async function launchBrowser() {
  return chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    headless: true,
    args: [
      "--mute-audio",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
}

// Virtual clock: real time until __clock.freeze(), then performance.now / Date.now only move when the
// renderer advances them, so every frame is exactly 1/30 s of game time however long SwiftShader takes.
const CLOCK_INIT = () => {
  const realPerf = performance.now.bind(performance);
  const realDate = Date.now.bind(Date);
  let manual = false, vt = 0, vd = 0;
  performance.now = () => (manual ? vt : realPerf());
  Date.now = () => (manual ? vd : realDate());
  window.__clock = {
    freeze() { vt = realPerf(); vd = realDate(); manual = true; },
    advance(ms) { vt += ms; vd += ms; },
    get frozen() { return manual; },
  };
};

export async function openGame(browser, base, { map, aircraft, width = 1920, height = 1080, dpr = 1, camMode = "chase", knobs = null }) {
  // Boot at a tiny viewport: the loader renders the world at full tier throughout, and under SwiftShader every one of
  // those frames costs in proportion to its size. The page is resized to the capture size once the world is ready.
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 }, deviceScaleFactor: dpr, serviceWorkers: "block" });
  const foreign = [];
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    let host = "";
    try { const u = new URL(url); host = /^(data|blob|about):$/.test(u.protocol) ? "localhost" : u.hostname; } catch { /* foreign */ }
    if (LOOPBACK(host)) return route.continue();
    foreign.push(url);
    return route.abort();
  });
  await ctx.addInitScript(CLOCK_INIT);
  await ctx.addInitScript((mode) => {
    localStorage.setItem("nw.tier", "ultra");
    localStorage.setItem("nw.tierChosen", "1");
    localStorage.setItem("nw.camMode", mode);
  }, camMode);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  const t0 = Date.now();
  await page.goto(`${base}/?play&map=${map}&aircraft=${aircraft}&lowgpu=0`, { waitUntil: "domcontentloaded", timeout: 300000 });
  if (knobs) { // tier-knob overrides for the capture: the game reads TIERS[tier] when the world builds after Launch
    await page.waitForSelector('#nw-card.show #nw-start:not([disabled])', { state: "visible", timeout: 300000 });
    console.log("[knobs]", await page.evaluate(async (ov) => { const m = await import("/src/render/qualityTier.ts"); Object.assign(m.TIERS.ultra, ov); return ov; }, knobs));
  }
  await launchFromMenu(page, { timeout: 900000 });
  await page.waitForFunction(() => window.__dbg && window.__frame, undefined, { timeout: 300000 });
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__dbg.engine.resize());
  console.log(`[open] ${map}/${aircraft} ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { ctx, page, errors, foreign };
}
