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
