// Builds one aircraft's landing page on www from content/ (the content home of
// docs/site-consolidation-plan.md, M3), e.g. /nanawing/chupito-simulator/:
//   node scripts/build-nanawing-landing.mjs content/nanawing/chupito-simulator.json
// Facts (the specs, the maker credit, the play link) come from content/_facts/nanawing.json;
// the copy from the page's own JSON. The page shares the hangar page's shell, stylesheet and
// spec card (nanawing-render.mjs), so the two never show different figures.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { site, page } from './page-shell.mjs';
import { esc, ext, play, IMG, ALT, imageDims, img, specRows, YT_SCRIPT } from './nanawing-render.mjs';

const contentPath = process.argv[2] || 'content/nanawing/chupito-simulator.json';
const facts = JSON.parse(readFileSync('content/_facts/nanawing.json', 'utf8'));
const copy = JSON.parse(readFileSync(contentPath, 'utf8'));
const a = facts.aircraft.find((x) => x.id === copy.aircraft);
if (!a) throw new Error(`Unknown aircraft: ${copy.aircraft}`);
if (!ALT[a.id]) throw new Error(`No alt text for ${a.id}`);
// A landing page is for a real maker's wing; its small print credits and links the maker.
if (!['reference', 'designer'].includes(a.credit.kind)) throw new Error(`${a.id}: a landing page needs a maker credit`);
const dims = await imageDims([a]);
const path = copy.path;
const fly = play(facts, a.id);

const btn = (label) => `<a class="ac-btn" href="${fly}" ${ext}>${esc(label)} <span aria-hidden="true">↗</span></a>`;
// An outbound text link keeps its arrow on the same line as its last word.
const link = (l) => (/^https?:/.test(l.href)
  ? `<a href="${esc(l.href)}" ${ext}>${esc(l.label)}&nbsp;<span aria-hidden="true">↗</span></a>`
  : `<a href="${esc(l.href)}">${esc(l.label)}</a>`);
const paras = (list) => list.map((p) => `<p>${esc(p)}</p>`).join('');
const sec = (id, cls, h2, inner) => `<section class="${cls}" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${esc(h2)}</h2>${inner}</section>`;
const links = (list) => `<ul class="ac-links">${list.map((l) => `<li>${link(l)}</li>`).join('')}</ul>`;

// Videos: the hangar page's click-to-play cards (YT_SCRIPT). Only well-formed YouTube ids reach
// the markup. A published date is an ISO string (the channel feed) or epoch seconds (the catalog).
const YT_ID = /^[A-Za-z0-9_-]{6,15}$/;
const videos = copy.watch.groups.flatMap((g) => g.videos);
for (const v of videos) if (!YT_ID.test(v.id)) throw new Error(`Bad video id: ${v.id}`);
const publishedIso = (p) => (typeof p === 'number' ? new Date(p * 1000) : new Date(p)).toISOString();
const videoCard = (v) => `<li><a class="ac-yt" href="https://www.youtube.com/watch?v=${v.id}" data-yt="${v.id}" ${ext}><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async"><span class="ac-yt-play" aria-hidden="true">▶</span><span class="sr-only">Play: ${esc(v.title)}</span></a><p class="ac-yt-title">${esc(v.title)}</p><p class="ac-yt-by">${esc(v.channel)}</p></li>`;

// The one small-print line about the recreation, under the spec card. Its credit and link come
// from the facts, so the maker's terms (credited and linked wherever the aircraft is shown)
// cannot be lost in a copy edit.
const makerUrl = a.credit.url ?? a.credit.designerUrl;
const smallPrint = `${esc(copy.smallPrint)} ${a.credit.kind === 'reference' ? 'Reference airframe by' : 'Aircraft design by'} <a href="${esc(makerUrl)}" ${ext}>${esc(a.credit.designer)}&nbsp;<span aria-hidden="true">↗</span></a>.`;

const hero = `<div class="ac-hero"><span class="eyebrow">${esc(copy.hero.eyebrow)}</span><h1>${esc(copy.hero.h1)}</h1><p class="lede">${esc(copy.hero.lede)}</p>
<div class="ac-actions">${btn(copy.hero.cta)}<nav class="ac-jumps" aria-label="On this page">${copy.hero.jumps.map((j) => `<a href="${esc(j.href)}">${esc(j.label)}</a>`).join('')}</nav></div>
<p class="ac-note">${esc(copy.hero.ctaNote)}</p></div>`;

const wing = `<section class="ac-craft" id="wing" aria-labelledby="wing-title">
<figure class="ac-craft-img">${img(a, dims, '(max-width:860px) 92vw, 520px', { eager: true })}</figure>
<div class="ac-craft-body"><span class="eyebrow">${esc(copy.specs.eyebrow)}</span><h2 id="wing-title">${esc(copy.specs.h2)}</h2>${copy.specs.intro ? `<p>${esc(copy.specs.intro)}</p>` : ''}
<dl class="ac-specs">${specRows.map(([label, f]) => `<div><dt>${label}</dt><dd>${f(a)}</dd></div>`).join('')}</dl>
<p class="ac-credit">${smallPrint}</p>
<p class="ac-more"><a href="${esc(copy.more.href)}">${esc(copy.more.label)} <span aria-hidden="true">→</span></a></p></div></section>`;

const doing = sec('fly', 'ac-practice ac-doing', copy.doing.h2, copy.doing.items.map((i) => `<h3>${esc(i.h3)}</h3><p>${esc(i.p)}</p>`).join(''));
const controls = sec('controls', 'ac-practice', copy.controls.h2, paras(copy.controls.paragraphs));
const bites = sec('bites', 'ac-practice', copy.bites.h2, `<ul class="ac-bites">${copy.bites.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
const watch = `<section class="ac-practice ac-watch" id="watch" aria-labelledby="watch-title"><h2 id="watch-title">${esc(copy.watch.h2)}</h2><p>${esc(copy.watch.intro)}</p>${copy.watch.groups.map((g) =>
  `<h3>${esc(g.h3)}</h3><ul class="ac-videos">${g.videos.map(videoCard).join('')}</ul>`).join('')}</section>`;
// The price line is a slot: the Worker fills it per request from the catalog (src/wings-live.js);
// the fallback sentence stays when the catalog has nothing to say.
// One card per bundle (copy.buy.variants): what is in the box, who it is for, and a slot the Worker
// fills with that bundle's listings from the catalog (src/wings-live.js: offersTable). A hidden
// "Other listings" card takes any listing that matches no bundle.
const variantCard = (v) => `<article class="ac-variant" id="buy-${esc(v.id)}"><h3>${esc(v.name)} <span>${esc(v.sub)}</span></h3><p>${esc(v.includes)}</p><p>${esc(v.pick)}</p><div class="ac-offers" data-wings-offers="${esc(copy.wingsSlug)}:${esc(v.id)}"><p class="ac-note">${esc(copy.buy.tableFallback)}</p></div></article>`;
const variants = `<div class="ac-variants">${copy.buy.variants.map(variantCard).join('')}<article class="ac-variant ac-variant-other" id="buy-other" hidden><h3>${esc(copy.buy.otherName)}</h3><div class="ac-offers" data-wings-offers="${esc(copy.wingsSlug)}:other"></div></article></div><p class="ac-note">${esc(copy.buy.note)}</p>`;
const buy = sec('buy', 'ac-practice ac-buy', copy.buy.h2, `<p class="ac-live" data-wings="${esc(copy.wingsSlug)}">${esc(copy.buy.fallback)}</p>${variants}<p>${esc(copy.buy.p)}</p>${links(copy.buy.links)}`);
const logs = sec('logs', 'ac-practice', copy.logs.h2, `${paras(copy.logs.paragraphs)}${links(copy.logs.links)}`);
// 3D prints: a curated list from the model sites, each a link to its designer's own page (none of
// their files or images are copied here). Optional: only pages with a `prints` block render it.
const printItem = (p) => `<li><a href="${esc(p.href)}" ${ext}>${esc(p.title)}&nbsp;<span aria-hidden="true">↗</span></a><span class="ac-print-by">${esc(p.by)} · ${esc(p.site)}</span><p>${esc(p.what)}</p></li>`;
// The owner's own build: each part, what he flies, and the alternates he would stand behind.
// Optional: rendered only once the list is in the page's JSON.
const build = copy.build
  ? sec('build', 'ac-practice ac-build', copy.build.h2, `<p>${esc(copy.build.intro)}</p><div class="ac-table-wrap" role="region" aria-labelledby="build-title" tabindex="0"><table class="ac-table ac-build-table"><thead><tr><th scope="col">Part</th><th scope="col">${esc(copy.build.mineLabel)}</th><th scope="col">${esc(copy.build.altLabel)}</th></tr></thead><tbody>${copy.build.items.map((p) =>
    `<tr><th scope="row">${esc(p.part)}</th><td>${p.href ? `<a href="${esc(p.href)}" ${ext}>${esc(p.mine)}&nbsp;<span aria-hidden="true">↗</span></a>` : esc(p.mine)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td>${(p.alternates || []).map(esc).join(', ') || '—'}</td></tr>`).join('')}</tbody></table></div>${copy.build.note ? `<p class="ac-note">${esc(copy.build.note)}</p>` : ''}`)
  : '';
const prints = copy.prints
  ? `<section class="ac-practice ac-prints" id="prints" aria-labelledby="prints-title"><h2 id="prints-title">${esc(copy.prints.h2)}</h2><p>${esc(copy.prints.intro)}</p>${copy.prints.groups.map((g) =>
    `<h3>${esc(g.h3)}</h3><ul class="ac-print-list">${g.items.map(printItem).join('')}</ul>`).join('')}${copy.prints.note ? `<p class="ac-note">${esc(copy.prints.note)}</p>` : ''}</section>`
  : '';
// copy.faqNote: the one small-print safety line, under the answers rather than inside one.
const faq = `<section class="ac-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">${esc(copy.faq.h2)}</h2>${copy.faq.items.map((f) =>
  `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}${f.link ? ` ${link(f.link)}.` : ''}</p></details>`).join('')}<p class="ac-note">${esc(copy.faqNote)}</p></section>`;
const final = `<section class="ac-final"><h2>${esc(copy.final.h2)}</h2><p>${esc(copy.final.lede)}</p>${btn(copy.final.cta)}</section>`;

const body = `<div class="ac-page ac-landing">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/nanawing/aircraft/">Nanawing aircraft</a> / ${esc(copy.crumb)}</nav>
${hero}
${watch}
${wing}
${doing}
${controls}
${bites}
${buy}
${build}
${prints}
${logs}
${faq}
${final}
</div>`;

const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': site + path, url: site + path, name: copy.title, description: copy.description, isPartOf: { '@id': site + '/#website' }, about: { '@id': 'https://sim.narenana.com/#app' }, primaryImageOfPage: { '@type': 'ImageObject', url: `${site}${IMG(a.id, 1400)}` } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' },
      { '@type': 'ListItem', position: 2, name: 'Nanawing aircraft', item: site + '/nanawing/aircraft/' },
      { '@type': 'ListItem', position: 3, name: copy.crumb, item: site + path },
    ] },
    { '@type': 'FAQPage', mainEntity: copy.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.link ? `${f.a} ${f.link.label}: ${f.link.href.startsWith('#') ? site + path : site}${f.link.href}` : f.a } })) },
    // The curated prints as an ItemList: each entry is the designer's own page.
    ...(copy.prints ? [{ '@type': 'ItemList', name: `${a.name} 3D prints`, itemListElement: copy.prints.groups.flatMap((g) => g.items).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: p.href })) }] : []),
    // One VideoObject per embedded video: video rich-result eligibility, as on the product pages.
    ...videos.map((v) => ({
      '@type': 'VideoObject',
      name: v.title,
      description: `${v.channel}'s video of the TBS Chupito, on narenana's Chupito page.`,
      thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      uploadDate: publishedIso(v.published),
      embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    })),
  ],
};

// What this page adds to the hangar page's stylesheet: the wing card sits right under the hero,
// and the text sections get their list and link styles.
const css = '.ac-landing .ac-actions{margin-bottom:10px}.ac-jumps{display:flex;flex-wrap:wrap;gap:0 18px}.ac-jumps a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:var(--ac-ink);text-underline-offset:4px}.ac-landing .ac-craft{margin-top:56px}.ac-landing .ac-craft-img{align-self:start}.ac-more{margin:0;font-weight:700}.ac-watch h3{margin-top:24px}.ac-watch .ac-videos{margin-top:10px}.ac-yt-by{margin:2px 0 0;font-size:12px;color:var(--ac-muted)}.ac-doing h3{margin-top:24px}.ac-doing h2+h3{margin-top:0}.ac-bites{margin:0;padding-left:20px}.ac-bites li{margin:0 0 10px}.ac-live{font-size:17px}.ac-live strong{color:#C63B2E}.ac-variants{display:grid;gap:14px;margin:16px 0 8px}.ac-variant{padding:16px 18px 14px;border:1px solid var(--ac-line);border-radius:8px;background:var(--ac-sky)}.ac-variant h3{margin:0 0 8px}.ac-variant h3 span{display:block;font:500 13px/1.4 \'DM Sans\',sans-serif;color:var(--ac-muted)}.ac-variant p{margin:0 0 8px;font-size:15px}.ac-variant .ac-offers{margin:10px 0 0}.ac-variant .ac-offers .ac-note{margin:0}.ac-variant .ac-table-wrap{background:#fff}.ac-offers{margin:14px 0 18px}.ac-offers-table{width:100%;min-width:0;border-collapse:collapse;font-size:14px;line-height:1.35;background:#fff}.ac-offers-table th,.ac-offers-table td{padding:11px 12px;border-bottom:1px solid var(--ac-line);text-align:left;vertical-align:middle}.ac-offers-table thead th{font:500 10px/1.4 \'JetBrains Mono\',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ac-muted);background:var(--ac-paper)}.ac-offers-table tbody tr:last-child th,.ac-offers-table tbody tr:last-child td{border-bottom:0}.ac-offers-table tbody th{font-weight:700}.ac-offers-table small{display:block;font-weight:400;font-size:12px;color:var(--ac-muted);margin-top:2px}.ac-offer-price{font:600 15px/1.3 \'JetBrains Mono\',monospace;white-space:nowrap}.ac-offer-price small{font-family:\'DM Sans\',sans-serif;white-space:normal}.ac-offer-held{font:600 13px/1.3 \'DM Sans\',sans-serif;color:var(--ac-muted);white-space:normal}.ac-offer-badge{display:inline-block;margin-left:6px;padding:1px 7px;border:1px solid var(--ac-line);border-radius:999px;font:500 10px/1.5 \'JetBrains Mono\',monospace;letter-spacing:.04em;text-transform:uppercase;color:var(--ac-muted)}.ac-offer-buy{text-align:right}.ac-btn-sm{min-height:40px;padding:8px 14px;font-size:14px}.ac-btn-quiet{background:#fff;border:1px solid var(--ac-line);color:var(--ac-ink)!important}.ac-btn-quiet:hover{background:var(--ac-paper)}.ac-offers-table .is-oos th a,.ac-offers-table .is-oos td,.ac-offers-table .is-gone th,.ac-offers-table .is-gone td{color:var(--ac-muted)}.ac-offers-table .is-live .ac-offer-stock{color:#2E7D4F;font-weight:700}@media(max-width:599px){.ac-offers .ac-table-wrap{overflow:visible}.ac-offers-table thead{display:none}.ac-offers-table,.ac-offers-table tbody{display:block}.ac-offers-table tr{display:grid;grid-template-columns:1fr auto;grid-template-areas:\'seller price\' \'config price\' \'stock buy\';gap:2px 12px;align-items:start;padding:12px 14px;border-bottom:1px solid var(--ac-line)}.ac-offers-table tbody tr:last-child{border-bottom:0}.ac-offers-table th,.ac-offers-table td{display:block;padding:0;border:0}.ac-offer-seller{grid-area:seller}.ac-offer-config{grid-area:config;color:var(--ac-muted);font-size:13px}.ac-offer-price{grid-area:price;text-align:right}.ac-offer-stock{grid-area:stock;align-self:end;font-size:13px}.ac-offer-buy{grid-area:buy;justify-self:end;margin-top:6px}}.ac-build .ac-table{min-width:0}.ac-build .ac-table th,.ac-build .ac-table td{white-space:normal;vertical-align:top}.ac-build-table small{display:block;font-size:12px;color:var(--ac-muted);margin-top:2px}.ac-prints h3{margin-top:24px}.ac-print-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:12px}.ac-print-list li{padding:14px 16px;border:1px solid var(--ac-line);border-radius:6px;background:#fff}.ac-print-list a{font-weight:700}.ac-print-by{display:block;font-size:12px;color:var(--ac-muted);margin-top:2px}.ac-print-list p{margin:6px 0 0;font-size:15px}@media(min-width:600px){.ac-print-list{grid-template-columns:repeat(2,minmax(0,1fr))}}.ac-links{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 28px}.ac-links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;text-underline-offset:4px}';

mkdirSync(`site${path}`, { recursive: true });
writeFileSync(`site${path}index.html`, page({
  path,
  title: copy.title,
  description: copy.description,
  image: `${site}${copy.social.image}`,
  social: copy.social,
  body,
  schema,
  head: `<link rel="stylesheet" href="/assets/nanawing-aircraft.css?v=862eb507d2"><style>${css}</style>`,
  scripts: YT_SCRIPT,
}));

// Stamp ?v= on every asset reference this wrote, as scripts/seo-content.mjs does.
const { planAssetVersions } = await import('./version-assets.mjs');
{ const plan = planAssetVersions(); for (const f of plan.changes) writeFileSync(f, plan.text.get(f)); if (plan.manifestStale) writeFileSync(new URL('../src/asset-versions.mjs', import.meta.url), plan.manifest); }
console.log(`wrote site${path}index.html`);
