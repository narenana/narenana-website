/**
 * Flight Debrief narration — prompt contract + post-check.
 *
 * PROMPT_VERSION is part of the KV cache key: bump it on ANY edit to
 * the strings below, or previously cached narrations keep serving the
 * old prompt's output for up to 30 days (the shared samples are the
 * hottest cache keys). The eval rubric in the viewer repo
 * (docs/eval/) re-runs on every bump.
 */
export const PROMPT_VERSION = 'p4'

const FINDING_MEANINGS = `
E1 unterminated log (recording stopped without its footer — power died mid-write)
E2 recording ends mid-air (no landing in the data)
E3 electrical death rattle (final writes show the ADC collapsing — impossible sensor values)
E4 instant power interruption in flight (composite: healthy battery to the last sample, then silence)
E5 power connection degrading (supply impedance rising through the flight)
E6 in-flight brownout that recovered
R1 failsafe engaged
R2 RC signal lost (loss_slant_m = hypotenuse distance from launch to the last known position at loss; pattern range_boundary = losses at the edge of the flight's envelope, the link running out of range — expected physics; close_in = losses far inside the envelope, so distance is NOT the cause and antennas/shading/interference are; mixed = no single distance boundary)
R3 link quality degrading (distance_correlated=true means it tracks range, likely physics not fault)
R4 RC control updates arriving slowly
B1 battery internal resistance high (tired pack)
B2 battery low at landing
B3 battery sags more than its model expects
B4 battery/endurance summary (informational)
M1 elevated vibration (experimental detector)
M2 uncommanded oscillation (experimental detector)
L0 link health profile (informational — worst link quality per distance band; edge_min_lq = worst reading near the flight's farthest range)
B0 power profile (informational — max current per throttle band)
X1 clean flight (no warnings)
X2 note about which checks could run on this log type`

export function buildMessages(payload) {
  const system = `You are the Flight Debrief narrator inside a browser-based RC flight-log viewer. You receive a JSON summary of deterministic findings computed locally from a pilot's flight log. You never see the log itself.

Write the debrief for the pilot. Rules, all hard:
- Use ONLY the findings and numbers in the JSON. Never invent sensor values, causes, times, or hardware. If evidence is absent, do not speculate about it.
- A failure type that is not in the findings array DID NOT HAPPEN. Never describe power loss, signal loss, battery problems, or any fault unless its finding is present. If findings hold no warning or critical entries, the flight was fine — say so plainly.
- Refer to findings naturally (never print raw ids like "E4").
- Tone: a calm, experienced pilot friend. No blame, no drama, no exclamation marks. Hedge honestly where confidence is below 0.7.
- Structure, exactly these three sections with these headings:
What happened — at most 120 words telling the flight's story from the findings.
The evidence — one short bullet per warning/critical finding, quoting its numbers.
Before the next flight — a numbered list of at most 4 concrete actions, most valuable first. For a clean flight, one line saying nothing needs attention.
- Plain text only: no links, no URLs, no markdown emphasis, no emoji.

Finding id meanings (for your understanding only — do not print ids):${FINDING_MEANINGS}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ]
}

/**
 * Server-side post-check (mirrored lighter on the client). The model
 * may only narrate what the payload contains: reject output that
 * leaks ids we didn't send, contains URLs, or ships suspiciously long.
 * Returns { ok, cleaned } — cleaned has URLs stripped defensively even
 * when ok.
 */
export function postCheck(text, payload) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty', cleaned: '' }
  if (text.length > 4000) return { ok: false, reason: 'too-long', cleaned: '' }
  const sentIds = new Set(payload.findings.map(f => f.id))
  // Any finding-id token the payload did NOT contain = the model is
  // hallucinating detectors (or echoing injected text).
  const idTokens = text.match(/\b(E[1-6]|R[1-4]|B[1-4]|M[1-2]|X[1-2])\b/g) || []
  for (const t of idTokens) if (!sentIds.has(t)) return { ok: false, reason: 'foreign-id:' + t, cleaned: '' }
  const cleaned = text.replace(/https?:\/\/\S+/gi, '').replace(/\bwww\.\S+/gi, '')
  const required = ['What happened', 'The evidence', 'Before the next flight']
  for (const h of required) if (!cleaned.includes(h)) return { ok: false, reason: 'missing-section:' + h, cleaned: '' }
  return { ok: true, cleaned }
}

/** Deterministic narration for CLEAN flights — no model involved.
 *  A clean payload gives an 8B model nothing to do except imagine
 *  failures (observed in eval), so it never reaches one. */
export function cleanNarration(payload) {
  const b4 = payload.findings.find(f => f.id === 'B4')
  const mins = Math.floor((payload.context.duration_s || 0) / 60)
  const secs = Math.round((payload.context.duration_s || 0) % 60)
  const bits = []
  if (b4?.evidence?.mah_used) bits.push(`${b4.evidence.mah_used} mAh used`)
  if (b4?.evidence?.avg_current_a) bits.push(`averaging ${b4.evidence.avg_current_a} A`)
  if (b4?.evidence?.end_v_per_cell) bits.push(`landed at ${b4.evidence.end_v_per_cell} V per cell`)
  return `What happened — A clean ${mins}:${String(secs).padStart(2, '0')} flight. Every check this log supports came back normal${bits.length ? ' (' + bits.join(', ') + ')' : ''}.

The evidence — No warnings. Nothing in the data needed a second look.

Before the next flight — Nothing needs attention. Fly it again.`
}

/** Deterministic canned narration for DEBRIEF_TEST_MODE — integration
 *  tests exercise the full endpoint without spending Neurons. */
export function cannedNarration(payload) {
  const worst = payload.findings[0]
  return `What happened — Test-mode narration for a ${payload.context.source} log of ${payload.context.duration_s}s. Top finding severity: ${worst ? worst.severity : 'none'}.

The evidence — ${payload.findings.filter(f => ['warning', 'critical'].includes(f.severity)).map(f => `${f.severity} finding with ${Object.keys(f.evidence || {}).length} evidence values`).join('; ') || 'no warnings'}.

Before the next flight — 1. This is canned test output; enable the real model for narration.`
}
