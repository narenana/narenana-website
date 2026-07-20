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
<header class="nav"><a class="nav-back" href="/">narenana</a><span class="nav-sep">/</span><a class="nav-here" href="${esc(path.split('/').slice(0, 2).join('/'))}/">${esc(path.split('/')[1])}</a></header>
${body}
<footer class="foot"><p>Prices come from each seller's live listing and carry the date we last confirmed them — always check the seller's page before paying.</p>
<p><a class="wordmark" href="/">narenana</a> &nbsp;·&nbsp; <a href="/log-viewer/">RC Log Viewer</a> · <a href="https://sim.narenana.com">Nanawing simulator</a> · <a href="https://www.youtube.com/@narenana" rel="noopener">YouTube</a></p></footer>
</body></html>`
}

// Card price: cheapest orderable across base-config offers. Never a pack/combo
// price masquerading as the unit price.
function masterCard(m, prefix) {
  const price = m.min_price
  const oos = !m.any_stock
  const hero = m.hero_any ?? m.hero_image // hero_any = offer-sku fallback (grid query)
  return `
    <li class="prod" data-price="${price ?? 999999}" data-stock="${oos ? 0 : 1}">
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
  const live = masters
  const body = `
  <div class="shop-head"><div class="shop-head-in">
    <p class="shop-kicker">narenana catalog</p>
    <h1 class="shop-h1">${esc(cat.name)} in India</h1>
    <p class="shop-sub">${live.length} in stock right now · live prices from Indian sellers</p>
    <p class="shop-intro">Kits, PNP and ready-to-fly aircraft from Indian hobby shops, in one place. Prices and stock come from each seller's live listing and are re-checked through the day — every card opens a spec sheet, and every offer links straight to the seller.</p>
  </div></div>
  <main class="shop">
    <ul class="prods">${live.map((m) => masterCard(m, cat.path_prefix)).join('')}</ul>
    ${live.length === 0 ? '<p class="empty">Nothing live yet.</p>' : ''}
  </main>`
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
      <td>${esc(o.source_name)}${o.grey_import ? ' <span class="badge warn badge-sm">import</span>' : ''}${o.made_in_india ? ' <span class="badge made badge-sm">Made in India</span>' : ''}</td>
      <td>${esc(o.config)}${o.pack_qty > 1 ? ` ×${o.pack_qty}` : ''}</td>
      <td>${o.flagged ? `<span title="price under review">${o.price_inr ? inr(o.price_inr) : '—'}*</span>` : o.price_inr ? inr(o.price_inr) : '—'}<span class="rp-note">as of ${dateOf(o.last_checked ?? o.last_seen)}</span></td>
      <td>${o.dead ? '<span class="badge bad badge-sm">gone</span>' : o.in_stock ? '<span class="badge ok badge-sm">In stock</span>' : '<span class="badge bad badge-sm">Out of stock</span>'}</td>
      <td>${o.dead ? '' : `<a class="cta" style="padding:7px 14px;font-size:.82rem" href="${esc(o.url_canonical)}" target="_blank" rel="noopener nofollow">Buy →</a>`}</td>
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
