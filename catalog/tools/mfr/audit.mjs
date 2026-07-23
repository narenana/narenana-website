// Manufacturer content & audit — Phase 1 local batch.
//
// Fetches each registered manufacturer's catalogue (Shopify /products.json for
// now), filters to actual aircraft, extracts facts (wingspan…), and matches
// against our masters with a wingspan tiebreak. Emits a review table + audit
// flags. NOTHING here touches prod — it reads a local masters dump and writes
// a JSON/HTML report for a human to review.
//
// Usage:
//   # dump our masters once (prod data stays out of the repo):
//   npx wrangler d1 execute catalog --remote --json \
//     --command "SELECT id,brand,name,specs,slug,status FROM master_model" > masters.json
//   node catalog/tools/mfr/audit.mjs masters.json [out.json]
import fs from 'fs'

// ---- registry: confirmed Shopify manufacturers (expand as we verify more) ----
const REGISTRY = {
  HEEWING: { domain: 'heewing.com', platform: 'shopify', aliases: ['heewing', 'hee wing'] },
  Volantex: { domain: 'volantexrc.com', platform: 'shopify', aliases: ['volantex', 'volantexrc'] },
  ATOMRC: { domain: 'atomrc.com', platform: 'shopify', aliases: ['atomrc'] },
}

// ---- helpers ----
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; narenana-audit/1.0)' }
const plain = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()

// wingspan (mm) from title + description
function spanOf(text) {
  const t = ' ' + (text || '') + ' '
  const m =
    t.match(/wing\s*span[^0-9]{0,14}(\d{3,4})\s*mm/i) ||
    t.match(/\b(\d{3,4})\s*mm\b/i) ||
    t.match(/\b(\d(?:\.\d)?)\s*m\b(?!m)/i) // "2.4M" / "2M" → meters
  if (!m) return null
  const v = parseFloat(m[1])
  return v < 10 ? Math.round(v * 1000) : Math.round(v)
}

// aircraft vs part/accessory. STRONG build-signal (PNP/RTF/BNF/ARF) is decisive;
// otherwise part-words exclude. This fixes "parts beat planes".
const STRONG = /\b(pnp|rtf|bnf|arf)\b/i
const PART = /(conversion kit|tail boom|fuselage|hatch|canopy|servo|\besc\b|\bvtx\b|\bvrx\b|\bmotor\b|propeller|\bprop\b|landing gear|\bcover\b|protector|\bmount\b|spare|replacement|\bcable\b|antenna|sticker|decal|foam set|foam case|carrying|storage|\bstand\b|charger|\bbattery\b|receiver|goggle|\blens\b|\bscrew\b|\bblock\b|\bpart\b|\bparts\b|set of|\bpack\b|\bbag\b|kit foam|nose \d|main wing|wing set|for rc (airplane|plane)|\d set\b)/i
function isAircraft(p) {
  const t = p.title || ''
  if (STRONG.test(t)) return true // PNP/RTF/BNF/ARF = decisive
  if (PART.test(t)) return false // else part-words exclude (incl. "1 Set Main Wing for RC Airplane …")
  return /\b(plane|glider|trainer|warbird|edf|jet|delta)\b/i.test(t) || /(fixed|flying)[\s-]*wing/i.test(t)
}

// name match = CONTAINMENT of our model tokens in their title. Our names are the
// short "core" (model + size); their titles pad with descriptors ("Fixed-wing
// Aircraft", "Beginner RC Warbird…"), so symmetric Jaccard wrongly punishes good
// matches. Containment-over-ours fixes it. Alpha tokens match whole-word; numbers
// match by prefix so 600 ≈ 600S.
const NOISE = /\b(pnp|rtf|bnf|arf|kit|combo|fpv|vtol|version|set|pack|edition|rc|plane|airplane|aircraft|fixed|wing|conversion|the|with|for|and|beginner|channel|\d?ch|stabiliz\w*|xpilot|epo|foam|scale|superior|unleash|precision|soar|new|heights|strong|streaml\w*)\b/gi
const modelToks = (s, aliases = []) => {
  let x = ' ' + (s || '').toLowerCase() + ' '
  for (const a of aliases) x = x.split(a).join(' ')
  return x.replace(NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length >= 2)
}
function nameSim(ourName, theirTitle, aliases = []) {
  const ours = modelToks(ourName, aliases)
  if (!ours.length) return 0
  const t = ' ' + (theirTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
  let hit = 0
  for (const tok of ours) {
    if (/^\d+$/.test(tok)) { if (new RegExp('\\b' + tok).test(t)) hit++ } // 600 matches 600S
    else if (t.includes(' ' + tok + ' ')) hit++ // whole word
  }
  return hit / ours.length
}
const spanClose = (a, b) => a && b && Math.abs(a - b) / Math.max(a, b) <= 0.03

async function shopify(domain) {
  const out = []
  for (let page = 1; page <= 12; page++) {
    let j
    try {
      const r = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: UA })
      if (!r.ok) break
      j = await r.json()
    } catch { break }
    const ps = j.products || []
    out.push(...ps)
    if (ps.length < 250) break
  }
  return out.map((p) => { const body = plain(p.body_html); return { ext_id: String(p.id), title: p.title, url: `products/${p.handle}`, body_text: body, images: (p.images || []).length, span: spanOf(p.title) ?? spanOf(body), is_aircraft: isAircraft(p) } })
}

// ---- load our masters (wrangler --json dump OR a plain array) ----
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'masters.json', 'utf8'))
// accept: wrangler --json wrapper [{results:[...]}], {results:[...]}, or a plain array
const masters = Array.isArray(raw) ? (raw[0]?.results ?? raw) : (raw.results ?? [])
const ourSpan = (m) => { try { const v = JSON.parse(m.specs || '{}').spanMM; return v && +v > 0 ? +v : null } catch { return null } }
const brandKey = (b) => {
  const n = (b || '').toLowerCase().trim()
  for (const [k, v] of Object.entries(REGISTRY)) if (k.toLowerCase() === n || v.aliases.some((a) => n === a || n.replace(/\s/g, '') === a.replace(/\s/g, ''))) return k
  return null
}

// ---- fetch all registered manufacturers ----
const mfrCatalog = {}
for (const [brand, cfg] of Object.entries(REGISTRY)) {
  const all = await shopify(cfg.domain)
  mfrCatalog[brand] = { cfg, all, aircraft: all.filter((p) => p.is_aircraft) }
  console.log(`${brand.padEnd(10)} ${String(all.length).padStart(3)} products → ${mfrCatalog[brand].aircraft.length} aircraft`)
}

// ---- match ----
const results = [], flags = []
for (const m of masters) {
  if (m.status !== 'ready') continue
  const bk = brandKey(m.brand)
  if (!bk) continue
  const oSpan = ourSpan(m)
  const cands = mfrCatalog[bk].aircraft
    .map((p) => ({ p, name: nameSim(m.name, p.title, mfrCatalog[bk].cfg.aliases) }))
    .map((c) => ({ ...c, span_agree: spanClose(oSpan, c.p.span), score: c.name + (spanClose(oSpan, c.p.span) ? 0.15 : 0) }))
    .sort((a, b) => b.score - a.score)
  const best = cands[0]
  if (!best) { flags.push({ id: m.id, brand: m.brand, name: m.name, flag: 'no aircraft candidates for brand' }); continue }
  const tier = best.name >= 0.6 && (best.span_agree || !oSpan || !best.p.span) ? 'accept'
    : best.name >= 0.6 && oSpan && best.p.span && !best.span_agree ? 'review-spanconflict'
    : best.name >= 0.35 ? 'review'
    : 'reject'
  const row = { id: m.id, brand: m.brand, name: m.name, our_span: oSpan, mfr_title: best.p.title, mfr_span: best.p.span, name_score: +best.name.toFixed(2), span_agree: best.span_agree, tier, desc_chars: best.p.body_text.length, url: `https://${mfrCatalog[bk].cfg.domain}/${best.p.url}` }
  results.push(row)
  if (tier === 'review-spanconflict') flags.push({ id: m.id, brand: m.brand, name: m.name, flag: `wingspan conflict: ours ${oSpan} vs mfr ${best.p.span} (${best.mfr_title || best.p.title})` })
  if (tier === 'reject') flags.push({ id: m.id, brand: m.brand, name: m.name, flag: `no match (best "${best.p.title}" @ ${best.name.toFixed(2)}) — brand/name may be wrong` })
}

// ---- report ----
const byTier = (t) => results.filter((r) => r.tier === t)
console.log('\n=== MATCH TIERS ===')
for (const t of ['accept', 'review-spanconflict', 'review', 'reject']) console.log(`  ${t.padEnd(20)} ${byTier(t).length}`)
console.log('\n=== ACCEPTED (auto) ===')
byTier('accept').forEach((r) => console.log(`  ✓ [${r.name_score}${r.span_agree ? ' span✓' : ''}] "${r.name}" → "${r.mfr_title}" (${r.desc_chars}c)`))
console.log('\n=== AUDIT FLAGS ===')
flags.forEach((f) => console.log(`  ⚑ #${f.id} ${f.brand}/${f.name}: ${f.flag}`))

const out = process.argv[3] || 'mfr-audit-result.json'
fs.writeFileSync(out, JSON.stringify({ results, flags, generated: 'run-time' }, null, 2))
console.log(`\n${results.length} matched rows, ${flags.length} flags → ${out}`)
