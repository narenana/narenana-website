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
  // horizonhobby: JSON-LD carries brand+description; product URLs don't encode
  // brand, so scope by fetched JSON-LD brand. Carries E-flite/Hangar 9.
  'horizonhobby.com': { via: 'jsonld', sitemaps: ['/sitemap_0-product.xml', '/sitemap_1-product.xml'], urlIncludes: '/product/', scopeByBrandInLd: true, max: 400 },
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
        return { ext_id: 'ld:' + (node.sku || node.mpn || url), title: node.name || metaOf(html, 'og:title'), url, body_text: body, image_urls: imgs, brand, span: spanOf((node.name || '') + ' ' + body) }
      }
    }
  }
  return null
}

async function jsonldSitemap(domain, cfg, brandHint, options = {}) {
  const offset = Math.max(0, options.offset || 0)
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : Infinity
  const urls = new Set()
  for (const sm of cfg.sitemaps || ['/sitemap.xml']) {
    try {
      const xml = await (await F(`https://${domain}${sm}`)).text()
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const u = m[1]
        if (cfg.urlIncludes && !u.includes(cfg.urlIncludes)) continue
        if (cfg.scopeByBrandInUrl && brandHint && !u.toLowerCase().includes(brandHint.toLowerCase().replace(/\s+/g, '-'))) continue
        urls.add(u)
      }
    } catch {}
  }
  // Spend the page budget wisely: drop known-irrelevant slugs outright (FMS
  // car/crawler parts), then fetch plane-looking URLs first — the budget may
  // not cover the whole brand. Deterministic order, so queue paging stays stable.
  let list = [...urls]
  if (cfg.urlSkip) list = list.filter((u) => !cfg.urlSkip.test(u))
  if (cfg.urlPrefer) list.sort((a, b) => ((cfg.urlPrefer.test(b) ? 1 : 0) - (cfg.urlPrefer.test(a) ? 1 : 0)) || a.localeCompare(b))
  const allUrls = list.slice(0, cfg.max || 120)
  const targets = allUrls.slice(offset, offset + limit)
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
  return { products: out, total: allUrls.length, nextOffset: offset + targets.length, done: offset + targets.length >= allUrls.length }
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
