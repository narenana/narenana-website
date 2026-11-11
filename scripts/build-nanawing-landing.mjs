// Builds one aircraft's landing page on www from content/ (the content home of
// docs/site-consolidation-plan.md, M3), e.g. /chupito/:
//   node scripts/build-nanawing-landing.mjs content/nanawing/chupito-simulator.json
// Facts (the specs, the maker credit, the play link) come from content/_facts/nanawing.json;
// the copy from the page's own JSON. The page shares the hangar page's shell, stylesheet and
// spec figures (nanawing-render.mjs), so the two never show different numbers.
// The layout is a product page (owner, 24 Oct 2026: "think Apple product page"): a sticky
// product nav, a dark centred hero with the real wing under the headline, the videos, a dark
// band for the sim (stat tiles, then the habits to learn), the bundles side by side, then the
// prints, the log viewer, the thanks, the questions and a dark closing band.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { site, page } from './page-shell.mjs';
import { esc, ext, play, IMG, ALT, imageDims, img, specRows, YT_LIGHTBOX } from './nanawing-render.mjs';

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

const btn = (label, cls = '') => `<a class="ac-btn${cls ? ` ${cls}` : ''}" href="${fly}" ${ext}>${esc(label)} <span aria-hidden="true">↗</span></a>`;
// An outbound text link keeps its arrow on the same line as its last word.
const link = (l) => (/^https?:/.test(l.href)
  ? `<a href="${esc(l.href)}" ${ext}>${esc(l.label)}&nbsp;<span aria-hidden="true">↗</span></a>`
  : `<a href="${esc(l.href)}">${esc(l.label)}</a>`);
const paras = (list) => list.map((p) => `<p>${esc(p)}</p>`).join('');
const sec = (id, cls, h2, inner) => `<section class="${cls}" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${esc(h2)}</h2>${inner}</section>`;
const links = (list) => `<ul class="ac-links">${list.map((l) => `<li>${link(l)}</li>`).join('')}</ul>`;

// Videos: click-to-play cards that open the modal player (YT_LIGHTBOX). Only well-formed YouTube
// ids reach the markup. A published date is an ISO string (the channel feed) or epoch seconds.
const YT_ID = /^[A-Za-z0-9_-]{6,15}$/;
const videos = copy.watch.groups.flatMap((g) => g.videos);
for (const v of videos) if (!YT_ID.test(v.id)) throw new Error(`Bad video id: ${v.id}`);
const publishedIso = (p) => (typeof p === 'number' ? new Date(p * 1000) : new Date(p)).toISOString();
const videoCard = (v) => `<li><a class="ac-yt" href="https://www.youtube.com/watch?v=${v.id}" data-yt="${v.id}" ${ext}><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async"><span class="ac-yt-play" aria-hidden="true">▶</span><span class="sr-only">Play: ${esc(v.title)}</span></a><p class="ac-yt-title">${esc(v.title)}</p><p class="ac-yt-by">${esc(v.channel)}</p></li>`;

// The one small-print line about the recreation, under the spec tiles. Its credit and link come
// from the facts, so the maker's terms (credited and linked wherever the aircraft is shown)
// cannot be lost in a copy edit.
const makerUrl = a.credit.url ?? a.credit.designerUrl;
const makerLink = `<a href="${esc(makerUrl)}" ${ext}>${esc(a.credit.designer)}&nbsp;<span aria-hidden="true">↗</span></a>`;
const smallPrint = `${esc(copy.smallPrint)} ${a.credit.kind === 'reference' ? 'Reference airframe by' : 'Aircraft design by'} ${makerLink}.`;

// The product nav: the wing's name, the page's stops and the play button; it sticks to the top
// as the page scrolls, so the way into the sim is never more than one tap away.
const jumps = `<nav class="ac-jumps" aria-label="On this page">${copy.hero.jumps.map((j) => `<a href="${esc(j.href)}">${esc(j.label)}</a>`).join('')}</nav>`;
const subnav = `<div class="ac-subnav"><div class="ac-subnav-in"><a class="ac-subnav-name" href="#hero-title">${esc(a.name)}</a>${jumps}${btn(copy.hero.navCta, 'ac-btn-nav')}</div></div>`;

// The hero: the words first (eyebrow, the tagline as the H1, one line, the play button and the
// way to the bundles), then the wing itself: the maker's photographs, made into the page's
// pictures by Astra (owner, 24 Oct 2026), sized by scripts/build-landing-images.mjs. The pictures
// show this aircraft and nothing else (docs/landing-pages.md, H2); a square crop serves phones.
// The maker is credited under the picture, as their terms ask wherever the wing appears.
const heroImg = copy.hero.image;
const HERO = (w) => `/assets/nanawing/${heroImg.file}-${w}.webp`;
const heroMeta = await sharp(`site${HERO(heroImg.widths[1] ?? heroImg.widths[0])}`).metadata();
const phoneSrc = heroImg.phone ? `<source media="(max-width:599px)" srcset="${heroImg.phone.widths.map((w) => `/assets/nanawing/${heroImg.phone.file}-${w}.webp ${w}w`).join(', ')}" sizes="100vw">` : '';
const hero = `<section class="ac-hero-band" aria-labelledby="hero-title">
<div class="ac-hero-in"><span class="eyebrow">${esc(copy.hero.eyebrow)}</span><h1 id="hero-title">${esc(copy.hero.h1)}</h1><p class="ac-hero-sub">${esc(copy.hero.sub)}</p>
<div class="ac-actions">${btn(copy.hero.cta)}<a class="ac-hero-buy" href="#buy">${esc(copy.hero.buyLabel)} <span aria-hidden="true">→</span></a></div>
<p class="ac-note">${esc(copy.hero.ctaNote)}</p></div>
<picture class="ac-hero-pic">${phoneSrc}<img class="ac-hero-bg" src="${HERO(heroImg.widths[1] ?? heroImg.widths[0])}" srcset="${heroImg.widths.map((w) => `${HERO(w)} ${w}w`).join(', ')}" sizes="(max-width:1400px) 100vw, 1400px" alt="${esc(heroImg.alt)}" width="${heroMeta.width}" height="${heroMeta.height}" fetchpriority="high" decoding="async"></picture>
<p class="ac-hero-credit">${esc(heroImg.creditLead)} ${makerLink}.</p></section>
<p class="lede ac-hero-lede">${esc(copy.hero.lede)}</p>`;

// The sim band: the recreation's render, the owner's heading, the figures as tiles, the small
// print, the play button; then the habits to learn, on a real in-sim frame.
const wing = `<section class="ac-craft" id="wing" aria-labelledby="wing-title">
<figure class="ac-craft-img">${img(a, dims, '(max-width:860px) 92vw, 720px')}</figure>
<div class="ac-craft-body"><span class="eyebrow">${esc(copy.specs.eyebrow)}</span><h2 id="wing-title">${esc(copy.specs.h2)}</h2>${copy.specs.intro ? `<p>${esc(copy.specs.intro)}</p>` : ''}
<dl class="ac-stats">${specRows.map(([label, f]) => `<div><dt>${label}</dt><dd>${f(a)}</dd></div>`).join('')}</dl>
<p class="ac-credit">${smallPrint}</p>
<p class="ac-more">${btn(copy.hero.cta)}</p></div></section>`;

// The frame is optional until captured (the build warns, the section renders without it).
const flyImg = copy.fly.image;
const FLY = (w) => `/assets/nanawing/${flyImg.file}-${w}.webp`;
const flyHas = existsSync(`site${FLY(flyImg.widths[0])}`);
const flyMeta = flyHas ? await sharp(`site${FLY(flyImg.widths[0])}`).metadata() : null;
if (!flyHas) console.warn(`warning: no in-sim frame at site${FLY(flyImg.widths[0])}; the section renders without it`);
const flyFigure = flyHas
  ? `<figure class="ac-fly-shot"><img src="${FLY(flyImg.widths[0])}" srcset="${flyImg.widths.map((w) => `${FLY(w)} ${w}w`).join(', ')}" sizes="(max-width:1180px) 100vw, 1132px" alt="${esc(flyImg.alt)}" width="${flyMeta.width}" height="${flyMeta.height}" loading="lazy" decoding="async"><figcaption>${esc(flyImg.caption).replace("{maker}", makerLink)}</figcaption></figure>`
  : '';
const flyBlocks = `<div class="ac-fly-grid">${copy.fly.blocks.map((b) => `<div class="ac-fly-card"><h3>${esc(b.h3)}</h3><ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`;
const flySection = sec('fly', 'ac-practice ac-fly', copy.fly.h2, `${flyFigure}${flyBlocks}`);
const stage = `<div class="ac-stage"><div class="ac-stage-in">${wing}${flySection}</div></div>`;

// Groups with several videos get a full-width grid under their heading; groups with one video sit
// two to a row on wide screens, each heading above its card, so no card is left alone in a row.
// Two rows on a laptop (owner, 24 Oct 2026): one four-column grid where a group spans as many
// columns as it has videos, so the owner's three flights and the first single fill row one and
// the next four singles fill row two. Two columns on a tablet, one on a phone.
const videoGroup = (g) => `<div class="ac-watch-group" style="--n:${g.videos.length}"><h3>${esc(g.h3)}</h3><ul class="ac-videos">${g.videos.map(videoCard).join('')}</ul></div>`;
const watch = `<section class="ac-practice ac-watch" id="watch" aria-labelledby="watch-title"><h2 id="watch-title">${esc(copy.watch.h2)}</h2><p>${esc(copy.watch.intro)}</p><div class="ac-watch-grid">${copy.watch.groups.map(videoGroup).join('')}</div></section>`;

// The price line is a slot: the Worker fills it per request from the catalog (src/wings-live.js);
// the fallback sentence stays when the catalog has nothing to say.
// One card per bundle (copy.buy.variants), side by side on a wide screen: what is in the box, who
// it is for, and a slot the Worker fills with that bundle's listings (src/wings-live.js:
// offersTable). A hidden card takes any listing that matches no bundle.
// A landing picture written by scripts/build-landing-images.mjs (400/800 wide), or nothing yet.
const pic = (base, alt, sizes, cls) => {
  const file = (w) => `/assets/nanawing/${base}-${w}.webp`;
  if (!existsSync(`site${file(400)}`)) { console.warn(`warning: no picture at site${file(400)}; run npm run landing:images`); return ''; }
  return `<img class="${cls}" src="${file(400)}" srcset="${file(400)} 400w, ${file(800)} 800w" sizes="${sizes}" alt="${esc(alt)}" width="400" height="300" loading="lazy" decoding="async">`;
};
const variantCard = (v) => `<article class="ac-variant" id="buy-${esc(v.id)}">${v.image ? pic(`${a.id}-bundle-${v.id}`, v.image.alt, '(max-width:959px) 92vw, 360px', 'ac-variant-pic') : ''}<h3>${esc(v.name)}</h3><p class="ac-variant-sub">${esc(v.sub)}</p><p>${esc(v.includes)}</p><p>${esc(v.pick)}</p><div class="ac-offers" data-wings-offers="${esc(copy.wingsSlug)}:${esc(v.id)}"><p class="ac-note">${esc(copy.buy.tableFallback)}</p></div></article>`;
const variants = `<div class="ac-variants">${copy.buy.variants.map(variantCard).join('')}<article class="ac-variant ac-variant-other" id="buy-other" hidden><h3>${esc(copy.buy.otherName)}</h3><div class="ac-offers" data-wings-offers="${esc(copy.wingsSlug)}:other"></div></article></div><p class="ac-note ac-centre">${esc(copy.buy.note)}${copy.buy.photoCredit ? ` ${esc(copy.buy.photoCredit).replace('{maker}', makerLink)}` : ''}</p>`;
const buy = sec('buy', 'ac-practice ac-buy', copy.buy.h2, `<p class="ac-live" data-wings="${esc(copy.wingsSlug)}">${esc(copy.buy.fallback)}</p>${variants}<p class="ac-centre">${esc(copy.buy.p)}</p>${links(copy.buy.links)}`);
// The logs section: a picture of the log viewer with the Chupito in it (Astra's, from a real
// screenshot; copy.logs.image), then the copy and the links.
const logImg = copy.logs.image;
const LOGPIC = (w) => `/assets/nanawing/${logImg?.file}-${w}.webp`;
const logHas = logImg && existsSync(`site${LOGPIC(logImg.widths[0])}`);
if (logImg && !logHas) console.warn(`warning: no log-viewer picture at site${LOGPIC(logImg.widths[0])}; run npm run landing:images`);
const logFigure = logHas
  ? `<figure class="ac-log-shot"><img src="${LOGPIC(logImg.widths[0])}" srcset="${logImg.widths.map((w) => `${LOGPIC(w)} ${w}w`).join(', ')}" sizes="(max-width:1180px) 100vw, 1132px" alt="${esc(logImg.alt)}" width="1600" height="1000" loading="lazy" decoding="async"><figcaption>${esc(logImg.caption)}</figcaption></figure>`
  : '';
const logs = sec('logs', 'ac-practice ac-logs', copy.logs.h2, `${logFigure}${paras(copy.logs.paragraphs)}${copy.logs.note ? `<p class="ac-note">${esc(copy.logs.note)}</p>` : ''}${links(copy.logs.links)}`);
// 3D prints: a curated list from the model sites, each a link to its designer's own page with the
// designer's own preview picture (scripts/fetch-print-images.mjs). data-print and
// data-print-group let the Worker drop a print the weekly check has retired (src/prints-live.js).
const printItem = (p) => `<li data-print="${esc(p.id)}">${p.master ? `<a class="ac-print-pic" href="${esc(p.href)}" ${ext} tabindex="-1" aria-hidden="true">${pic(`${a.id}-print-${p.id}`, p.alt || p.title, '(max-width:599px) 92vw, (max-width:959px) 45vw, 360px', 'ac-print-img')}</a>` : ''}<a href="${esc(p.href)}" ${ext}>${esc(p.title)}&nbsp;<span aria-hidden="true">↗</span></a><span class="ac-print-by">${esc(p.by)} · ${esc(p.site)}</span><p>${esc(p.what)}</p></li>`;
// The owner's own build: each part, what he flies, and the alternates he would stand behind.
// Optional: rendered only once the list is in the page's JSON.
const build = copy.build
  ? sec('build', 'ac-practice ac-build', copy.build.h2, `<p>${esc(copy.build.intro)}</p><div class="ac-table-wrap" role="region" aria-labelledby="build-title" tabindex="0"><table class="ac-table ac-build-table"><thead><tr><th scope="col">Part</th><th scope="col">${esc(copy.build.mineLabel)}</th><th scope="col">${esc(copy.build.altLabel)}</th></tr></thead><tbody>${copy.build.items.map((p) =>
    `<tr><th scope="row">${esc(p.part)}</th><td>${p.href ? `<a href="${esc(p.href)}" ${ext}>${esc(p.mine)}&nbsp;<span aria-hidden="true">↗</span></a>` : esc(p.mine)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td>${(p.alternates || []).map(esc).join(', ') || '—'}</td></tr>`).join('')}</tbody></table></div>${copy.build.note ? `<p class="ac-note">${esc(copy.build.note)}</p>` : ''}`)
  : '';
const prints = copy.prints
  ? `<section class="ac-practice ac-prints" id="prints" aria-labelledby="prints-title"><h2 id="prints-title">${esc(copy.prints.h2)}</h2><p>${esc(copy.prints.intro)}</p>${copy.prints.groups.map((g, i) =>
    `<div class="ac-print-group" data-print-group="${i}"><h3>${esc(g.h3)}</h3><ul class="ac-print-list">${g.items.map(printItem).join('')}</ul></div>`).join('')}${copy.prints.note ? `<p class="ac-note">${esc(copy.prints.note)}</p>` : ''}</section>`
  : '';
// The owner's thank-you to the maker, with links to their site and the product page. Optional.
const thanks = copy.thanks ? sec('thanks', 'ac-practice ac-thanks', copy.thanks.h2, `${paras(copy.thanks.paragraphs)}${links(copy.thanks.links)}`) : '';
// copy.faqNote: the one small-print safety line, under the answers rather than inside one.
const faq = `<section class="ac-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">${esc(copy.faq.h2)}</h2>${copy.faq.items.map((f) =>
  `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}${f.link ? ` ${link(f.link)}.` : ''}</p></details>`).join('')}<p class="ac-note">${esc(copy.faqNote)}</p></section>`;
const final = `<section class="ac-final" id="go" aria-labelledby="go-title"><h2 id="go-title">${esc(copy.final.h2)}</h2><p>${esc(copy.final.lede)}</p>${btn(copy.final.cta)}</section>`;

const body = `<div class="ac-page ac-landing">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/nanawing/aircraft/">Nanawing aircraft</a> / ${esc(copy.crumb)}</nav>
${subnav}
${hero}
${watch}
${stage}
${buy}
${build}
${prints}
${logs}
${thanks}
${faq}
${final}
</div>`;

const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': site + path, url: site + path, name: copy.title, description: copy.description, isPartOf: { '@id': site + '/#website' }, about: { '@id': 'https://sim.narenana.com/#app' }, primaryImageOfPage: { '@type': 'ImageObject', url: `${site}${HERO(heroImg.widths[1] ?? heroImg.widths[0])}` } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' },
      { '@type': 'ListItem', position: 2, name: 'Nanawing aircraft', item: site + '/nanawing/aircraft/' },
      { '@type': 'ListItem', position: 3, name: copy.crumb, item: site + path },
    ] },
    { '@type': 'FAQPage', mainEntity: copy.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.link ? `${f.a} ${f.link.label}: ${f.link.href.startsWith('#') ? site + path : site}${f.link.href}` : f.a } })) },
    // The sim itself, free in the browser: what a search for the aircraft's simulator should find.
    { '@type': 'SoftwareApplication', '@id': 'https://sim.narenana.com/#app', name: 'Nanawing', url: 'https://sim.narenana.com/', applicationCategory: 'GameApplication', applicationSubCategory: 'FPV flight simulator', operatingSystem: 'Web browser', offers: { '@type': 'Offer', price: 0, priceCurrency: 'INR' }, description: `A free FPV wing simulator in your browser: fly the ${a.name} and race it on ${facts.courses.length} courses.` },
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

// What this page adds to the hangar page's stylesheet. The dark colour is the family's navy
// (#0d1d2a); the hero and share pictures fade to the same value at their edges.
const DARK = '#0d1d2a';
const css = [
  // Every jump target clears the sticky product nav.
  'html,body{overflow-x:clip}.ac-landing [id]{scroll-margin-top:72px}',
  // The sticky product nav.
  `.ac-subnav{position:sticky;top:0;z-index:20;margin:0 calc(50% - 50vw);background:rgba(13,29,42,.94);-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px);color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}`,
  '.ac-subnav-in{max-width:1180px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:18px;min-height:54px}',
  '.ac-subnav-name{font:700 20px/1 "Barlow Condensed",sans-serif;letter-spacing:.02em;color:#fff;text-decoration:none;white-space:nowrap}',
  '.ac-jumps{display:flex;flex-wrap:wrap;gap:0 18px}.ac-jumps a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;text-underline-offset:4px}',
  '.ac-landing .ac-subnav .ac-subnav-name{color:#fff}.ac-subnav .ac-jumps{margin-left:auto;gap:0 22px;flex-wrap:nowrap}.ac-landing .ac-subnav .ac-jumps a{color:#c9d7e2;font-weight:500;font-size:14px;min-height:54px;white-space:nowrap;text-decoration:none}.ac-landing .ac-subnav .ac-jumps a:hover{color:#fff}',
  '.ac-btn-nav{min-height:36px;padding:6px 16px;font-size:14px;border-radius:999px;margin-left:8px}',
  '@media(max-width:899px){.ac-subnav .ac-jumps{display:none}.ac-btn-nav{margin-left:auto}}',
  // The hero: words, then the wing.
  `.ac-hero-band{margin:0 calc(50% - 50vw);background:${DARK};color:#fff;text-align:center;overflow:hidden}`,
  '.ac-hero-in{max-width:1000px;margin:0 auto;padding:clamp(26px,4.5vh,52px) 24px 0;box-sizing:border-box}',
  '.ac-hero-band .eyebrow{color:#8fc7ee}',
  '.ac-hero-band h1{color:#fff;font-size:clamp(2.35rem,5vw,4.5rem);line-height:.98;margin:12px auto 14px;max-width:22ch;text-wrap:balance}',
  '.ac-hero-sub{margin:0 auto 22px;font:700 clamp(1.2rem,2.4vw,1.8rem)/1.25 "Barlow Condensed",sans-serif;color:#ffd08a}',
  '.ac-hero-band .ac-actions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:14px 28px;margin:0 0 10px}',
  '.ac-landing .ac-hero-band .ac-hero-buy{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:#fff;font-weight:700;text-underline-offset:4px}',
  '.ac-hero-band .ac-note{color:#9fb3c2;margin:0}',
  // The pictures carry plain dark space above the wing; the words sit over it, so the wing shows sooner.
  '.ac-hero-in{position:relative;z-index:1}.ac-hero-pic{display:block;max-width:1400px;margin:calc(-1 * clamp(24px,7vh,80px)) auto 0}',
  `.ac-hero-bg{display:block;width:100%;height:auto;max-height:min(64vh,660px);object-fit:contain;background:${DARK}}`,
  '.ac-hero-credit{max-width:1180px;margin:0 auto;padding:4px 24px 20px;font-size:12px;color:#9fb3c2}.ac-hero-credit a{color:#dbe6ee}',
  '.ac-hero-lede{margin:30px auto 0;max-width:64ch;text-align:center;font-size:1.1rem}',
  '@media(max-width:599px){.ac-hero-bg{max-height:none}.ac-hero-band h1{font-size:2.4rem}}',
  // Section rhythm: big centred headings, one centred line, then the content.
  '.ac-landing .ac-practice{margin-top:clamp(56px,9vh,96px);max-width:none}',
  '.ac-landing .ac-practice>h2,.ac-landing .ac-faq>h2{text-align:center;font-size:clamp(30px,4.4vw,48px);line-height:1.05;max-width:22ch;margin:0 auto 12px;text-wrap:balance}',
  '.ac-landing .ac-practice>h2+p{text-align:center;max-width:62ch;margin:0 auto 26px}',
  '.ac-centre{text-align:center;max-width:64ch;margin-left:auto;margin-right:auto}',
  '.ac-landing .ac-faq{margin-top:clamp(56px,9vh,96px)}.ac-landing .ac-faq>h2{margin-bottom:18px}',
  // The dark sim band.
  `.ac-stage{margin:clamp(56px,9vh,96px) calc(50% - 50vw) 0;padding:clamp(48px,8vh,96px) 24px;background:${DARK};color:#fff}`,
  '.ac-stage-in{max-width:1180px;margin:0 auto}',
  '.ac-stage .eyebrow{color:#8fc7ee}.ac-stage h2,.ac-stage h3{color:#fff}.ac-stage p,.ac-stage li{color:#dbe6ee}.ac-stage a{color:#fff}.ac-stage .ac-note,.ac-stage .ac-credit{color:#9fb3c2}.ac-stage .ac-credit a{color:#dbe6ee}',
  '.ac-stage .ac-craft{display:block;margin:0;padding:0;border:0}',
  '.ac-stage .ac-craft-img{max-width:760px;margin:0 auto 26px;padding:0;background:none;border:0}.ac-stage .ac-craft-img img{display:block;width:100%;height:auto;filter:drop-shadow(0 24px 40px rgba(0,0,0,.5))}',
  '.ac-stage .ac-craft-body{text-align:center;max-width:1000px;margin:0 auto}.ac-stage .ac-craft-body h2{font-size:clamp(30px,4.4vw,48px);line-height:1.05;margin:10px auto 12px;max-width:22ch;text-wrap:balance}',
  '.ac-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 24px;margin:26px 0 0;padding:0}',
  // Values sit at the top of each tile, so a two-line figure (the battery) keeps the row aligned.
  '.ac-stats div{display:flex;flex-direction:column-reverse;justify-content:flex-end;gap:4px;border-top:1px solid rgba(255,255,255,.16);padding-top:14px}',
  ".ac-stats dt{font:500 11px/1.5 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#8fc7ee}",
  '.ac-stats dd{margin:0;font:700 clamp(1.7rem,3.2vw,2.5rem)/1.05 "Barlow Condensed",sans-serif;color:#fff}',
  '@media(min-width:640px){.ac-stats{grid-template-columns:repeat(4,minmax(0,1fr))}}',
  '.ac-stage .ac-credit{margin:22px auto 0;font-size:13px;max-width:64ch}.ac-stage .ac-more{margin:18px 0 0;font-weight:700}',
  '.ac-stage .ac-fly{margin-top:clamp(48px,8vh,88px)}.ac-stage .ac-fly>h2{color:#fff}.ac-stage .ac-fly>h2+p{color:#dbe6ee}',
  '.ac-fly{max-width:none}.ac-fly-shot{margin:0 0 20px}.ac-fly-shot img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid rgba(255,255,255,.12)}.ac-fly-shot figcaption{font-size:12px;color:#9fb3c2;margin-top:8px;text-align:center}',
  '.ac-fly-grid{display:grid;gap:14px}.ac-fly-card{padding:18px 20px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.05)}.ac-fly-card h3{margin:0 0 10px}.ac-fly-card ul{margin:0;padding-left:18px}.ac-fly-card li{margin:0 0 8px;font-size:15px}',
  '@media(min-width:860px){.ac-fly-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  // The modal player.
  '.ac-yt-dialog{width:min(96vw,1120px);max-width:none;margin:auto;padding:0;border:0;border-radius:8px;background:#000;overflow:visible}.ac-yt-dialog::backdrop{background:rgba(5,10,16,.86)}.ac-yt-stage{aspect-ratio:16/9;width:100%;background:#000;border-radius:8px;overflow:hidden}.ac-yt-stage iframe{width:100%;height:100%;border:0;display:block}',
  '.ac-yt-close{position:absolute;right:0;top:-48px;width:44px;height:44px;border:0;border-radius:4px;background:#fff;color:#15191c;font:400 28px/1 "DM Sans",sans-serif;cursor:pointer}.ac-yt-close:focus-visible{outline:3px solid var(--ac-orange);outline-offset:2px}',
  // Watch.
  '.ac-watch-grid{display:grid;gap:26px 18px;grid-template-columns:minmax(0,1fr);margin-top:8px}.ac-watch-group{display:flex;flex-direction:column;min-width:0}.ac-watch h3{margin:0 0 10px;font-size:21px;line-height:1.15}.ac-watch .ac-videos{grid-template-columns:repeat(var(--n),minmax(0,1fr));margin:0}.ac-yt-by{margin:2px 0 0;font-size:12px;color:var(--ac-muted)}@media(max-width:699px){.ac-watch .ac-videos{grid-template-columns:minmax(0,1fr)}}@media(min-width:700px){.ac-watch-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ac-watch-group[style*="--n:3"]{grid-column:1/-1}}@media(min-width:1000px){.ac-watch-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.ac-watch-group{grid-column:span var(--n)}.ac-watch-group[style*="--n:3"]{grid-column:span 3}.ac-watch h3{min-height:2.3em}}',
  // Buy: the bundles side by side, each with its listings stacked as rows at every width.
  '.ac-live{font-size:17px;text-align:center;max-width:64ch;margin:0 auto 22px}.ac-live strong{color:#C63B2E}',
  '.ac-variants{display:grid;gap:16px;margin:0 0 12px}@media(min-width:960px){.ac-variants{grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}.ac-variant-other{grid-column:1/-1}}',
  ".ac-variant-pic{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:contain;background:#fff;border-radius:10px;margin:0 0 14px}.ac-variant{padding:20px 20px 16px;border:1px solid var(--ac-line);border-radius:12px;background:var(--ac-sky)}.ac-variant h3{margin:0 0 2px;font-size:28px}.ac-variant .ac-variant-sub{margin:0 0 12px;font:600 15px/1.35 'DM Sans',sans-serif;color:var(--ac-ink)}.ac-variant p{margin:0 0 8px;font-size:15px}.ac-variant .ac-offers{margin:12px 0 0}.ac-variant .ac-offers .ac-note{margin:0}.ac-variant .ac-table-wrap{background:#fff}",
  '.ac-offers{margin:14px 0 18px}.ac-offers .ac-table-wrap{overflow:visible}.ac-offers-table{width:100%;min-width:0;border-collapse:collapse;font-size:14px;line-height:1.35;background:#fff;display:block}.ac-offers-table thead{display:none}.ac-offers-table tbody{display:block}',
  ".ac-offers-table tr{display:grid;grid-template-columns:1fr auto;grid-template-areas:'seller price' 'config price' 'stock buy';gap:2px 12px;align-items:start;padding:12px 14px;border-bottom:1px solid var(--ac-line)}.ac-offers-table tbody tr:last-child{border-bottom:0}.ac-offers-table th,.ac-offers-table td{display:block;padding:0;border:0;text-align:left}",
  ".ac-offers-table tbody th{font-weight:700}.ac-offers-table small{display:block;font-weight:400;font-size:12px;color:var(--ac-muted);margin-top:2px}.ac-offer-seller{grid-area:seller}.ac-offer-config{grid-area:config;color:var(--ac-muted);font-size:13px}.ac-offer-price{grid-area:price;text-align:right;font:600 15px/1.3 'JetBrains Mono',monospace;white-space:nowrap}.ac-offer-price small{font-family:'DM Sans',sans-serif;white-space:normal}.ac-offer-held{font:600 13px/1.3 'DM Sans',sans-serif;color:var(--ac-muted);white-space:normal}",
  ".ac-offer-badge{display:inline-block;margin-left:6px;padding:1px 7px;border:1px solid var(--ac-line);border-radius:999px;font:500 10px/1.5 'JetBrains Mono',monospace;letter-spacing:.04em;text-transform:uppercase;color:var(--ac-muted)}.ac-offer-stock{grid-area:stock;align-self:end;font-size:13px}.ac-offer-buy{grid-area:buy;justify-self:end;margin-top:6px}",
  '.ac-btn-sm{min-height:40px;padding:8px 14px;font-size:14px}.ac-btn-quiet{background:#fff;border:1px solid var(--ac-line);color:var(--ac-ink)!important}.ac-btn-quiet:hover{background:var(--ac-paper)}.ac-offers-table .is-oos th a,.ac-offers-table .is-oos td,.ac-offers-table .is-gone th,.ac-offers-table .is-gone td{color:var(--ac-muted)}.ac-offers-table .is-live .ac-offer-stock{color:#2E7D4F;font-weight:700}',
  '.ac-buy .ac-links{justify-content:center}',
  // The build table, the prints, the logs, the thanks.
  '.ac-build .ac-table{min-width:0}.ac-build .ac-table th,.ac-build .ac-table td{white-space:normal;vertical-align:top}.ac-build-table small{display:block;font-size:12px;color:var(--ac-muted);margin-top:2px}',
  '.ac-prints h3{margin-top:28px}.ac-print-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:12px}.ac-print-list li{padding:14px 16px;border:1px solid var(--ac-line);border-radius:10px;background:#fff;overflow:hidden}.ac-print-pic{display:block;margin:-14px -16px 12px;text-decoration:none}.ac-print-img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:contain;background:#fff;border-bottom:1px solid var(--ac-line)}.ac-print-list a{font-weight:700}.ac-print-by{display:block;font-size:12px;color:var(--ac-muted);margin-top:2px}.ac-print-list p{margin:6px 0 0;font-size:15px}@media(min-width:600px){.ac-print-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:960px){.ac-print-list{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '.ac-log-shot{margin:0 0 24px}.ac-log-shot img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--ac-line);box-shadow:0 18px 40px rgba(13,29,42,.12)}.ac-log-shot figcaption{font-size:12px;color:var(--ac-muted);margin-top:8px;text-align:center}.ac-logs p,.ac-thanks p{text-align:center;max-width:64ch;margin:0 auto 14px}.ac-logs .ac-links,.ac-thanks .ac-links{justify-content:center}',
  '.ac-links{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 28px}.ac-links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;text-underline-offset:4px}',
  // The closing band.
  `.ac-landing .ac-final{margin:clamp(56px,9vh,96px) calc(50% - 50vw) 0;padding:clamp(48px,8vh,96px) 24px;border:0;border-radius:0;background:${DARK};color:#fff}.ac-landing .ac-final h2{color:#fff;font-size:clamp(30px,4.4vw,48px);line-height:1.05;max-width:22ch;margin:0 auto 12px;text-wrap:balance}.ac-landing .ac-final p{color:#dbe6ee;max-width:60ch;margin:0 auto 22px}`,
].join('');

mkdirSync(`site${path}`, { recursive: true });
writeFileSync(`site${path}index.html`, page({
  path,
  title: copy.title,
  description: copy.description,
  image: `${site}${copy.social.image}`,
  social: copy.social,
  body,
  schema,
  // The share card's real size and type, so link previews lay it out before fetching it.
  head: `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/jpeg"><link rel="stylesheet" href="/assets/nanawing-aircraft.css?v=862eb507d2"><style>${css}</style>`,
  scripts: YT_LIGHTBOX,
}));

// Stamp ?v= on every asset reference this wrote, as scripts/seo-content.mjs does.
const { planAssetVersions } = await import('./version-assets.mjs');
{ const plan = planAssetVersions(); for (const f of plan.changes) writeFileSync(f, plan.text.get(f)); if (plan.manifestStale) writeFileSync(new URL('../src/asset-versions.mjs', import.meta.url), plan.manifest); }
console.log(`wrote site${path}index.html`);
