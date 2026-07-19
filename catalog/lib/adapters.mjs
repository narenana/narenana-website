// Seller-platform adapters. Pure fetch — run in Worker and CLI alike.
// Each returns products as:
//   { pid, url, title, priceINR, inStock, img, variants:[{vkey,label,priceINR,inStock}] }
// pid = the platform's own product id — PRIMARY identity (URLs get reused).
// Learned quirks live in source.notes in the DB; structural ones are comments.

import { canonicalUrl } from './util.mjs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

export async function getHtml(url, { tries = 2, timeoutMs = 8000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return await res.text()
      if (res.status === 404) return null
    } catch {}
    await new Promise((r) => setTimeout(r, 700 * (i + 1)))
  }
  return null
}

async function getJson(url, { tries = 2, timeoutMs = 9000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch {}
    await new Promise((r) => setTimeout(r, 900 * (i + 1)))
  }
  return null
}

const slugOf = (listUrl) => new URL(listUrl).pathname.split('/').filter(Boolean).pop() || null

// --- WooCommerce Store API ------------------------------------------------
// One feed page per call — the caller owns pagination (Free-plan budgets).
export async function wooPage(source, listUrl, page) {
  const origin = new URL(source.home_url).origin
  const slug = slugOf(listUrl)
  const cats = await getJson(`${origin}/wp-json/wc/store/v1/products/categories?per_page=100`)
  const id = Array.isArray(cats) ? (cats.find((c) => c.slug === slug)?.id ?? null) : null
  // No whole-shop fallback unless the source explicitly opts in (drkstore).
  if (!id && !/unscoped/i.test(source.notes ?? '')) return { error: `no category matches slug "${slug}"` }
  const cat = id ? `category=${id}&` : ''
  const rows = await getJson(`${origin}/wp-json/wc/store/v1/products?${cat}per_page=100&page=${page}`)
  if (!Array.isArray(rows)) return { products: [], done: true }
  const products = rows.map((p) => {
    const div = 10 ** (p.prices?.currency_minor_unit ?? 2)
    return {
      pid: String(p.id),
      url: canonicalUrl(p.permalink),
      title: (p.name || '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/<[^>]+>/g, ''),
      priceINR: p.prices?.price ? Math.round(Number(p.prices.price) / div) : null,
      inStock: p.is_in_stock !== false,
      img: p.images?.[0]?.src ?? null,
      variants: [],
    }
  })
  return { products, done: rows.length < 100, fetches: 2 }
}

// --- Shopify --------------------------------------------------------------
export async function shopifyPage(source, listUrl, page) {
  const d = await getJson(`${listUrl.replace(/\/$/, '')}/products.json?limit=250&page=${page}`)
  const rows = d?.products
  if (!Array.isArray(rows)) return { products: [], done: true }
  const origin = new URL(source.home_url).origin
  const products = rows.map((p) => ({
    pid: String(p.id),
    url: canonicalUrl(`${origin}/products/${p.handle}`),
    title: p.title || '',
    priceINR: p.variants?.[0]?.price ? Math.round(Number(p.variants[0].price)) : null,
    inStock: p.variants?.some((x) => x.available) ?? true,
    img: p.images?.[0]?.src ?? null,
    variants: (p.variants ?? []).slice(0, 12).map((v) => ({
      vkey: String(v.id),
      label: v.title || 'Standard',
      priceINR: Math.round(Number(v.price)),
      inStock: !!v.available,
    })),
  }))
  return { products, done: rows.length < 250, fetches: 1 }
}

// --- HTML (Zoho etc): listing page → product links; details need enrich ---
function productLinks(html, source, pageUrl) {
  const origin = new URL(source.home_url).origin
  const pat = source.platform === 'zoho' ? /^\/products\/.+/ : /^\/product\/[^/]+\/?$/
  const out = new Set()
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let u
    try {
      u = new URL(m[1], pageUrl)
    } catch {
      continue
    }
    if (u.origin !== origin || !pat.test(u.pathname)) continue
    if (/\/(page|category|tag|feed)\//.test(u.pathname)) continue
    out.add(canonicalUrl(u.toString()))
  }
  return [...out]
}

const titleFromUrl = (u) => {
  const segs = new URL(u).pathname.split('/').filter(Boolean).reverse()
  const name = segs.find((s) => /[a-z]/i.test(s) && s !== 'products')
  return name ? decodeURIComponent(name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

export async function htmlPage(source, listUrl, page) {
  // page N = follow "next" N times; cheap pages, but each is a subrequest.
  let url = listUrl
  for (let i = 1; i < page; i++) {
    const html = await getHtml(url)
    const m = html?.match(/rel=["']next["'][^>]+href=["']([^"']+)["']/i) || html?.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href="([^"]+)"/i)
    if (!m) return { products: [], done: true }
    url = new URL(m[1], url).toString()
  }
  const html = await getHtml(url)
  if (!html) return { products: [], done: true }
  const products = productLinks(html, source, url).map((u) => ({
    pid: null, // HTML sources have no feed id — Zoho URLs do embed one:
    url: u,
    title: titleFromUrl(u),
    priceINR: null,
    inStock: null,
    img: null,
    variants: [],
  }))
  // Zoho product URLs end in /<numeric id> — recover it as pid.
  for (const p of products) {
    const m = p.url.match(/\/(\d{12,})$/)
    if (m) p.pid = m[1]
  }
  const hasNext = /rel=["']next["']/.test(html) || /class="[^"]*next[^"]*"/.test(html)
  return { products, done: !hasNext, fetches: page }
}

export function feedPage(source, listUrl, page) {
  if (source.platform === 'woocommerce') return wooPage(source, listUrl, page)
  if (source.platform === 'shopify') return shopifyPage(source, listUrl, page)
  return htmlPage(source, listUrl, page)
}

// --- single-page enrichment / verification --------------------------------
function parseJsonLd(html) {
  for (const b of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data
    try {
      data = JSON.parse(b[1].trim())
    } catch {
      continue
    }
    const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data]
    for (const n of nodes) {
      const isP = n && (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product')))
      if (!isP) continue
      const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers
      const price = Number(offer?.price ?? offer?.lowPrice)
      if (!price) continue
      return { priceINR: Math.round(price), inStock: /InStock/i.test(String(offer.availability || '')) }
    }
  }
  return null
}

function parseWooVariants(html) {
  const m = html.match(/data-product_variations=(["'])(.*?)\1/s)
  if (!m) return null
  let arr
  try {
    arr = JSON.parse(m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"))
  } catch {
    return null
  }
  if (!Array.isArray(arr) || !arr.length) return null
  return arr.map((v) => ({
    vkey: String(v.variation_id ?? Object.values(v.attributes || {}).join('/')),
    label: Object.values(v.attributes || {}).filter(Boolean).join(' / ') || 'Standard',
    priceINR: Math.round(Number(v.display_price)),
    inStock: !!v.is_in_stock,
  }))
}

export function ogImageFrom(html, base) {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/data-large_image=["']([^"']+)["']/i)
  return m ? new URL(m[1], base).toString() : null
}

// Direct product-page check. { gone } | { priceINR, inStock, quoteOnly, variants?, img?, title? }
export async function checkPage(url, source) {
  const html = await getHtml(url)
  if (html === null) return { gone: true }
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = t ? t[1].replace(/\s*[|–—-]\s*[^|–—-]*$/, '').replace(/\s+/g, ' ').trim().slice(0, 140) : null
  const img = ogImageFrom(html, url)
  const vars = source?.platform === 'woocommerce' ? parseWooVariants(html) : null
  if (vars?.length) {
    const live = vars.filter((v) => v.inStock)
    return {
      title, img, variants: vars, quoteOnly: false,
      priceINR: live.length ? Math.min(...live.map((v) => v.priceINR)) : null,
      inStock: live.length > 0,
    }
  }
  const ld = parseJsonLd(html)
  if (ld) return { title, img, variants: [], quoteOnly: false, ...ld }
  return { title, img, variants: [], quoteOnly: true, priceINR: null, inStock: false }
}
