// File-only regressions for an aircraft's landing page (/chupito/).
// No server, browser or service requests. Build first: npm run aircraft:build
// Run: node --test scripts/nanawing-landing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { site } from './page-shell.mjs';

const file = (path) => new URL(`../${path}`, import.meta.url);
const facts = JSON.parse(await readFile(file('content/_facts/nanawing.json'), 'utf8'));
const copy = JSON.parse(await readFile(file('content/nanawing/chupito-simulator.json'), 'utf8'));
const html = await readFile(file(`site${copy.path}index.html`), 'utf8');
const aircraft = facts.aircraft.find((a) => a.id === copy.aircraft);
const decode = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:\d+|x[\da-f]+);/gi, (entity) => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
  if (entity.startsWith('&#')) return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : Number(entity.slice(2, -1)));
  return named[entity.toLowerCase()];
});
const text = (value) => decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const visible = text(main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
const meta = (key) => {
  const tags = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag)).filter((tag) => tag.name === key || tag.property === key);
  assert.equal(tags.length, 1, `${key} appears exactly once`);
  return tags[0].content;
};
const fmt = (number, digits = 0) => Number(number).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('search metadata: the title names the aircraft and "simulator", within the limits', () => {
  assert.match(copy.title, /^TBS Chupito simulator/);
  assert.ok(copy.title.length <= 60, `title is ${copy.title.length} characters`);
  assert.ok(html.includes(`<title>${copy.title} | narenana</title>`));
  assert.equal(meta('description'), copy.description);
  assert.ok(copy.description.length <= 155, `description is ${copy.description.length} characters`);
  assert.match(copy.description, /TBS Chupito/);
  assert.ok(html.includes(`<link rel="canonical" href="${site}${copy.path}">`));
  assert.ok(!/<meta[^>]+noindex/.test(html));
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'one H1');
  assert.equal(text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), copy.hero.h1);
  assert.match(copy.hero.h1, /Chupito simulator/, 'the tagline carries the search phrase');
  assert.ok(visible.includes(copy.hero.sub) && /TBS Chupito/.test(copy.hero.sub), 'the sub-line names the TBS Chupito');
  // The hero banner: the sim's own artwork in three sizes, with an alt that names what is in it.
  const heroImg = main.match(/<img class="ac-hero-bg"[^>]*>/)[0];
  for (const w of copy.hero.image.widths) assert.ok(heroImg.includes(`/assets/nanawing/${copy.hero.image.file}-${w}.webp?v=`), `hero ${w}w, versioned`);
  assert.ok(heroImg.includes(`alt="${copy.hero.image.alt}"`) && heroImg.includes('fetchpriority="high"'));
  // The product layout (owner, 24 Oct 2026): the words come first, then the picture; the maker is credited under it;
  // the hero also points at the bundles; the sticky product nav carries the wing's name and the play button.
  const hero = main.match(/<section class="ac-hero-band"[\s\S]*?<\/section>/)[0];
  assert.ok(hero.indexOf('<h1') < hero.indexOf('<img class="ac-hero-bg"'), 'the headline sits above the picture');
  assert.ok(hero.includes(`<a class="ac-hero-buy" href="#buy">`), 'the hero links the bundles');
  assert.ok(new RegExp(`<p class="ac-hero-credit">[^<]*<a href="${escapeRe(aircraft.credit.url)}"`).test(hero), 'the maker is credited under the hero picture');
  const subnav = main.match(/<div class="ac-subnav">[\s\S]*?<\/div><\/div>/);
  assert.ok(subnav && subnav[0].includes(`>${aircraft.name}</a>`) && subnav[0].includes('class="ac-btn ac-btn-nav"'), 'the product nav names the wing and carries the play button');
  assert.equal(meta('og:image'), `${site}${copy.social.image}`);
  assert.equal(meta('og:title'), copy.social.title);
});

test('the spec card shows the facts snapshot and the maker credit with its link, once', () => {
  const specs = [
    `${fmt(aircraft.topSpeedKmh)} km/h`, `${fmt(aircraft.stallSpeedKmh)} km/h`, `${fmt(aircraft.rollRateDegS)}°/s`,
    `${fmt(aircraft.climbRateMs, 1)} m/s`, `${fmt(aircraft.spanM, 2)} m`, `${fmt(aircraft.massKg * 1000)} g`,
    `${fmt(aircraft.thrustN, 2)} N`, aircraft.battery,
  ];
  for (const value of specs) assert.ok(visible.includes(value), `spec ${value}`);
  assert.ok(main.includes(`href="${aircraft.credit.url}"`), 'the maker product page is linked');
  assert.ok(visible.includes(copy.smallPrint), 'the small print is on the page');
  assert.equal(visible.split(copy.smallPrint).length - 1, 1, 'the small print appears once');
  assert.ok(visible.includes(`Reference airframe by ${aircraft.credit.designer}`));
  // The roll-rate claim belongs to the aircraft with the highest roll rate in the fleet.
  const quickest = facts.aircraft.reduce((best, a) => (a.rollRateDegS > best.rollRateDegS ? a : best));
  assert.equal(quickest.id, aircraft.id, 'the quickest roll in the hangar is this aircraft');
});

test('the play link opens the sim with this aircraft; Wings and the hangar page are linked', () => {
  const fly = facts.playUrl.replace('{id}', aircraft.id).replace(/&/g, '&amp;');
  const plays = main.match(new RegExp(`href="${escapeRe(fly)}"`, 'g')) || [];
  assert.ok(plays.length >= 2, `the play link appears in the hero and the closing block (${plays.length})`);
  assert.ok(main.includes('href="/wings/tbs-chupito/"'), 'links the Wings price page');
  assert.ok(main.includes('href="/nanawing/aircraft/"'), 'links the hangar page');
  for (const [, href] of main.matchAll(/href="(https?:[^"]+)"/g)) {
    const tag = main.slice(main.indexOf(`href="${href}"`) - 3, main.indexOf(`href="${href}"`) + href.length + 60);
    assert.ok(tag.includes('target="_blank" rel="noopener"'), `${href} opens in a new tab with noopener`);
  }
});

test('structured data: WebPage, a 3-level breadcrumb and a FAQPage matching the visible questions', () => {
  const webPage = graph.find((entry) => entry['@type'] === 'WebPage');
  assert.equal(webPage.url, site + copy.path);
  assert.equal(webPage.name, copy.title);
  const crumbs = graph.find((entry) => entry['@type'] === 'BreadcrumbList').itemListElement;
  assert.deepEqual(crumbs.map((c) => c.item), [site + '/', site + '/nanawing/aircraft/', site + copy.path]);
  assert.equal(crumbs[2].name, copy.crumb);
  const faq = graph.find((entry) => entry['@type'] === 'FAQPage');
  const questions = [...main.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(([, q]) => text(q));
  assert.ok(questions.length >= 7, `${questions.length} questions`);
  assert.deepEqual(faq.mainEntity.map((q) => q.name), questions);
  assert.deepEqual(copy.faq.items.map((f) => f.q), questions);
});

test('watch, buy, replay: the videos, the live price slot and the log viewer links', () => {
  // Watch: the owner's flights first, then Team BlackSheep's, then others; every card is a click-to-play
  // facade with a VideoObject (uploadDate from the feed or the catalog), and the player script is on the page.
  const groups = copy.watch.groups;
  assert.ok(groups[0].videos.every((v) => v.channel === 'narenana'), "the owner's own flights lead");
  // Owner, 23 Oct 2026: a heading promises what the pilot gets or does; never a filler like "Worth your time too".
  for (const g of groups) {
    assert.doesNotMatch(g.h3, /worth your time|more videos|other videos|also|too$/i, `${g.h3}: no filler heading`);
    assert.match(g.h3, /^(Come|Watch|See|Learn|Admire|Fly|Throw|Race|Hear|Join)\b/, `${g.h3}: leads with what the pilot does`);
    assert.ok(g.videos.length >= 1);
  }
  const videos = groups.flatMap((g) => g.videos);
  assert.ok(videos.length >= 6 && new Set(videos.map((v) => v.id)).size === videos.length, 'distinct videos');
  for (const v of videos) {
    assert.match(v.id, /^[A-Za-z0-9_-]{6,15}$/);
    assert.ok(main.includes(`data-yt="${v.id}"`), `card for ${v.id}`);
  }
  const objects = graph.filter((entry) => entry['@type'] === 'VideoObject');
  assert.deepEqual(objects.map((o) => o.url), videos.map((v) => `https://www.youtube.com/watch?v=${v.id}`));
  for (const o of objects) assert.ok(!Number.isNaN(Date.parse(o.uploadDate)) && o.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/'));
  assert.ok(html.includes("closest('a[data-yt]')"), 'the click-to-play script is on the page');
  assert.ok(html.includes('<dialog class="ac-yt-dialog" id="yt-dialog"') && html.includes('d.showModal()'), 'videos open in the modal player, not inside the card');
  // The jump strip covers the four stops.
  const jumps = main.match(/<nav class="ac-jumps"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(jumps, 'the jump strip exists');
  assert.deepEqual([...jumps[1].matchAll(/href="(#[a-z]+)"/g)].map(([, h]) => h), ['#watch', '#wing', '#buy', '#prints', '#logs']);
  for (const id of ['watch', 'wing', 'buy', 'prints', 'logs']) assert.ok(main.includes(`id="${id}"`), `#${id} exists`);
  // Prints: a curated list, every card a distinct https link to a designer's page with a credit and a line
  // about what it does; the same list is the page's ItemList.
  const prints = copy.prints.groups.flatMap((g) => g.items);
  assert.ok(prints.length >= 10, `${prints.length} prints`);
  assert.equal(new Set(prints.map((p) => p.href)).size, prints.length, 'distinct links');
  for (const p of prints) {
    assert.match(p.href, /^https:\/\/(makerworld\.com|www\.thingiverse\.com)\//, p.title);
    assert.ok(p.by && p.site && p.what.length > 20, `${p.title} has a credit and a line`);
    assert.ok(main.includes(`href="${p.href}" target="_blank" rel="noopener"`), `${p.title} opens in a new tab`);
  }
  // Each print card carries its id for the weekly check (src/prints-live.js), inside a group wrapper,
  // and shows the designer's picture once it has been fetched (npm run landing:prints, landing:images).
  for (const p of prints) {
    assert.match(p.id, /^(mw|tv)-\d+$/, `${p.title} id`);
    assert.ok(main.includes(`<li data-print="${p.id}">`), `${p.title} card carries data-print`);
    if (p.master) assert.ok(main.includes(`/assets/nanawing/${copy.aircraft}-print-${p.id}-400.webp`) && p.image.startsWith('https://'), `${p.title} picture`);
  }
  assert.ok(prints.filter((p) => p.master).length >= prints.length - 2, 'nearly every print shows its picture');
  assert.equal((main.match(/data-print-group="/g) || []).length, copy.prints.groups.length, 'one wrapper per print group');
  // The bundle cards show the seller's photos (owner, 24 Oct 2026), credited under the cards.
  for (const v of copy.buy.variants) assert.ok(main.includes(`/assets/nanawing/${copy.aircraft}-bundle-${v.id}-400.webp`), `${v.id} photo`);
  assert.ok(visible.includes(`${copy.buy.photoCredit.split('{maker}')[0]}${aircraft.credit.designer}`), 'the bundle photos are credited, and the maker with them');
  assert.ok(main.includes(`${copy.buy.photoCredit.split('{maker}')[0]}<a href="${aircraft.credit.url}"`), 'the maker credit links their page');
  // The logs section: the picture, the AI flight analysis and the iNAV line, as the log viewer states it.
  assert.match(copy.logs.h2, /^Analyse your Chupito flight logs/);
  assert.ok(main.includes('class="ac-log-shot"'), 'the log-viewer picture');
  assert.ok(/AI flight analysis/.test(visible) && /iNAV blackbox logs from 9\.x and earlier/.test(visible) && visible.includes(copy.logs.note), 'AI analysis and iNAV support are on the page; the version range is the one small-print line');
  assert.doesNotMatch(visible, /all (versions|releases) of iNAV/i, 'never claims every iNAV version');
  const list = graph.find((entry) => entry['@type'] === 'ItemList');
  assert.deepEqual(list.itemListElement.map((e) => e.url), prints.map((p) => p.href));
  // Buy: the Worker's slot with the fallback sentence; no price is baked into the page.
  assert.ok(main.includes(`<p class="ac-live" data-wings="${copy.wingsSlug}">${copy.buy.fallback}</p>`));
  // One card per bundle, each with its what-is-in-the-box and who-it-is-for lines and a listings slot;
  // the hidden "other" card is there for listings that match no bundle.
  for (const v of copy.buy.variants) {
    assert.ok(main.includes(`<article class="ac-variant" id="buy-${v.id}">`), `${v.id} card`);
    assert.ok(visible.includes(v.includes) && visible.includes(v.pick), `${v.id} copy`);
    assert.ok(main.includes(`<div class="ac-offers" data-wings-offers="${copy.wingsSlug}:${v.id}"><p class="ac-note">${copy.buy.tableFallback}</p></div>`), `${v.id} slot with its fallback`);
    assert.doesNotThrow(() => new RegExp(v.match, 'i'), `${v.id} pattern compiles`);
  }
  assert.ok(main.includes(`id="buy-other" hidden`) && main.includes(`data-wings-offers="${copy.wingsSlug}:other"`), 'the hidden other card');
  assert.ok(!/₹/.test(visible), 'no price is baked into the static page');
  // Replay: the log viewer, its walkthrough and its guides.
  for (const href of ['/log-viewer/', '/videos/log-viewer-walkthrough/', '/log-viewer/guides/']) assert.ok(main.includes(`href="${href}"`), `links ${href}`);
  // Thanks: the maker's site and the product page, from the thanks section.
  const thanks = main.match(/<section class="ac-practice ac-thanks" id="thanks"[\s\S]*?<\/section>/);
  assert.ok(thanks, 'the thanks section exists');
  for (const href of ['https://www.team-blacksheep.com/', aircraft.credit.url]) assert.ok(thanks[0].includes(`href="${href}" target="_blank" rel="noopener"`), `thanks links ${href}`);
  assert.ok(!/official|endorse/i.test(text(thanks[0])), 'the thanks never claims an official tie');
});

test('voice: no banned words; "official" appears only in the FAQ denial; the safety line once', () => {
  assert.doesNotMatch(visible, /\b(explore|discover|unlock|elevate|journey|experience|seamless|immersive|next-level)\b/i);
  assert.equal((visible.match(/official/gi) || []).length, 1);
  assert.ok(visible.includes('not an official TBS simulator'));
  assert.equal(visible.split(copy.faqNote).length - 1, 1);
});

test('the page is in the sitemap, the Worker lastmod list and the SEO page checks', async () => {
  const sitemap = await readFile(file('site/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes(`<loc>${site}${copy.path}</loc>`), 'site/sitemap.xml lists the page');
  const worker = await readFile(file('catalog/lib/worker.mjs'), 'utf8');
  assert.match(worker, new RegExp(`'${escapeRe(copy.path)}': '\\d{4}-\\d{2}-\\d{2}'`), 'STATIC_PAGE_LASTMOD dates the page');
  assert.ok(worker.includes(`'${copy.path}', '/log-viewer/'`) || worker.includes(`'${copy.path}',`), 'the Worker sitemap lists the page');
  const seo = await readFile(file('catalog/test/seo.mjs'), 'utf8');
  assert.ok(seo.includes(`'${copy.path}'`), 'catalog/test/seo.mjs checks the page');
});

test('the share card exists at 1200×630 and the hangar page links the landing from the Chupito section', async () => {
  const card = await sharp(fileURLToPath(file(`site${copy.social.image}`))).metadata();
  assert.equal(`${card.width}×${card.height}`, '1200×630');
  const hangar = await readFile(file('site/nanawing/aircraft/index.html'), 'utf8');
  const section = hangar.match(/<section class="ac-craft[^"]*" id="chupito"[\s\S]*?<\/section>/)[0];
  assert.ok(section.includes(`href="${copy.path}"`), 'the hangar page links the Chupito landing page');
});
