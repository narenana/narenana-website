// narenana Wings — static site generator.
//
//   node wings/build.mjs        (or: npm run wings:build)
//
// Reads the curated catalogue (wings/data/kits.json) and emits prerendered HTML
// into site/wings/ — an index plus one page per kit, so every kit is crawlable
// without running JS. The umbrella Worker already serves site/ statically, so
// there is no separate deploy: /wings/ is live the moment master deploys.

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)
const OUT = fileURLToPath(new URL('site/wings/', ROOT))
const kits = JSON.parse(await readFile(fileURLToPath(new URL('wings/data/kits.json', ROOT)), 'utf8')).kits
const sources = JSON.parse(await readFile(fileURLToPath(new URL('wings/data/sources.json', ROOT)), 'utf8')).sources
const sourceById = Object.fromEntries(sources.map((s) => [s.id, s]))

const SITE = 'https://www.narenana.com'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN')

// --- domain helpers -------------------------------------------------------
// The cheapest ORDERABLE variant — deliberately not the range minimum. Several
// vendors' cheapest variant is the out-of-stock one, so a naive min() would
// quote a price nobody can actually pay.
function priceState(kit) {
  const vs = kit.variants ?? []
  const live = vs.filter((v) => v.inStock)
  if (live.length) return { kind: 'from', amount: Math.min(...live.map((v) => v.priceINR)) }
  if (vs.length) return { kind: 'oos', amount: Math.min(...vs.map((v) => v.priceINR)) }
  if (kit.importEstimateINR) return { kind: 'import', ...kit.importEstimateINR }
  return { kind: 'none' }
}

const AVAIL = {
  domestic: { label: 'In India', cls: 'ok' },
  'grey-import': { label: 'Grey import', cls: 'warn' },
  'not-available': { label: "Can't buy in India", cls: 'bad' },
}

// --- components -----------------------------------------------------------
const nav = () => `
  <header class="nav">
    <a class="nav-back" href="/">← narenana</a>
    <span class="nav-sep">/</span>
    <a class="nav-here" href="/wings/">wings</a>
  </header>`

function priceBlock(kit, big = false) {
  const p = priceState(kit)
  const c = big ? 'price price-lg' : 'price'
  if (p.kind === 'from') return `<div class="${c}"><span class="price-pre">from</span> ${inr(p.amount)}</div>`
  if (p.kind === 'oos') return `<div class="${c} is-muted"><span class="price-pre">was</span> ${inr(p.amount)}</div>`
  if (p.kind === 'import') return `<div class="${c} price-est is-muted">${inr(p.from)}–${inr(p.to)}<br /><span class="price-pre">landed, imported</span></div>`
  return `<div class="${c} is-muted">—</div>`
}

const badge = (kit) => {
  const a = AVAIL[kit.availability] ?? AVAIL.domestic
  const madeIn = kit.madeIn === 'IN' ? `<span class="badge made">Made in India</span>` : ''
  return `<span class="badge ${a.cls}">${a.label}</span>${madeIn}`
}

const flags = (kit) =>
  (kit.flags ?? []).map((f) => `<p class="flag flag-${f.level}"><strong>${f.level === 'warn' ? 'Heads up' : 'Note'}</strong> ${esc(f.text)}</p>`).join('')

function kitCard(kit) {
  const p = priceState(kit)
  const dead = kit.availability === 'not-available'
  const alt = kit.alternativeSlug ? kits.find((k) => k.slug === kit.alternativeSlug) : null
  return `
    <li>
      <a class="card ${dead ? 'is-dead' : ''}" href="/wings/${kit.slug}/">
        <div class="card-top">
          <div>
            <h3 class="card-title">${esc(kit.brand)} ${esc(kit.name)}</h3>
            <p class="card-meta">${kit.spanMM}mm${kit.auwG ? ` · ~${kit.auwG}g` : ''}</p>
          </div>
          ${priceBlock(kit)}
        </div>
        <p class="card-blurb">${esc(kit.blurb)}</p>
        <div class="card-foot">
          ${badge(kit)}
          ${p.kind === 'oos' ? '<span class="badge bad">Out of stock</span>' : ''}
        </div>
        ${alt ? `<p class="card-alt">Buy instead → <strong>${esc(alt.brand)} ${esc(alt.name)}</strong></p>` : ''}
      </a>
    </li>`
}

function page({ title, desc, slug, body, jsonld }) {
  const url = `${SITE}/wings/${slug ? slug + '/' : ''}`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0e1117" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="narenana" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${SITE}/assets/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-1KY518LPBH"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "G-1KY518LPBH");
    </script>
    ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
    <link rel="stylesheet" href="/wings/wings.css" />
  </head>
  <body>
    ${nav()}
    ${body}
    <footer class="foot">
      <p>Prices are checked against each seller's live listing and stamped with the date we saw them — always confirm on the seller's page before paying. Some links may be affiliate links.</p>
      <p><a href="/">narenana</a> · <a href="/log-viewer/">RC Log Viewer</a> · <a href="https://sim.narenana.com">Nanawing</a></p>
    </footer>
  </body>
</html>`
}

// --- index ----------------------------------------------------------------
const wings = kits.filter((k) => k.airframe === 'flying-wing')
const buyable = wings.filter((k) => k.availability === 'domestic')
const notBuyable = wings.filter((k) => k.availability !== 'domestic')
const cheapest = Math.min(...buyable.flatMap((k) => (k.variants ?? []).filter((v) => v.inStock).map((v) => v.priceINR)))

const indexBody = `
  <main class="wrap">
    <h1>Every flying wing you can<br /><span class="accent">actually buy in India.</span></h1>
    <p class="lede">Live prices from Indian sellers, checked by hand. Plus the honest answer to the question we get most: <em>should I import that wing I saw on YouTube?</em></p>

    <section class="insight">
      <h2 class="insight-h">Short answer: don't import.</h2>
      <p>The famous wings are effectively unobtainable here. A <strong>ZOHD Dart XL</strong> lands at <strong>₹25,000–30,000</strong> after shipping and duty — and arrives as a bare airframe with no motor, ESC or servos. The <strong>SonicModell AR Wing</strong> isn't sold in India at all.</p>
      <p>Meanwhile <strong>Vortex-RC build EPP wings in Bangalore from ${inr(cheapest)}</strong>, in stock, with crash spares and a GST invoice. For most people that's the whole answer.</p>
    </section>

    <h2 class="sec">Buy in India <span class="count">${buyable.length}</span></h2>
    <ul class="grid">${buyable.map(kitCard).join('')}</ul>

    <h2 class="sec">Asked about, but you can't really buy <span class="count">${notBuyable.length}</span></h2>
    <p class="sec-sub">Kept here on purpose — these are the ones people ask about. Each points at the domestic wing that does the same job.</p>
    <ul class="grid">${notBuyable.map(kitCard).join('')}</ul>
  </main>`

// --- kit page -------------------------------------------------------------
function kitPage(kit) {
  const p = priceState(kit)
  const src = sourceById[kit.source]
  const alt = kit.alternativeSlug ? kits.find((k) => k.slug === kit.alternativeSlug) : null
  const live = (kit.variants ?? []).filter((v) => v.inStock)

  const jsonld = kit.url && p.kind === 'from' ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${kit.brand} ${kit.name}`,
    description: kit.blurb,
    brand: { '@type': 'Brand', name: kit.brand },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: p.amount,
      highPrice: Math.max(...kit.variants.map((v) => v.priceINR)),
      offerCount: kit.variants.length,
      availability: 'https://schema.org/InStock',
      url: kit.url,
    },
  } : null

  const body = `
  <main class="wrap">
    <a class="crumb" href="/wings/">← all wings</a>
    <h1 class="kit-h">${esc(kit.brand)} ${esc(kit.name)}</h1>
    <div class="kit-badges">${badge(kit)}</div>
    <p class="lede">${esc(kit.blurb)}</p>

    <div class="kit-key">
      ${priceBlock(kit, true)}
      <dl class="spec">
        <div><dt>Wingspan</dt><dd>${kit.spanMM}mm</dd></div>
        ${kit.auwG ? `<div><dt>All-up weight</dt><dd>~${kit.auwG}g</dd></div>` : ''}
        <div><dt>Seller</dt><dd>${esc(src?.name ?? '—')}</dd></div>
        <div><dt>Price checked</dt><dd>${kit.checkedAt}</dd></div>
      </dl>
    </div>

    ${flags(kit)}

    ${kit.url ? `<a class="cta" href="${esc(kit.url)}" target="_blank" rel="noopener nofollow">View on ${esc(src?.name)} →</a>` : ''}
    ${src && src.taxIncluded === false ? `<p class="tax">Seller lists this price <strong>excluding tax/duty</strong> — the real number at checkout will be higher.</p>` : ''}

    ${live.length ? `
    <h2 class="sec">What you can order today</h2>
    <table class="vars">
      <thead><tr><th>Option</th><th>Price</th></tr></thead>
      <tbody>${live.map((v) => `<tr><td>${esc(v.label)}</td><td>${inr(v.priceINR)}</td></tr>`).join('')}</tbody>
    </table>
    ${kit.variants.length > live.length ? `<p class="sec-sub">${kit.variants.length - live.length} other option${kit.variants.length - live.length > 1 ? 's are' : ' is'} listed but out of stock.</p>` : ''}
    ` : ''}

    ${alt ? `
    <section class="insight">
      <h2 class="insight-h">Buy this instead</h2>
      <p><a href="/wings/${alt.slug}/"><strong>${esc(alt.brand)} ${esc(alt.name)}</strong></a> — ${esc(alt.blurb)}</p>
    </section>` : ''}

    <section class="recipes">
      <h2 class="sec">Build recipes</h2>
      <p class="sec-sub">Good / fast / endurance component picks for this airframe, with Indian buy links — coming next.</p>
    </section>
  </main>`

  return page({
    title: `${kit.brand} ${kit.name} — price in India (${kit.spanMM}mm FPV wing) | narenana`,
    desc: `${kit.brand} ${kit.name}: ${kit.blurb}`,
    slug: kit.slug,
    body,
    jsonld,
  })
}

// --- emit -----------------------------------------------------------------
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
await writeFile(new URL('index.html', `file://${OUT.replace(/\\/g, '/')}/`), page({
  title: 'Flying wing kits in India — live prices & what to buy | narenana',
  desc: 'Every FPV flying wing you can actually buy in India, with live prices from Indian sellers — and an honest look at whether importing a ZOHD Dart XL or AR Wing is worth it.',
  slug: '',
  body: indexBody,
}))
await writeFile(new URL('wings.css', `file://${OUT.replace(/\\/g, '/')}/`), await readFile(fileURLToPath(new URL('wings/wings.css', ROOT)), 'utf8'))

for (const kit of wings) {
  const dir = `${OUT}${kit.slug}/`
  await mkdir(dir, { recursive: true })
  await writeFile(new URL('index.html', `file://${dir.replace(/\\/g, '/')}`), kitPage(kit))
}

console.log(`wings: index + ${wings.length} kit pages -> site/wings/`)
console.log(`  buyable in India: ${buyable.length} · unobtainable: ${notBuyable.length} · cheapest live: ${inr(cheapest)}`)
