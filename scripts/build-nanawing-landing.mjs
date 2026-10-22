// Builds one aircraft's landing page on www from content/ (the content home of
// docs/site-consolidation-plan.md, M3), e.g. /nanawing/chupito-simulator/:
//   node scripts/build-nanawing-landing.mjs content/nanawing/chupito-simulator.json
// Facts (the specs, the maker credit, the play link) come from content/_facts/nanawing.json;
// the copy from the page's own JSON. The page shares the hangar page's shell, stylesheet and
// spec card (nanawing-render.mjs), so the two never show different figures.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { site, page } from './page-shell.mjs';
import { esc, ext, play, IMG, ALT, imageDims, img, specRows } from './nanawing-render.mjs';

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

// The one small-print line about the recreation, under the spec card. Its credit and link come
// from the facts, so the maker's terms (credited and linked wherever the aircraft is shown)
// cannot be lost in a copy edit.
const makerUrl = a.credit.url ?? a.credit.designerUrl;
const smallPrint = `${esc(copy.smallPrint)} ${a.credit.kind === 'reference' ? 'Reference airframe by' : 'Aircraft design by'} <a href="${esc(makerUrl)}" ${ext}>${esc(a.credit.designer)}&nbsp;<span aria-hidden="true">↗</span></a>.`;

const hero = `<div class="ac-hero"><span class="eyebrow">${esc(copy.hero.eyebrow)}</span><h1>${esc(copy.hero.h1)}</h1><p class="lede">${esc(copy.hero.lede)}</p>
<div class="ac-actions">${btn(copy.hero.cta)}<a class="ac-link" href="#fly">${esc(copy.hero.secondary)} <span aria-hidden="true">↓</span></a></div>
<p class="ac-note">${esc(copy.hero.ctaNote)}</p></div>`;

const wing = `<section class="ac-craft" id="wing" aria-labelledby="wing-title">
<figure class="ac-craft-img">${img(a, dims, '(max-width:860px) 92vw, 520px', { eager: true })}</figure>
<div class="ac-craft-body"><span class="eyebrow">${esc(copy.specs.eyebrow)}</span><h2 id="wing-title">${esc(copy.specs.h2)}</h2><p>${esc(copy.specs.intro)}</p>
<dl class="ac-specs">${specRows.map(([label, f]) => `<div><dt>${label}</dt><dd>${f(a)}</dd></div>`).join('')}</dl>
<p class="ac-credit">${smallPrint}</p>
<p class="ac-more"><a href="${esc(copy.more.href)}">${esc(copy.more.label)} <span aria-hidden="true">→</span></a></p></div></section>`;

const doing = sec('fly', 'ac-practice ac-doing', copy.doing.h2, copy.doing.items.map((i) => `<h3>${esc(i.h3)}</h3><p>${esc(i.p)}</p>`).join(''));
const controls = sec('controls', 'ac-practice', copy.controls.h2, paras(copy.controls.paragraphs));
const bites = sec('bites', 'ac-practice', copy.bites.h2, `<ul class="ac-bites">${copy.bites.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
const real = sec('real', 'ac-practice', copy.real.h2, `<p>${esc(copy.real.p)}</p><ul class="ac-links">${copy.real.links.map((l) => `<li>${link(l)}</li>`).join('')}</ul>`);
// copy.faqNote: the one small-print safety line, under the answers rather than inside one.
const faq = `<section class="ac-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">${esc(copy.faq.h2)}</h2>${copy.faq.items.map((f) =>
  `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}${f.link ? ` ${link(f.link)}.` : ''}</p></details>`).join('')}<p class="ac-note">${esc(copy.faqNote)}</p></section>`;
const final = `<section class="ac-final"><h2>${esc(copy.final.h2)}</h2><p>${esc(copy.final.lede)}</p>${btn(copy.final.cta)}</section>`;

const body = `<div class="ac-page ac-landing">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/nanawing/aircraft/">Nanawing aircraft</a> / ${esc(copy.crumb)}</nav>
${hero}
${wing}
${doing}
${controls}
${bites}
${real}
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
    { '@type': 'FAQPage', mainEntity: copy.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.link ? `${f.a} ${f.link.label}: ${site}${f.link.href}` : f.a } })) },
  ],
};

// What this page adds to the hangar page's stylesheet: the wing card sits right under the hero,
// and the text sections get their list and link styles.
const css = '.ac-landing .ac-actions{margin-bottom:10px}.ac-landing .ac-craft{margin-top:30px;padding-top:0;border-top:0}.ac-landing .ac-craft-img{align-self:start}.ac-more{margin:0;font-weight:700}.ac-doing h3{margin-top:24px}.ac-doing h2+h3{margin-top:0}.ac-bites{margin:0;padding-left:20px}.ac-bites li{margin:0 0 10px}.ac-links{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 28px}.ac-links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;text-underline-offset:4px}';

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
}));

// Stamp ?v= on every asset reference this wrote, as scripts/seo-content.mjs does.
const { planAssetVersions } = await import('./version-assets.mjs');
{ const plan = planAssetVersions(); for (const f of plan.changes) writeFileSync(f, plan.text.get(f)); if (plan.manifestStale) writeFileSync(new URL('../src/asset-versions.mjs', import.meta.url), plan.manifest); }
console.log(`wrote site${path}index.html`);
