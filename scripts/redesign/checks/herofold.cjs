// Fold shots of the /nanawing2/ hero on several screens; reports CTA bottom and copy top. Loopback only.
// BASE: the local Worker (`npx wrangler dev --local --ip 127.0.0.1 --port 8787`); override with BASE=...
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const specs = [['iphone13', devices['iPhone 13']], ['pixel7', devices['Pixel 7']], ['iphoneSE', devices['iPhone SE']], ['galaxyS9', devices['Galaxy S9+']], ['laptop', { viewport: { width: 1366, height: 768 } }], ['desk', { viewport: { width: 1920, height: 1080 } }]];
  for (const [name, opts] of specs) {
    const ctx = await b.newContext(opts);
    await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
    const p = await ctx.newPage();
    await p.goto(process.argv[3] || BASE + '/nanawing2/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    const m = await p.evaluate(() => {
      const r = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
      return { vh: innerHeight, vw: innerWidth, chip: r('.hero-copy .chip'), cta: r('.hero .actions .btn-primary'), corner: r('.hero-corner'), share: r('#nn-share-launcher'), video: document.querySelector('.hero video')?.currentSrc.split('/').pop() };
    });
    console.log(name, JSON.stringify(m));
    await p.screenshot({ path: `${process.argv[2]}/${process.argv[4] || 'fold'}-${name}.png` });
    await ctx.close();
  }
  await b.close();
})();
