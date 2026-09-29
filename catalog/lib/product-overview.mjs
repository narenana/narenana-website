import { extractManufacturerFacts, PROFILE_FIELDS, mergeProfile } from './mfr-profile.mjs'
import { detectConfig } from './adapters.mjs'

// Only explicit, physical facts from an accepted manufacturer identity are
// public. Handling/difficulty recommendations remain editorial review work.
const publicKeys = new Set(['channels','motorCount','propulsionType','recommendedAuwMinG','recommendedAuwMaxG','maxAuwG','payloadG'])
export function manufacturerReference(row) {
  if (!row || row.match_status !== 'accepted' || !/^https:\/\//.test(row.url || '')) return null
  const facts = extractManufacturerFacts({title:row.title,bodyText:row.body_text})
  let overrides = {}; try { const parsed = JSON.parse(row.overrides_json || "{}"); if(parsed && typeof parsed === "object" && !Array.isArray(parsed)) overrides = parsed } catch {}
  const values = mergeProfile(facts.suggestions, overrides)
  const properties = []
  if (Number.isFinite(row.span_mm) && row.span_mm > 0) properties.push({name:'Wingspan',value:row.span_mm,unit:'mm'})
  for (const f of PROFILE_FIELDS) {
    if (!publicKeys.has(f.key) || (!Object.hasOwn(overrides,f.key) && facts.sources[f.key]?.confidence !== 'explicit')) continue
    const value = values[f.key]
    if (value == null) continue
    const display = f.options ? f.options.find(o=>o.value===value)?.label : value
    if (display != null) properties.push({name:f.label.replace('Good AUW','Recommended all-up weight'),value:display,unit:f.unit || ''})
  }
  return {url:row.url,properties,checked:row.fetched_at}
}
// A model's public name: brand and name, trimmed and joined, with no brand when
// there isn't a real one ('' or 'Unbranded'). The <title>, H1, image alt text,
// JSON-LD and cards all use it, so a brandless model reads 'Sky Surfer', never
// ' Sky Surfer'.
export const realBrand = (m) => { const b = String(m?.brand ?? '').trim(); return /^unbranded$/i.test(b) ? '' : b }
export const displayName = (m) => [realBrand(m), String(m?.name ?? '').trim()].filter(Boolean).join(' ')

// Approve-time name lint: a master's name is the model, not the seller's
// listing title ("Phoenix 2000 V2", not "RC Phoenix 2000 V2: Soar to New
// Heights…"). Returns why a name looks like a seller title, or ''.
export function nameLint(name) {
  const n = String(name ?? '').trim()
  if (n.length > 45) return 'is over 45 characters'
  if (n.includes(':')) return "contains ':', where seller slogans start"
  const letters = n.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 8 && /\s/.test(n) && letters === letters.toUpperCase()) return 'is all capitals'
  return ''
}

// The configuration a listing states. 'kit' is what detectConfig() and the
// approve form fall back to when nothing is named, so a stored 'kit' is only
// believed when the seller's title (else its URL path) says kit, airframe,
// frame only or ARF; one that names RTF, PNP or a combo there is read as that.
// Anything else is '' (not stated). Other stored configs came from a positive
// match. Product pages label listings with this, and the Wings price bands
// count a listing only under the configuration it states.
const KIT_WORDS = /\b(kit|airframe|frame[\s-]?only)\b/i
const ARF_WORDS = /\b(arf|almost[\s-]?ready[\s-]?to[\s-]?fly)\b/i
const configIn = (text) => {
  const named = detectConfig(text)
  if (named !== 'kit') return named
  return ARF_WORDS.test(text) ? 'arf' : KIT_WORDS.test(text) ? 'kit' : ''
}
export function statedConfig(o) {
  const c = String(o?.config ?? '').trim().toLowerCase()
  if (c !== 'kit') return c
  let path = ''
  try { path = decodeURIComponent(new URL(o.url_canonical).pathname).replace(/[-_/.+]+/g, ' ') } catch {}
  return configIn(o.title || '') || configIn(path)
}
const CONFIG_SHORT = { kit: 'Kit', arf: 'ARF', pnp: 'PNP', rtf: 'RTF', combo: 'Combo', bnf: 'BNF' }
export const CONFIG_NOT_STATED = 'Configuration not stated'
// 'Kit', 'PNP', … or notStated for a listing that does not say.
export const configLabel = (o, notStated = CONFIG_NOT_STATED) => { const c = statedConfig(o); return c ? CONFIG_SHORT[c] || c : notStated }

export function productOverview(model, offers) {
  if (model.blurb?.trim()) return model.blurb.trim()
  let specs={};try{specs=JSON.parse(model.specs||'{}')}catch{}
  const span=Number(specs.spanMM)
  const name=displayName(model)
  const configs=[...new Set(offers.filter(o=>!o.dead).map(o=>o.config).filter(Boolean))]
  const sellers=new Set(offers.filter(o=>!o.dead).map(o=>o.source_name).filter(Boolean)).size
  const detail=Number.isFinite(span)&&span>0?` The catalog lists a ${span.toLocaleString('en-IN')} mm wingspan.`:''
  // Only the configurations the listings state (statedConfig): a stored 'kit'
  // is often detectConfig's fallback, not the seller's word.
  const stated=[...new Set(offers.filter(o=>!o.dead).map(statedConfig).filter(Boolean))]
  const labels=stated.map(c=>({kit:'kit (airframe)',pnp:'plug-and-play (PNP)',rtf:'ready-to-fly (RTF)',arf:'almost-ready-to-fly (ARF)',bnf:'bind-and-fly (BNF)'}[c]||c))
  const from=sellers?` from ${sellers} Indian seller${sellers===1?'':'s'}`:''
  const availability=labels.length?` Compare ${labels.join(', ')} listings${from}, with prices and stock checks below.`:configs.length?` Compare listings${from}, with prices and stock checks below.`:' Current and last-seen seller offers are listed below.'
  return `${name}.${detail}${availability} Check each package’s included equipment before choosing.`
}
