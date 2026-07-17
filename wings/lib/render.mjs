// Pure page rendering — data in, HTML string out. No fs, no globals, so the
// Worker renders /wings/* from KV at request time and the CLI can still emit a
// static snapshot from the same code.
//
// `data` = { kits, sourceById, recipes }. Only flying-wings that are live are
// passed in; filtering/availability decisions happen upstream.

const SITE = 'https://www.narenana.com'
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN')

export function priceState(kit) {
  const vs = kit.variants ?? []
  const live = vs.filter((v) => v.inStock)
  if (live.length) return { kind: 'from', amount: Math.min(...live.map((v) => v.priceINR)) }
  if (vs.length) return { kind: 'oos', amount: Math.min(...vs.map((v) => v.priceINR)) }
  return { kind: 'none' }
}

const recipesForKit = (kit, recipes) =>
  (recipes?.recipes ?? []).filter((r) => r.appliesTo.airframe === kit.airframe && kit.spanMM >= r.appliesTo.spanMM[0] && kit.spanMM <= r.appliesTo.spanMM[1])

function buildTotal(kit, recipes) {
  const p = priceState(kit)
  if (p.kind !== 'from') return null
  const rs = recipesForKit(kit, recipes)
  if (!rs.length) return null
  const totals = rs.map((r) => r.picks.reduce((n, x) => n + (recipes.components[x.id]?.priceINR ?? 0), 0))
  return p.amount + Math.min(...totals)
}

const nav = () => `
  <header class="nav">
    <a class="nav-back" href="/">← narenana</a><span class="nav-sep">/</span><a class="nav-here" href="/wings/">wings</a>
  </header>`

function priceBlock(kit, big = false) {
  const p = priceState(kit)
  const c = big ? 'price price-lg' : 'price'
  if (p.kind === 'from') return `<div class="${c}"><span class="price-pre">from</span> ${inr(p.amount)}</div>`
  if (p.kind === 'oos') return `<div class="${c} is-muted"><span class="price-pre">was</span> ${inr(p.amount)}</div>`
  return `<div class="${c} is-muted">—</div>`
}

const flags = (kit) => (kit.flags ?? []).map((f) => `<p class="flag flag-${f.level}"><strong>${f.level === 'warn' ? 'Heads up' : 'Note'}</strong> ${esc(f.text)}</p>`).join('')

function kitCard(kit, data) {
  const p = priceState(kit)
  const oos = p.kind === 'oos'
  const mrp = (kit.variants ?? []).find((v) => v.mrpINR)?.mrpINR
  const off = mrp && p.amount ? Math.round((1 - p.amount / mrp) * 100) : null
  const build = buildTotal(kit, data.recipes)
  return `
    <li class="prod" data-span="${kit.spanMM}" data-price="${p.amount ?? 999999}" data-stock="${oos ? '0' : '1'}" data-india="${kit.madeIn === 'IN' ? '1' : '0'}">
      <a class="prod-link" href="/wings/${kit.slug}/">
        <div class="prod-img">
          <img src="/wings/img/${kit.slug}" alt="${esc(kit.brand)} ${esc(kit.name)}" width="800" height="600" loading="lazy" onerror="this.style.display='none'" />
          ${kit.madeIn === 'IN' ? `<span class="tag tag-in">Made in India</span>` : ''}
          ${off && off > 10 ? `<span class="tag tag-off">${off}% off</span>` : ''}
          ${oos ? `<span class="prod-veil">Out of stock</span>` : ''}
        </div>
        <div class="prod-body">
          <p class="prod-brand">${esc(kit.brand)}</p>
          <h3 class="prod-name">${esc(kit.name)}</h3>
          <p class="prod-spec">${kit.spanMM}mm${kit.auwG ? ` · ${kit.auwG}g` : ''}</p>
          <div class="prod-price">${priceBlock(kit)}${mrp && !oos ? `<span class="mrp">${inr(mrp)}</span>` : ''}</div>
          ${build ? `<p class="prod-build">Flying build from <strong>${inr(build)}</strong></p>` : ''}
        </div>
      </a>
      <span class="prod-cta ${oos ? 'is-off' : ''}">${oos ? 'See options' : 'View & buy'}</span>
    </li>`
}

const STOCK = { 'in-stock': { l: 'In stock', c: 'ok' }, 'out-of-stock': { l: 'Out of stock', c: 'bad' }, 'pre-order': { l: 'Pre-order', c: 'warn' }, listed: { l: 'Listed', c: '' } }

function recipePanel(r, kit, active, recipes) {
  const picks = r.picks.map((p) => ({ ...p, c: recipes.components[p.id] })).filter((p) => p.c)
  const parts = picks.reduce((n, p) => n + p.c.priceINR, 0)
  const base = priceState(kit).kind === 'from' ? priceState(kit).amount : null
  const gaps = picks.filter((p) => p.c.stock === 'out-of-stock' || p.c.stock === 'pre-order')
  return `
  <div class="rp" data-panel="${r.id}" ${active ? '' : 'hidden'}>
    <p class="rp-sum">${esc(r.summary)}</p>
    <table class="vars rp-table"><thead><tr><th>Part</th><th>Pick</th><th>Price</th></tr></thead><tbody>
      ${picks.map((p) => {
        const s = STOCK[p.c.stock] ?? STOCK.listed
        return `<tr><td class="rp-role">${esc(p.role)}</td><td><a href="${esc(p.c.url)}" target="_blank" rel="noopener nofollow">${esc(p.c.name)}</a>${s.c ? `<span class="badge ${s.c} badge-sm">${s.l}</span>` : ''}${p.note || p.c.note ? `<span class="rp-note">${esc(p.note ?? p.c.note)}</span>` : ''}<span class="rp-vendor">${esc(p.c.vendor)}</span></td><td>${inr(p.c.priceINR)}</td></tr>`
      }).join('')}
    </tbody><tfoot>
      <tr><td colspan="2">Electronics</td><td>${inr(parts)}</td></tr>
      ${base ? `<tr><td colspan="2">Airframe (cheapest orderable)</td><td>${inr(base)}</td></tr>` : ''}
      ${base ? `<tr class="rp-total"><td colspan="2">Complete build ≈</td><td>${inr(parts + base)}</td></tr>` : ''}
    </tfoot></table>
    <p class="rp-foot">${gaps.length ? `<strong class="is-warn">${gaps.length} part${gaps.length > 1 ? 's are' : ' is'} out of stock or pre-order right now</strong> — the total is what it costs when everything's available, not what you can check out with today. ` : ''}Source: ${esc(r.source)}.</p>
  </div>`
}

function recipesFor(kit, recipes) {
  const rs = recipesForKit(kit, recipes)
  if (!rs.length) return `<section class="recipes"><h2 class="sec">Build recipes</h2><p class="sec-sub">No recipe for this size of wing yet.</p></section>`
  const note = recipes.marketNote
  return `
  <section class="recipes">
    <h2 class="sec">What to put in it</h2>
    <p class="sec-sub">Community-proven parts for this size of wing, priced at Indian sellers.</p>
    <div class="tabs" role="tablist">${rs.map((r, i) => `<button class="tab ${i === 0 ? 'is-on' : ''}" role="tab" data-tab="${r.id}">${esc(r.label)}</button>`).join('')}</div>
    ${rs.map((r, i) => recipePanel(r, kit, i === 0, recipes)).join('')}
    ${note ? `<p class="flag flag-warn"><strong>${esc(note.title)}</strong> ${esc(note.text)}</p>` : ''}
  </section>
  <script>document.querySelectorAll('.tab').forEach((t)=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach((x)=>x.classList.toggle('is-on',x===t));document.querySelectorAll('.rp').forEach((p)=>{p.hidden=p.dataset.panel!==t.dataset.tab})}))</script>`
}

export function page({ title, desc, slug, body, jsonld }) {
  const url = `${SITE}/wings/${slug ? slug + '/' : ''}`
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0e1117" />
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="canonical" href="${url}" />
<link rel="icon" href="/favicon.ico" sizes="any" /><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="narenana" /><meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:image" content="${SITE}/assets/og.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1KY518LPBH"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-1KY518LPBH")</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<link rel="stylesheet" href="/wings/wings.css" />
</head><body>
${nav()}
${body}
<footer class="foot"><p>Prices are checked against each seller's live listing and stamped with the date we saw them — always confirm on the seller's page before paying. Some links may be affiliate links.</p><p><a href="/">narenana</a> · <a href="/log-viewer/">RC Log Viewer</a> · <a href="https://sim.narenana.com">Nanawing</a></p></footer>
</body></html>`
}

export function renderIndex(data) {
  const wings = data.kits
  const inStock = wings.filter((k) => priceState(k).kind === 'from').length
  const sellers = new Set(wings.map((k) => k.source)).size
  const body = `
  <div class="shop-head"><div class="shop-head-in">
    <h1 class="shop-h1">Flying wing kits in India</h1>
    <p class="shop-sub">${wings.length} wings from ${sellers} sellers · ${inStock} in stock · live prices</p>
  </div></div>
  <main class="shop">
    <div class="bar">
      <div class="chips">
        <button class="chip is-on" data-f="all">All <span>${wings.length}</span></button>
        <button class="chip" data-f="stock">In stock <span>${inStock}</span></button>
        <button class="chip" data-f="india">Made in India <span>${wings.filter((k) => k.madeIn === 'IN').length}</span></button>
        <button class="chip" data-f="small">Under 1m <span>${wings.filter((k) => k.spanMM < 1000).length}</span></button>
        <button class="chip" data-f="big">1m and up <span>${wings.filter((k) => k.spanMM >= 1000).length}</span></button>
      </div>
      <label class="sort">Sort <select id="sort"><option value="stock">In stock first</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="span-asc">Wingspan: small to large</option></select></label>
    </div>
    <ul class="prods" id="prods">${wings.map((k) => kitCard(k, data)).join('')}</ul>
    <p class="empty" id="empty" hidden>Nothing matches that filter.</p>
  </main>
  <script>
    const grid=document.getElementById('prods'),items=[...grid.children];
    const tests={all:()=>true,stock:(e)=>e.dataset.stock==='1',india:(e)=>e.dataset.india==='1',small:(e)=>+e.dataset.span<1000,big:(e)=>+e.dataset.span>=1000};
    let filter='all';
    const sorts={stock:(a,b)=>b.dataset.stock-a.dataset.stock||a.dataset.price-b.dataset.price,'price-asc':(a,b)=>a.dataset.price-b.dataset.price,'price-desc':(a,b)=>b.dataset.price-a.dataset.price,'span-asc':(a,b)=>a.dataset.span-b.dataset.span};
    function apply(){let s=0;items.forEach((e)=>{const ok=tests[filter](e);e.hidden=!ok;if(ok)s++});document.getElementById('empty').hidden=s>0}
    document.querySelectorAll('.chip').forEach((c)=>c.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach((x)=>x.classList.toggle('is-on',x===c));filter=c.dataset.f;apply()}));
    document.getElementById('sort').addEventListener('change',(e)=>{[...items].sort(sorts[e.target.value]).forEach((el)=>grid.appendChild(el))});
    [...items].sort(sorts.stock).forEach((el)=>grid.appendChild(el));
  </script>`
  return page({ title: 'Flying wing kits in India — live prices & what to buy | narenana', desc: 'Every FPV flying wing you can buy in India, with live prices from Indian sellers, and the complete-build cost for each.', slug: '', body })
}

export function renderKit(kit, data) {
  const p = priceState(kit)
  const src = data.sourceById[kit.source]
  const live = (kit.variants ?? []).filter((v) => v.inStock)
  const jsonld = kit.url && p.kind === 'from' ? {
    '@context': 'https://schema.org', '@type': 'Product', name: `${kit.brand} ${kit.name}`, description: kit.blurb,
    brand: { '@type': 'Brand', name: kit.brand }, image: `${SITE}/wings/img/${kit.slug}`,
    offers: { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: p.amount, highPrice: Math.max(...kit.variants.map((v) => v.priceINR)), offerCount: kit.variants.length, availability: 'https://schema.org/InStock', url: kit.url },
  } : null
  const body = `
  <main class="wrap">
    <a class="crumb" href="/wings/">← all wings</a>
    <h1 class="kit-h">${esc(kit.brand)} ${esc(kit.name)}</h1>
    <p class="lede">${esc(kit.blurb)}</p>
    <div class="kit-key">
      ${priceBlock(kit, true)}
      <dl class="spec">
        <div><dt>Wingspan</dt><dd>${kit.spanMM}mm</dd></div>
        ${kit.auwG ? `<div><dt>All-up weight</dt><dd>~${kit.auwG}g</dd></div>` : ''}
        <div><dt>Seller</dt><dd>${esc(src?.name ?? '—')}</dd></div>
        <div><dt>Price checked</dt><dd>${esc(kit.checkedAt ?? '—')}</dd></div>
      </dl>
    </div>
    ${flags(kit)}
    ${kit.url ? `<a class="cta" href="${esc(kit.url)}" target="_blank" rel="noopener nofollow">View on ${esc(src?.name)} →</a>` : ''}
    ${src && src.taxIncluded === false ? `<p class="tax">Seller lists this price <strong>excluding tax/duty</strong> — the checkout number will be higher.</p>` : ''}
    ${live.length ? `<h2 class="sec">What you can order today</h2><table class="vars"><thead><tr><th>Option</th><th>Price</th></tr></thead><tbody>${live.map((v) => `<tr><td>${esc(v.label)}</td><td>${inr(v.priceINR)}</td></tr>`).join('')}</tbody></table>${kit.variants.length > live.length ? `<p class="sec-sub">${kit.variants.length - live.length} other option${kit.variants.length - live.length > 1 ? 's are' : ' is'} listed but out of stock.</p>` : ''}` : ''}
    ${recipesFor(kit, data.recipes)}
  </main>`
  return page({ title: `${kit.brand} ${kit.name} — price in India (${kit.spanMM}mm FPV wing) | narenana`, desc: `${kit.brand} ${kit.name}: ${kit.blurb}`, slug: kit.slug, body, jsonld })
}
