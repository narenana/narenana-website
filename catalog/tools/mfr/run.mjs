// Local batch: fetch registered manufacturers via the COMMITTED per-domain
// strategy registry (catalog/lib/mfr-strategies.mjs — same code production uses),
// match against a masters dump, and EMIT load-SQL for D1. Nothing here touches
// prod directly — it writes a .sql file.
//   node catalog/tools/mfr/run.mjs <seed_brands.json> <masters.json> <out.sql>
import fs from 'fs'
import { isAircraft, matchMaster } from '../../lib/mfr-match.mjs'
import { STRATEGIES, fetchStrategy } from '../../lib/mfr-strategies.mjs'

const [seedPath, mastersPath, outPath] = process.argv.slice(2)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const rawM = JSON.parse(fs.readFileSync(mastersPath, 'utf8'))
const masters = (Array.isArray(rawM) ? rawM[0]?.results ?? rawM : rawM.results).filter((m) => m.status === 'ready')
const ourSpan = (m) => { try { const v = JSON.parse(m.specs || '{}').spanMM; return v && +v > 0 ? +v : null } catch { return null } }
const aliasesOf = (b) => [b.toLowerCase(), b.toLowerCase().replace(/\s+/g, ''), b.toLowerCase().replace(/[^a-z]/g, '')]
const sqlEsc = (s) => "'" + String(s ?? '').replace(/'/g, "''").slice(0, 8000) + "'"
const bkey = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')

// pursue brands whose domain has a working (non-todo) strategy in the registry
const pursue = seed.filter((s) => s.pursue && s.domain && STRATEGIES[s.domain] && STRATEGIES[s.domain].via !== 'todo')
console.log(`fetchable via registry: ${pursue.length} brands (${[...new Set(pursue.map((p) => STRATEGIES[p.domain].via))].join(', ')})`)

let sql = '-- mfr load (generated via strategy registry). DELETE+INSERT full refresh.\nDELETE FROM manufacturer;\nDELETE FROM mfr_product;\nDELETE FROM mfr_match;\n'
let mid = 0, pid = 0
const t = 'strftime("%s","now")*1000'

for (const b of pursue) {
  mid++
  const via = STRATEGIES[b.domain].via
  sql += `INSERT INTO manufacturer (id,brand,domain,platform,strategy,updated_at) VALUES (${mid},${sqlEsc(b.brand)},${sqlEsc(b.domain)},${sqlEsc(b.probed_platform)},${sqlEsc(via)},${t});\n`
  let products = []
  try { products = (await fetchStrategy(b.domain, b.brand)) || [] } catch (e) { console.log(`  ${b.brand}: ${e.message}`) }
  const aircraft = products.filter((p) => isAircraft(p.title))
  const idOf = new Map()
  for (const p of aircraft) { pid++; idOf.set(p, pid); sql += `INSERT INTO mfr_product (id,manufacturer_id,ext_id,url,title,is_aircraft,span_mm,body_text,image_urls,fetched_at) VALUES (${pid},${mid},${sqlEsc(p.ext_id)},${sqlEsc(p.url)},${sqlEsc(p.title)},1,${p.span || 'NULL'},${sqlEsc(p.body_text)},${sqlEsc(JSON.stringify(p.image_urls || []))},${t});\n` }
  const mine = masters.filter((m) => bkey(m.brand) === bkey(b.brand))
  let acc = 0
  for (const m of mine) {
    const best = matchMaster({ name: m.name, span: ourSpan(m) }, aircraft, aliasesOf(b.brand))
    if (!best) continue
    const status = best.tier === 'reject' ? 'rejected' : 'pending'
    sql += `INSERT INTO mfr_match (master_model_id,mfr_product_id,score,span_agree,tier,status,updated_at) VALUES (${m.id},${idOf.get(best.product)},${best.score.toFixed(3)},${best.span_agree === null ? 'NULL' : best.span_agree},${sqlEsc(best.tier)},${sqlEsc(status)},${t});\n`
    if (best.tier === 'accept') acc++
  }
  console.log(`  ${b.brand.padEnd(16)} ${via.padEnd(7)} ${String(products.length).padStart(3)}p → ${String(aircraft.length).padStart(3)} aircraft, ${mine.length} masters, ${acc} accept`)
}

fs.writeFileSync(outPath, sql)
console.log(`\n→ ${outPath}`)
