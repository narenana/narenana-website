// Aircraft-page regressions. No server, browser, or real service requests.
// The records test uses a fake service binding and disables global fetch.
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
const allAircraft = [...facts.aircraft, ...facts.previewAircraft];
const expectedOrder = ['spectre', 'chupito', 'desertwing', 'morok', 'sukhoi'];
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
  `${fmt(aircraft.thrustN, Number.isInteger(aircraft.thrustN) ? 0 : 2)} N`,
  aircraft.battery,
];

test('Spectre leads every presentation surface without reordering the facts snapshot', () => {
  assert.deepEqual(copy.order, expectedOrder);
  assert.deepEqual(facts.aircraft.map((aircraft) => aircraft.id), ['desertwing', 'morok', 'sukhoi', 'spectre']);
  assert.deepEqual(facts.previewAircraft.map((aircraft) => aircraft.id), ['chupito']);
  assert.deepEqual([...new Set(copy.order)].sort(), allAircraft.map((aircraft) => aircraft.id).sort());

  const lineup = match(html, /<ul class="ac-lineup"[^>]*>([\s\S]*?)<\/ul>/, 'lineup exists');
  assert.deepEqual([...lineup.matchAll(/<li><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'lineup order');
  const comparison = match(section('compare'), /<tbody>([\s\S]*?)<\/tbody>/, 'comparison body exists');
  assert.deepEqual([...comparison.matchAll(/<th scope="row"><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'comparison order');
  assert.deepEqual([...html.matchAll(/<section class="ac-craft(?: ac-craft--flip)?" id="([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'detail section order');

  const list = graph.find((entry) => entry['@type'] === 'ItemList');
  assert.ok(list, 'aircraft ItemList exists');
  assert.deepEqual(list.itemListElement.map((entry) => new URL(entry.url).hash.slice(1)), expectedOrder, 'structured-data order');
  assert.deepEqual(list.itemListElement.map((entry) => entry.position), [1, 2, 3, 4, 5]);
  for (const entry of list.itemListElement) {
    const aircraft = allAircraft.find((item) => `#${item.id}` === new URL(entry.url).hash);
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

test('the bottom aircraft-request section uses the existing Instagram and LinkedIn contacts', async () => {
  const expectedLinks = ['https://www.instagram.com/narenana', 'https://www.linkedin.com/in/siddharthanihalani/'];
  const requestPattern = /<section class="ac-request" id="request-aircraft"[^>]*>([\s\S]*?)<\/section>/;
  const request = match(html, requestPattern, 'aircraft request section exists');
  assert.equal([...html.matchAll(/\bid="request-aircraft"/g)].length, 1, 'request section has one unique anchor');
  const final = html.match(/<section class="ac-final">[\s\S]*?<\/section>/);
  assert.ok(final, 'final flight action exists');
  assert.ok(html.search(requestPattern) >= final.index + final[0].length, 'request section follows the final flight action');
  assert.ok(copy.request.h2 && copy.request.lede, 'request copy includes a heading and explanation');
  assert.equal(text(match(request, /<h2\b[^>]*>([\s\S]*?)<\/h2>/, 'request heading exists')), copy.request.h2);
  assert.ok(text(request).includes(copy.request.lede), 'request explanation is visible');
  assert.deepEqual(copy.request.links.map((link) => link.href), expectedLinks);

  const anchors = [...request.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, label]) => ({ ...attributes(attrs), label: text(label) }));
  assert.equal(anchors.length, 2, 'request section has only the two requested contact links');
  assert.deepEqual(anchors.map((anchor) => anchor.href), expectedLinks);
  const home = await readFile(file('site/index.html'), 'utf8');
  const homepageAnchors = [...home.matchAll(/<a\b[^>]*>/g)].map(([tag]) => attributes(tag));
  for (const [index, anchor] of anchors.entries()) {
    assert.equal(anchor.target, '_blank');
    assert.ok((anchor.rel || '').split(/\s+/).includes('noopener'), 'new tabs do not expose their opener');
    assert.ok(copy.request.links[index].label && anchor.label.includes(copy.request.links[index].label), 'configured link label is visible');
    assert.ok(homepageAnchors.some((existing) => existing.href === anchor.href), `${anchor.href} exactly matches an existing homepage contact`);
  }
});

test('the page and social copy do not retain the superseded closer-flying campaign', () => {
  assert.doesNotMatch(text(html), /fly a little closer/i);
  assert.doesNotMatch(JSON.stringify(copy), /fly a little closer/i);
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

test('all four released aircraft retain their measured specs, flight links and empty record slots', () => {
  const comparison = section('compare');
  const rows = [...match(comparison, /<tbody>([\s\S]*?)<\/tbody>/, 'comparison body exists').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => row);
  assert.equal(rows.length, allAircraft.length);
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

test('Chupito has accurate preview specs and never a production flight link or record slot', () => {
  const aircraft = facts.previewAircraft[0];
  assert.equal(aircraft.status, 'preview');
  assert.equal(aircraft.rollRateDegS, 360);
  assert.equal(aircraft.pitchRateDegS, 380);
  assert.equal(aircraft.turnCoordination, 0.6);
  assert.equal(aircraft.thrustN, 14.71);
  assert.equal(aircraft.spanM, 0.8);
  assert.equal(aircraft.massKg, 0.7);
  assert.equal(aircraft.battery, '6S 1500 mAh · 30 A');
  const row = match(section('compare'), /<tr><th scope="row"><a href="#chupito">([\s\S]*?)<\/tr>/, 'Chupito comparison row exists');
  assert.deepEqual([...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, value]) => text(value)), specs(aircraft));
  const body = section('chupito');
  const dl = match(body, /<dl class="ac-specs">([\s\S]*?)<\/dl>/, 'Chupito detail specs exist');
  assert.deepEqual([...dl.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(([, value]) => text(value)), specs(aircraft));
  const visible = text(body);
  assert.match(visible, /360°\/s roll ceiling/);
  assert.match(visible, /380°\/s pitch-command ceiling/);
  assert.match(visible, /0\.60 turn assistance/);
  assert.match(visible, /not guaranteed rates at every speed/);
  assert.match(visible, /provisional 700 g flying weight/);
  assert.match(visible, /not a TBS collaboration, endorsement or manufacturer-validated flight model/);
  assert.match(visible, /test standings use a separate database and never appear on the production leaderboards/);
  assert.match(visible, /Flight-trajectory uploads remain disabled/);
  assert.doesNotMatch(visible, /no online Chupito leaderboards|Practice laps stay on that device/);
  assert.ok(visible.includes(copy.aircraft.chupito.previewNote));
  assert.doesNotMatch(body, /data-records|class="ac-records"/);
  assert.doesNotMatch(html, /data-records="chupito"/);
  const anchor = attributes(match(body, /(<a class="ac-btn"[^>]+>)/, 'Chupito preview CTA exists'));
  assert.equal(anchor.href, aircraft.playUrl);
  const url = new URL(anchor.href);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'codex-tbs-chupito.fpvsim.pages.dev');
  assert.ok(url.searchParams.has('play'));
  assert.equal(url.searchParams.get('aircraft'), 'chupito');
  assert.equal(anchor.target, '_blank');
  assert.ok(anchor.rel.split(/\s+/).includes('noopener'));
  assert.doesNotMatch(html, /https:\/\/sim\.narenana\.com\/\?[^"\s]*aircraft=chupito/);
  assert.match(body, /href="https:\/\/www\.team-blacksheep\.com\/products\/prod:tbs_chupito_kit"/);
});

test('Chupito test standings link only to its isolated preview board', () => {
  const aircraft = facts.previewAircraft[0];
  const body = section('chupito');
  const anchor = attributes(match(body, /(<a class="ac-link"[^>]+>)/, 'Chupito test standings CTA exists'));
  assert.equal(anchor.href, aircraft.leaderboardUrl);
  assert.equal(anchor.href, 'https://codex-tbs-chupito.fpvsim.pages.dev/leaderboard/?aircraft=chupito');
  assert.equal(anchor.target, '_blank');
  assert.ok(anchor.rel.split(/\s+/).includes('noopener'));
  assert.ok(text(body).includes(copy.aircraft.chupito.leaderboardCta));
  assert.doesNotMatch(html, /https:\/\/(?:sim\.narenana\.com|fpvsim\.pages\.dev)\/leaderboard\/\?[^"\s]*aircraft=chupito/);
  assert.doesNotMatch(body, /data-records/);
});

test('preview labels are visible in the lineup, comparison and detail heading', () => {
  assert.match(html, /aria-label="4 released aircraft and 1 preview aircraft"/);
  const lineup = match(html, /<ul class="ac-lineup"[^>]*>([\s\S]*?)<\/ul>/, 'lineup exists');
  const tile = match(lineup, /<a href="#chupito">([\s\S]*?)<\/a>/, 'Chupito tile exists');
  const row = match(section('compare'), /<tr><th scope="row"><a href="#chupito">([\s\S]*?)<\/tr>/, 'Chupito comparison exists');
  const heading = match(section('chupito'), /<h2 id="chupito-title">([\s\S]*?)<\/h2>/, 'Chupito heading exists');
  for (const surface of [tile, row, heading]) assert.match(surface, /<small class="ac-preview-badge">Preview<\/small>/);
  assert.match(copy.hero.lede, /four released aircraft and our new TBS Chupito preview/);
  assert.match(copy.description, /four free-to-fly aircraft and the TBS Chupito preview/);
});

test('Chupito images are responsive, locally served and dimensioned', async () => {
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => attributes(tag))
    .filter((image) => new URL(image.src, site).pathname.includes('/chupito-'));
  assert.equal(images.length, 2, 'one lineup render and one detail render');
  for (const image of images) {
    assert.match(image.alt, /TBS Chupito preview/);
    assert.match(image.alt, /bright red propeller/);
    assert.match(image.alt, /rendered from the simulator model/);
    assert.ok(image.sizes && Number(image.width) > 0 && Number(image.height) > 0);
    assert.equal(new URL(image.src, site).pathname, '/assets/nanawing/aircraft/chupito-900.webp');
    const sources = image.srcset.split(',').map((source) => source.trim().split(/\s+/));
    assert.deepEqual(sources.map(([, width]) => width), ['560w', '900w', '1400w']);
    for (const [path, width] of sources) {
      assert.ok(path.startsWith('/assets/nanawing/aircraft/chupito-'), 'image stays first-party');
      const data = await readFile(file(`site${new URL(path, site).pathname}`));
      const metadata = await sharp(data).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.width, Number(width.slice(0, -1)));
      assert.ok(metadata.height > 0);
      if (metadata.width === 900) {
        assert.equal(Number(image.width), metadata.width);
        assert.equal(Number(image.height), metadata.height);
      }
    }
  }
});

test('live records fetch only the sixteen released boards through a mocked binding', async (t) => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Real network is disabled in this test'); });
  const calls = [];
  const { aircraftRecords } = await import('../src/aircraft-records.js');
  const records = await aircraftRecords({ FPVSIM_BOARD: { fetch: async (input) => {
    calls.push(new URL(input));
    return new Response(JSON.stringify({ entries: [], total: 0 }), { status: 200 });
  } } });
  assert.equal(network.mock.callCount(), 0, 'no global fetch or fallback');
  assert.equal(calls.length, 16);
  assert.deepEqual(new Set(calls.map((url) => url.searchParams.get('aircraft'))), new Set(facts.aircraft.map((aircraft) => aircraft.id)));
  for (const aircraft of facts.aircraft) {
    assert.deepEqual(new Set(calls.filter((url) => url.searchParams.get('aircraft') === aircraft.id).map((url) => url.searchParams.get('course'))), new Set(facts.courses.map((course) => course.id)));
    assert.equal(records.rows[aircraft.id].length, 4);
  }
  assert.equal(records.rows.chupito, undefined);
  assert.equal(records.degraded, false);
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
  const chupitoFaq = copy.faq.find((entry) => entry.q === 'Where can I fly the TBS Chupito?');
  assert.ok(chupitoFaq, 'Chupito has a discoverable FAQ');
  assert.match(chupitoFaq.a, /not in the production hangar yet/);
  assert.match(chupitoFaq.a, /independent simulator recreation/);
  const raceAnswer = copy.faq.find((entry) => entry.q === 'Can every aircraft race every course?').a;
  assert.match(raceAnswer, /Chupito preview has its own test standings in a separate database/);
  assert.match(raceAnswer, /never enter production leaderboards/);
  assert.match(raceAnswer, /Flight-trajectory uploads remain disabled for Chupito/);
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
