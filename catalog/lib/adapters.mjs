// Seller-platform adapters. Pure fetch — run in Worker and CLI alike.
// Each returns products as:
//   { pid, url, title, priceINR, inStock, img, variants:[{vkey,label,priceINR,inStock}] }
// pid = the platform's own product id — PRIMARY identity (URLs get reused).
// Learned quirks live in source table FLAGS (e.g. unscoped_ok); prose notes
// are for humans only and never drive behavior.

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
// Cursor-based: each call does ONE feed-page fetch and returns nextCursor
// (JSON-safe) or null when the URL's whole SUBTREE is exhausted. A root
// category expands into its descendant categories automatically — the owner
// adds one root URL and the scan walks the tree.
export async function wooPage(source, listUrl, cursor) {
  const origin = new URL(source.home_url).origin
  let { cats, catIdx = 0, page = 1 } = cursor ?? {}
  let fetches = 1
  if (!cats) {
    // First call for this URL: resolve the root category and its descendants.
    const all = await getJson(`${origin}/wp-json/wc/store/v1/products/categories?per_page=100`)
    fetches++
    const rows = Array.isArray(all) ? all : []
    const root = rows.find((c) => c.slug === slugOf(listUrl))
    if (!root) {
      // No whole-shop fallback unless the source row opts in via unscoped_ok.
      if (!source.unscoped_ok) return { error: `no category matches slug "${slugOf(listUrl)}"` }
      cats = [null] // unscoped: one pass over the whole shop
    } else {
      const kids = (id) => rows.filter((c) => c.parent === id).map((c) => c.id)
      const tree = [root.id]
      for (let i = 0; i < tree.length && tree.length < 25; i++) tree.push(...kids(tree[i]))
      cats = tree
    }
  }
  const cat = cats[catIdx] != null ? `category=${cats[catIdx]}&` : ''
  const rows = await getJson(`${origin}/wp-json/wc/store/v1/products?${cat}per_page=100&page=${page}`)
  const list = Array.isArray(rows) ? rows : []
  const products = list.map((p) => {
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
  const pageDone = list.length < 100
  const next = pageDone
    ? catIdx + 1 < cats.length
      ? { cats, catIdx: catIdx + 1, page: 1 }
      : null
    : { cats, catIdx, page: page + 1 }
  return { products, nextCursor: next, fetches, subtree: cats.length }
}

// --- Shopify --------------------------------------------------------------
// Collections don't nest in Shopify — pagination covers the whole collection.
export async function shopifyPage(source, listUrl, cursor) {
  const page = cursor?.page ?? 1
  const d = await getJson(`${listUrl.replace(/\/$/, '')}/products.json?limit=250&page=${page}`)
  const rows = d?.products
  if (!Array.isArray(rows)) return { products: [], nextCursor: null, fetches: 1 }
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
  return { products, nextCursor: rows.length < 250 ? null : { page: page + 1 }, fetches: 1 }
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

// Cursor = { queue:[listing URLs to visit], idx } — starts at the root and
// grows with pagination "next" links AND sub-category links found under the
// root path, so one root URL covers its whole subtree (bounded at 20 pages).
export async function htmlPage(source, listUrl, cursor) {
  const cur = cursor?.queue ? cursor : { queue: [listUrl], idx: 0 }
  const url = cur.queue[cur.idx]
  if (!url) return { products: [], nextCursor: null, fetches: 0 }
  const html = await getHtml(url)
  if (!html) {
    const nextIdx = cur.idx + 1
    return { products: [], nextCursor: nextIdx < cur.queue.length ? { ...cur, idx: nextIdx } : null, fetches: 1 }
  }
  const rootPath = new URL(listUrl).pathname.replace(/\/$/, '')
  const origin = new URL(source.home_url).origin
  const push = (u) => {
    const c = canonicalUrl(u)
    if (c && !cur.queue.includes(c) && cur.queue.length < 20) cur.queue.push(c)
  }
  // pagination
  const nx = html.match(/rel=["']next["'][^>]+href=["']([^"']+)["']/i) || html.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href="([^"]+)"/i)
  if (nx) try { push(new URL(nx[1], url).toString()) } catch {}
  // sub-category links strictly UNDER the root path (never siblings — that
  // discipline is what keeps a category root from becoming a whole-shop crawl)
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], url)
      // Sub-categories are PATHS: drop query variants (?orderby, ?min_price,
      // ?add-to-cart…) or one listing multiplies into a junk queue that eats
      // the whole scan budget. /page/N is pagination's job (next-link chain);
      // /feed etc. are excluded by the TAIL under root (rootPath itself may
      // legitimately contain words like "product-category").
      u.search = ''
      u.hash = ''
      const tail = u.pathname.replace(/\/$/, '').slice(rootPath.length)
      if (u.origin === origin && tail.length > 1 && u.pathname.startsWith(rootPath + '/') && !/\/(product|products|page|feed|tag|category)(\/|$)/.test(tail))
        push(u.toString())
    } catch {}
  }
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
  const nextIdx = cur.idx + 1
  return {
    products,
    nextCursor: nextIdx < cur.queue.length ? { queue: cur.queue, idx: nextIdx } : null,
    fetches: 1,
    subtree: cur.queue.length,
  }
}

// feedPage(source, listUrl, cursor) → { products, nextCursor|null, fetches,
// subtree?, error? }. nextCursor===null means the URL's whole subtree
// (pagination + child categories) is exhausted for this sweep.
export function feedPage(source, listUrl, cursor) {
  if (source.platform === 'woocommerce') return wooPage(source, listUrl, cursor)
  if (source.platform === 'shopify') return shopifyPage(source, listUrl, cursor)
  return htmlPage(source, listUrl, cursor)
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
