// Pure manufacturer matcher. Shared by local tooling and the production
// harvesting cron; no environment access and no I/O.

// Wingspan (mm) from free text: "1200mm", "1,400mm", "1.2M", "wingspan: 1200 mm",
// '68.2" wing span', "60 in Extra". Wingspan-LABELED matches always win; bare
// numbers are trusted only in short text (titles) — long descriptions mention
// too many other millimetre/inch figures ("includes 330mm propeller").
export function spanOf(text) {
  const t = (' ' + (text || '') + ' ').replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
  const mm = (v) => Math.round(parseFloat(v))
  const inch = (v) => Math.round(parseFloat(v) * 25.4)
  let m
  if ((m = t.match(/wing\s*span[^0-9]{0,14}(\d{3,4})\s*mm/i))) return mm(m[1])
  if ((m = t.match(/wing\s*span[^0-9]{0,14}(\d{2,3}(?:\.\d)?)\s*(?:"|''|″|in(?:ch(?:es)?)?\b)/i))) return inch(m[1])
  if ((m = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:"|''|″|in(?:ch(?:es)?)?\b)[^a-z0-9]{0,6}wing\s*span/i))) return inch(m[1])
  if ((m = t.match(/wing\s*span[^0-9]{0,14}(\d(?:\.\d{1,2})?)\s*m\b(?!m)/i))) return mm(parseFloat(m[1]) * 1000)
  if (t.length <= 90) {
    if ((m = t.match(/\b(\d{3,4})\s*mm\b/i))) return mm(m[1])
    if ((m = t.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:"|''|″|in(?:ch(?:es)?)?\b)/i))) return inch(m[1])
    if ((m = t.match(/\b(\d(?:\.\d)?)\s*m\b(?!m)/i))) return mm(parseFloat(m[1]) * 1000)
  }
  return null
}

// Strong build signals win; otherwise exclude common parts/accessories. The
// store's own product_type (Shopify) is more reliable than any title heuristic
// — kit/aerobatic brands title planes with nothing but a model name + inch span
// ("EDGE 540N 68.2\" WING SPAN"), which pure title matching wrongly drops.
const STRONG = /\b(pnp|rtf|bnf|arf|rxr|receiver[\s-]*ready)\b/i
const TYPE_AIRCRAFT = /\b(aircraft|air\s*plane|airplane|plane|glider|sailplane|warbird|edf|jet|biplane|3d|aerobatic|trainer|delta|fpv)\b/i
const TYPE_PART = /\b(accessor|part|spare|hardware|electronic|covering|adhesive|engine|motor|servo|radio|batter|charger|prop|wheel|tool|field|pilot(s| figure)?|decal|apparel|gift)\b/i
const PART =
  /(conversion kit|tail boom|fuselage|hatch|canopy|servo|\besc\b|\bvtx\b|\bvrx\b|\bmotor\b|propeller|\bprop\b|landing gear|\bcover\b|protector|\bmount\b|spare|replacement|\bcable\b|antenna|sticker|decal|foam set|foam case|carrying|storage|\bstand\b|charger|\bbattery\b|receiver|goggle|\blens\b|\bscrew\b|\bblock\b|\bpart\b|\bparts\b|set of|\bpack\b|\bbag\b|kit foam|nose \d|main wing|wing set|for rc (airplane|plane)|\d set\b)/i
export function isAircraft(title, productType) {
  const t = title || ''
  if (STRONG.test(t)) return true
  if (productType) {
    if (TYPE_PART.test(productType)) return false
    if (TYPE_AIRCRAFT.test(productType)) return true
  }
  if (PART.test(t)) return false
  if (/\b(plane|glider|trainer|warbird|edf|jet|delta)\b/i.test(t) || /(fixed|flying)[\s-]*wing/i.test(t)) return true
  // A wingspan marker in the title ("68.2\" WING SPAN", "71 inches") after the
  // part-words exclusion is an aircraft signal — kit brands title planes this way.
  return /wing\s*span/i.test(t) || /\b\d{2,3}(?:\.\d)?\s*(?:"|″|in(?:ch(?:es)?)?\b)/i.test(t)
}

// Name match is containment of our short model tokens in the padded official
// title. Brand names and storefront noise do not count as evidence.
const NOISE =
  /\b(pnp|rtf|bnf|arf|kit|combo|fpv|vtol|version|set|pack|edition|rc|plane|airplane|aircraft|fixed|wing|conversion|the|with|for|and|beginner|channel|\d?ch|stabiliz\w*|xpilot|epo|foam|scale|superior|unleash|precision|soar|new|heights|strong|streaml\w*)\b/gi
export function modelToks(s, aliases = []) {
  let x = ' ' + (s || '').toLowerCase() + ' '
  for (const a of aliases) x = x.split(a).join(' ')
  return x.replace(NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length >= 2)
}

export function nameSim(ourName, theirTitle, aliases = []) {
  const ours = modelToks(ourName, aliases)
  if (!ours.length) return 0
  const t = ' ' + (theirTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
  let hit = 0
  for (const tok of ours) {
    if (/^\d+$/.test(tok)) {
      // Permit 600 <-> 600S, but never 757 <-> 75708.
      if (new RegExp('\\b' + tok + '(?:[a-z]\\b|\\b)').test(t)) hit++
    } else if (t.includes(' ' + tok + ' ')) {
      hit++
    }
  }
  return hit / ours.length
}

const spanClose = (a, b) => a && b && Math.abs(a - b) / Math.max(a, b) <= 0.03

// Normalize common manufacturer build/package labels. Keep distinct variants
// distinct: a PNP catalog offer should not silently auto-map to an ARF/RTF SKU.
export function configTypes(text) {
  const t = String(text ?? '').toLowerCase()
  const out = []
  const has = (type, pattern) => {
    if (pattern.test(t)) out.push(type)
  }
  // "almost ready to fly" contains "ready to fly", so test it separately and
  // suppress the broader RTF phrase in that case.
  const arf = /\b(?:arf|almost[\s-]*ready[\s-]*to[\s-]*fly)\b/i.test(t)
  if (arf) out.push('arf')
  if (!arf) has('rtf', /\b(?:rtf|ready[\s-]*to[\s-]*fly)\b/i)
  has('bnf', /\b(?:bnf|bind[\s-]*(?:and|n)[\s-]*fly)\b/i)
  has('pnp', /\b(?:pnp|pnf|plug[\s-]*(?:and|n)?[\s-]*(?:play|fly))\b/i)
  has('rxr', /\b(?:rxr|receiver[\s-]*ready)\b/i)
  has('combo', /\b(?:combo|bundle)\b/i)
  has('kit', /\bkit\b/i)
  return [...new Set(out)]
}

// The catalog's current four-value taxonomy stores ARF seller listings as
// "kit". BNF/RxR have no honest equivalent, so leave them unknown rather than
// manufacturing a conflict from incomplete catalog data.
export function configAgreement(ourValue, theirValue) {
  const ours = configTypes(Array.isArray(ourValue) ? ourValue.join(' ') : ourValue)
  const theirs = configTypes(Array.isArray(theirValue) ? theirValue.join(' ') : theirValue)
  const known = new Set(['kit', 'pnp', 'rtf', 'combo'])
  const ourComparable = ours.filter((type) => known.has(type))
  const theirComparable = theirs
    .map((type) => (type === 'arf' ? 'kit' : type))
    .filter((type) => known.has(type))
  if (!ourComparable.length || !theirComparable.length) return null
  return ourComparable.some((type) => theirComparable.includes(type)) ? 1 : 0
}

const productConfigs = (product) => {
  const title = configTypes(product?.title)
  return title.length ? title : configTypes(product?.body_text)
}

export function tierCandidate(candidate, margin = 1) {
  if (!candidate || candidate.name < 0.35) return 'reject'
  if (candidate.span_agree === 0) return 'review'
  if (candidate.config_agree === 0) return 'review'
  // Ambiguous variants belong in the picker. A complete token match can
  // auto-accept even if colour/config variants have the same score.
  if (candidate.name >= 0.75 && (candidate.name >= 0.999 || margin >= 0.1)) return 'accept'
  return 'review'
}

// Return several ranked candidates so a reviewer can select the correct
// manufacturer SKU instead of accepting a single irreversible guess.
export function rankCandidates(master, candidates, aliases = [], limit = 5) {
  if (!candidates.length) return []
  const oSpan = master.span || null
  const ourConfigs = configTypes(Array.isArray(master.configs) ? master.configs.join(' ') : master.configs)
  const ranked = candidates
    .map((product) => {
      const name = nameSim(master.name, product.title, aliases)
      const agree = spanClose(oSpan, product.span)
      const theirConfigs = productConfigs(product)
      const configAgree = configAgreement(ourConfigs, theirConfigs)
      return {
        product,
        name,
        span_agree: oSpan && product.span ? (agree ? 1 : 0) : null,
        config_types: theirConfigs,
        config_agree: configAgree,
        score: name + (agree ? 0.15 : 0) + (configAgree === 1 ? 0.08 : configAgree === 0 ? -0.05 : 0),
      }
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.name - a.name ||
      String(a.product.title).localeCompare(String(b.product.title)),
    )

  for (let i = 0; i < ranked.length; i++) {
    ranked[i].margin = ranked[i].score - (ranked[i + 1]?.score ?? 0)
    ranked[i].tier = tierCandidate(ranked[i], ranked[i].margin)
  }
  return ranked.slice(0, Math.max(1, limit))
}

// Compatibility helper for existing local tools.
export function matchMaster(master, candidates, aliases = []) {
  return rankCandidates(master, candidates, aliases, 1)[0] ?? null
}
