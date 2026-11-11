// Real-input check: the share dialog heading follows the button that opened it. Loopback only.
// BASE: the local Worker (`npx wrangler dev --local --ip 127.0.0.1 --port 8787`); override with BASE=...
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const { chromium, devices } = require('playwright');
async function realTap(p, loc, touch) {
  await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  const b = await loc.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const hit = await loc.evaluate((el, [x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); }, [x, y]);
  if (!hit) throw new Error('not hit-testable');
  touch ? await p.touchscreen.tap(x, y) : await p.mouse.click(x, y);
}
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const out = {};
  for (const [name, opts, sel] of [
    ['phone-hero', devices['iPhone 13'], '.hero button[data-share-page]'],
    ['phone-close', devices['iPhone 13'], '#go button.btn-ghost[data-share-page]'],
    ['laptop-fab', { viewport: { width: 1366, height: 768 } }, '#nn-share-launcher'],
  ]) {
    const ctx = await b.newContext(opts); if (name === 'laptop-fab') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const p = await ctx.newPage(); await p.goto(BASE + '/nanawing2/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
    await realTap(p, p.locator(sel).first(), !!opts.hasTouch);
    await p.waitForTimeout(400);
    out[name] = await p.evaluate(() => ({ open: !!document.getElementById('nn-share-dialog')?.open, heading: document.getElementById('nn-share-heading')?.textContent, fabShown: getComputedStyle(document.getElementById('nn-share-launcher')).display !== 'none' }));
    if (name === 'laptop-fab') {
      await realTap(p, p.locator('#nn-share-dialog [data-copy]'), false).catch((e) => (out.copyErr = e.message));
      await p.waitForTimeout(300); out.toast = await p.evaluate(() => document.querySelector('#nn-share-dialog .nn-share-status').textContent);
    }
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
