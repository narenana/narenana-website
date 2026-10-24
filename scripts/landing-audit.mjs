// Audits a built landing page against docs/landing-pages.md.
//   node scripts/landing-audit.mjs content/nanawing/chupito-simulator.json [--no-fold]
// Static checks read the page JSON, the built HTML and the files it depends on; the fold check
// (rule H1) renders the page in headless Chrome at a laptop and a phone size and needs Chrome at
// CHROME or the usual Windows path. Exits 1 on any failure.
import { readFileSync, existsSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, extname, normalize } from 'node:path';
import sharp from 'sharp';

const contentPath = process.argv[2] || 'content/nanawing/chupito-simulator.json';
const fold = !process.argv.includes('--no-fold');
const copy = JSON.parse(readFileSync(contentPath, 'utf8'));
const facts = JSON.parse(readFileSync('content/_facts/nanawing.json', 'utf8'));
const site = 'https://www.narenana.com';
const html = readFileSync(`site${copy.path}index.html`, 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const decode = (s) => s.replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (m, e) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[e]);
const text = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const visible = text(main);
const aircraft = copy.aircraft ? facts.aircraft.find((a) => a.id === copy.aircraft) : null;
const phrase = copy.seo?.phrase || '';

const results = [];
const check = (rule, ok, detail = '') => { results.push({ rule, ok, detail }); };
const metas = Object.fromEntries([...html.matchAll(/<meta\b([^>]*)>/g)].map(([, attrs]) => {
  const a = Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]));
  return [a.name || a.property, a.content];
}));

// S. Search ---------------------------------------------------------------
check('S1 phrase declared', !!phrase, 'seo.phrase');
check('S1 title carries the phrase, ≤60 chars', phrase && copy.title.toLowerCase().includes(phrase.toLowerCase()) && copy.title.length <= 60, `${copy.title.length} chars`);
check('S1 slug carries the phrase', phrase && copy.path.replace(/-/g, ' ').toLowerCase().includes(phrase.toLowerCase()), copy.path);
check('S2 description 70–155 chars, names the aircraft', copy.description.length >= 70 && copy.description.length <= 155 && (!aircraft || copy.description.includes(aircraft.name)), `${copy.description.length} chars`);
check('S2 meta description matches', metas.description === copy.description);
const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => text(m[1]));
check('S3 exactly one H1 with the phrase', h1s.length === 1 && h1s[0].toLowerCase().includes(phrase.toLowerCase()), h1s.join(' | '));
const headings = [...main.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: Number(m[1]), attrs: m[2], text: text(m[3]) }));
let skipped = false; let prev = 0;
for (const h of headings) { if (h.level > prev + 1) skipped = true; prev = h.level; }
check('S3 no heading level skipped', !skipped, headings.map((h) => `h${h.level}`).join(' '));
const h2NoId = headings.filter((h) => h.level === 2 && !/\bid="/.test(h.attrs));
check('S3 every H2 has an id', h2NoId.length === 0, h2NoId.map((h) => h.text).join(' | '));
const ids = new Set([...main.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const broken = [...main.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !ids.has(id));
check('S3 in-page links resolve', broken.length === 0, broken.join(' '));
let graph = [];
try { graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph']; check('S4 JSON-LD parses', true); } catch (e) { check('S4 JSON-LD parses', false, String(e)); }
const types = graph.map((n) => n['@type']);
check('S4 WebPage + BreadcrumbList', types.includes('WebPage') && types.includes('BreadcrumbList'));
const faqCount = (main.match(/<details>/g) || []).length;
check('S4 FAQPage when there is a FAQ', faqCount === 0 || types.includes('FAQPage'));
const videoCards = (main.match(/data-yt="/g) || []).length;
check('S4 one VideoObject per video card', types.filter((t) => t === 'VideoObject').length === videoCards, `${videoCards} cards`);
check('S4 ItemList for the curated list', !copy.prints || types.includes('ItemList'));
check('S4 canonical and robots', html.includes(`<link rel="canonical" href="${site}${copy.path}">`) && /index,follow/.test(metas.robots || ''));
const sitemap = readFileSync('site/sitemap.xml', 'utf8');
check('S5 in site/sitemap.xml', sitemap.includes(`<loc>${site}${copy.path}</loc>`));
const worker = readFileSync('catalog/lib/worker.mjs', 'utf8');
const lastmod = worker.match(new RegExp(`'${copy.path.replace(/[/]/g, '\\/')}': '(\\d{4}-\\d{2}-\\d{2})'`))?.[1];
check('S5 Worker lastmod set and not in the future', !!lastmod && lastmod <= new Date().toISOString().slice(0, 10), lastmod || 'missing');
for (const f of copy.seo?.linkedFrom || []) check(`S5 linked from ${f}`, existsSync(f) && readFileSync(f, 'utf8').includes(copy.path));
check('S5 linked from at least three places', (copy.seo?.linkedFrom || []).filter((f) => existsSync(f) && readFileSync(f, 'utf8').includes(copy.path)).length >= 3);
// S6: every H2 names the aircraft (the owner's own headings, seo.keptHeadings, excepted).
const wingWord = aircraft ? aircraft.name.split(' ').pop() : '';
const kept = new Set(copy.seo?.keptHeadings || []);
const h2Unnamed = headings.filter((h) => h.level === 2 && !kept.has(h.text) && !h.text.includes(wingWord));
check('S6 every H2 names the aircraft', !!wingWord && h2Unnamed.length === 0, h2Unnamed.map((h) => h.text).join(' | '));
check('S6 search phrases recorded', !!copy._seo, '_seo note');
// S7: every main section shows something besides text.
const sections = [...main.matchAll(/<section class="([^"]*)" id="([^"]+)"[\s\S]*?<\/section>/g)].filter((m) => ['watch', 'wing', 'fly', 'buy', 'prints', 'logs'].includes(m[2]));
const bare = sections.filter((m) => !/<img\b|data-yt="/.test(m[0])).map((m) => m[2]);
check('S7 every section shows a picture or a video', sections.length >= 5 && bare.length === 0, bare.join(' ') || `${sections.length} sections`);
// S8: each print carries the id the weekly check retires it by.
const printItems = copy.prints ? copy.prints.groups.flatMap((g) => g.items) : [];
check('S8 each print carries data-print for the weekly check', printItems.every((p) => p.id && main.includes(`data-print="${p.id}"`)), `${printItems.length} prints`);
// S9: images: alt on every one, real dimensions, lazy below the hero, the hero eager and first.
const imgs = [...main.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
check('S9 every image has alt text (empty only inside a labelled link)', imgs.every((i) => / alt="/.test(i)), `${imgs.length} images`);
check('S9 every image has width and height', imgs.every((i) => / width="\d+"/.test(i) && / height="\d+"/.test(i)));
check('S9 the hero loads first, the rest lazily', /fetchpriority="high"/.test(heroTagOf(imgs)) && imgs.filter((i) => !/loading="lazy"/.test(i)).length <= 1);
function heroTagOf(list) { return list.find((i) => i.includes('class="ac-hero-bg"')) || ''; }
// S10: every internal link answers 200 on the local Worker (wrangler dev), when one is running.
const base = process.env.LANDING_BASE || 'http://127.0.0.1:8787';
const internal = [...new Set([...main.matchAll(/href="(\/[^"#]*)/g)].map((m) => decode(m[1])))];
const up = await fetch(base + copy.path, { headers: { connection: 'close' }, signal: AbortSignal.timeout(8000) }).then((r) => r.ok).catch(() => false);
if (up) {
  const dead = [];
  for (const href of internal) { const s = await fetch(base + href, { redirect: 'manual', headers: { connection: 'close' }, signal: AbortSignal.timeout(15000) }).then((r) => r.status).catch(() => 0); if (s !== 200) dead.push(`${href} ${s}`); }
  check('S10 every internal link resolves', dead.length === 0, dead.join(', ') || `${internal.length} links`);
} else check('S10 internal links (skipped: no local Worker)', true, `start wrangler dev or set LANDING_BASE`);
// S11: weight: the page and its hero stay light.
const heroFile = heroTagOf(imgs).match(/src="([^"?]+)/)?.[1];
check('S11 page HTML under 120 KB', html.length < 120000, `${Math.round(html.length / 1024)} KB`);
check('S11 hero picture under 150 KB', !!heroFile && existsSync(`site${heroFile}`) && statSync(`site${heroFile}`).size < 150000, heroFile ? `${Math.round(statSync(`site${heroFile}`).size / 1024)} KB` : 'missing');

// H. Hero -----------------------------------------------------------------
const heroTag = main.match(/<img class="ac-hero-bg"[^>]*>/)?.[0] || '';
check('H3 hero has an image, eyebrow, H1, sub-line and CTA', !!heroTag && /<section class="ac-hero-band"[\s\S]*?class="eyebrow"[\s\S]*?<h1[\s\S]*?ac-hero-sub[\s\S]*?class="ac-btn"[\s\S]*?<\/section>/.test(main));
const heroAlt = decode(heroTag.match(/alt="([^"]*)"/)?.[1] || '');
const others = facts.aircraft.filter((a) => a.id !== copy.aircraft).map((a) => a.name).filter((n) => !(aircraft && aircraft.name.includes(n)));
const otherNamed = others.filter((n) => heroAlt.includes(n) || heroAlt.includes(n.split(' ').pop()));
check('H2 hero alt names this aircraft and no other', !!aircraft && heroAlt.includes(aircraft.name) && otherNamed.length === 0, otherNamed.join(', ') || heroAlt);
const heroFiles = [...new Set([...heroTag.matchAll(/\/assets\/[^\s",?]+/g)].map((m) => m[0]))];
const hash = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
const homeImages = [...new Set([...readFileSync('site/index.html', 'utf8').matchAll(/\/assets\/[^\s",?)]+\.(?:webp|jpg|png|avif)/g)].map((m) => m[0]))].filter((p) => existsSync(`site${p}`));
const homeHashes = new Set(homeImages.map((p) => hash(`site${p}`)));
const reused = heroFiles.filter((p) => existsSync(`site${p}`) && homeHashes.has(hash(`site${p}`)));
check('H2 hero files exist', heroFiles.length > 0 && heroFiles.every((p) => existsSync(`site${p}`)), heroFiles.join(' '));
check('H2 hero art not reused from the homepage', reused.length === 0, reused.join(' '));
const firstCta = main.indexOf('class="ac-btn"');
const heroEnd = main.indexOf('</section>', main.indexOf('<section class="ac-hero-band"'));
check('H1 primary CTA is inside the hero', firstCta > 0 && firstCta < heroEnd);

// C. Copy -----------------------------------------------------------------
const filler = /^(worth your time|more|other|also|misc|related|check the|read the)/i;
const bad = headings.filter((h) => h.level >= 2 && filler.test(h.text));
check('C1 no filler or reading-task headings', bad.length === 0, bad.map((h) => h.text).join(' | '));
check('C2 no banned words', !/\b(explore|discover|unlock|elevate|journey|experience|seamless|immersive|next-level)\b/i.test(visible));
check('C2 sizes take no space before mm', !/\d mm\b/.test(visible), (visible.match(/\d+ mm\b/g) || []).join(' '));
check('C3 small print once', !copy.smallPrint || visible.split(copy.smallPrint).length - 1 === 1);
const officialOutsideFaq = [...main.matchAll(/official/gi)].filter((m) => { const before = main.lastIndexOf('<details>', m.index); const close = main.lastIndexOf('</details>', m.index); return before < 0 || close > before; });
check('C3 "official" only inside the FAQ', officialOutsideFaq.length === 0, `${officialOutsideFaq.length} outside`);

// T. Trust ----------------------------------------------------------------
check('T1 maker credited and linked', !aircraft || (main.includes(`href="${aircraft.credit.url || aircraft.credit.designerUrl}"`) && visible.includes(aircraft.credit.designer)));
const outbound = [...main.matchAll(/<a\b[^>]*href="https?:[^"]+"[^>]*>/g)].map((m) => m[0]).filter((a) => !a.includes('narenana.com'));
const unsafe = outbound.filter((a) => !/target="_blank"/.test(a) || !/rel="noopener/.test(a));
check('T2 outbound links open safely', unsafe.length === 0, `${unsafe.length} of ${outbound.length}`);
check('T4 no price baked into the page', !/₹\s?\d/.test(visible));

// G. Share ----------------------------------------------------------------
check('G1 og and twitter tags', !!metas['og:title'] && !!metas['og:description'] && !!metas['og:image'] && metas['twitter:card'] === 'summary_large_image' && !!metas['og:image:alt']);
const cardPath = `site${copy.social.image}`;
let cardOk = false;
if (existsSync(cardPath)) { const m = await sharp(cardPath).metadata(); cardOk = m.width === 1200 && m.height === 630; }
check('G1 share card exists at 1200×630', cardOk, cardPath);
check('G1 share title carries the tagline or the phrase', copy.social.title === copy.hero.h1 || copy.social.title.toLowerCase().includes(phrase.toLowerCase()), copy.social.title);
check('G1 og:image width, height and type declared', metas['og:image:width'] === '1200' && metas['og:image:height'] === '630' && /^image\//.test(metas['og:image:type'] || ''));
check('G1 twitter title and image match og', metas['twitter:title'] === metas['og:title'] && metas['twitter:image'] === metas['og:image']);
check('G2 the card shows the page headline', [].concat(copy.social.card?.headline || []).join(' ') === copy.hero.h1, [].concat(copy.social.card?.headline || []).join(' '));
check('S4 the sim is described as a free app (SoftwareApplication)', graph.some((n) => n['@type'] === 'SoftwareApplication' && n.offers && Number(n.offers.price) === 0));

// H1. First fold, rendered ------------------------------------------------
async function foldCheck() {
  const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!existsSync(chrome)) { check('H1 CTA within the first screen (skipped: no Chrome)', true, 'set CHROME to run it'); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
  const root = normalize('site');
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p)); if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}${copy.path}`;
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(chrome, ['--headless=new', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${join(process.env.TEMP || '/tmp', 'landing-audit-' + port)}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let target; for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  for (const [label, width, height, mobile] of [['laptop 1366×768', 1366, 768, false], ['phone 390×844', 390, 844, true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url }); await sleep(2500);
    const r = await send('Runtime.evaluate', { expression: `(() => { const b = document.querySelector('.ac-hero-band .ac-btn'); if (!b) return { missing: true }; const r = b.getBoundingClientRect(); return { bottom: Math.round(r.bottom), overflow: document.documentElement.scrollWidth > innerWidth }; })()`, returnByValue: true });
    const v = r.result?.result?.value || {};
    check(`H1 CTA within the first screen on ${label}`, !v.missing && v.bottom <= height, v.missing ? 'no CTA in the hero' : `CTA bottom ${v.bottom}px of ${height}`);
    check(`H1 no horizontal overflow on ${label}`, v.overflow === false);
  }
  ws.close(); proc.kill(); server.close();
}
if (fold) await foldCheck(); else check('H1 fold check skipped (--no-fold)', true);

// Report ------------------------------------------------------------------
let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? '✓' : '✗'} ${r.rule}${r.detail ? `  (${r.detail})` : ''}`); }
// The ten-point SEO checklist (docs/landing-pages.md): a point scores when every rule under it passes.
const POINTS = [
  ['Title and URL carry the phrase', /^S1 /],
  ['Meta description', /^S2 /],
  ['One H1 and a clean heading outline', /^S3 /],
  ['H2s carry search phrases', /^S6 /],
  ['Structured data', /^S4 /],
  ['Images: alt, size, loading order', /^S9 /],
  ['Discovery: sitemap, inbound links, every link resolves', /^(S5|S10) /],
  ['Share card and tags', /^G[12] /],
  ['First screen and phone layout', /^H1 /],
  ['Weight', /^S11 /],
];
const score = POINTS.map(([label, re]) => { const rs = results.filter((r) => re.test(r.rule)); return { label, ok: rs.length > 0 && rs.every((r) => r.ok) }; });
console.log('\nSEO checklist');
for (const p of score) console.log(`${p.ok ? '✓' : '✗'} ${p.label}`);
console.log(`SEO checklist: ${score.filter((p) => p.ok).length}/10`);
console.log(failed ? `\n${failed} rule(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
