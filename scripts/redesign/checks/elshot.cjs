// Element screenshot: node elshot.cjs <url> <selector> <out.png> [laptop|phone]. Loopback only.
const { chromium, devices } = require('playwright');
const [url, sel, out, mode = 'laptop'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio'] });
  const ctx = await b.newContext(mode === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 768 } });
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'domcontentloaded' });
  const loc = p.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await loc.screenshot({ path: out });
  await b.close();
})();
