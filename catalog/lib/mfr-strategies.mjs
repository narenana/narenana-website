// Per-domain extract-strategy registry. Researched locally (see
// scratchpad/mfr-audit/research-*.mjs); COMMITTED so the local batch and the
// production worker/cron dispatch on domain identically. Add a manufacturer =
// add one entry here. `fetchStrategy(domain, brandHint)` returns a normalized
// product list: [{ ext_id, title, url, body_text, image_urls[], span }].
//
// Research status per domain is noted inline. `via`:
//   shopify — /products.json (clean, structured)
//   jsonld  — sitemap → product pages → schema.org Product (+ og:description)
//   todo    — needs a per-domain parser (site has no Shopify/JSON-LD)
import { spanOf } from './mfr-match.mjs'
import { HTML_PARSERS } from './mfr-html.mjs'

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; narenana-mfr/1.0)' }
const F = (u) => fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) })
const plain = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()
const metaOf = (html, prop) => (html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)', 'i')) || [])[1] || ''

export const STRATEGIES = {
  // ---- Shopify manufacturers (verified) ----
  'volantexrc.com': { via: 'shopify' },
  'heewing.com': { via: 'shopify' },
  'atomrc.com': { via: 'shopify' },
  'dynamrc.com': { via: 'shopify' },
  'extremeflightrc.com': { via: 'shopify' },
  'sigmfg.com': { via: 'shopify' },
  // ---- distributors / custom sites with JSON-LD Product pages ----
  // motionrc: brand is in the product URL (/products/freewing-…) so we can scope
  // the (15k-url) sitemap to the brand cheaply. Carries Freewing/Dynam/FMS.
  // FMS also makes RC CARS whose part URLs sort alphabetically BEFORE the
  // planes (fms-1-12-scale-… < fms-1400mm-…) — without urlSkip + urlPrefer the
  // whole page budget went to crawler parts and the aircraft filter kept 0.
  'motionrc.com': {
    via: 'jsonld', sitemaps: ['/sitemap.xml'], urlIncludes: '/products/', scopeByBrandInUrl: true, max: 120,
    urlSkip: /(crawler|rock-racer|1-1[0-9]-scale|1-24-scale|rc-cars|truck|buggy|bearing|driveshaft|axle|tire|wheel|shock-|chassis|differential|transmission|winch|-esc-|servo|light-kit|bumper|body-shell)/i,
    urlPrefer: /(\d{3,4}mm|edf|pnp|rtf|arf|bnf|glider|warbird|airplane|-plane|jet)/i,
  },
  // horizonhobby: start from the official airplanes category, not the brand's
  // parts catalog, and fail closed if that authoritative listing changes.
  // Stable EFL/HAN SKU prefixes scope both sources cheaply, and JSON-LD remains
  // the final defence against a mislabelled URL. Carries E-flite/Hangar 9.
  'horizonhobby.com': {
    via: 'jsonld', urlIncludes: '/product/', scopeByBrandInUrl: true, scopeByBrandInLd: true, max: 400,
    brandSkuPrefixes: { eflite: 'EFL', hangar9: 'HAN' },
    brandListingUrls: {
      eflite: '/airplanes/by-type/?prefn1=brand&prefv1=E-flite&prefn2=discontinued&prefv2=true&start=0&sz=200',
      hangar9: '/airplanes/by-type/?prefn1=brand&prefv1=Hangar%209&prefn2=discontinued&prefv2=true&start=0&sz=200',
    },
    listingRequired: true, listingPageSize: 200,
    urlPrefer: /(bnf|rtf|pnp|arf|ready-to-fly|bind-n-fly|plug-n-play|with-as3x|safe-select)/i,
  },
  // ---- custom sites: dedicated per-domain HTML parsers (catalog/lib/mfr-domains/) ----
  'seagullmodels.com': { via: 'html', note: 'ASP.NET Handler.ashx RPC → product grid → JSON-LD-less pages' },
  'rc-factory.eu': { via: 'html' },
  'multiplex-rc.de': { via: 'html' },
  'pilot-rc.com': { via: 'html' },
  'kyosho.com': { via: 'html' },
  'xflymodel.com': { via: 'html' },
  // still needs a parser (workflow build hit a transient auth error) — retry
  'dwhobby.com': { via: 'todo', note: 'old PHP; custom HTML — parser pending' },
  // FMS's own store (fmsmodel.com redirects here). Cloudflare JS challenge blocks
  // every plain fetch (Worker AND local node) — data is refreshed via a LOCAL
  // real-browser pull (JSON-LD per product page; sitemap has EN+ES locale
  // duplicates — dedupe by ext_id preferring non-/es/). Weekly queue skips it.
  'fmshobby.com': { via: 'todo', note: 'Cloudflare challenge — refresh via local browser pull (see mfr memory)' },
}

async function shopify(domain, options = {}) {
  const offset = Math.max(0, options.offset || 0)
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : Infinity
  const out = []
  for (let page = 1; page <= 12; page++) {
    let j
    try {
      const r = await F(`https://${domain}/products.json?limit=250&page=${page}`)
      if (!r.ok) {
        if (page === 1) throw new Error(`Shopify HTTP ${r.status}`)
        break
      }
      j = await r.json()
    } catch (e) {
      if (page === 1) throw e
      break
    }
    const ps = j.products || []
    out.push(...ps.map((p) => { const body = plain(p.body_html); return { ext_id: 'sh:' + p.id, title: p.title, product_type: p.product_type || '', url: `https://${domain}/products/${p.handle}`, body_text: body, image_urls: (p.images || []).map((i) => i.src), span: spanOf(p.title) ?? spanOf(body) } }))
    if (ps.length < 250) break
  }
  const products = out.slice(offset, offset + limit)
  return { products, total: out.length, nextOffset: offset + products.length, done: offset + products.length >= out.length }
}

function extractJsonLdProduct(html, url) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j
    try { j = JSON.parse(m[1]) } catch { continue }
    for (const node of [].concat(j['@graph'] || j)) {
      if (node && /product/i.test([].concat(node['@type'] || '').join(','))) {
        const body = plain(node.description) || plain(metaOf(html, 'og:description')) || plain(metaOf(html, 'description'))
        const brand = node.brand?.name || (typeof node.brand === 'string' ? node.brand : '') || ''
        const imgs = [].concat(node.image || []).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean)
        const title = node.name || metaOf(html, 'og:title')
        return { ext_id: 'ld:' + (node.sku || node.mpn || url), title, url, body_text: body, image_urls: imgs, brand, span: spanOf(title) ?? spanOf(body) }
      }
    }
  }
  return null
}

async function jsonldSitemap(domain, cfg, brandHint, options = {}) {
  const offset = Math.max(0, options.offset || 0)
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : Infinity
  const sameHost = (raw) => {
    try {
      const host = new URL(raw).hostname.toLowerCase()
      return host === domain || host === `www.${domain}`
    } catch {
      return false
    }
  }
  const inBrandScope = (raw) => {
    if (!cfg.scopeByBrandInUrl || !brandHint) return true
    const key = brandHint.toLowerCase().replace(/[^a-z0-9]/g, '')
    const prefix = cfg.brandSkuPrefixes?.[key]
    if (prefix) {
      try {
        const sku = new URL(raw).pathname.split('/').filter(Boolean).at(-1)?.replace(/\.html$/i, '') || ''
        return sku.toUpperCase().startsWith(prefix.toUpperCase())
      } catch {
        return false
      }
    }
    return raw.toLowerCase().includes(brandHint.toLowerCase().replace(/\s+/g, '-'))
  }
  const validProductUrl = (raw) => sameHost(raw) &&
    (!cfg.urlIncludes || raw.includes(cfg.urlIncludes)) && inBrandScope(raw)

  let list
  if (Array.isArray(options.cursorUrls)) {
    // Queue cursors are an optimization, not a trust boundary. Revalidate every
    // carried URL before fetching it and reapply the committed cap.
    list = [...new Set(options.cursorUrls.filter(validProductUrl))].slice(0, cfg.max || 120)
  } else {
    const urls = new Set()
    const brandKey = brandHint?.toLowerCase().replace(/[^a-z0-9]/g, '')
    const listingUrl = cfg.brandListingUrls?.[brandKey]
    let listingError = null
    if (listingUrl) {
      try {
        const pageSize = Math.max(1, cfg.listingPageSize || 200)
        let reportedTotal = null
        for (let start = 0; ; ) {
          const pageUrl = new URL(listingUrl, `https://${domain}`)
          pageUrl.searchParams.set('start', String(start))
          pageUrl.searchParams.set('sz', String(pageSize))
          const response = await F(pageUrl.href)
          if (!response.ok) throw new Error(`aircraft listing HTTP ${response.status}`)
          const html = await response.text()
          const range = html.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+Results/i)
          if (!range) throw new Error('aircraft listing result range missing')
          const first = Number(range[1])
          const last = Number(range[2])
          const total = Number(range[3])
          if (first !== start + 1 || last < first || last > total || total > (cfg.max || 120))
            throw new Error(`unexpected aircraft listing range: ${first}-${last}/${total}`)
          if (reportedTotal !== null && reportedTotal !== total)
            throw new Error(`aircraft listing total changed: ${reportedTotal} to ${total}`)
          reportedTotal = total

          const before = urls.size
          for (const match of html.matchAll(/href=["']([^"']*\/product\/[^"'#?]+\.html)["']/gi)) {
            const raw = new URL(match[1].replace(/&amp;/gi, '&'), `https://${domain}`).href
            if (validProductUrl(raw)) urls.add(raw)
          }
          const expected = last - first + 1
          if (urls.size - before !== expected)
            throw new Error(`aircraft listing expected ${expected} products, found ${urls.size - before}`)
          if (last === total) break
          start = last
        }
        if (urls.size !== reportedTotal)
          throw new Error(`aircraft listing expected ${reportedTotal} unique products, found ${urls.size}`)
      } catch (error) {
        urls.clear()
        listingError = error
      }
    }

    // The category listing is authoritative and excludes parts. Horizon is
    // fail-closed: markup drift must preserve existing data, not admit its
    // much larger parts catalog through a fallback sitemap.
    if (listingUrl && cfg.listingRequired && (listingError || !urls.size))
      throw listingError || new Error('aircraft listing returned no products')

    if (!urls.size) {
      let sitemaps = cfg.sitemaps || ['/sitemap.xml']
      for (const sitemap of sitemaps) {
        try {
          const sitemapUrl = /^https?:/i.test(sitemap) ? sitemap : `https://${domain}${sitemap}`
          const xml = await (await F(sitemapUrl)).text()
          for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
            const raw = match[1]
            if (validProductUrl(raw)) urls.add(raw)
          }
        } catch {}
      }
    }
    list = [...urls]
    if (cfg.urlSkip) list = list.filter((url) => !cfg.urlSkip.test(url))
    if (cfg.urlPrefer || (cfg.scopeByBrandInUrl && brandHint)) {
      const brandSlug = brandHint?.toLowerCase().replace(/\s+/g, '-')
      const priority = (url) =>
        (brandSlug && url.toLowerCase().includes(brandSlug) ? 2 : 0) +
        (cfg.urlPrefer?.test(url) ? 1 : 0)
      list.sort((a, b) => priority(b) - priority(a) || a.localeCompare(b))
    }
    list = list.slice(0, cfg.max || 120)
  }
  // Spend the page budget wisely: drop known-irrelevant slugs outright (FMS
  // car/crawler parts), then fetch plane-looking URLs first — the budget may
  // not cover the whole brand. Deterministic order, so queue paging stays stable.
  const targets = list.slice(offset, offset + limit)
  const out = []
  for (const u of targets) {
    try {
      const html = await (await F(u)).text()
      const p = extractJsonLdProduct(html, u)
      if (!p) continue
      if (cfg.scopeByBrandInLd && brandHint && p.brand && !p.brand.toLowerCase().includes(brandHint.toLowerCase())) continue
      out.push(p)
    } catch {}
    await new Promise((r) => setTimeout(r, 120))
  }
  return {
    products: out,
    total: list.length,
    nextOffset: offset + targets.length,
    done: offset + targets.length >= list.length,
    cursorUrls: list,
  }
}

// Dedicated per-domain HTML parser; normalize its output to the common shape
// (ensure image_urls + span, which the parsers may not compute).
async function html(domain, options = {}) {
  const fn = HTML_PARSERS[domain]
  if (!fn) return null
  const raw = (await fn(options)) || []
  const products = raw.map((p) => ({ ...p, image_urls: p.image_urls || [], span: p.span ?? spanOf(p.title) ?? spanOf(p.body_text) }))
  return {
    products,
    total: raw.total ?? products.length,
    nextOffset: raw.nextOffset ?? (Math.max(0, options.offset || 0) + products.length),
    done: raw.done ?? true,
  }
}

export async function fetchStrategyPage(domain, brandHint, options = {}) {
  const cfg = STRATEGIES[domain]
  if (!cfg || cfg.via === 'todo') return null
  if (cfg.via === 'shopify') return shopify(domain, options)
  if (cfg.via === 'jsonld') return jsonldSitemap(domain, cfg, brandHint, options)
  if (cfg.via === 'html') return html(domain, options)
  return null
}

export async function fetchStrategy(domain, brandHint) {
  return (await fetchStrategyPage(domain, brandHint, { offset: 0, limit: Infinity }))?.products ?? null
}
