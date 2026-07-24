// Pure manufacturer matcher. Shared by local tooling and the production
// harvesting cron; no environment access and no I/O.

// Wingspan (mm) from free text: "1200mm", "1.2M", "wingspan: 1200 mm".
export function spanOf(text) {
  const t = ' ' + (text || '') + ' '
  const m =
    t.match(/wing\s*span[^0-9]{0,14}(\d{3,4})\s*mm/i) ||
    t.match(/\b(\d{3,4})\s*mm\b/i) ||
    t.match(/\b(\d(?:\.\d)?)\s*m\b(?!m)/i)
  if (!m) return null
  const v = parseFloat(m[1])
  return v < 10 ? Math.round(v * 1000) : Math.round(v)
}

// Strong build signals win; otherwise exclude common parts/accessories.
const STRONG = /\b(pnp|rtf|bnf|arf)\b/i
const PART =
  /(conversion kit|tail boom|fuselage|hatch|canopy|servo|\besc\b|\bvtx\b|\bvrx\b|\bmotor\b|propeller|\bprop\b|landing gear|\bcover\b|protector|\bmount\b|spare|replacement|\bcable\b|antenna|sticker|decal|foam set|foam case|carrying|storage|\bstand\b|charger|\bbattery\b|receiver|goggle|\blens\b|\bscrew\b|\bblock\b|\bpart\b|\bparts\b|set of|\bpack\b|\bbag\b|kit foam|nose \d|main wing|wing set|for rc (airplane|plane)|\d set\b)/i
export function isAircraft(title) {
  const t = title || ''
  if (STRONG.test(t)) return true
  if (PART.test(t)) return false
  return /\b(plane|glider|trainer|warbird|edf|jet|delta)\b/i.test(t) || /(fixed|flying)[\s-]*wing/i.test(t)
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

export function tierCandidate(candidate, margin = 1) {
  if (!candidate || candidate.name < 0.35) return 'reject'
  if (candidate.span_agree === 0) return 'review'
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
  const ranked = candidates
    .map((product) => {
      const name = nameSim(master.name, product.title, aliases)
      const agree = spanClose(oSpan, product.span)
      return {
        product,
        name,
        span_agree: oSpan && product.span ? (agree ? 1 : 0) : null,
        score: name + (agree ? 0.15 : 0),
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
