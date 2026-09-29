// Deterministic checks the curator runs on every AI answer, after the schema
// check (design § 5). A model can only PROPOSE: a brand needs a quote found in
// the input that contains it, a wingspan needs a quote that parses to the same
// number, a name may use only words from the input and must read like a model
// name, and role tags go through the owner's 2026-07 taxonomy rules. A field
// that fails is dropped, never guessed at.

import { nameLint } from '../product-overview.mjs'
import { extractSpanMM } from '../adapters.mjs'
import { ROLE_TAGS, normalizeRoleTags } from '../public.mjs'

// ------------------------------------------------------------- text + tokens
// Lower case; curly quotes, primes and dashes straightened; entities blanked.
const straighten = (s) =>
  String(s ?? '')
    .replace(/&(amp|nbsp|quot|#\d+);/gi, ' ')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()

// Word pieces: letters and digits, split where one turns into the other
// ("1400mm" → 1400 mm, "X8" → x 8), so spacing and punctuation never decide a match.
const pieces = (s) => straighten(s).replace(/([a-z])(\d)|(\d)([a-z])/g, '$1$3 $2$4').replace(/([a-z])(\d)|(\d)([a-z])/g, '$1$3 $2$4').split(/[^a-z0-9]+/).filter(Boolean)
const seq = (s) => ' ' + pieces(s).join(' ') + ' '

// A quote "appears in" a text when its word pieces occur there, in order and
// next to each other, ignoring case, spacing and punctuation.
export function quoteIn(quote, text) {
  const q = seq(quote)
  return q.trim().length > 0 && seq(text).includes(q)
}

// Every word of `name` occurs in `text` (case and punctuation ignored). The
// text side also offers the joins a seller might spell differently: "Sky
// Surfer" covers "SkySurfer", "1400 mm" covers "1400mm", "P51D" covers "51D".
export function tokenSubset(name, text) {
  const raw = straighten(text).split(/[^a-z0-9]+/).filter(Boolean)
  const have = new Set()
  for (let i = 0; i < raw.length; i++) {
    const p = pieces(raw[i])
    for (let a = 0; a < p.length; a++) for (let b = a; b < p.length; b++) have.add(p.slice(a, b + 1).join(''))
    if (i + 1 < raw.length) have.add(raw[i] + raw[i + 1])
  }
  const words = straighten(name).split(/[^a-z0-9]+/).filter(Boolean)
  return words.length > 0 && words.every((w) => have.has(w))
}

// ------------------------------------------------------------------- brands
// brandKey: one key per manufacturer however a shop spells it. Lower-case
// alphanumerics with generic suffixes removed, spaced or glued on, while at
// least 4 characters remain: Havoc Hobby → havoc, CARF-Models → carf,
// Robosynckits → robosync, VolantexRC → volantex.
const SUFFIXES = ['hobbies', 'hobby', 'models', 'model', 'kits', 'kit', 'toys', 'aero', 'rc']
export function brandKey(brand) {
  let k = String(brand ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (let changed = true; changed; ) {
    changed = false
    for (const s of SUFFIXES) {
      if (k.endsWith(s) && k.length - s.length >= 4) {
        k = k.slice(0, -s.length)
        changed = true
        break
      }
    }
  }
  return k
}

// Brands that name nobody: empty, house brands, and configuration words a
// shop's title put in the brand slot (#490 "Arf").
const HOUSE_BRANDS = new Set(['unbranded', 'generic', 'diy'])
const CONFIG_BRANDS = new Set(['arf', 'pnp', 'pnf', 'bnf', 'rtf', 'kit', 'kits', 'rc', 'combo'])
export function isBlankBrand(brand) {
  const raw = String(brand ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return !raw || HOUSE_BRANDS.has(raw) || CONFIG_BRANDS.has(raw)
}

// A brand counts only when its quote is in the input and contains it.
export function checkBrand(brand, quote, text) {
  const b = String(brand ?? '').trim().replace(/\s+/g, ' ')
  if (!b || isBlankBrand(b)) return ''
  if (!quote || !quoteIn(quote, text) || !quoteIn(b, quote)) return ''
  return b
}

// -------------------------------------------------------------------- names
// Why a name reads like a seller's title rather than a model name, or ''.
const CONFIG_WORDS = /\b(kits?|arf|pnp|pnf|bnf|rtf|combo|set|crash[\s-]?a[\s-]?lot|with(?:out)?\s+electronics?|air[\s-]?frame|frame[\s-]?only|plug[\s-]?(?:n|and|&)[\s-]?play|ready[\s-]?to[\s-]?fly|almost[\s-]?ready)\b/i
const COLOUR_WORDS = /\b(white|black|red|blue|green|orange|yellow|grey|gray|silver|pink|purple|camo|camouflage|livery|scheme)\b/i
const SHOP_WORDS = /\brc\s+(?:plane|planes|airplane|aeroplane|aircraft)\b|\bfor\s+beginners?\b|\bindia\b|\bbuy\b|^rc\b/i
export function nameSmell(name, brand = '') {
  const n = String(name ?? '').trim()
  if (!n) return ''
  if (CONFIG_WORDS.test(n)) return `has the configuration word "${n.match(CONFIG_WORDS)[0]}"`
  if (COLOUR_WORDS.test(n)) return `has the colour word "${n.match(COLOUR_WORDS)[0]}"`
  if (SHOP_WORDS.test(n)) return `has the shop words "${n.match(SHOP_WORDS)[0]}"`
  const bk = brandKey(brand)
  if (bk && bk.length >= 2) {
    const first = n.split(/\s+/)
    for (let w = 1; w <= Math.min(3, first.length - 1); w++) if (brandKey(first.slice(0, w).join(' ')) === bk) return 'repeats the brand at the start'
  }
  const words = n.split(/\s+/).filter(Boolean)
  if (words.length >= 4 && /[a-z]/.test(n) && n === n.toLowerCase()) return 'is all lower case'
  return ''
}

// A model name passes when every word is in the input, nameLint (45 chars, no
// ':', not all capitals) is clean, and it does not smell of a seller title.
export function checkName(model, text, brand = '') {
  const n = String(model ?? '').trim().replace(/\s+/g, ' ')
  if (!n) return { name: '', why: 'empty' }
  if (!tokenSubset(n, text)) return { name: '', why: 'uses a word that is not in the listings' }
  const lint = nameLint(n)
  if (lint) return { name: '', why: lint }
  const smell = nameSmell(n, brand)
  if (smell) return { name: '', why: smell }
  return { name: n, why: '' }
}

// ----------------------------------------------------------------- wingspan
// The millimetres a quote states: extractSpanMM (adapters.mjs) first, then a
// plain "<number> <unit>" anywhere in the quote (a quote often drops the word
// "wingspan"). 150 to 4,000 mm only.
export function spanFromQuote(quote) {
  const q = String(quote ?? '')
  const v = extractSpanMM(q)
  if (v) return v
  const m = straighten(q).replace(/(\d),(?=\d{3}\b)/g, '$1').match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|")(?![a-z])/)
  if (!m) return null
  const mul = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, inches: 25.4, '"': 25.4 }[m[2]]
  const mm = Math.round(parseFloat(m[1]) * mul)
  return mm >= 150 && mm <= 4000 ? mm : null
}

// A wingspan counts when its quote is in the input and parses to the same
// value within 2%.
export function checkSpan(spanMM, quote, text) {
  const s = Number(spanMM)
  if (!Number.isFinite(s) || s < 150 || s > 4000) return null
  if (!quote || !quoteIn(quote, text)) return null
  const v = spanFromQuote(quote)
  if (!v || Math.abs(v - s) / s > 0.02) return null
  return Math.round(s)
}

// ------------------------------------------------------------ configurations
// The category's configs, with the aliases a model or seller uses: BNF and PNF
// are PNP, ARF is a kit (statedConfig labels it ARF from the title), and
// 'unstated' maps to the kit default. Anything else is not a configuration.
export function normConfig(c, configs = ['kit', 'pnp', 'rtf', 'combo']) {
  const v = String(c ?? '').trim().toLowerCase()
  if (v === 'bnf' || v === 'pnf') return configs.includes('pnp') ? 'pnp' : null
  if (v === 'arf') return configs.includes('kit') ? 'kit' : null
  if (v === 'unstated' || configs.includes(v)) return v
  return null
}
export const configForOffer = (c, configs) => {
  const v = normConfig(c, configs)
  return v === 'unstated' ? 'kit' : v
}

// Review's existing vocabulary: the old guess.kind and the reject reasons.
export const LEGACY_KIND = { airframe: 'aircraft', part: 'accessory', electronics: 'accessory', power: 'accessory', radio: 'accessory', tool: 'accessory', multirotor: 'other', helicopter: 'other', other: 'other' }
export const rejectReasonFor = (kind) => (LEGACY_KIND[kind] === 'accessory' ? 'accessory' : kind === 'airframe' ? null : 'out-of-scope')

// ------------------------------------------------------------------- roles
// The owner's taxonomy (2026-07 audit): Trainer is strict (a purpose-built
// learn-to-fly model, never a scale model marketed as easy, a glider only when
// a title says trainer), FPV / Flying Wing means FPV intent, not shape, and
// Glider / Sailplane needs the glider fact. Budget beginner foamies keep
// Trainer through beginner_trainer. [] = no confident tags; leave them alone.
export function rolePolicy(roles, titles = '') {
  if (!roles || typeof roles !== 'object') return []
  const tags = normalizeRoleTags((roles.tags ?? []).filter((t) => ROLE_TAGS.includes(t)))
  const titleTrainer = /\btrainer\b/i.test(String(titles))
  return normalizeRoleTags(tags.filter((t) => {
    if (t === 'Trainer') return roles.beginner_trainer === true && roles.scale_replica !== true && (roles.glider !== true || titleTrainer)
    if (t === 'FPV / Flying Wing') return roles.fpv_intent === true
    if (t === 'Glider / Sailplane') return roles.glider === true
    return true
  }))
}

// ------------------------------------------------------------ coercion
// Run BEFORE the schema check: models vary case on enum words and sometimes
// send numbers as strings. Only lossless fixes; anything else fails the schema.
const lc = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)
const num = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v)
const int = (v) => { const n = num(v); return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : n }
const tagCase = new Map(ROLE_TAGS.map((t) => [t.toLowerCase(), t]))

export function coerceListing(o, configs) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o
  const out = { ...o, kind: lc(o.kind), power: lc(o.power), confidence: num(o.confidence), pack_qty: int(o.pack_qty) }
  const c = normConfig(o.config, configs)
  out.config = c ?? lc(o.config)
  out.span_mm = o.span_mm == null || o.span_mm === '' ? null : int(o.span_mm)
  return out
}

export function coerceMaster(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o
  const out = { ...o, power: lc(o.power), span_mm: o.span_mm == null || o.span_mm === '' ? null : int(o.span_mm) }
  if (Array.isArray(o.tags)) out.tags = o.tags.map((t) => tagCase.get(String(t).trim().toLowerCase()) ?? t)
  for (const k of ['confidence_brand', 'confidence_model', 'confidence_span', 'confidence_roles']) if (k in o) out[k] = num(o[k])
  return out
}

export function coercePair(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o
  return { ...o, verdict: lc(o.verdict), same_manufacturer: lc(o.same_manufacturer), same_size: lc(o.same_size), confidence: num(o.confidence) }
}

// ------------------------------------------------------------ per task
// listing-v1 → the facts the curator may use, each already checked.
//   input: { title, shop, text, configs }
export function checkListing(out, input) {
  const src = `${input.title ?? ''}\n${input.text ?? ''}`
  const brand = checkBrand(out.brand, out.brand_quote, src)
  const nm = checkName(out.model, src, brand || out.brand)
  const config = normConfig(out.config, input.configs)
  return {
    kind: out.kind,
    confidence: out.confidence,
    brand,
    brandQuote: brand ? out.brand_quote : '',
    model: nm.name,
    modelWhy: nm.why,
    config: config === 'unstated' ? null : config, // null = the listing does not say
    spanMM: checkSpan(out.span_mm, out.span_quote, src),
    spanQuote: out.span_quote || '',
    power: out.power === 'gas' || out.power === 'electric' ? out.power : null,
    packQty: out.pack_qty,
    evidence: (out.evidence ?? []).filter((q) => quoteIn(q, src)),
  }
}

// master-v2 → checked facts. A brand or span must be quoted from the page's
// own listings (not from its current brand/name); the name may use words from
// the current name or the listings.
//   input: { brand, name, listings: [{shop,title,config,text}] }
const ROLE_FACTS = ['fpv_intent', 'beginner_trainer', 'glider', 'scale_replica', 'jet', 'warbird', 'aerobatic', 'airliner', 'sport']
export function checkMaster(out, input) {
  const titles = (input.listings ?? []).map((l) => l.title ?? '').join('\n')
  const listingText = (input.listings ?? []).map((l) => `${l.title ?? ''}\n${l.text ?? ''}`).join('\n')
  const brand = checkBrand(out.brand, out.brand_quote, listingText)
  const nm = checkName(out.model, `${input.name ?? ''}\n${listingText}`, brand || input.brand)
  const c = { brand: out.confidence_brand, model: out.confidence_model, span: out.confidence_span, roles: out.confidence_roles }
  const roles = { ...Object.fromEntries(ROLE_FACTS.map((f) => [f, out[f] === true])), tags: out.tags ?? [] }
  return {
    brand,
    brandQuote: brand ? out.brand_quote : '',
    brandConf: c.brand ?? 0,
    model: nm.name,
    modelWhy: nm.why,
    modelConf: c.model ?? 0,
    spanMM: checkSpan(out.span_mm, out.span_quote, listingText),
    spanQuote: out.span_quote || '',
    spanConf: c.span ?? 0,
    power: out.power === 'gas' || out.power === 'electric' ? out.power : null,
    fixedWing: out.fixed_wing !== false,
    tags: rolePolicy(roles, titles),
    roles,
    rolesConf: c.roles ?? 0,
  }
}

// pair-v1 → the verdict with only the evidence that is really in the titles.
//   input: { A: {listings:[{title}]}, B: {…} }
export function checkPair(out, input) {
  const titles = ['A', 'B'].flatMap((s) => (input?.[s]?.listings ?? []).map((l) => l.title ?? '')).join('\n')
  const names = ['A', 'B'].map((s) => input?.[s]?.name ?? '').join('\n')
  const evidence = (out.evidence ?? []).filter((q) => quoteIn(q, titles))
  const nm = out.verdict === 'same' ? checkName(out.name, `${names}\n${titles}`) : { name: '' }
  return { ...out, evidence, name: nm.name, quotesOk: evidence.length === (out.evidence ?? []).length }
}
