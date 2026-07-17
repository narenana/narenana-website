// Platform fetch layer — pure `fetch`, no Node APIs, so it runs unchanged in
// the Cloudflare Worker (cron/admin) AND the local CLI. This is what lets
// discovery + availability polling live in production.
//
// Every WooCommerce and Shopify shop exposes a JSON product feed; we use that
// over HTML scraping because JS-rendered category pages return no links at all
// and the feed gives price + stock in the same call.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

export const norm = (u) => (u || '').split('#')[0].split('?')[0].replace(/\/$/, '').toLowerCase()

async function getJson(url, { tries = 3, timeoutMs = 8000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch {
      /* 503s on these hosts are usually transient — retry */
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

export async function getHtml(url, { tries = 2, timeoutMs = 8000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return await res.text()
      if (res.status === 404) return null
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)))
  }
  return null
}

const slugOf = (listUrl) => {
  const segs = new URL(listUrl).pathname.split('/').filter(Boolean)
  return segs[segs.length - 1] || null
}

// --- WooCommerce Store API ------------------------------------------------
async function wooCategoryId(origin, slug) {
  const cats = await getJson(`${origin}/wp-json/wc/store/v1/products/categories?per_page=100`)
  return Array.isArray(cats) ? (cats.find((c) => c.slug === slug)?.id ?? null) : null
}

async function wooProducts(source, listUrl) {
  const origin = new URL(source.home).origin
  const slug = slugOf(listUrl)
  const id = await wooCategoryId(origin, slug)
  // Refuse rather than fall back to the whole shop: a root that doesn't resolve
  // to a real category is a broken root, and silently returning 400 unrelated
  // products (as a fabricated vortex-rc URL once did) is worse than nothing.
  if (!id) return { products: [], error: `no category matches slug "${slug}" — is the root link right?` }
  const out = []
  for (let page = 1; page <= 10; page++) {
    const rows = await getJson(`${origin}/wp-json/wc/store/v1/products?category=${id}&per_page=100&page=${page}`)
    if (!Array.isArray(rows) || !rows.length) break
    for (const p of rows) {
      const div = 10 ** (p.prices?.currency_minor_unit ?? 2)
      out.push({
        url: norm(p.permalink),
        title: (p.name || '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–'),
        priceINR: p.prices?.price ? Math.round(Number(p.prices.price) / div) : null,
        inStock: p.is_in_stock !== false,
        img: p.images?.[0]?.src ?? null,
      })
    }
    if (rows.length < 100) break
  }
  return { products: out }
}

// --- Shopify --------------------------------------------------------------
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
        img: p.images?.[0]?.src ?? null,
      })
    }
    if (rows.length < 250) break
  }
  return { products: out }
}

// --- HTML fallback (Zoho Commerce) ----------------------------------------
function productLinks(html, source, pageUrl) {
  const origin = new URL(source.home).origin
  const pat = source.platform === 'zoho-commerce' ? /^\/products\/.+/ : /^\/product\/[^/]+\/?$/
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
    out.add(norm(u.toString()))
  }
  return [...out]
}

async function htmlProducts(source, listUrl) {
  const out = new Map()
  let url = listUrl
  const seen = new Set()
  for (let page = 0; page < 12 && url; page++) {
    seen.add(norm(url))
    const html = await getHtml(url)
    if (!html) break
    for (const u of productLinks(html, source, url)) if (!out.has(u)) out.set(u, { url: u, title: '', priceINR: null, inStock: null, img: null })
    const m = html.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href="([^"]+)"/i) || html.match(/rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    url = m && !seen.has(norm(new URL(m[1], url).toString())) ? new URL(m[1], url).toString() : null
  }
  return { products: [...out.values()] }
}

export async function fetchCatalog(source, listUrl) {
  if (source.platform === 'woocommerce') return wooProducts(source, listUrl)
  if (source.platform === 'shopify') return shopifyProducts(source, listUrl)
  return htmlProducts(source, listUrl)
}

// --- single-product price/stock (refresh) ---------------------------------
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
    label: Object.values(v.attributes || {}).filter(Boolean).join(' / ') || 'Standard',
    priceINR: Math.round(Number(v.display_price)),
    inStock: !!v.is_in_stock,
  }))
}

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
      const isProduct = n && (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product')))
      if (!isProduct) continue
      const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers
      const price = Number(offer?.price ?? offer?.lowPrice)
      if (!price) continue
      return [{ label: 'Standard', priceINR: Math.round(price), inStock: /InStock/i.test(String(offer.availability || '')) }]
    }
  }
  return null
}

export async function fetchOfferForUrl(url, source) {
  const html = await getHtml(url)
  if (!html) return { error: 'fetch failed' }
  const variants = source?.platform === 'woocommerce' ? parseWooVariants(html) ?? parseJsonLd(html) : parseJsonLd(html) ?? parseWooVariants(html)
  if (!variants?.length) return { error: 'no price parsed' }
  return { variants }
}

export function ogImageFrom(html, base) {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/data-large_image=["']([^"']+)["']/i)
  return m ? new URL(m[1], base).toString() : null
}
