// Builds the Nanawing content pages on www from content/ (the content home in
// docs/site-consolidation-plan.md, M3). Today: /nanawing/aircraft/.
//   node scripts/build-nanawing-pages.mjs
// Facts come from content/_facts/nanawing.json (a snapshot of the fpvsim repo);
// copy comes from content/nanawing/aircraft.json. The live lap records are left
// as empty <tbody data-records="<id>"> slots that the Worker fills per request
// (src/aircraft-records.js), so the page never ships stale times.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { site, safe, page } from './page-shell.mjs';

const facts = JSON.parse(readFileSync('content/_facts/nanawing.json', 'utf8'));
const copy = JSON.parse(readFileSync('content/nanawing/aircraft.json', 'utf8'));
// Editorial order belongs to this page, not the shared performance snapshot.
const byId = new Map(facts.aircraft.map((a) => [a.id, a]));
if (!Array.isArray(copy.order) || copy.order.length !== byId.size ||
    new Set(copy.order).size !== byId.size || copy.order.some((id) => !byId.has(id))) {
  throw new Error('Aircraft display order must include every aircraft exactly once');
}
const displayAircraft = copy.order.map((id) => byId.get(id));
for (const cta of [copy.hero, copy.final]) {
  if (!byId.has(cta.aircraft)) throw new Error(`Unknown CTA aircraft: ${cta.aircraft}`);
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ext = 'target="_blank" rel="noopener"';
const play = (id) => facts.playUrl.replace('{id}', id).replace(/&/g, '&amp;');
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const weight = (kg) => (kg < 1 ? `${fmt(kg * 1000)}&nbsp;g` : `${fmt(kg, 1)}&nbsp;kg`);
// A number never wraps away from its unit; values break only at the ' · ' separators.
const battery = (b) => esc(b).replace(/ (mAh|A)\b/g, '&nbsp;$1');
const IMG = (id, w) => `/assets/nanawing/aircraft/${id}-${w}.webp`;

// Real pixel sizes, so every <img> reserves its space (no layout shift).
const dims = {};
for (const a of facts.aircraft) {
  const m = await sharp(`site${IMG(a.id, 900)}`).metadata();
  dims[a.id] = { w: m.width, h: m.height };
}
const alt = {
  desertwing: 'Nanawing One, a blue camouflage flying wing with a single pusher prop, rendered from the simulator model',
  morok: 'Morok UAV, a silver drone with a V-tail and a pusher prop, rendered from the simulator model',
  sukhoi: 'Sukhoi S-70 Okhotnik, a grey stealth flying wing, rendered from the simulator model',
  spectre: 'WUDFLY Spectre, a white and yellow twin-motor flying wing with SPECTRE and WUDFLY lettering, rendered from the simulator model',
};
const img = (a, sizes, { eager = false, cls = '' } = {}) =>
  `<img${cls ? ` class="${cls}"` : ''} src="${IMG(a.id, 900)}" srcset="${IMG(a.id, 560)} 560w, ${IMG(a.id, 900)} 900w, ${IMG(a.id, 1400)} 1400w" sizes="${sizes}" alt="${esc(alt[a.id])}" width="${dims[a.id].w}" height="${dims[a.id].h}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;

function credit(a) {
  const c = a.credit;
  if (c.kind === 'cc-by') return `Model: <a href="${c.source}" ${ext}>“${esc(c.title)}”</a> by ${esc(c.author)}, <a href="${c.licenseUrl}" ${ext}>${esc(c.license)}</a>. Rendered in Nanawing with its simulator materials.`;
  if (c.kind === 'designer') return `Aircraft design by <a href="${c.designerUrl}" ${ext}>${esc(c.designer)}</a>.`;
  return esc(c.text);
}

const specRows = [
  ['Top speed', (a) => `${fmt(a.topSpeedKmh)}&nbsp;km/h`],
  ['Stall speed', (a) => `${fmt(a.stallSpeedKmh)}&nbsp;km/h`],
  ['Roll rate', (a) => `${fmt(a.rollRateDegS)}°/s`],
  ['Climb rate', (a) => `${fmt(a.climbRateMs, 1)}&nbsp;m/s`],
  ['Wingspan', (a) => `${fmt(a.spanM, 2)}&nbsp;m`],
  ['Weight', (a) => weight(a.massKg)],
  ['Thrust', (a) => `${fmt(a.thrustN)}&nbsp;N`],
  ['Battery', (a) => battery(a.battery)],
];

const courseRows = facts.courses.map((c) =>
  `<tr><th scope="row">${esc(c.name)}<small>${esc(c.map)} · ${fmt(c.km, 1)} km</small></th><td class="ac-time">—</td><td class="ac-pilot">—</td></tr>`).join('');

const lineup = `<ul class="ac-lineup" aria-label="The four aircraft">${displayAircraft.map((a, i) =>
  `<li><a href="#${a.id}">${img(a, '(max-width:700px) 44vw, 270px', { eager: i < 2 })}<span class="ac-lineup-name">${esc(a.name)}</span><span class="ac-lineup-role">${esc(copy.aircraft[a.id].role)}</span></a></li>`).join('')}</ul>`;

const compare = `<section class="ac-compare" id="compare" aria-labelledby="compare-title"><h2 id="compare-title">${esc(copy.compare.h2)}</h2>
<div class="ac-table-wrap" role="region" aria-labelledby="compare-title" tabindex="0"><table class="ac-table"><thead><tr><th scope="col">Aircraft</th>${specRows.map(([label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
<tbody>${displayAircraft.map((a) => `<tr><th scope="row"><a href="#${a.id}">${esc(a.name)}</a></th>${specRows.map(([, f]) => `<td>${f(a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<p class="ac-swipe">Swipe the table sideways for all eight specs.</p><p class="ac-note">${esc(copy.compare.note)}</p></section>`;

// A real photo (copy.aircraft.<id>.photo, e.g. the designer's own) in place of the render.
const PHOTO = (file, w) => `/assets/nanawing/aircraft/${file}-${w}.webp`;
const photo = (p, sizes) =>
  `<img src="${PHOTO(p.file, p.widths[1] ?? p.widths[0])}" srcset="${p.widths.map((w) => `${PHOTO(p.file, w)} ${w}w`).join(', ')}" sizes="${sizes}" alt="${esc(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy" decoding="async">`;
const figure = (a, c) => c.photo
  ? `<figure class="ac-craft-img ac-craft-photo">${photo(c.photo, '(max-width:860px) 92vw, 600px')}<figcaption>${esc(c.photo.credit)}</figcaption></figure>`
  : `<figure class="ac-craft-img">${img(a, '(max-width:860px) 92vw, 520px')}</figure>`;
const gallery = (w) => (w.gallery?.length
  ? `<ul class="ac-gallery">${w.gallery.map((p) => `<li>${photo(p, '(max-width:600px) 46vw, 340px')}</li>`).join('')}</ul><p class="ac-note">${esc(w.galleryCredit)}</p>`
  : '');

const wudfly = (w) => `<div class="ac-wudfly"><h3>${esc(w.h3)}</h3>${w.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
<ul class="ac-wudfly-links">${w.links.map((l) => `<li><a href="${l.href}" ${ext}>${esc(l.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
${gallery(w)}
<h4>${esc(w.videosH4)}</h4><ul class="ac-videos">${w.videos.map((v) =>
  `<li><a class="ac-yt" href="https://www.youtube.com/watch?v=${v.id}" data-yt="${v.id}" ${ext}><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async"><span class="ac-yt-play" aria-hidden="true">▶</span><span class="sr-only">Play: </span></a><p class="ac-yt-title">${esc(v.title)}</p></li>`).join('')}</ul></div>`;

const sections = displayAircraft.map((a, i) => {
  const c = copy.aircraft[a.id];
  return `<section class="ac-craft${i % 2 ? ' ac-craft--flip' : ''}" id="${a.id}" aria-labelledby="${a.id}-title">
${figure(a, c)}
<div class="ac-craft-body"><span class="eyebrow">${String(i + 1).padStart(2, '0')} / ${esc(c.role.toUpperCase())}</span><h2 id="${a.id}-title">${esc(a.name)}</h2>
<p class="ac-credit">${credit(a)}</p>
${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}${c.note ? `<p class="ac-note">${esc(c.note)}</p>` : ''}
<dl class="ac-specs">${specRows.map(([label, f]) => `<div><dt>${label}</dt><dd>${f(a)}</dd></div>`).join('')}</dl>
<div class="ac-records"><h3>${esc(copy.records.h3)} <span>in the ${esc(a.name)}</span></h3>
<table><thead><tr><th scope="col">Course</th><th scope="col">Best lap</th><th scope="col">Pilot</th></tr></thead><tbody data-records="${a.id}">${courseRows}</tbody></table>
<p class="ac-note">${esc(copy.records.note)}</p></div>
<a class="ac-btn" href="${play(a.id)}" ${ext}>Fly the ${esc(a.name)} <span aria-hidden="true">↗</span></a>
</div>${a.id === 'spectre' ? wudfly(copy.wudfly) : ''}</section>`;
}).join('\n');

const method = `<section class="ac-method" aria-labelledby="method-title"><h2 id="method-title">${esc(copy.method.h2)}</h2>${copy.method.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`;
const faq = `<section class="ac-faq" aria-labelledby="faq-title"><h2 id="faq-title">Questions</h2>${copy.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
const final = `<section class="ac-final"><h2>${esc(copy.final.h2)}</h2><p>${esc(copy.final.lede)}</p><a class="ac-btn" href="${play(copy.final.aircraft)}" ${ext}>${esc(copy.final.cta)} <span aria-hidden="true">↗</span></a></section>`;

const body = `<div class="ac-page">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Nanawing aircraft</nav>
<div class="ac-hero"><span class="eyebrow">${esc(copy.hero.eyebrow)}</span><h1>${copy.hero.h1}</h1><p class="lede">${esc(copy.hero.lede)}</p>
<div class="ac-actions"><a class="ac-btn" href="${play(copy.hero.aircraft)}" ${ext}>${esc(copy.hero.cta)} <span aria-hidden="true">↗</span></a><a class="ac-link" href="#compare">${esc(copy.hero.secondary)} <span aria-hidden="true">↓</span></a></div>
${lineup}</div>
${compare}
${sections}
${method}
${faq}
${final}
</div>`;

const path = copy.path;
const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': site + path, url: site + path, name: copy.title, description: copy.description, isPartOf: { '@id': site + '/#website' }, about: { '@id': 'https://sim.narenana.com/#app' } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' }, { '@type': 'ListItem', position: 2, name: 'Nanawing aircraft', item: site + path }] },
    { '@type': 'ItemList', name: 'Nanawing aircraft', itemListElement: displayAircraft.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name, url: `${site}${path}#${a.id}`, image: copy.aircraft[a.id].photo ? `${site}${PHOTO(copy.aircraft[a.id].photo.file, 1200)}` : `${site}${IMG(a.id, 1400)}` })) },
    { '@type': 'FAQPage', mainEntity: copy.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ],
};

// Click a video thumbnail to load the player; nothing from YouTube loads before that.
const scripts = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-yt]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+a.getAttribute('data-yt')+'?autoplay=1&rel=0';f.title=a.parentNode.querySelector('.ac-yt-title').textContent;f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';f.allowFullscreen=true;f.className='ac-yt ac-yt-on';a.replaceWith(f);f.focus()});</script>`;

mkdirSync(`site${path}`, { recursive: true });
writeFileSync(`site${path}index.html`, page({
  path,
  title: copy.title,
  description: copy.description,
  image: `${site}${copy.social.image}`,
  social: copy.social,
  body,
  schema,
  head: '<link rel="stylesheet" href="/assets/nanawing-aircraft.css?v=e9bcd54314">',
  scripts,
}));

// Stamp ?v= on every asset reference this wrote, as scripts/seo-content.mjs does.
const { planAssetVersions } = await import('./version-assets.mjs');
{ const plan = planAssetVersions(); for (const f of plan.changes) writeFileSync(f, plan.text.get(f)); if (plan.manifestStale) writeFileSync(new URL('../src/asset-versions.mjs', import.meta.url), plan.manifest); }
console.log(`wrote site${path}index.html`);
