// File-only aircraft-page regressions. No server, browser, or service requests.
// Build first: node scripts/build-nanawing-pages.mjs
// Run: node --test scripts/nanawing-aircraft.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { page, site } from './page-shell.mjs';

const file = (path) => new URL(`../${path}`, import.meta.url);
const facts = JSON.parse(await readFile(file('content/_facts/nanawing.json'), 'utf8'));
const copy = JSON.parse(await readFile(file('content/nanawing/aircraft.json'), 'utf8'));
const html = await readFile(file('site/nanawing/aircraft/index.html'), 'utf8');
const expectedOrder = ['spectre', 'desertwing', 'morok', 'sukhoi'];
const decode = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:\d+|x[\da-f]+);/gi, (entity) => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
  if (entity.startsWith('&#')) return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  return named[entity.toLowerCase()];
});
const text = (value) => decode(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const match = (source, pattern, label) => {
  const result = source.match(pattern);
  assert.ok(result, label);
  return result[1];
};
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
const meta = (source, key) => {
  const tags = [...source.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag)).filter((tag) => tag.name === key || tag.property === key);
  assert.equal(tags.length, 1, `${key} appears exactly once`);
  return tags[0].content;
};
const section = (id) => match(html, new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/section>`), `${id} section exists`);
const graph = JSON.parse(match(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/, 'JSON-LD exists'))['@graph'];
const fmt = (number, digits = 0) => Number(number).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const specs = (aircraft) => [
  `${fmt(aircraft.topSpeedKmh)} km/h`,
  `${fmt(aircraft.stallSpeedKmh)} km/h`,
  `${fmt(aircraft.rollRateDegS)}°/s`,
  `${fmt(aircraft.climbRateMs, 1)} m/s`,
  `${fmt(aircraft.spanM, 2)} m`,
  aircraft.massKg < 1 ? `${fmt(aircraft.massKg * 1000)} g` : `${fmt(aircraft.massKg, 1)} kg`,
  `${fmt(aircraft.thrustN)} N`,
  aircraft.battery,
];

test('Spectre leads every presentation surface without reordering the facts snapshot', () => {
  assert.deepEqual(copy.order, expectedOrder);
  assert.deepEqual(facts.aircraft.map((aircraft) => aircraft.id), ['desertwing', 'morok', 'sukhoi', 'spectre']);
  assert.deepEqual([...new Set(copy.order)].sort(), facts.aircraft.map((aircraft) => aircraft.id).sort());

  const lineup = match(html, /<ul class="ac-lineup"[^>]*>([\s\S]*?)<\/ul>/, 'lineup exists');
  assert.deepEqual([...lineup.matchAll(/<li><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'lineup order');
  const comparison = match(section('compare'), /<tbody>([\s\S]*?)<\/tbody>/, 'comparison body exists');
  assert.deepEqual([...comparison.matchAll(/<th scope="row"><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'comparison order');
  assert.deepEqual([...html.matchAll(/<section class="ac-craft(?: ac-craft--flip)?" id="([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'detail section order');

  const list = graph.find((entry) => entry['@type'] === 'ItemList');
  assert.ok(list, 'aircraft ItemList exists');
  assert.deepEqual(list.itemListElement.map((entry) => new URL(entry.url).hash.slice(1)), expectedOrder, 'structured-data order');
  assert.deepEqual(list.itemListElement.map((entry) => entry.position), [1, 2, 3, 4]);
  for (const entry of list.itemListElement) {
    const aircraft = facts.aircraft.find((item) => `#${item.id}` === new URL(entry.url).hash);
    assert.equal(entry.name, aircraft.name);
    assert.equal(entry.url, `${site}${copy.path}#${aircraft.id}`);
  }
});

test('hero and final calls to action start a WUDFLY Spectre flight', () => {
  for (const key of ['hero', 'final']) {
    assert.equal(copy[key].aircraft, 'spectre');
    const block = key === 'hero'
      ? match(html, /<div class="ac-hero">([\s\S]*?)<ul class="ac-lineup"/, 'hero exists')
      : match(html, /<section class="ac-final">([\s\S]*?)<\/section>/, 'final action exists');
    const href = decode(match(block, /<a class="ac-btn" href="([^"]+)"/, `${key} primary action exists`));
    assert.equal(href, facts.playUrl.replace('{id}', 'spectre'));
    const url = new URL(href);
    assert.ok(url.searchParams.has('play'));
    assert.equal(url.searchParams.get('aircraft'), 'spectre');
    assert.ok(text(block).includes(copy[key].cta));
  }
});

test('aircraft shares use Spectre-specific metadata without changing the canonical page', () => {
  const canonical = decode(match(html, /<link rel="canonical" href="([^"]+)"/, 'canonical exists'));
  assert.equal(canonical, `${site}/nanawing/aircraft/`);
  assert.equal(meta(html, 'og:url'), canonical);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal(text(match(html, /<title>([\s\S]*?)<\/title>/, 'title exists')), `${copy.title} | narenana`);
  assert.equal(meta(html, 'description'), copy.description);
  assert.match(copy.social.title, /WUDFLY Spectre/i);
  assert.match(copy.social.description, /(?:WUDFLY )?Spectre/i);
  assert.match(copy.social.imageAlt, /WUDFLY Spectre/i);
  for (const prefix of ['og', 'twitter']) {
    assert.equal(meta(html, `${prefix}:title`), copy.social.title);
    assert.equal(meta(html, `${prefix}:description`), copy.social.description);
    assert.equal(meta(html, `${prefix}:image`), new URL(copy.social.image, site).href);
    assert.equal(meta(html, `${prefix}:image:alt`), copy.social.imageAlt);
  }
  assert.equal(copy.social.image, '/nanawing/aircraft/spectre-share-v1.jpg');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
  const webPage = graph.find((entry) => entry['@type'] === 'WebPage');
  assert.equal(webPage.url, canonical);
  assert.equal(webPage.name, copy.title);
  assert.equal(webPage.description, copy.description);
});

test('the Spectre social card is a complete 1200 by 630 JPEG', async () => {
  const bytes = await readFile(file(`site${copy.social.image}`));
  const image = sharp(bytes);
  const metadata = await image.metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const { info } = await image.raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200, 'the full image decodes');
  assert.equal(info.height, 630);
});

test('all four aircraft retain their measured specs, flight links and empty record slots', () => {
  const comparison = section('compare');
  const rows = [...match(comparison, /<tbody>([\s\S]*?)<\/tbody>/, 'comparison body exists').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => row);
  assert.equal(rows.length, facts.aircraft.length);
  assert.equal([...html.matchAll(/<tbody data-records="[^"]+">/g)].length, facts.aircraft.length);
  for (const aircraft of facts.aircraft) {
    const row = rows.find((value) => value.includes(`href="#${aircraft.id}"`));
    assert.ok(row, `${aircraft.id} has a comparison row`);
    assert.deepEqual([...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => text(cell)), specs(aircraft), `${aircraft.id} comparison specs`);
    const body = section(aircraft.id);
    const dl = match(body, /<dl class="ac-specs">([\s\S]*?)<\/dl>/, `${aircraft.id} detail specs exist`);
    assert.deepEqual([...dl.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(([, value]) => text(value)), specs(aircraft), `${aircraft.id} detail specs`);
    const flight = decode(match(body, /<a class="ac-btn" href="([^"]+)"/, `${aircraft.id} flight link exists`));
    assert.equal(flight, facts.playUrl.replace('{id}', aircraft.id));
    const records = match(body, new RegExp(`<tbody data-records="${aircraft.id}">([\\s\\S]*?)<\\/tbody>`), `${aircraft.id} record slot exists`);
    assert.equal([...records.matchAll(/<tr>/g)].length, facts.courses.length);
    for (const course of facts.courses) assert.ok(text(records).includes(course.name), `${aircraft.id} retains ${course.name}`);
    assert.equal([...records.matchAll(/<td class="ac-time">—<\/td>/g)].length, facts.courses.length, 'build does not freeze live lap times');
    assert.equal([...records.matchAll(/<td class="ac-pilot">—<\/td>/g)].length, facts.courses.length, 'build does not freeze pilot names');
  }
});

test('simulator caveats, designer attribution and visible FAQ match the structured answers', () => {
  const spectre = text(section('spectre'));
  assert.match(copy.aircraft.spectre.note, /simulator approximation/i);
  assert.match(copy.aircraft.spectre.note, /not a manufacturer-validated flight model/i);
  assert.ok(spectre.includes(copy.aircraft.spectre.note));
  assert.ok(section('spectre').includes('href="https://wudfly.com/"'));
  assert.ok(section('spectre').includes('href="https://wudfly.com/store/spectre"'));
  assert.ok(text(section('compare')).includes(copy.compare.note));
  const method = match(html, /<section class="ac-method"[^>]*>([\s\S]*?)<\/section>/, 'methodology exists');
  for (const paragraph of copy.method.paragraphs) assert.ok(text(method).includes(paragraph));
  const faq = graph.find((entry) => entry['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((entry) => ({ q: entry.name, a: entry.acceptedAnswer.text })), copy.faq);
  const visibleFaq = match(html, /<section class="ac-faq"[^>]*>([\s\S]*?)<\/section>/, 'visible FAQ exists');
  for (const entry of copy.faq) {
    assert.ok(text(visibleFaq).includes(entry.q));
    assert.ok(text(visibleFaq).includes(entry.a));
  }
});

test('the shared page shell keeps original metadata defaults for other editorial pages', () => {
  const input = { path: '/test-editorial/', title: 'Editorial title', description: 'Editorial description.', body: '<h1>Editorial</h1>', schema: { '@context': 'https://schema.org', '@type': 'WebPage' } };
  for (const options of [input, { ...input, image: `${site}/custom.jpg` }]) {
    const output = page(options);
    assert.equal(meta(output, 'description'), input.description);
    assert.equal(meta(output, 'og:url'), site + input.path);
    for (const prefix of ['og', 'twitter']) {
      assert.equal(meta(output, `${prefix}:title`), input.title);
      assert.equal(meta(output, `${prefix}:description`), input.description);
      assert.equal(meta(output, `${prefix}:image`), options.image || `${site}/og.jpg`);
      assert.equal(meta(output, `${prefix}:image:alt`), input.title);
    }
  }
  const output = page({ ...input, social: { title: 'Share title' } });
  assert.equal(meta(output, 'og:title'), 'Share title');
  assert.equal(meta(output, 'twitter:title'), 'Share title');
  assert.equal(meta(output, 'description'), input.description, 'social override leaves search metadata unchanged');
  assert.equal(meta(output, 'og:description'), input.description, 'partial social override preserves description default');
  assert.equal(meta(output, 'og:image:alt'), input.title, 'partial social override preserves image-alt default');
});
