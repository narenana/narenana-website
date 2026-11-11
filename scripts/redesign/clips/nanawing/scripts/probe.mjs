// Timing probe: how long does one ultra frame take under SwiftShader, at 1x and 2x, and how long does capture take?
import { startServer, launchBrowser, openGame, SCRATCH } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const { server, base } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors, foreign } = await openGame(browser, base, { map: "island", aircraft: "spectre", dpr: 2 });
  const info = await page.evaluate(() => {
    const d = window.__dbg;
    const gl = d.engine._gl;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?", tier: d.tier, w: d.engine.getRenderWidth(), h: d.engine.getRenderHeight(), lvl: d.engine.getHardwareScalingLevel() };
  });
  console.log("info", info);
  // put the wing in the air (phase FLYING detaches SSAO as in flight), run two real frames, then take over
  await page.evaluate(() => {
    const d = window.__dbg;
    d.teleport(-260, 60, -330, 14, 0, 14);
    window.__frame(1 / 30); window.__frame(1 / 30);
    d.engine.stopRenderLoop();
    for (const el of document.body.children) if (el.tagName !== "CANVAS") el.style.display = "none";
  });
  await page.waitForTimeout(4000);
  const timeRender = async (level) => page.evaluate(async (level) => {
    const d = window.__dbg;
    d.engine.setHardwareScalingLevel(level); d.engine.resize();
    const c = d.scene.activeCamera;
    c.position.set(-280, 70, -350); c.setTarget(c.position.clone().set(180, 0, 220));
    d.scenery.updateCulling(-280, -350, 0.62, 0.78);
    const gl = d.engine._gl, px = new Uint8Array(4);
    const times = [];
    for (let i = 0; i < 4; i++) {
      window.__clock.frozen || window.__clock.freeze();
      window.__clock.advance(1000 / 30);
      const t = performance.timeOrigin ? Date.now() : 0; // frozen clock: measure with a real timer instead
      const r0 = window.__realNow ? window.__realNow() : 0;
      const t0 = new Date().getTime();
      d.engine.beginFrame(); d.scene.render(); d.engine.endFrame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(new Date().getTime() - t0);
      await new Promise((r) => setTimeout(r, 50));
    }
    return { level, w: d.engine.getRenderWidth(), h: d.engine.getRenderHeight(), times };
  }, level);
  // NB: Date is frozen too once the clock freezes — measure on the Node side instead.
  for (const level of [1, 0.5]) {
    const t0 = Date.now();
    const r = await timeRender(level);
    console.log("render", r.level, r.w, r.h, `${((Date.now() - t0) / 4000).toFixed(2)} s/frame (node-side, incl. 50 ms waits)`);
    let t1 = Date.now();
    const png = await page.screenshot({ type: "png" });
    console.log("  png screenshot", ((Date.now() - t1) / 1000).toFixed(2), "s", png.length);
    writeFileSync(`${SCRATCH}/frames/probe-${level}.png`, png);
    t1 = Date.now();
    const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
    console.log("  jpg screenshot", ((Date.now() - t1) / 1000).toFixed(2), "s", jpg.length);
  }
  console.log("errors", errors.slice(0, 8));
  console.log("foreign requests aborted", foreign.length, [...new Set(foreign)].slice(0, 5));
} finally {
  await browser.close();
  await server.close();
}
