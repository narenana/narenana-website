// Local batch: fetch registered manufacturers (Shopify JSON + HTML/JSON-LD),
// match against a masters dump, and EMIT load-SQL (manufacturer/mfr_product/
// mfr_match) for D1. Protected sites are handled separately by the worker cron
// (browser render). Nothing here touches prod directly — it writes a .sql file.
//
//   node catalog/tools/mfr/run.mjs <seed_brands.json> <masters.json> <out.sql>
import fs from 'fs'
import { isAircraft, spanOf, matchMaster } from '../../lib/mfr-match.mjs'

const [seedPath, mastersPath, outPath] = process.argv.slice(2)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const rawM = JSON.parse(fs.readFileSync(mastersPath, 'utf8'))
const masters = (Array.isArray(rawM) ? rawM[0]?.results ?? rawM : rawM.results).filter((m) => m.status === 'ready')
const ourSpan = (m) => { try { const v = JSON.parse(m.specs || '{}').spanMM; return v && +v > 0 ? +v : null } catch { return null } }
const aliasesOf = (brand) => [brand.toLowerCase(), brand.toLowerCase().replace(/\s+/g, ''), brand.toLowerCase().replace(/[^a-z]/g, '')]
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; narenana-mfr/1.0)' }
const plain = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()

// ---- adapters: (domain) -> [{ ext_id, title, url, body_text, image_urls[], span, is_aircraft }] ----
async function shopify(domain) {
  const out = []
  for (let page = 1; page <= 12; page++) {
    let j
    try { const r = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: UA }); if (!r.ok) break; j = await r.json() } catch { break }
    const ps = j.products || []
    out.push(...ps.map((p) => { const body = plain(p.body_html); return { ext_id: 'sh:' + p.id, title: p.title, url: `https://${domain}/products/${p.handle}`, body_text: body, image_urls: (p.images || []).map((i) => i.src), span: spanOf(p.title) ?? spanOf(body) } }))
    if (ps.length < 250) break
  }
  return out
}

// generic HTML/JSON-LD: sitemap → product URLs → schema.org Product on each page
async function html(domain) {
  const urls = new Set()
  for (const sm of ['/sitemap.xml', '/sitemap_products_1.xml', '/product-sitemap.xml']) {
    try {
      const r = await fetch(`https://${domain}${sm}`, { headers: UA })
      if (!r.ok) continue
      const xml = await r.text()
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const u = m[1]
        if (/sitemap/i.test(u) && u.endsWith('.xml')) { // sitemap index → fetch child
          try { const c = await fetch(u, { headers: UA }); const cx = await c.text(); for (const mm of cx.matchAll(/<loc>([^<]+)<\/loc>/gi)) if (/\/product|\/shop|\/rc-|\/planes?\//i.test(mm[1])) urls.add(mm[1]) } catch {}
        } else if (/\/product|\/shop\/|\/rc-|\/planes?\//i.test(u)) urls.add(u)
      }
    } catch {}
    if (urls.size) break
  }
  const out = []
  let n = 0
  for (const u of urls) {
    if (n++ >= 120) break // politeness bound per domain
    try {
      const r = await fetch(u, { headers: UA })
      if (!r.ok) continue
      const h = await r.text()
      for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        let j
        try { j = JSON.parse(m[1]) } catch { continue }
        const arr = Array.isArray(j) ? j : j['@graph'] || [j]
        for (const node of arr) {
          if (node && /product/i.test(node['@type'] || '')) {
            const body = plain(node.description)
            out.push({ ext_id: 'ld:' + u, title: node.name || '', url: u, body_text: body, image_urls: [].concat(node.image || []).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean), span: spanOf((node.name || '') + ' ' + body) })
          }
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  return out
}

// ---- run ----
const pursue = seed.filter((s) => s.pursue && s.probed_platform !== 'protected') // protected → worker cron
const sqlEsc = (s) => "'" + String(s ?? '').replace(/'/g, "''").slice(0, 8000) + "'"
let sql = '-- mfr load (generated). DELETE+INSERT: full refresh of the batch-fetched set.\nDELETE FROM manufacturer;\nDELETE FROM mfr_product;\nDELETE FROM mfr_match;\n'
let mid = 0, pid = 0
const t = 'strftime("%s","now")*1000'
console.log(`pursue (shopify+html): ${pursue.length} brands`)

for (const b of pursue) {
  mid++
  const strat = b.probed_platform === 'shopify' ? 'shopify' : 'html'
  sql += `INSERT INTO manufacturer (id,brand,domain,platform,strategy,updated_at) VALUES (${mid},${sqlEsc(b.brand)},${sqlEsc(b.domain)},${sqlEsc(b.probed_platform)},${sqlEsc(strat)},${t});\n`
  let products = []
  try { products = strat === 'shopify' ? await shopify(b.domain) : await html(b.domain) } catch (e) { console.log(`  ${b.brand}: fetch failed ${e.message}`) }
  const aircraft = products.filter((p) => isAircraft(p.title))
  const idOf = new Map()
  for (const p of aircraft) { pid++; idOf.set(p, pid); sql += `INSERT INTO mfr_product (id,manufacturer_id,ext_id,url,title,is_aircraft,span_mm,body_text,image_urls,fetched_at) VALUES (${pid},${mid},${sqlEsc(p.ext_id)},${sqlEsc(p.url)},${sqlEsc(p.title)},1,${p.span || 'NULL'},${sqlEsc(p.body_text)},${sqlEsc(JSON.stringify(p.image_urls || []))},${t});\n` }
  const mine = masters.filter((m) => (m.brand || '').toLowerCase().replace(/[^a-z]/g, '') === b.brand.toLowerCase().replace(/[^a-z]/g, ''))
  let matched = 0
  for (const m of mine) {
    const best = matchMaster({ name: m.name, span: ourSpan(m) }, aircraft, aliasesOf(b.brand))
    if (!best) continue
    const status = best.tier === 'accept' ? 'pending' : best.tier === 'review' ? 'pending' : 'rejected'
    sql += `INSERT INTO mfr_match (master_model_id,mfr_product_id,score,span_agree,tier,status,updated_at) VALUES (${m.id},${idOf.get(best.product)},${best.score.toFixed(3)},${best.span_agree === null ? 'NULL' : best.span_agree},${sqlEsc(best.tier)},${sqlEsc(status)},${t});\n`
    if (best.tier === 'accept') matched++
  }
  console.log(`  ${b.brand.padEnd(16)} ${strat.padEnd(7)} ${String(products.length).padStart(3)} products → ${String(aircraft.length).padStart(3)} aircraft, ${mine.length} masters, ${matched} accept`)
}

fs.writeFileSync(outPath, sql)
console.log(`\n→ ${outPath} (${sql.split('\n').length} statements)`)
