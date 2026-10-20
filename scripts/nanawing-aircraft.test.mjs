// File-only aircraft-page regressions. No server, browser, or service requests.
// Build first: node scripts/build-nanawing-pages.mjs
// Run: node --test scripts/nanawing-aircraft.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { page, site } from './page-shell.mjs';
import { courseAllows } from '../src/aircraft-records.js';

const file = (path) => new URL(`../${path}`, import.meta.url);
const facts = JSON.parse(await readFile(file('content/_facts/nanawing.json'), 'utf8'));
const copy = JSON.parse(await readFile(file('content/nanawing/aircraft.json'), 'utf8'));
const html = await readFile(file('site/nanawing/aircraft/index.html'), 'utf8');
// Owner, 15 Oct 2026: the TBS Chupito joins as the fifth aircraft; 20 Oct 2026: Darkwing the sixth, last in the fleet order.
const expectedOrder = ['spectre', 'desertwing', 'morok', 'sukhoi', 'chupito', 'darkwing'];
const TBS_PRODUCT = 'https://www.team-blacksheep.com/products/prod:tbs_chupito_kit';
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
// The aircraft at one end of a spec ('max' or 'min'); a "quickest", "highest" or "fastest" claim belongs to it alone.
const extreme = (key, end) => facts.aircraft.reduce((best, a) => ((end === 'max' ? a[key] > best[key] : a[key] < best[key]) ? a : best));
// Aircraft that recreate a real maker's airframe (credit kind designer or reference: the WUDFLY Spectre, the TBS
// Chupito). They share ONE recreation and approximation note per page (release rule, 15 Oct 2026): one FAQ entry.
const recreated = facts.aircraft.filter((aircraft) => ['designer', 'reference'].includes(aircraft.credit.kind));
// "the A and the B", or "the A, the B and the C"
const listed = (names) => names.length < 3 ? names.join(' and the ') : `${names.slice(0, -1).join(', the ')} and the ${names[names.length - 1]}`;
const realQuestion = `Are the ${listed(recreated.map((aircraft) => aircraft.name))} in Nanawing the real aircraft?`;
const realAnswer = () => {
  const entries = copy.faq.filter((entry) => /in Nanawing the real aircraft\?$/.test(entry.q));
  assert.equal(entries.length, 1, 'one FAQ entry asks whether the recreated aircraft are the real ones');
  assert.equal(entries[0].q, realQuestion, 'that entry names every recreated aircraft');
  return entries[0].a;
};

test('Spectre leads every presentation surface without reordering the facts snapshot', () => {
  assert.deepEqual(copy.order, expectedOrder);
  assert.deepEqual(facts.aircraft.map((aircraft) => aircraft.id), ['desertwing', 'morok', 'sukhoi', 'spectre', 'chupito', 'darkwing']);
  assert.deepEqual([...new Set(copy.order)].sort(), facts.aircraft.map((aircraft) => aircraft.id).sort());

  const lineup = match(html, /<ul class="ac-lineup"[^>]*>([\s\S]*?)<\/ul>/, 'lineup exists');
  assert.deepEqual([...lineup.matchAll(/<li><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'lineup order');
  const comparison = match(section('compare'), /<tbody>([\s\S]*?)<\/tbody>/, 'comparison body exists');
  assert.deepEqual([...comparison.matchAll(/<th scope="row"><a href="#([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'comparison order');
  assert.deepEqual([...html.matchAll(/<section class="ac-craft(?: ac-craft--flip)?" id="([^"]+)"/g)].map(([, id]) => id), expectedOrder, 'detail section order');

  const list = graph.find((entry) => entry['@type'] === 'ItemList');
  assert.ok(list, 'aircraft ItemList exists');
  assert.deepEqual(list.itemListElement.map((entry) => new URL(entry.url).hash.slice(1)), expectedOrder, 'structured-data order');
  assert.deepEqual(list.itemListElement.map((entry) => entry.position), expectedOrder.map((_, i) => i + 1));
  assert.equal(match(html, /<ul class="ac-lineup" aria-label="([^"]+)"/, 'lineup label exists'), `The ${expectedOrder.length} aircraft`);
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

// Brand voice (owner, 14 Oct 2026): the specs are shown, never how they were measured; the recreation and
// approximation note for the designer aircraft (the WUDFLY Spectre and the TBS Chupito share it) is said once, in
// the one FAQ that asks about them; the safety note is small print, once.
test('the page shows the specs without explaining how they were measured', () => {
  assert.equal(copy.method, undefined, 'no methodology copy');
  // The one line under the table is a flying fact a pilot uses beside the stall column, not a measurement disclaimer.
  assert.match(copy.compare.note, /banked turns/i);
  assert.match(copy.compare.note, /stall/i);
  assert.doesNotMatch(copy.compare.note, /measured|simulat|real-world|wings-level|unpowered|battery/i);
  assert.ok(text(section('compare')).includes(copy.compare.note), 'the banked-turn note sits under the table');
  assert.doesNotMatch(html, /class="ac-method"/);
  assert.doesNotMatch(text(html), /test bot|\bmeasured\b|\bbench\b|1 g lift|aerodynamic curve/i);
  assert.doesNotMatch(html, /rendered from the simulator model/i, 'image alt text describes the aircraft, not how the picture was made');
  // Nothing military (owner, 7 Oct 2026): no camouflage in copy or alt text, and no stand-in word for it.
  assert.doesNotMatch(html, /camouflage|\bcamo\b|mottled/i);
  // Counted in what a visitor reads: the JSON-LD FAQPage repeats the FAQ answers for search engines.
  const visible = text(html.replace(/<script\b[\s\S]*?<\/script>/g, ''));
  // One shared note for every aircraft that recreates a real maker's airframe, and none for the rest.
  assert.deepEqual(recreated.map((aircraft) => aircraft.id), ['spectre', 'chupito', 'darkwing']);
  assert.equal((visible.match(/approximation/gi) || []).length, 1, 'the approximation note appears once on the page');
  assert.equal((visible.match(/recreation/gi) || []).length, 1, 'the recreation note appears once on the page');
  assert.equal((visible.match(/flight data/gi) || []).length, 1, 'the flight-data note appears once on the page');
  const answer = realAnswer();
  assert.match(answer, /our recreations/i);
  assert.match(answer, /simulator approximation/i);
  for (const aircraft of recreated) {
    assert.ok(answer.includes(aircraft.name), `the shared note names the ${aircraft.name}`);
    assert.doesNotMatch(text(section(aircraft.id)), /approximation|recreation|flight data/i, `the ${aircraft.name} section carries no second copy of the note`);
  }
  // The sim-is-no-substitute line is small print under the FAQ, once, and inside no answer.
  assert.match(copy.faqNote, /no substitute for instruction/i);
  for (const entry of copy.faq) assert.doesNotMatch(entry.a, /no substitute|instruction/i, `${entry.q} carries no disclaimer`);
  const faqNote = match(html, /<section class="ac-faq"[^>]*>[\s\S]*?<p class="ac-note">([\s\S]*?)<\/p>[\s\S]*?<\/section>/, 'FAQ small print exists');
  assert.equal(text(faqNote), copy.faqNote);
  assert.equal((visible.match(/no substitute for instruction/gi) || []).length, 1, 'the safety note appears once');
});

test('the retired camouflage-era share card is not shipped beside the page', async () => {
  await assert.rejects(readFile(file('site/nanawing/aircraft/og.jpg')), { code: 'ENOENT' });
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
  assert.match(copy.social.imageAlt, /giant oaks[\s\S]*Estate Run/, 'the alt text carries the words printed on the card');
  for (const prefix of ['og', 'twitter']) {
    assert.equal(meta(html, `${prefix}:title`), copy.social.title);
    assert.equal(meta(html, `${prefix}:description`), copy.social.description);
    assert.equal(meta(html, `${prefix}:image`), new URL(copy.social.image, site).href);
    assert.equal(meta(html, `${prefix}:image:alt`), copy.social.imageAlt);
  }
  assert.equal(copy.social.image, '/nanawing/aircraft/spectre-share-v2.jpg');
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

test('every aircraft retains its measured specs, flight link and empty record slots', () => {
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
    // A course's aircraft list is its allow-list (Parkland's Estate Run: the Spectre and the Chupito); no list = every aircraft.
    const allowed = facts.courses.filter((course) => courseAllows(course, aircraft.id));
    assert.equal([...records.matchAll(/<tr>/g)].length, allowed.length);
    for (const course of facts.courses) assert.equal(text(records).includes(course.name), allowed.includes(course), `${aircraft.id} ${allowed.includes(course) ? 'retains' : 'omits'} ${course.name}`);
    assert.equal([...records.matchAll(/<td class="ac-time">—<\/td>/g)].length, allowed.length, 'build does not freeze live lap times');
    assert.equal([...records.matchAll(/<td class="ac-pilot">—<\/td>/g)].length, allowed.length, 'build does not freeze pilot names');
  }
});

test('a course with an aircraft allow-list gets records only for those aircraft, on the page and in the Worker', () => {
  const restricted = facts.courses.filter((course) => Array.isArray(course.aircraft));
  // fpvsim src/world/parkland/parklandCourses.json: Estate Run opens to the TBS Chupito with its release (15 Oct 2026).
  assert.deepEqual(restricted.map((course) => [course.id, course.aircraft]), [['parkland-estate-run', ['spectre', 'chupito']]], 'Estate Run is the Spectre and Chupito course');
  for (const course of facts.courses) for (const id of course.aircraft ?? []) assert.ok(facts.aircraft.some((a) => a.id === id), `${course.id} allows a known aircraft (${id})`);
  // The Worker's job list (src/aircraft-records.js) reads a board only for an aircraft its course allows.
  for (const id of ['spectre', 'chupito']) assert.equal(courseAllows(restricted[0], id), true, `${id} races Estate Run`);
  for (const id of ['desertwing', 'morok', 'sukhoi']) assert.equal(courseAllows(restricted[0], id), false, `${id} cannot race Estate Run`);
  assert.equal(courseAllows(facts.courses[0], 'sukhoi'), true, 'a course without a list allows every aircraft');
  for (const id of ['spectre', 'chupito']) assert.ok(text(section(id)).includes('Estate Run'), `the ${id} section names its Parkland race`);
  const faq = copy.faq.find((entry) => entry.q === 'Which aircraft race which course?');
  assert.ok(faq && /Take the WUDFLY Spectre or the TBS Chupito to Parkland for Estate Run/.test(faq.a), 'the FAQ says who can race Estate Run');
  assert.doesNotMatch(text(html), /Estate Run(?:, its own course| is the WUDFLY Spectre's course)/, 'no line still calls Estate Run the Spectre\'s alone');
});

test('simulator caveats, designer attribution and visible FAQ match the structured answers', () => {
  const spectre = text(section('spectre'));
  // The recreation and approximation note is said once, in the FAQ that asks about it; the Spectre section keeps
  // the designer credit and the photo credit, not a second copy of the note.
  assert.equal(copy.aircraft.spectre.note, undefined, 'no duplicate approximation note in the Spectre section');
  assert.doesNotMatch(spectre, /approximation|recreation/i);
  assert.ok(spectre.includes(copy.aircraft.spectre.photo.credit), 'the photo credit stays');
  assert.ok(spectre.includes('Aircraft design by WUDFLY'), 'the designer credit stays');
  // The shared FAQ note names WUDFLY as the Spectre's maker and calls the handling an approximation.
  const real = realAnswer();
  assert.match(real, /our recreations of WUDFLY's/i);
  assert.match(real, /WUDFLY designs and sells the real Spectre at wudfly\.com/);
  assert.match(real, /simulator approximation/i);
  // Phones yaw the Spectre too (the left touch stick pushed sideways), so no line may say yaw needs a gamepad or radio.
  assert.doesNotMatch(text(html), /yaw needs a yaw stick|yaw on a gamepad or RC radio/i);
  assert.match(copy.faq.find((entry) => entry.q === 'Do I need a gamepad or RC radio?').a, /phone's left stick/);
  assert.ok(section('spectre').includes('href="https://wudfly.com/"'));
  assert.ok(section('spectre').includes('href="https://wudfly.com/store/spectre"'));
  // Each video thumbnail link names the video it plays, so a screen reader hears more than "Play:".
  const videoLinks = [...section('spectre').matchAll(/<a class="ac-yt"[^>]*\bdata-yt="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(videoLinks.length, copy.wudfly.videos.length);
  for (const [, id, inner] of videoLinks) {
    const video = copy.wudfly.videos.find((entry) => entry.id === id);
    assert.ok(video, `video ${id} is in the copy`);
    assert.equal(text(match(inner, /<span class="sr-only">([\s\S]*?)<\/span>/, `video ${id} has a screen-reader label`)), `Play: ${video.title}`);
  }
  const faq = graph.find((entry) => entry['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((entry) => ({ q: entry.name, a: entry.acceptedAnswer.text })), copy.faq);
  const visibleFaq = match(html, /<section class="ac-faq"[^>]*>([\s\S]*?)<\/section>/, 'visible FAQ exists');
  for (const entry of copy.faq) {
    assert.ok(text(visibleFaq).includes(entry.q));
    assert.ok(text(visibleFaq).includes(entry.a));
  }
});

// Team BlackSheep's written permission (15 Oct 2026, ticket TBS-S261014-D3E0): the Chupito may fly under its name and
// livery if it is presented accurately, never as an official TBS simulator or an endorsement, and every public surface
// that shows it credits Team BlackSheep and links the product page. No TBS photographs.
const PARTNERSHIP = /\bofficial\b|\bendorse|\bpartner|in collaboration|\blicensed\b/i;

test('the TBS Chupito is credited to Team BlackSheep with its product link and never presented as official', () => {
  const chupito = facts.aircraft.find((aircraft) => aircraft.id === 'chupito');
  assert.equal(chupito.credit.kind, 'reference');
  assert.equal(chupito.credit.designer, 'Team BlackSheep');
  assert.equal(chupito.credit.url, TBS_PRODUCT);
  const body = section('chupito');
  const credit = match(body, /<p class="ac-credit">([\s\S]*?)<\/p>/, 'the Chupito credit line exists');
  assert.equal(text(credit), 'Reference airframe by Team BlackSheep.');
  const link = attributes(match(credit, /(<a\b[^>]*>)/, 'the credit links out'));
  assert.equal(link.href, TBS_PRODUCT);
  assert.equal(link.target, '_blank');
  assert.ok((link.rel || '').split(/\s+/).includes('noopener'));
  // The section shows the Nanawing render, never a TBS photograph.
  assert.equal(copy.aircraft.chupito.photo, undefined, 'no photo for the Chupito');
  assert.match(body, /<figure class="ac-craft-img"><img [^>]*src="\/assets\/nanawing\/aircraft\/chupito-900\.webp/);
  const real = realAnswer();
  assert.match(real, /our recreations of WUDFLY's, Team BlackSheep's and Anirudh's wings/);
  assert.match(real, /the TBS Chupito's is not TBS flight data/);
  assert.match(real, /Team BlackSheep sells the real Chupito at team-blacksheep\.com/);
  const visible = text(html.replace(/<script\b[\s\S]*?<\/script>/g, ''));
  assert.doesNotMatch(visible, PARTNERSHIP);
  assert.doesNotMatch(JSON.stringify(copy), PARTNERSHIP);
});

test('every aircraft count on the page matches the hangar', () => {
  const n = facts.aircraft.length;
  const words = [text(html.replace(/<script\b[\s\S]*?<\/script>/g, '')), copy.title, copy.description, copy.social.title, copy.social.description, copy.social.imageAlt].join(' ');
  const counts = [...words.matchAll(/\b(?:All|the) (\d+)(?= aircraft\b| fly\b|\.(?!\d))/g)].map(([, count]) => Number(count));
  assert.ok(counts.length >= 5, `the page states its aircraft count (${counts.length} found)`);
  for (const count of counts) assert.equal(count, n, 'every "All n" and "the n aircraft" is the hangar size');
  for (const [, count] of words.matchAll(/\btry (\d+) more aircraft\b/g)) assert.equal(Number(count), n - 1);
});

test('a quickest, fastest, slowest, lowest or highest claim belongs to the aircraft that holds it', () => {
  const claims = [
    [/quickest roll|rolls? (?:quicker|faster) than/i, extreme('rollRateDegS', 'max')],
    [/fastest in the hangar|fastest wing/i, extreme('topSpeedKmh', 'max')],
    [/slower than any other wing|slowest wing|flies slowest/i, extreme('topSpeedKmh', 'min')],
    [/lowest stall/i, extreme('stallSpeedKmh', 'min')],
    [/highest stall|stalls at \d+ km\/h, the highest/i, extreme('stallSpeedKmh', 'max')],
    [/strongest climb/i, extreme('climbRateMs', 'max')],
  ];
  // In an aircraft's own section, the claim is about that aircraft.
  for (const id of expectedOrder) {
    const body = text(section(id));
    for (const [pattern, holder] of claims) if (pattern.test(body)) assert.equal(id, holder.id, `the ${id} section claims ${pattern}`);
  }
  // Anywhere else, the sentence that makes the claim names the aircraft that holds it.
  const elsewhere = [copy.description, copy.social.description, copy.hero.lede, ...copy.practice.paragraphs, ...copy.faq.map((entry) => entry.a)];
  for (const sentence of elsewhere.join(' ').split(/(?<=[.!?])\s+/)) {
    for (const [pattern, holder] of claims) if (pattern.test(sentence)) assert.ok(sentence.includes(holder.name), `"${sentence}" names ${holder.name}`);
  }
});

test('the homepage lists, races and credits every aircraft, the TBS Chupito included', async () => {
  const home = await readFile(file('site/index.html'), 'utf8');
  const byId = new Map(facts.aircraft.map((aircraft) => [aircraft.id, aircraft]));
  // The board opens on the Sukhoi (owner rule); the Chupito is appended last.
  const select = match(home, /<select id="race-aircraft">([\s\S]*?)<\/select>/, 'the homepage aircraft picker exists');
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(([, id, name]) => ({ id, name }));
  assert.deepEqual(options.map((option) => option.id), ['sukhoi', 'desertwing', 'morok', 'spectre', 'chupito', 'darkwing']);
  for (const option of options) assert.equal(option.name, byId.get(option.id).name);
  // Estate Run's option carries the course allow-list the board script reads (site/assets/leaderboard.js).
  const estate = attributes(match(home, /(<option value="parkland-estate-run"[^>]*>)/, 'the Estate Run option exists'));
  assert.deepEqual(estate['data-aircraft'].split(/\s+/), facts.courses.find((course) => course.id === 'parkland-estate-run').aircraft);
  const pick = text(match(home, /<a href="\/nanawing\/aircraft\/">(Pick your wing:[\s\S]*?)<\/a>/, 'the Pick your wing list exists'));
  for (const aircraft of facts.aircraft) assert.ok(pick.includes(aircraft.name), `the homepage list names the ${aircraft.name}`);
  // The page that names the Chupito credits Team BlackSheep and links the product page.
  const credits = [...home.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter(([, attrs]) => attributes(attrs).href === TBS_PRODUCT);
  assert.equal(credits.length, 1, 'one Team BlackSheep product link');
  assert.match(text(credits[0][2]), /Team BlackSheep/);
  // The credit sits in the page's one small-print honesty note (TBS release rule: once per page).
  const homeVisible = text(home.replace(/<script\b[\s\S]*?<\/script>/g, ''));
  assert.match(homeVisible, /TBS Chupito: Nanawing’s recreation; its handling is not TBS flight data\. Reference airframe by Team BlackSheep/);
  assert.equal((homeVisible.match(/not TBS flight data/g) || []).length, 1, 'the homepage honesty note appears once');
  assert.doesNotMatch(homeVisible, PARTNERSHIP);
  assert.doesNotMatch(text(home), /Estate Run, a WUDFLY Spectre race/, 'Estate Run is no longer the Spectre\'s alone');
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
