// Public pages, rendered from D1 at request time.
//   /<prefix>/            category grid of LIVE master models
//   /<prefix>/<slug>/     master page: specs + config-grouped offers table
//
// Liveness is DERIVED: a master renders when status='ready' AND it has ≥1
// approved offer. A master whose offers are all dead/OOS keeps its page with
// "last seen ₹X on <date>" — pages only vanish when the owner retires them.

import { esc, inr } from './util.mjs'

// Site IDENTITY (domain, analytics id) is code config; all product/market
// content — masters, offers, recipes, components — arrives as arguments,
// straight from D1. This module holds zero content.
const SITE = 'https://www.narenana.com'
const dateOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—')

export function page({ title, desc, path, body, jsonld, noindex, image }) {
  const url = `${SITE}${path}`
  const og = image ?? `${SITE}/assets/og.jpg`
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#F3EEE0" />
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="canonical" href="${url}" />${noindex ? '<meta name="robots" content="noindex" />' : ''}
<link rel="icon" href="/favicon.ico" sizes="any" /><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="narenana" /><meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:image" content="${esc(og)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${esc(og)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Grand+Hotel&family=Hanken+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
<script>if(location.hostname==='www.narenana.com'){var _g=document.createElement('script');_g.async=1;_g.src='https://www.googletagmanager.com/gtag/js?id=G-1KY518LPBH';document.head.appendChild(_g);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-1KY518LPBH")}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<link rel="stylesheet" href="/catalog.css" />
</head><body>
<header class="nav"><a class="nav-back" href="/">narenana</a><span class="nav-sep">/</span><a class="nav-here" href="${esc(path.split('/').slice(0, 2).join('/'))}/">${esc(path.split('/')[1])}</a>
<span class="nav-grow"></span>
<div class="shr"><button id="shr-btn" class="shr-btn" aria-haspopup="true" aria-expanded="false"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>Share</button>
<div id="shr-menu" class="shr-menu" role="menu">
<p class="shr-k">Share this page</p>
<a id="shr-wa" target="_blank" rel="noopener" role="menuitem"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.3c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.6.8 1.9.8 2 .1.1.1.3 0 .5-.3.6-.7.9-.5 1.2.7 1.2 1.6 2 2.8 2.6.3.2.5.1.7-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.4 0 .1 0 .7-.2 1.3z"/></svg>WhatsApp</a>
<a id="shr-x" target="_blank" rel="noopener" role="menuitem"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.5 22H3.4l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2zm-1.1 18h1.7L7.3 3.7H5.5L17.8 20z"/></svg>X / Twitter</a>
<button id="shr-cp" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>Copy link</button>
<button id="shr-nt" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>More options</button>
</div></div></header>
${body}
<footer class="foot"><p>Prices come from each seller's live listing and carry the date we last confirmed them — always check the seller's page before paying.</p>
<p><a class="wordmark" href="/">narenana</a> &nbsp;·&nbsp; <a href="/log-viewer/">RC Log Viewer</a> · <a href="https://sim.narenana.com">Nanawing simulator</a> · <a href="https://www.youtube.com/@narenana" rel="noopener">YouTube</a></p></footer>
<script>(function(){var b=document.getElementById('shr-btn'),m=document.getElementById('shr-menu');if(!b)return;
function u(s){var x=new URL(location.origin+location.pathname);x.searchParams.set('utm_source',s);x.searchParams.set('utm_medium','share');x.searchParams.set('utm_campaign','wings');return x.toString()}
var t=document.title.replace(/\\s*\\|[^|]*$/,'').trim();
b.onclick=function(e){e.stopPropagation();var on=m.classList.toggle('on');b.setAttribute('aria-expanded',on)};
document.addEventListener('click',function(){m.classList.remove('on');b.setAttribute('aria-expanded','false')});
m.addEventListener('click',function(e){e.stopPropagation()});
document.getElementById('shr-wa').href='https://wa.me/?text='+encodeURIComponent(t+' — '+u('whatsapp'));
document.getElementById('shr-x').href='https://twitter.com/intent/tweet?text='+encodeURIComponent(t)+'&url='+encodeURIComponent(u('x'));
document.getElementById('shr-cp').onclick=function(){var el=this;navigator.clipboard.writeText(u('copy')).then(function(){el.textContent='Copied ✓';setTimeout(function(){el.textContent='Copy link'},1400)})};
var n=document.getElementById('shr-nt');
if(navigator.share){n.onclick=function(){navigator.share({title:t,url:u('native')}).catch(function(){})}}else{n.style.display='none'}
})()</script>
</body></html>`
}

// Power class from a listing's text. LOGIC is in code; the text (engine
// markers — displacement, glow size, fuel) is DATA, living in seller titles.
// gas/nitro when such a marker is present; electric is the common default
// (foam, PNP, EDF, brushless).
export function powerType(text = '') {
  const t = String(text).toLowerCase()
  if (/\b\d{2,3}\s*cc\b/.test(t)) return 'gas' // 35cc, 100cc, 60cc (covers 50-60cc)
  if (/(^|[\s(/])\.\d{2}\b/.test(t)) return 'gas' // .46, .61 glow engine size
  if (/\b(nitro|glow|petrol|gasoline|2[\s-]?stroke|4[\s-]?stroke)\b/.test(t)) return 'gas'
  return 'electric'
}

// Card price: cheapest orderable across base-config offers. Never a pack/combo
// price masquerading as the unit price.
function masterCard(m, prefix) {
  const price = m.min_price
  const oos = !m.any_stock
  const hero = m.hero_any ?? m.hero_image // hero_any = offer-sku fallback (grid query)
  return `
    <li class="prod" data-price="${price ?? 999999}" data-stock="${oos ? 0 : 1}" data-power="${m.power}"${m.power === 'gas' ? ' style="display:none"' : ''}>
      <a class="prod-link" href="${prefix}/${esc(m.slug)}/">
        <div class="prod-img">
          ${hero ? `<img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="800" height="600" loading="lazy" />` : '<div class="prod-noimg">No image</div>'}
          ${oos ? '<span class="prod-veil">Out of stock</span>' : ''}
        </div>
        <div class="prod-body">
          <p class="prod-brand">${esc(m.brand)}</p>
          <h3 class="prod-name">${esc(m.name)}</h3>
          <p class="prod-spec">${esc(specLine(m))}</p>
          <div class="prod-price">${price ? `<div class="price"><span class="price-pre">${oos ? 'was' : 'from'}</span> ${inr(price)}</div>` : '<div class="price is-muted">—</div>'}
            ${m.sellers > 1 ? `<span class="mrp" style="text-decoration:none">${m.sellers} sellers</span>` : ''}</div>
        </div>
        <span class="prod-cta ${oos ? 'is-off' : ''}">${oos ? 'See details' : m.sellers > 1 ? `Compare ${m.sellers} sellers` : 'View & buy'}</span>
      </a>
    </li>`
}

const specLine = (m) => {
  try {
    const s = JSON.parse(m.specs || '{}')
    return [s.spanMM && `${s.spanMM}mm`, s.auwG && `${s.auwG}g`].filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

export function renderGrid(cat, masters) {
  // Power class per master, derived from its offers' seller titles (engine
  // markers). Electric is the default view; gas/nitro filtered in on demand.
  const live = masters.map((m) => ({ ...m, power: powerType(m.titles ?? `${m.brand} ${m.name} ${m.specs ?? ''}`) }))
  const nElec = live.filter((m) => m.power === 'electric').length
  const nGas = live.filter((m) => m.power === 'gas').length
  const filt = `
    <div class="filt" role="tablist" aria-label="Power type">
      <button class="filt-b is-on" data-power="electric">Electric <span>${nElec}</span></button>
      <button class="filt-b" data-power="gas">Gas / Nitro <span>${nGas}</span></button>
      <button class="filt-b" data-power="all">All <span>${live.length}</span></button>
    </div>`
  const body = `
  <div class="shop-head"><div class="shop-head-in">
    <p class="shop-kicker">narenana catalog</p>
    <h1 class="shop-h1">${esc(cat.name)} in India</h1>
    <p class="shop-sub"><span id="shop-count">${nElec}</span> <span id="shop-count-label">electric</span> in stock · live prices from Indian sellers</p>
    <p class="shop-intro">Kits, PNP and ready-to-fly aircraft from Indian hobby shops, in one place. Prices and stock come from each seller's live listing and are re-checked through the day — every card opens a spec sheet, and every offer links straight to the seller.</p>
    ${filt}
  </div></div>
  <main class="shop">
    <ul class="prods">${live.map((m) => masterCard(m, cat.path_prefix)).join('')}</ul>
    ${live.length === 0 ? '<p class="empty">Nothing live yet.</p>' : ''}
    <p class="empty" id="filt-empty" hidden>Nothing in this category right now.</p>
  </main>
  <script>(function(){
    var btns=document.querySelectorAll('.filt-b');if(!btns.length)return;
    var count=document.getElementById('shop-count'),label=document.getElementById('shop-count-label'),empty=document.getElementById('filt-empty');
    var LBL={electric:'electric',gas:'gas / nitro',all:''};
    function apply(p){
      btns.forEach(function(b){b.classList.toggle('is-on',b.dataset.power===p)});
      var shown=0;
      document.querySelectorAll('.prods .prod').forEach(function(li){
        var vis=(p==='all'||li.dataset.power===p);li.style.display=vis?'':'none';if(vis)shown++;
      });
      count.textContent=shown;label.textContent=LBL[p];empty.hidden=shown>0;
      try{history.replaceState(null,'',p==='electric'?location.pathname:location.pathname+'?power='+p)}catch(e){}
    }
    btns.forEach(function(b){b.onclick=function(){apply(b.dataset.power)}});
    var init=new URLSearchParams(location.search).get('power');
    apply(init==='gas'||init==='all'?init:'electric');
  })()</script>`
  const jsonld = live.length
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'narenana', item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: `${cat.name} in India` },
            ],
          },
          {
            '@type': 'ItemList',
            name: `${cat.name} in India`,
            numberOfItems: live.length,
            itemListElement: live.slice(0, 24).map((m, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: `${m.brand} ${m.name}`,
              url: `${SITE}${cat.path_prefix}/${m.slug}/`,
            })),
          },
        ],
      }
    : null
  return page({
    title: `${cat.name} in India — compare live prices | narenana`,
    desc: `Every ${cat.name.toLowerCase().replace(/^./, (c) => c)} you can buy in India — kits, PNP and RTF, with live prices and stock compared across Indian hobby shops.`,
    path: `${cat.path_prefix}/`,
    body,
    jsonld,
    noindex: live.length === 0, // an empty category must not get indexed
  })
}

function recipesFor(recipes, components) {
  if (!recipes?.length) return ''
  const panel = (r, active) => {
    let picks = []
    try {
      picks = JSON.parse(r.picks)
    } catch {}
    picks = picks.map((p) => ({ ...p, c: components[p.component_id] })).filter((p) => p.c)
    const parts = picks.reduce((n, p) => n + (p.c.price_inr ?? 0), 0)
    return `<div class="rp" data-panel="${r.id}" ${active ? '' : 'hidden'}>
      <p class="rp-sum">${esc(r.summary ?? '')}</p>
      <table class="vars rp-table"><tbody>
        ${picks.map((p) => `<tr><td class="rp-role">${esc(p.role)}</td><td><a href="${esc(p.c.url)}" target="_blank" rel="noopener nofollow">${esc(p.c.name)}</a><span class="rp-vendor">${esc(p.c.vendor ?? '')}</span></td><td>${p.c.price_inr ? inr(p.c.price_inr) : '—'}</td></tr>`).join('')}
      </tbody><tfoot><tr class="rp-total"><td colspan="2">Electronics ≈</td><td>${inr(parts)}</td></tr></tfoot></table>
    </div>`
  }
  return `<section class="recipes"><h2 class="sec">What to put in it</h2>
    <div class="tabs">${recipes.map((r, i) => `<button class="tab ${i === 0 ? 'is-on' : ''}" data-tab="${r.id}">${esc(r.label)}</button>`).join('')}</div>
    ${recipes.map((r, i) => panel(r, i === 0)).join('')}
    <script>document.querySelectorAll('.tab').forEach((t)=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach((x)=>x.classList.toggle('is-on',x===t));document.querySelectorAll('.rp').forEach((p)=>{p.hidden=p.dataset.panel!==t.dataset.tab})}))</script>
  </section>`
}

export function renderMaster(cat, m, offers, recipes = [], components = {}) {
  let specs = {}
  try {
    specs = JSON.parse(m.specs || '{}')
  } catch {}
  const schema = (() => {
    try {
      return JSON.parse(cat.spec_schema)
    } catch {
      return []
    }
  })()

  const liveOffers = offers.filter((o) => !o.dead && o.in_stock)
  const configs = [...new Set(offers.map((o) => o.config))]
  // Min over PRESENT prices only — data-poor offers (price NULL until a scan
  // or verify fills it) must render as "—", never as ₹∞ from Math.min().
  const minOf = (arr) => {
    const v = arr.map((o) => o.price_inr).filter(Boolean)
    return v.length ? Math.min(...v) : null
  }
  const liveMin = minOf(liveOffers)
  const seenMin = minOf(offers)
  const offerRow = (o) => `
    <tr class="${o.dead || !o.in_stock ? 'is-dim' : ''}">
      <td>${o.dead ? esc(o.source_name) : `<a class="offer-seller" href="${esc(o.url_canonical)}" target="_blank" rel="noopener nofollow">${esc(o.source_name)} ↗</a>`}${o.grey_import ? ' <span class="badge warn badge-sm">import</span>' : ''}${o.made_in_india ? ' <span class="badge made badge-sm">Made in India</span>' : ''}</td>
      <td>${esc(o.config)}${o.pack_qty > 1 ? ` ×${o.pack_qty}` : ''}</td>
      <td>${o.flagged ? `<span title="price under review">${o.price_inr ? inr(o.price_inr) : '—'}*</span>` : o.price_inr ? inr(o.price_inr) : '—'}<span class="rp-note">as of ${dateOf(o.last_checked ?? o.last_seen)}</span></td>
      <td>${o.dead ? '<span class="badge bad badge-sm">gone</span>' : o.in_stock ? '<span class="badge ok badge-sm">In stock</span>' : '<span class="badge bad badge-sm">Out of stock</span>'}</td>
      <td>${o.dead ? '' : `<a class="cta cta-buy" href="${esc(o.url_canonical)}" target="_blank" rel="noopener nofollow">Buy&nbsp;→</a>`}</td>
    </tr>`

  const productLd = liveOffers.length && liveMin ? {
    '@type': 'Product',
    name: `${m.brand} ${m.name}`, brand: { '@type': 'Brand', name: m.brand }, description: m.blurb ?? undefined,
    image: m.hero_image ? `${SITE}/img/master/${m.id}` : undefined,
    offers: {
      '@type': 'AggregateOffer', priceCurrency: 'INR',
      lowPrice: liveMin,
      highPrice: Math.max(...liveOffers.map((o) => o.price_inr).filter(Boolean)),
      offerCount: liveOffers.length, availability: 'https://schema.org/InStock',
    },
  } : null
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'narenana', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: `${cat.name} in India`, item: `${SITE}${cat.path_prefix}/` },
          { '@type': 'ListItem', position: 3, name: `${m.brand} ${m.name}` },
        ],
      },
      ...(productLd ? [productLd] : []),
    ],
  }

  const body = `
  <main class="wrap">
    <a class="crumb" href="${cat.path_prefix}/">← all ${esc(cat.name.toLowerCase())}</a>
    <h1 class="kit-h">${esc(m.brand)} ${esc(m.name)}</h1>
    ${m.blurb ? `<p class="lede">${esc(m.blurb)}</p>` : ''}
    <div class="kit-key">
      ${m.hero_image || offers.some((o) => o.image_url) ? `<div class="kit-img"><img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="800" height="600" /></div>` : ''}
      ${liveMin
        ? `<div class="price price-lg"><span class="price-pre">from</span> ${inr(liveMin)}</div>`
        : seenMin
          ? `<div class="price price-lg is-muted"><span class="price-pre">last seen</span> ${inr(seenMin)}</div>`
          : ''}
      <dl class="spec">
        ${schema.filter((f) => specs[f.key] != null && specs[f.key] !== '').map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(String(specs[f.key]))}${f.unit ?? ''}</dd></div>`).join('')}
      </dl>
    </div>
    <h2 class="sec">Where to buy${configs.length > 1 ? ' <span class="count">by configuration</span>' : ''}</h2>
    <table class="vars"><thead><tr><th>Seller</th><th>Config</th><th>Price</th><th>Stock</th><th></th></tr></thead>
      <tbody>${offers.map(offerRow).join('')}</tbody></table>
    ${offers.some((o) => o.tax_included === 0) ? '<p class="tax">Some sellers list prices <strong>excluding tax/duty</strong> — checkout totals will be higher.</p>' : ''}
    ${recipesFor(recipes, components)}
  </main>`
  return page({
    title: `${m.brand} ${m.name} — price in India | narenana`,
    desc: m.blurb || `${m.brand} ${m.name}: prices compared across ${offers.length} Indian seller listing${offers.length === 1 ? '' : 's'}.`,
    path: `${cat.path_prefix}/${m.slug}/`,
    body, jsonld,
    image: m.hero_image ? `${SITE}/img/master/${m.id}` : undefined,
  })
}
