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
    // ₹0 is not a price — discontinued/quote-only Woo products publish 0 and
    // "0" is a truthy STRING, so guard on the parsed number.
    const paise = Math.round(Number(p.prices?.price ?? 0) / div)
    return {
      pid: String(p.id),
      url: canonicalUrl(p.permalink),
      title: (p.name || '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/<[^>]+>/g, ''),
      priceINR: paise > 0 ? paise : null,
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
    priceINR: Number(p.variants?.[0]?.price) > 0 ? Math.round(Number(p.variants[0].price)) : null,
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

// --- Magento (1.x/2.x, no public product API) ----------------------------
// The category LISTING page carries everything per product: url (…/x.html),
// pid (product-price-<id>), name, ₹price, image, and add-to-cart vs
// out-of-stock. We segment on each `product-image` anchor and parse a window.
function parseMagentoList(html, source) {
  const origin = new URL(source.home_url).origin
  // Anchor on the product-image <a> tag itself (it carries the href); the
  // forward window to the next such tag holds pid, name, price, and stock.
  const anchors = [...html.matchAll(/<a\s[^>]*class="product-image"[^>]*>/g)]
  const out = []
  const seen = new Set()
  for (let i = 0; i < anchors.length; i++) {
    const tag = anchors[i][0]
    const fwd = html.slice(anchors[i].index, i + 1 < anchors.length ? anchors[i + 1].index : html.length)
    const url = tag.match(/href="([^"]+\.html)"/)?.[1]
    const pid = fwd.match(/product-(?:price|collection-image)-(\d+)/)?.[1]
    if (!url || !pid || seen.has(pid)) continue
    try {
      if (new URL(url).origin !== origin) continue
    } catch {
      continue
    }
    seen.add(pid)
    const name = fwd.match(/product-name[^>]*>\s*<a[^>]*>([^<]+)/)?.[1]
    const price = fwd.match(/class="price"[^>]*>\s*(?:₹|Rs\.?)\s*([\d,]+)/i)?.[1]
    const img = fwd.match(/defaultImage"\s+src="([^"]+)"/)?.[1] ?? fwd.match(/<img[^>]+src="([^"]+)"/)?.[1]
    const inStock = /add to cart|btn-cart/i.test(fwd) && !/out of stock/i.test(fwd)
    out.push({
      pid,
      url: canonicalUrl(url),
      title: (name ?? '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(),
      priceINR: price ? Number(price.replace(/,/g, '')) : null,
      inStock,
      img: img ?? null,
      variants: [],
    })
  }
  return out
}

export async function magentoPage(source, listUrl, cursor) {
  const { page = 1, lastFirst = null } = cursor ?? {}
  const sep = listUrl.includes('?') ? '&' : '?'
  const url = page > 1 ? `${listUrl}${sep}p=${page}` : listUrl
  const html = await getHtml(url)
  if (!html) return { products: [], nextCursor: null, fetches: 1 }
  const products = parseMagentoList(html, source)
  const firstPid = products[0]?.pid ?? null
  // Stop when a page is empty, when Magento clamps ?p past the end and
  // re-serves the same page (firstPid repeats), or at a hard cap.
  const stop = products.length === 0 || firstPid === lastFirst || page >= 8
  return { products, nextCursor: stop ? null : { page: page + 1, lastFirst: firstPid }, fetches: 1, subtree: 1 }
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
  if (source.platform === 'magento') return magentoPage(source, listUrl, cursor)
  return htmlPage(source, listUrl, cursor)
}

// --- single-page enrichment / verification --------------------------------
export function parseJsonLd(html) {
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

// --- spec extraction (pure text → data; used by the enrich job) -----------
// Wingspan from product-page/title text. Handles mm / cm / m / inches;
// sanity-bounded to 200–4000mm so "3.5mm connector" can't become a wingspan.
export function extractSpanMM(text = '') {
  const t = String(text)
  const pats = [
    [/wing\s*span[^0-9<>]{0,24}([\d,.]{2,7})\s*mm\b/i, 1],
    [/([\d]{3,4})\s*mm\b[^.]{0,24}wing\s*span/i, 1],
    [/wing\s*span[^0-9<>]{0,24}([\d,.]{1,6})\s*cm\b/i, 10],
    [/wing\s*span[^0-9<>]{0,24}([\d.]{1,5})\s*m\b/i, 1000],
    [/wing\s*span[^0-9<>]{0,24}([\d.]{1,5})\s*(?:in|inch|inches|")/i, 25.4],
    [/\b([\d]{3,4})\s*mm\b/, 1], // bare "800mm" in a title
  ]
  for (const [rx, mul] of pats) {
    const m = t.match(rx)
    if (!m) continue
    const v = Math.round(parseFloat(m[1].replace(/,/g, '')) * mul)
    if (v >= 200 && v <= 4000) return v
  }
  return null
}

// kit / pnp / rtf / combo from listing text. Order matters: RTF claims beat
// PNP beats combo beats the kit default.
export function detectConfig(text = '') {
  const t = String(text)
  if (/\b(rtf|ready[\s-]?to[\s-]?fly)\b/i.test(t)) return 'rtf'
  if (/\b(pnp|pnf|plug[\s-]?(?:and|n|&)[\s-]?(?:play|fly))\b/i.test(t)) return 'pnp'
  if (/\b(combo|bundle|with\s+(?:motor|electronics|fc|flight\s*controller))\b/i.test(t)) return 'combo'
  return 'kit'
}

// Server-rendered add-to-cart detection for storefronts without Product
// JSON-LD (Zoho: uavmarketplace). Owner rule: a REAL add-to-cart control on
// the page means the item is purchasable/in stock — quote-only pages never
// render one. Detection is at the ELEMENT level (data-zs-add-to-cart /
// theme-cart-button): the literal strings "Add to Cart" / "Out of Stock"
// appear in dormant JS templates on EVERY Zoho page and must not match.
export function cartSignals(html = '') {
  const h = String(html)
  const hasCart = /<[a-z][^>]*\sdata-zs-add-to-cart[\s>]/i.test(h) || /<[a-z][^>]*class="[^"]*theme-cart-button[^"]*"/i.test(h)
  if (!hasCart) return null
  const p = h.match(/class="[^"]*theme-product-price[^"]*"[^>]*>\s*(?:₹|Rs\.?)\s*([\d,]+)/i)
  const v = p ? Math.round(Number(p[1].replace(/,/g, ''))) : null
  return { inStock: true, priceINR: v && v > 0 ? v : null }
}

// Verify a WooCommerce SKU via the Store API (same source the scan trusts),
// NOT by scraping product HTML — a simple Woo product often carries no price
// JSON-LD, so HTML scraping wrongly reads it as quote-only. Returns the same
// shape as checkPage: { blocked } | { gone } | { priceINR, inStock, ... }.
export async function checkWooProduct(homeUrl, pid) {
  const origin = new URL(homeUrl).origin
  let res
  try {
    res = await fetch(`${origin}/wp-json/wc/store/v1/products?include=${pid}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(9000) })
  } catch {
    return { blocked: true }
  }
  if (!res.ok) return { blocked: true } // 403/429/5xx → preserve, never wipe
  let arr
  try {
    arr = await res.json()
  } catch {
    return { blocked: true }
  }
  if (!Array.isArray(arr)) return { blocked: true }
  const p = arr.find((x) => String(x.id) === String(pid))
  if (!p) return { gone: true } // API reachable and product absent → really gone
  const div = 10 ** (p.prices?.currency_minor_unit ?? 2)
  const paise = Math.round(Number(p.prices?.price ?? 0) / div)
  return {
    title: (p.name || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–'),
    img: p.images?.[0]?.src ?? null,
    priceINR: paise > 0 ? paise : null,
    inStock: p.is_in_stock !== false,
    quoteOnly: false,
    variants: [],
  }
}

// A bot-challenge / interstitial page (Cloudflare "Just a moment…", etc.) is
// NOT the product page. Verify must treat it as "couldn't check", never as a
// real listing — otherwise a seller enabling bot protection silently wipes
// every price we hold for them.
export function isChallenge(html = '') {
  return /Just a moment\.\.\.|Checking your browser|Enable JavaScript and cookies|challenges\.cloudflare\.com|cf-browser-verification|Attention Required|Access denied|error code:\s*1020/i.test(html)
}

// Direct product-page check.
//   { gone }    — page genuinely 404s
//   { blocked } — any block/error (403/429/5xx, timeout, bot wall): the read
//                 FAILED, so the caller must PRESERVE the last-known data and
//                 never downgrade a live listing on a signal we can't trust
//   { priceINR, inStock, quoteOnly, variants?, img?, title? } — real 200 listing
export async function checkPage(url, source) {
  let res
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(9000) })
  } catch {
    return { blocked: true } // network error / timeout — don't wipe on it
  }
  if (res.status === 404 || res.status === 410) return { gone: true }
  if (!res.ok) return { blocked: true } // 403/429/5xx — WAF or seller hiccup
  const html = await res.text()
  if (isChallenge(html)) return { blocked: true } // 200 + interstitial
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = t ? t[1].replace(/\s*[|–—-]\s*[^|–—-]*$/, '').replace(/\s+/g, ' ').trim().slice(0, 140) : null
  const img = ogImageFrom(html, url)
  // Magento: no product API — parse the product page's own price + stock.
  if (source?.platform === 'magento') {
    const price = html.match(/class="price"[^>]*>\s*(?:₹|Rs\.?)\s*([\d,]+)/i)?.[1]
    const inStock = /add to cart|btn-cart/i.test(html) && !/out of stock/i.test(html)
    return { title, img, variants: [], quoteOnly: false, priceINR: price ? Number(price.replace(/,/g, '')) : null, inStock }
  }
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
  const cart = cartSignals(html)
  if (cart) return { title, img, variants: [], quoteOnly: false, ...cart }
  return { title, img, variants: [], quoteOnly: true, priceINR: null, inStock: false }
}
