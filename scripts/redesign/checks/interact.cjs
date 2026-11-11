// BASE: the local Worker (`npx wrangler dev --local --ip 127.0.0.1 --port 8787`); override with BASE=...
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const { chromium, devices } = require('playwright');
const local = (r) => { const h = new URL(r.request().url()).hostname; return h === '127.0.0.1' ? r.continue() : r.abort(); };
async function realClick(p, sel) {
  const loc = p.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const b = await loc.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const ok = await p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest(sel); }, [x, y, sel]);
  if (!ok) throw new Error('not hit-testable: ' + sel);
  await p.mouse.click(x, y);
}
(async () => {
  const b = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const out = {};
  { // desktop homepage: map switcher
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.route('**/*', local);
    const p = await ctx.newPage(); await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await realClick(p, '.pick[data-pick="desert"] h3 button'); await p.waitForTimeout(700);
    out.mapSwitch = await p.evaluate(() => ({ slide: document.querySelector('#maps .slide.on')?.dataset.slide, pressed: document.querySelector('.pick[data-pick="desert"] h3 button').getAttribute('aria-pressed'), moreVisible: getComputedStyle(document.querySelector('.pick[data-pick="desert"] .more')).display }));
    await realClick(p, '.pick[data-pick="parkland"] p'); await p.waitForTimeout(500);
    out.mapSwitchByCard = await p.evaluate(() => document.querySelector('#maps .slide.on')?.dataset.slide);
    await ctx.close();
  }
  { // desktop /nanawing2/: clip switcher plays only the active clip
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.route('**/*', local);
    const p = await ctx.newPage(); await p.goto(BASE + '/nanawing2/', { waitUntil: 'domcontentloaded' });
    await realClick(p, '.pick[data-pick="landing"] h3 button'); await p.waitForTimeout(2500);
    out.clipSwitch = await p.evaluate(() => [...document.querySelectorAll('#fly .switch-media .slide')].map((s) => ({ id: s.dataset.slide, on: s.classList.contains('on'), playing: !s.querySelector('video').paused, src: s.querySelector('video').currentSrc.split('/').pop() })));
    await ctx.close();
  }
  { // phone /nanawing2/: phone CTA opens the share dialog
    const ctx = await b.newContext({ ...devices['iPhone 13'] }); await ctx.route('**/*', local);
    const p = await ctx.newPage(); await p.goto(BASE + '/nanawing2/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    out.phoneButtons = await p.evaluate(() => ({ send: getComputedStyle(document.querySelector('.hero button.only-phone')).display, fly: getComputedStyle(document.querySelector('.hero a.only-wide')).display }));
    await p.evaluate(() => scrollTo(0, 0));
    const btn = p.locator('.hero button.only-phone'); const bb = await btn.boundingBox();
    await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(600);
    out.shareDialogOpen = await p.evaluate(() => !!document.getElementById('nn-share-dialog')?.open);
    out.shareUrl = await p.evaluate(() => document.getElementById('nn-share-url')?.value);
    out.ctaInFirstScreen = bb.y + bb.height <= 664;
    await ctx.close();
  }
  { // reduced motion: no clip downloads at all
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); await ctx.route('**/*', local);
    const p = await ctx.newPage(); const media = [];
    p.on('request', (r) => { if (/\.(mp4|webm)/.test(r.url())) media.push(r.url().split('/').pop()); });
    await p.goto(BASE + '/nanawing2/', { waitUntil: 'domcontentloaded' });
    for (let y = 0; y < 8000; y += 500) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(150); }
    out.reducedMotionVideoRequests = media.length;
    await ctx.close();
  }
  { // homepage first screen on a 1366x768 laptop and a phone: primary CTA fully visible
    for (const [name, opts] of [['laptop', { viewport: { width: 1366, height: 768 } }], ['phone', devices['iPhone 13']]]) {
      const ctx = await b.newContext(opts); await ctx.route('**/*', local);
      const p = await ctx.newPage(); await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
      out['homeCta_' + name] = await p.evaluate(() => { const r = document.querySelector('.hero .btn-primary').getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, visible: r.bottom <= innerHeight && r.top >= 0 }; });
      await ctx.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
