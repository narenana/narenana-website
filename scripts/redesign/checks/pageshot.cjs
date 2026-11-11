// Usage: node pageshot.cjs <url> <outprefix> [desk|phone|laptop] [--reduce]
// Scrolls the page to settle lazy media and reveals, then writes <prefix>-fold.png, <prefix>-full.jpg
// and per-section shots. Only loopback requests are allowed (no third-party calls from the preview).
const { chromium, devices } = require('playwright');
const [url, prefix, mode = 'desk'] = process.argv.slice(2);
const reduce = process.argv.includes('--reduce');
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const opts = mode === 'phone' ? { ...devices['iPhone 13'] } : mode === 'laptop' ? { viewport: { width: 1366, height: 768 } } : { viewport: { width: 1440, height: 900 } };
  if (reduce) opts.reducedMotion = 'reduce';
  const ctx = await b.newContext(opts);
  await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return h === '127.0.0.1' || h === 'localhost' ? r.continue() : r.abort(); });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${prefix}-fold.png` });
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 400) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(220); }
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - innerWidth,
    wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 5).map((e) => e.tagName + '.' + e.className),
    videos: [...document.querySelectorAll('video')].map((v) => ({ src: v.currentSrc.split('/').pop(), paused: v.paused, t: +v.currentTime.toFixed(1), rs: v.readyState })),
    sections: [...document.querySelectorAll('main > section, main > div, footer')].map((s) => ({ id: s.id || s.className, y: Math.round(s.getBoundingClientRect().top + scrollY), h: s.offsetHeight })),
  }));
  console.log(JSON.stringify({ height: H, ...info, errors }, null, 0));
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
  await p.screenshot({ path: `${prefix}-full.jpg`, fullPage: true, type: 'jpeg', quality: 70 });
  let i = 0;
  for (const s of info.sections) {
    await p.evaluate((y) => scrollTo(0, y - 70), s.y); await p.waitForTimeout(900);
    await p.screenshot({ path: `${prefix}-s${String(i++).padStart(2, '0')}-${String(s.id).replace(/\W+/g, '_').slice(0, 24)}.png` });
  }
  await b.close();
})();
