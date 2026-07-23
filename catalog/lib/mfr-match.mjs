// Pure matcher — no env, no I/O. Shared by the local batch (Shopify/HTML) and
// the worker cron (browser-render) so every match is scored identically.
// Given a master + a manufacturer's aircraft products, pick the best match with
// a wingspan tiebreak, and tier it (accept | review | reject).

// wingspan (mm) from free text: "1200mm", "1.2M", "wingspan: 1200 mm"
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

// aircraft vs part/accessory. Strong build-signal (PNP/RTF/BNF/ARF) is decisive;
// otherwise part-words exclude. Fixes "parts beat planes".
const STRONG = /\b(pnp|rtf|bnf|arf)\b/i
const PART =
  /(conversion kit|tail boom|fuselage|hatch|canopy|servo|\besc\b|\bvtx\b|\bvrx\b|\bmotor\b|propeller|\bprop\b|landing gear|\bcover\b|protector|\bmount\b|spare|replacement|\bcable\b|antenna|sticker|decal|foam set|foam case|carrying|storage|\bstand\b|charger|\bbattery\b|receiver|goggle|\blens\b|\bscrew\b|\bblock\b|\bpart\b|\bparts\b|set of|\bpack\b|\bbag\b|kit foam|nose \d|main wing|wing set|for rc (airplane|plane)|\d set\b)/i
export function isAircraft(title) {
  const t = title || ''
  if (STRONG.test(t)) return true
  if (PART.test(t)) return false
  return /\b(plane|glider|trainer|warbird|edf|jet|delta)\b/i.test(t) || /(fixed|flying)[\s-]*wing/i.test(t)
}

// name match = containment of OUR (short) model tokens in THEIR (padded) title.
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
    if (/^\d+$/.test(tok)) { if (new RegExp('\\b' + tok).test(t)) hit++ }
    else if (t.includes(' ' + tok + ' ')) hit++
  }
  return hit / ours.length
}

const spanClose = (a, b) => a && b && Math.abs(a - b) / Math.max(a, b) <= 0.03

// candidates: [{ id/ext_id, title, span, body_text, ... }] (already aircraft-filtered)
// returns { product, score, span_agree, tier } | null
export function matchMaster(master, candidates, aliases = []) {
  if (!candidates.length) return null
  const oSpan = master.span || null
  const ranked = candidates
    .map((p) => {
      const name = nameSim(master.name, p.title, aliases)
      const agree = spanClose(oSpan, p.span)
      return { product: p, name, span_agree: oSpan && p.span ? (agree ? 1 : 0) : null, score: name + (agree ? 0.15 : 0) }
    })
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  best.tier =
    best.name >= 0.6 && best.span_agree !== 0 ? 'accept'
    : best.name >= 0.6 && best.span_agree === 0 ? 'review' // name matches but span conflicts → audit
    : best.name >= 0.35 ? 'review'
    : 'reject'
  return best
}
