// Duplicate-master detection. Pure functions — same brand + same model.
//
// Two masters are the same product when they share a brand, their core name
// (marketing/config/colour words stripped) matches, and no SIZE token or
// wingspan contradicts. Obvious dupes (a shared size number or a matching
// wingspan pins them) auto-merge; a name-only overlap is a doubtful candidate
// the owner confirms.

// Marketing / config / colour words that don't identify the aircraft. NOT
// stripped: real model names, type words (trainer/glider) that can distinguish.
const NOISE = new Set([
  'rc', 'r/c', 'airplane', 'aeroplane', 'plane', 'aircraft', 'model', 'kit', 'kits',
  'pnp', 'pnf', 'rtf', 'arf', 'bnf', 'combo', 'set', 'version', 'edition', 'premium',
  'with', 'and', 'the', 'for', 'new', 'original', 'buy', 'india', 'sale', 'used',
  'white', 'black', 'red', 'blue', 'green', 'orange', 'yellow', 'grey', 'gray', 'silver', 'camo',
  'epo', 'epp', 'foam', 'balsa', 'lasercut', 'laser', 'cut', 'diy', 'stunt', 'scale', 'sport',
  'beginner', 'ready', 'to', 'fly', 'wing', 'wingspan', 'mm', 'cm',
])

// Size tokens: "1220", "1220mm", "1.2m", "600" — the number that names/sizes it.
export function sizeTokens(nameNorm = '') {
  const out = new Set()
  for (const m of String(nameNorm).matchAll(/\b(\d{3,4})\s?mm?\b|\b(\d{3,4})\b/g)) {
    const v = Number(m[1] ?? m[2])
    if (v >= 200 && v <= 4000) out.add(v)
  }
  for (const m of String(nameNorm).matchAll(/\b(\d)\.(\d)\s?m\b/g)) {
    const v = Number(m[1]) * 1000 + Number(m[2]) * 100
    if (v >= 200 && v <= 4000) out.add(v)
  }
  return out
}

// Core identity tokens: brand and noise and pure numbers removed.
export function coreTokens(nameNorm = '', brandNorm = '') {
  const brandWords = new Set(String(brandNorm).split(/\s+/).filter(Boolean))
  return String(nameNorm)
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w) && !brandWords.has(w) && !/^\d/.test(w))
}

const spanOf = (m) => {
  try {
    const v = Number(JSON.parse(m.specs || '{}').spanMM)
    return v > 0 ? v : null
  } catch {
    return null
  }
}

// --- brand confirmation ----------------------------------------------------
// A master's brand is "confirmed" when a distinctive word of it actually shows
// up in its own listing titles. Guessed-but-wrong brands (the Volantex-vs-FMS
// Ranger) fail this. Generic words appear in many brand names AND in ordinary
// titles, so they never confirm/accuse a brand on their own; house/blank brands
// have nothing to confirm.
const GENERIC_BRAND = new Set(['wing', 'wings', 'hobby', 'hobbies', 'model', 'models', 'plane', 'planes', 'aero', 'aircraft', 'airplane', 'sky', 'fly', 'flying', 'world', 'kit', 'kits', 'toys', 'toy', 'tech', 'craft', 'works', 'sport', 'sports', 'racing', 'star', 'rc'])
const HOUSE_BRAND = new Set(['', 'unbranded', 'generic', 'diy'])
const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const brandWords = (bn = '') => String(bn).split(/\s+/).filter((w) => w.length >= 4 && !GENERIC_BRAND.has(w))
export function brandConfirmed(brandNorm, titlesNorm) {
  if (titlesNorm == null) return true // no titles to check against → don't accuse
  const w = brandWords(brandNorm)
  if (!w.length) return true
  const t = ' ' + normText(titlesNorm) + ' '
  return w.some((x) => t.includes(' ' + x))
}

// compareCross(a, b): compare(a,b) with the same-brand gate removed — used only
// to surface a possible mislabel where one side's brand isn't confirmed. Returns
// a containment score 0..1 (0 = not a candidate). Never auto-merges: a same
// TYPE across real brands (Seagull vs FMS Cessna 182) also scores here, so the
// owner adjudicates every cross-brand pair.
export function compareCross(a, b) {
  const na = sizeTokens(a.name_norm), nb = sizeTokens(b.name_norm)
  if (na.size && nb.size && ![...na].some((x) => nb.has(x))) return 0
  const sa = spanOf(a), sb = spanOf(b)
  if (sa && sb && Math.abs(sa - sb) / Math.max(sa, sb) > 0.1) return 0
  const setA = new Set(coreTokens(a.name_norm, a.brand_norm))
  const setB = new Set(coreTokens(b.name_norm, b.brand_norm))
  const inter = [...setA].filter((x) => setB.has(x)).length
  const minLen = Math.min(setA.size, setB.size)
  if (!minLen || !inter) return 0
  const containment = inter / minLen
  const spanMatch = !!(sa && sb && Math.abs(sa - sb) / Math.max(sa, sb) <= 0.05)
  const sharedSize = [...na].some((x) => nb.has(x))
  if (containment >= 0.6 && (spanMatch || sharedSize || minLen >= 2)) return containment
  return 0
}

// compare(a, b) → { score 0..1, obvious, reason }. Order-independent.
export function compare(a, b) {
  if (!a.brand_norm || a.brand_norm !== b.brand_norm) return { score: 0, obvious: false, reason: 'different brand' }

  const na = sizeTokens(a.name_norm)
  const nb = sizeTokens(b.name_norm)
  // Both name a size and they don't overlap → different sizes, NOT a dupe.
  if (na.size && nb.size && ![...na].some((x) => nb.has(x))) return { score: 0, obvious: false, reason: 'different size numbers' }

  const sa = spanOf(a)
  const sb = spanOf(b)
  if (sa && sb && Math.abs(sa - sb) / Math.max(sa, sb) > 0.1) return { score: 0, obvious: false, reason: `wingspan ${sa}≠${sb}` }

  const ca = coreTokens(a.name_norm, a.brand_norm)
  const cb = coreTokens(b.name_norm, b.brand_norm)
  const setA = new Set(ca)
  const setB = new Set(cb)
  const inter = [...setA].filter((x) => setB.has(x)).length
  const minLen = Math.min(setA.size, setB.size)
  if (minLen === 0 || inter === 0) return { score: 0, obvious: false, reason: 'no shared model word' }
  const containment = inter / minLen // shorter name's core mostly inside the longer

  const sharedSize = [...na].some((x) => nb.has(x))
  const spanMatch = !!(sa && sb && Math.abs(sa - sb) / Math.max(sa, sb) <= 0.05)
  // Core token SETS must be equal for an auto-merge — a name that is merely a
  // prefix ("Ranger" vs "Ranger EP V2") has an extra distinguishing token and
  // stays a doubtful candidate, never an automatic merge.
  const coreEqual = setA.size === setB.size && [...setA].every((x) => setB.has(x))

  // OBVIOUS: identical core name pinned by a shared size number or matching span.
  const obvious = coreEqual && (sharedSize || spanMatch)
  // CANDIDATE: strong core overlap the size/span didn't pin — owner decides.
  const score = obvious ? 1 : containment >= 0.6 ? 0.6 + 0.3 * containment : 0

  const reason = obvious
    ? `same brand + core "${[...setA].filter((x) => setB.has(x)).join(' ')}"` + (sharedSize ? ` + size ${[...na].find((x) => nb.has(x))}` : ` + span ${sa}mm`)
    : `core overlap ${(containment * 100) | 0}% (${[...setA].filter((x) => setB.has(x)).join(' ') || '—'})`
  return { score, obvious, reason }
}

// The preferred survivor of a set: ready>draft, then more offers, then the
// shorter (cleaner) name, then lower id.
const survivorRank = (m) => [m.status === 'ready' ? 0 : 1, -(m.offers ?? 0), (m.name || '').length, m.id]
export function bestSurvivor(list) {
  return list.reduce((x, y) => {
    const rx = survivorRank(x)
    const ry = survivorRank(y)
    for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] < ry[i] ? x : y
    return x
  })
}

// Given all masters, return { obviousClusters, candidatePairs }.
//   obviousClusters: [[master,…]] connected components of obvious dupes —
//     merge every member into bestSurvivor(cluster) (order-independent, so a
//     3-way dup like Ranger 600 white/black/plain collapses cleanly to one).
//   candidatePairs: [{a,b,score,reason}] doubtful pairs (a = preferred survivor)
//     for the owner to confirm.
export function findDuplicates(masters) {
  const byBrand = new Map()
  for (const m of masters) {
    if (!m.brand_norm) continue
    const g = byBrand.get(m.brand_norm) ?? []
    g.push(m)
    byBrand.set(m.brand_norm, g)
  }
  const byId = new Map(masters.map((m) => [m.id, m]))
  const parent = new Map()
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => {
    for (const id of [a, b]) if (!parent.has(id)) parent.set(id, id)
    parent.set(find(a), find(b))
  }
  const candidatePairs = []
  for (const group of byBrand.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const c = compare(group[i], group[j])
        if (c.score <= 0) continue
        if (c.obvious) {
          union(group[i].id, group[j].id)
        } else {
          const a = bestSurvivor([group[i], group[j]])
          const b = a === group[i] ? group[j] : group[i]
          candidatePairs.push({ a, b, score: c.score, reason: c.reason })
        }
      }
    }
  }
  const clusters = new Map()
  for (const id of parent.keys()) {
    const r = find(id)
    if (!clusters.has(r)) clusters.set(r, [])
    clusters.get(r).push(byId.get(id))
  }
  const obviousClusters = [...clusters.values()].filter((c) => c.length > 1)

  // --- brand anomalies + cross-brand duplicate candidates -------------------
  // Only runs when masters carry `titles` (dedupSlice supplies them; the unit
  // tests don't, so their behaviour is unchanged). Trusted brand vocabulary =
  // distinctive words of brands confirmed by their own titles somewhere.
  const vocab = new Map()
  for (const m of masters) if (m.brand_norm && brandConfirmed(m.brand_norm, m.titles)) for (const w of brandWords(m.brand_norm)) if (!vocab.has(w)) vocab.set(w, m.brand)
  const byCat = new Map()
  for (const m of masters) { const g = byCat.get(m.category_id) ?? []; g.push(m); byCat.set(m.category_id, g) }
  const anomalies = []
  const seenCross = new Set()
  for (const m of masters) {
    if (m.titles == null) continue
    const house = HOUSE_BRAND.has(String(m.brand_norm || '').trim())
    if (!m.brand_norm || house || brandConfirmed(m.brand_norm, m.titles)) continue
    // (a) a DISTINCTIVE different brand appears in the listing titles → mislabel
    const tn = ' ' + normText(m.titles) + ' '
    const mine = new Set(brandWords(m.brand_norm))
    const others = new Set()
    for (const [w, canon] of vocab) if (!mine.has(w) && tn.includes(' ' + w)) others.add(canon)
    if (others.size) anomalies.push({ id: m.id, kind: 'brand-mismatch', detail: `listing titles say ${[...others].join(' / ')}, tagged "${m.brand}"` })
    // (b) unconfirmed brand + strong match to an other-brand master → the owner
    //     confirms whether it's the same product mislabelled, or a real sibling.
    for (const o of byCat.get(m.category_id) ?? []) {
      if (o.id === m.id || o.brand_norm === m.brand_norm) continue
      const key = m.id < o.id ? m.id + ':' + o.id : o.id + ':' + m.id
      if (seenCross.has(key)) continue
      const score = compareCross(m, o)
      if (score <= 0) continue
      seenCross.add(key)
      const a = bestSurvivor([m, o]); const b = a === m ? o : m
      candidatePairs.push({ a, b, score: +score.toFixed(2), reason: `possible mislabel — same model, brand differs (${a.brand || '—'} vs ${b.brand || '—'})` })
    }
  }
  return { obviousClusters, candidatePairs, anomalies }
}
