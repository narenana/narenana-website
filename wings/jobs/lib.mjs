// Shared scraping primitives for the wings jobs.
//
// Two jobs use these:
//   discover.mjs — walks each source's root listUrls, into the subtree, and
//                  finds product pages we don't have yet.
//   refresh.mjs  — re-checks price/stock for products already in the index.
//
// Per-PLATFORM parsers rather than per-site ones: most Indian hobby shops are
// WooCommerce or Zoho Commerce, so two parsers cover nearly everything, and a
// new seller usually needs only a sources.json entry — no new code.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const ROOT = new URL('../../', import.meta.url)
export const path = (p) => fileURLToPath(new URL(p, ROOT))
export const readJson = async (p) => JSON.parse(await readFile(path(p), 'utf8'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

export const norm = (u) => (u || '').split('#')[0].split('?')[0].replace(/\/$/, '').toLowerCase()

export async function get(url, { tries = 2 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' })
      if (res.ok) return await res.text()
      if (res.status === 404) return null
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)))
  }
  return null
}

export async function getJson(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, redirect: 'follow' })
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch {
      /* retry — 503s on these hosts are usually transient */
    }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)))
  }
  return null
}

// --- platform APIs (preferred over HTML) ----------------------------------
// Every WooCommerce and Shopify shop exposes a JSON product feed. Using it
// instead of parsing HTML is both more reliable (JS-rendered category pages
// return no links at all — anubisrc and drkstore both do) and richer: we get
// price and stock in the same call, so discovery and refresh share one path.

const slugOf = (listUrl) => {
  const segs = new URL(listUrl).pathname.split('/').filter(Boolean)
  return segs[segs.length - 1] || null
}

async function wooCategoryId(origin, slug) {
  const cats = await getJson(`${origin}/wp-json/wc/store/v1/products/categories?per_page=100`)
  if (!Array.isArray(cats)) return null
  const hit = cats.find((c) => c.slug === slug)
  return hit?.id ?? null
}

async function wooProducts(source, listUrl) {
  const origin = new URL(source.home).origin
  const slug = slugOf(listUrl)
  const id = await wooCategoryId(origin, slug)
  // Refuse rather than fall back to the whole shop. A root link that doesn't
  // resolve to a real category is a broken root link — silently returning 400
  // unrelated products (as this did for a fabricated vortex-rc URL) is worse
  // than returning nothing, because it looks like it worked.
  if (!id) return { products: [], scoped: false, error: `no category matches slug "${slug}" — is the root link right?` }
  const out = []
  for (let page = 1; page <= 10; page++) {
    const rows = await getJson(`${origin}/wp-json/wc/store/v1/products?category=${id}&per_page=100&page=${page}`)
    if (!Array.isArray(rows) || !rows.length) break
    for (const p of rows) {
      const minor = p.prices?.currency_minor_unit ?? 2
      const div = 10 ** minor
      out.push({
        url: norm(p.permalink),
        title: (p.name || '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–'),
        priceINR: p.prices?.price ? Math.round(Number(p.prices.price) / div) : null,
        inStock: p.is_in_stock !== false,
      })
    }
    if (rows.length < 100) break
  }
  return { products: out, scoped: true }
}

async function shopifyProducts(source, listUrl) {
  const out = []
  for (let page = 1; page <= 6; page++) {
    const d = await getJson(`${listUrl.replace(/\/$/, '')}/products.json?limit=250&page=${page}`)
    const rows = d?.products
    if (!Array.isArray(rows) || !rows.length) break
    for (const p of rows) {
      const v = p.variants?.[0]
      out.push({
        url: norm(`${new URL(source.home).origin}/products/${p.handle}`),
        title: p.title || '',
        priceINR: v?.price ? Math.round(Number(v.price)) : null,
        inStock: p.variants?.some((x) => x.available) ?? true,
      })
    }
    if (rows.length < 250) break
  }
  return { products: out, scoped: true }
}

// Fall back to HTML for platforms without a usable feed (Zoho Commerce).
async function htmlProducts(source, listUrl) {
  const out = []
  const seen = new Set()
  let url = listUrl
  for (let page = 0; page < 12 && url; page++) {
    seen.add(norm(url))
    const html = await get(url)
    if (!html) break
    for (const u of productLinks(html, source, url)) out.push({ url: u, title: '', priceINR: null, inStock: null })
    url = nextPage(html, url, seen)
  }
  return { products: [...new Map(out.map((p) => [p.url, p])).values()], scoped: true }
}

export async function fetchCatalog(source, listUrl) {
  if (source.platform === 'woocommerce') return wooProducts(source, listUrl)
  if (source.platform === 'shopify') return shopifyProducts(source, listUrl)
  return htmlProducts(source, listUrl)
}

// --- product-link extraction (discovery) ----------------------------------
// Pull every href and resolve it against the page URL. Matching raw absolute
// URLs in the HTML looks simpler but silently finds nothing on any site that
// writes relative links (which is most of them).
const PRODUCT_PATH = {
  woocommerce: /^\/product\/[^/]+\/?$/,
  'zoho-commerce': /^\/products\/.+/,
}

export function productLinks(html, source, pageUrl) {
  const origin = new URL(source.home).origin
  const pat = PRODUCT_PATH[source.platform]
  if (!pat) return []

  const out = new Set()
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let u
    try {
      u = new URL(m[1], pageUrl)
    } catch {
      continue
    }
    if (u.origin !== origin) continue
    if (!pat.test(u.pathname)) continue
    // Category/tag/feed URLs can share the product shape — drop them.
    if (/\/(page|category|tag|feed)\//.test(u.pathname)) continue
    out.add(norm(u.toString()))
  }
  return [...out]
}

// Follow WooCommerce/Zoho pagination from a category root.
export function nextPage(html, listUrl, seen) {
  const m = html.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href="([^"]+)"/i) || html.match(/rel=["']next["'][^>]+href=["']([^"']+)["']/i)
  if (!m) return null
  const abs = new URL(m[1], listUrl).toString()
  return seen.has(norm(abs)) ? null : abs
}

// --- price / stock extraction (refresh) -----------------------------------
export function parseWooVariants(html) {
  const m = html.match(/data-product_variations=(["'])(.*?)\1/s)
  if (!m) return null
  const raw = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'")
  let arr
  try {
    arr = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(arr) || !arr.length) return null
  return arr.map((v) => ({
    label: Object.values(v.attributes || {}).filter(Boolean).join(' / ') || 'Standard',
    priceINR: Math.round(Number(v.display_price)),
    inStock: !!v.is_in_stock,
  }))
}

// Simple (non-variable) WooCommerce product, or anything with Product JSON-LD.
export function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of blocks) {
    let data
    try {
      data = JSON.parse(b[1].trim())
    } catch {
      continue
    }
    const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data]
    for (const n of nodes) {
      if (!n || (n['@type'] !== 'Product' && !(Array.isArray(n['@type']) && n['@type'].includes('Product')))) continue
      const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers
      if (!offer) continue
      const price = Number(offer.price ?? offer.lowPrice)
      if (!price) continue
      return [
        {
          label: 'Standard',
          priceINR: Math.round(price),
          inStock: /InStock/i.test(String(offer.availability || '')),
        },
      ]
    }
  }
  return null
}

export function parsePrice(html, source) {
  if (source.platform === 'woocommerce') return parseWooVariants(html) ?? parseJsonLd(html)
  return parseJsonLd(html) ?? parseWooVariants(html)
}

export function titleOf(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim().replace(/\s+/g, ' ') : ''
}
