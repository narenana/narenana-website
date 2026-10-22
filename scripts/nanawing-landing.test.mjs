// File-only regressions for an aircraft's landing page (/nanawing/chupito-simulator/).
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
  assert.match(text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), /TBS Chupito/);
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
  assert.equal(questions.length, 5);
  assert.deepEqual(faq.mainEntity.map((q) => q.name), questions);
  assert.deepEqual(copy.faq.items.map((f) => f.q), questions);
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
