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
  'motionrc.com': { via: 'jsonld', sitemaps: ['/sitemap.xml'], urlIncludes: '/products/', scopeByBrandInUrl: true, max: 80 },
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
}

async function shopify(domain) {
  const out = []
  for (let page = 1; page <= 12; page++) {
    let j
    try { const r = await F(`https://${domain}/products.json?limit=250&page=${page}`); if (!r.ok) break; j = await r.json() } catch { break }
    const ps = j.products || []
    out.push(...ps.map((p) => { const body = plain(p.body_html); return { ext_id: 'sh:' + p.id, title: p.title, url: `https://${domain}/products/${p.handle}`, body_text: body, image_urls: (p.images || []).map((i) => i.src), span: spanOf(p.title) ?? spanOf(body) } }))
    if (ps.length < 250) break
  }
  return out
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

async function jsonldSitemap(domain, cfg, brandHint) {
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
  const out = []
  let n = 0
  for (const u of urls) {
    if (n++ >= (cfg.max || 120)) break
    try {
      const html = await (await F(u)).text()
      const p = extractJsonLdProduct(html, u)
      if (!p) continue
      if (cfg.scopeByBrandInLd && brandHint && p.brand && !p.brand.toLowerCase().includes(brandHint.toLowerCase())) continue
      out.push(p)
    } catch {}
    await new Promise((r) => setTimeout(r, 120))
  }
  return out
}

// Dedicated per-domain HTML parser; normalize its output to the common shape
// (ensure image_urls + span, which the parsers may not compute).
async function html(domain) {
  const fn = HTML_PARSERS[domain]
  if (!fn) return null
  const raw = (await fn()) || []
  return raw.map((p) => ({ ...p, image_urls: p.image_urls || [], span: p.span ?? spanOf(p.title) ?? spanOf(p.body_text) }))
}

export async function fetchStrategy(domain, brandHint) {
  const cfg = STRATEGIES[domain]
  if (!cfg || cfg.via === 'todo') return null
  if (cfg.via === 'shopify') return shopify(domain)
  if (cfg.via === 'jsonld') return jsonldSitemap(domain, cfg, brandHint)
  if (cfg.via === 'html') return html(domain)
  return null
}
