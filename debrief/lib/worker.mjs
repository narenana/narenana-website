/**
 * Flight Debrief narration endpoint — POST /api/debrief.
 *
 * Design: edgetx-log-parser/docs/FLIGHT-DEBRIEF-DESIGN.md rev 2 §6.
 * The client sends ONLY the findings JSON (validated again here — the
 * endpoint is public), never the log. Guards, in order:
 *   CORS allowlist → strict schema → device token (issued after a
 *   Turnstile solve; HMAC-signed, ≤24 h, bound to the IP prefix) →
 *   Durable Object rate limit (per IPv6 /64 / IPv4 /32) → global
 *   daily budget on the same DO → KV cache keyed
 *   SHA-256(canonical payload ‖ model ‖ PROMPT_VERSION).
 * Model output is post-checked server-side; only passing responses are
 * cached and served. Every failure path returns {fallback:'templates'}
 * so the client's deterministic cards always stand.
 */
import { validatePayload, MAX_PAYLOAD_BYTES } from './validate.mjs'
import { PROMPT_VERSION, buildMessages, postCheck, cannedNarration, cleanNarration } from './prompt.mjs'

const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct'
const TOKEN_TTL_S = 24 * 3600
const RATE_LIMIT = { limit: 10, windowS: 3600 }
const DAILY_BUDGET = 400 // narrations/day across everyone (free-tier Neuron headroom)
// Per-IP-prefix daily cap on MODEL calls. Bounds how much of the global
// budget any single network can claim, so a distributed quota-drain needs
// many prefixes, not two. Tunable via env.DEBRIEF_PREFIX_DAILY_CAP.
const PREFIX_DAILY_CAP = 20
const CACHE_TTL_S = 30 * 24 * 3600

const ALLOWED_ORIGINS = [
  /^https:\/\/www\.narenana\.com$/,
  /^https:\/\/latest\.narenana\.com$/,
  /^https:\/\/edgetx-log-parser\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.edgetx-log-parser\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

// ── helpers ────────────────────────────────────────────────────────────

const enc = new TextEncoder()

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(msg) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(msg))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** IPv4 /32, IPv6 /64 — the granularity residential networks rotate at. */
export function ipPrefix(ip) {
  if (!ip) return 'unknown'
  if (ip.includes(':')) {
    const parts = ip.split(':')
    return parts.slice(0, 4).join(':') + '::/64'
  }
  return ip
}

async function mintToken(env, prefix) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S
  const body = `${prefix}.${exp}`
  const sig = await hmac(env.DEBRIEF_TOKEN_SECRET || 'dev-secret', body)
  return `${btoa(body)}.${sig}`
}

async function verifyToken(env, token, prefix) {
  if (typeof token !== 'string' || !token.includes('.')) return false
  const dot = token.lastIndexOf('.')
  let body
  try { body = atob(token.slice(0, dot)) } catch { return false }
  const sig = token.slice(dot + 1)
  const expect = await hmac(env.DEBRIEF_TOKEN_SECRET || 'dev-secret', body)
  if (sig !== expect) return false
  const [tokPrefix, expStr] = [body.slice(0, body.lastIndexOf('.')), body.slice(body.lastIndexOf('.') + 1)]
  if (tokPrefix !== prefix) return false
  return Number(expStr) > Math.floor(Date.now() / 1000)
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

const json = (obj, status, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-robots-tag': 'noindex', ...extra },
  })

/** Serve vetted narration as an SSE stream (progressive render on the
 *  client) with a terminal `usage` event. The text is fully post-checked
 *  BEFORE the first byte leaves — the stream is presentation, not a
 *  bypass of the check. */
function sseResponse(text, meta, cors) {
  const words = text.split(/(\s+)/)
  const stream = new ReadableStream({
    async start(controller) {
      const e = new TextEncoder()
      let buf = ''
      let count = 0
      for (const w of words) {
        buf += w
        count++
        if (count >= 16) {
          controller.enqueue(e.encode(`event: chunk\ndata: ${JSON.stringify(buf)}\n\n`))
          buf = ''
          count = 0
        }
      }
      if (buf) controller.enqueue(e.encode(`event: chunk\ndata: ${JSON.stringify(buf)}\n\n`))
      controller.enqueue(e.encode(`event: usage\ndata: ${JSON.stringify(meta)}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...cors,
    },
  })
}

// ── Durable Object: rate limiter + daily budget ───────────────────────
// One class, two roles by instance name: idFromName(ipPrefix) does the
// sliding-window rate limit; idFromName('budget') counts the global
// daily spend. KV can do neither (eventual consistency, no atomic
// increment) — this is the strongly-consistent single point the review
// demanded.
export class DebriefLimiter {
  constructor(state) {
    this.state = state
  }
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/take') {
      const limit = Number(url.searchParams.get('limit'))
      const windowS = Number(url.searchParams.get('window'))
      const now = Date.now()
      let hits = (await this.state.storage.get('hits')) || []
      hits = hits.filter(t => now - t < windowS * 1000)
      if (hits.length >= limit) {
        return json({ ok: false, retryAfterS: Math.ceil((hits[0] + windowS * 1000 - now) / 1000) }, 200)
      }
      hits.push(now)
      await this.state.storage.put('hits', hits)
      return json({ ok: true }, 200)
    }
    if (url.pathname === '/budget') {
      const cap = Number(url.searchParams.get('cap'))
      const day = new Date().toISOString().slice(0, 10)
      const rec = (await this.state.storage.get('day')) || { day, n: 0 }
      const fresh = rec.day === day ? rec : { day, n: 0 }
      if (fresh.n >= cap) return json({ ok: false }, 200)
      fresh.n++
      await this.state.storage.put('day', fresh)
      return json({ ok: true, n: fresh.n }, 200)
    }
    // Per-prefix DAILY model-call cap. Same shape as /budget but stored on
    // the per-prefix instance (idFromName(ipPrefix)) under its own key, so
    // it counts only this network's spend. Resets at UTC midnight.
    if (url.pathname === '/dtake') {
      const cap = Number(url.searchParams.get('cap'))
      const day = new Date().toISOString().slice(0, 10)
      const rec = (await this.state.storage.get('pday')) || { day, n: 0 }
      const fresh = rec.day === day ? rec : { day, n: 0 }
      if (fresh.n >= cap) return json({ ok: false }, 200)
      fresh.n++
      await this.state.storage.put('pday', fresh)
      return json({ ok: true, n: fresh.n }, 200)
    }
    return json({ error: 'no route' }, 404)
  }
}

// ── the handler ────────────────────────────────────────────────────────

export async function handleDebrief(request, env) {
  const origin = request.headers.get('origin') || ''
  const originOk = ALLOWED_ORIGINS.some(re => re.test(origin))
  const cors = originOk ? corsHeaders(origin) : {}

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: originOk ? 204 : 403, headers: cors })
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors)
  if (!originOk) return json({ error: 'origin not allowed' }, 403)

  // Bound the read before parsing.
  const raw = await request.text()
  if (raw.length > MAX_PAYLOAD_BYTES * 2) return json({ error: 'too large', fallback: 'templates' }, 413, cors)
  let body
  try { body = JSON.parse(raw) } catch { return json({ error: 'bad json', fallback: 'templates' }, 400, cors) }

  const payload = body.payload
  const errs = validatePayload(payload)
  if (errs.length) return json({ error: 'invalid payload', detail: errs.slice(0, 5), fallback: 'templates' }, 400, cors)
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return json({ error: 'too large', fallback: 'templates' }, 413, cors)

  const ip = request.headers.get('cf-connecting-ip') || ''
  let prefix = ipPrefix(ip)
  // TEST MODE ONLY: an integration run isolates its rate-limit window
  // via a per-run bucket, since the DO's real window (by design)
  // persists across runs. Production ignores this header entirely.
  if (env.DEBRIEF_TEST_MODE === '1') {
    const bucket = request.headers.get('x-debrief-test-bucket')
    if (bucket) prefix = 'test:' + bucket.slice(0, 32)
  }

  // ── device token / Turnstile ───────────────────────────────────────
  // Turnstile is OPTIONAL: it's active only when TURNSTILE_SECRET is
  // configured. Unconfigured, we skip the bot-check and mint a token on
  // first contact — the DO rate limit + daily budget still bound abuse
  // and cost. This lets the endpoint ship before a Turnstile widget
  // exists; setting the two secrets later turns the challenge on with no
  // code change (and the client only loads the Turnstile script once a
  // real sitekey comes back, so the unconfigured path loads nothing).
  let freshToken = null
  const tokenOk = await verifyToken(env, body.token, prefix)
  if (!tokenOk) {
    const turnstileOn = !!env.TURNSTILE_SECRET
    if (turnstileOn) {
      const ts = body.turnstile
      if (!ts) {
        // No token, no solve → challenge. Sitekey ships here so the client
        // only ever loads the Turnstile script after consent.
        return json({ challenge: true, sitekey: env.TURNSTILE_SITE_KEY || null, fallback: 'templates' }, 403, cors)
      }
      const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET)}&response=${encodeURIComponent(ts)}&remoteip=${encodeURIComponent(ip)}`,
      }).then(r => r.json()).catch(() => ({ success: false }))
      if (!vr.success) return json({ error: 'turnstile failed', challenge: true, sitekey: env.TURNSTILE_SITE_KEY || null, fallback: 'templates' }, 403, cors)
    }
    freshToken = await mintToken(env, prefix)
  }

  // ── rate limit + budget (Durable Object) ───────────────────────────
  const limiter = env.DEBRIEF_LIMITER.get(env.DEBRIEF_LIMITER.idFromName(prefix))
  const rlLimit = Number(env.DEBRIEF_RATE_LIMIT) || RATE_LIMIT.limit
  const rl = await limiter.fetch(`https://do/take?limit=${rlLimit}&window=${RATE_LIMIT.windowS}`).then(r => r.json())
  // A fresh token rides along on every outcome — a Turnstile solve must
  // never be wasted on a rate-limited or budget-capped request.
  if (!rl.ok) return json({ error: 'rate limited', retryAfterS: rl.retryAfterS, fallback: 'templates', ...(freshToken ? { token: freshToken } : {}) }, 429, cors)

  // ── cache ──────────────────────────────────────────────────────────
  const model = env.DEBRIEF_MODEL || DEFAULT_MODEL
  const cacheKey = 'narr:' + (await sha256hex(JSON.stringify(payload) + '|' + model + '|' + PROMPT_VERSION))
  const cached = env.DEBRIEF_KV ? await env.DEBRIEF_KV.get(cacheKey) : null
  if (cached) {
    const meta = { cached: true, model, prompt_version: PROMPT_VERSION }
    if (freshToken) meta.token = freshToken
    return sseResponse(cached, meta, cors)
  }

  // ── inference ──────────────────────────────────────────────────────
  // Only genuinely worth-narrating flights reach the model. Clean flights
  // are deterministic (no model call, no cost), so they must NOT charge the
  // AI budget — otherwise a flood of cheap clean payloads could exhaust it
  // and deny the feature for everyone. The budget + per-prefix daily cap
  // are therefore charged HERE, gating the one expensive action: an AI call.
  const hasWorthyFindings = payload.findings.some(f => ['warning', 'critical'].includes(f.severity))
  let text
  if (payload.clean || !hasWorthyFindings) {
    // Clean flights never reach the model — deterministic, instant,
    // free, and immune to a small model's imagination.
    text = cleanNarration(payload)
  } else if (env.DEBRIEF_TEST_MODE === '1') {
    text = cannedNarration(payload)
  } else {
    // Per-prefix daily model-call cap: no single network can drain more
    // than a small slice of the global budget in a day.
    const prefixCap = Number(env.DEBRIEF_PREFIX_DAILY_CAP) || PREFIX_DAILY_CAP
    const pd = await limiter.fetch(`https://do/dtake?cap=${prefixCap}`).then(r => r.json())
    if (!pd.ok) return json({ error: 'daily limit reached for this network', fallback: 'templates', ...(freshToken ? { token: freshToken } : {}) }, 429, cors)

    // Global daily AI budget (shared cost ceiling across everyone).
    const budget = env.DEBRIEF_LIMITER.get(env.DEBRIEF_LIMITER.idFromName('budget'))
    const bd = await budget.fetch(`https://do/budget?cap=${env.DEBRIEF_DAILY_CAP || DAILY_BUDGET}`).then(r => r.json())
    if (!bd.ok) return json({ error: 'daily budget exhausted', fallback: 'templates', ...(freshToken ? { token: freshToken } : {}) }, 503, cors)

    try {
      const out = await env.AI.run(model, { messages: buildMessages(payload), max_tokens: 700 })
      text = typeof out === 'string' ? out : out?.response
    } catch (e) {
      console.error('AI run failed:', e?.name, e?.message?.slice(0, 200))
      return json({ error: 'model unavailable', fallback: 'templates' }, 502, cors)
    }
  }

  let check = postCheck(text, payload)
  if (!check.ok && env.DEBRIEF_TEST_MODE !== '1' && !(payload.clean || !hasWorthyFindings)) {
    // Small models occasionally trip a guard (a stray heading, a raw
    // id). One fresh sample usually lands; only then give up.
    try {
      const out2 = await env.AI.run(model, { messages: buildMessages(payload), max_tokens: 700 })
      const text2 = typeof out2 === 'string' ? out2 : out2?.response
      const check2 = postCheck(text2, payload)
      if (check2.ok) { text = text2; check = check2 }
    } catch { /* fall through to the 502 */ }
  }
  if (!check.ok) {
    // Shape-limited diagnostics: which rule failed + a short head of the
    // output. Never logs payload contents.
    console.error('postCheck failed:', check.reason || 'unknown', '| head:', String(text || '').slice(0, 160))
    return json({ error: 'narration failed checks', fallback: 'templates' }, 502, cors)
  }

  // Never cache test-mode output — canned text under a real cache key
  // poisoned the fixtures' (hottest) entries for 30 days during D2 dev.
  if (env.DEBRIEF_KV && env.DEBRIEF_TEST_MODE !== '1') {
    await env.DEBRIEF_KV.put(cacheKey, check.cleaned, { expirationTtl: CACHE_TTL_S })
  }
  const meta = { cached: false, model, prompt_version: PROMPT_VERSION }
  if (freshToken) meta.token = freshToken
  return sseResponse(check.cleaned, meta, cors)
}
