/**
 * Product feedback — POST /api/feedback.
 *
 * The log viewer's Feedback dialog posts a 1–10 rating and an optional
 * comment here when a visitor presses Send. This is the one endpoint where
 * a visitor's own words reach the server, so it stays small and strict:
 *
 *   stored:     the rating, the comment as typed (trimmed, ≤ 2000 chars,
 *               may be empty), which screen it came from (the landing page
 *               or the kind of log that was open) and the minute (UTC).
 *   NOT stored: IP, user id, cookie, user agent, filename, the log.
 *
 * Guards, in order: origin allowlist → body size cap → strict validation →
 * honeypot field (bots fill every input; people never see it) → per-network
 * rate limit (5 an hour) → global daily cap (300) → D1 insert. The limits
 * reuse the debrief's Durable Object class (`DEBRIEF_LIMITER`) under their
 * own instance names ('fb:<prefix>', 'fb-budget'), so feedback and AI
 * narration never share a quota. Table: usage/schema.sql `lv_feedback`.
 */
import { ipPrefix } from '../../debrief/lib/worker.mjs'

export const FEEDBACK_LIMITS = {
  maxComment: 2000, // UTF-16 code units, same unit as the textarea's maxLength
  maxBody: 8192, // bytes of raw JSON accepted before parsing
  perNetworkPerHour: 5,
  dailyCap: 300,
}
const PRODUCTS = ['log-viewer']
const CONTEXTS = ['landing', 'blackbox', 'edgetx-csv', 'sample']

const CORS = /^https:\/\/(www|latest)\.narenana\.com$|^https:\/\/([a-z0-9-]+\.)?edgetx-log-parser\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/

// C0 controls except \t and \n, DEL, and the bidi override/isolate marks
// (they can make a comment display differently from what it says).
const UNSAFE_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g

const json = (obj, status, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  })

/**
 * Validate and normalise a parsed request body. Pure, so it is unit-tested
 * directly. Returns { value } | { error } | { drop: true } (honeypot hit).
 */
export function normalizeFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad body' }
  if (typeof body.website === 'string' && body.website.trim() !== '') return { drop: true }

  const { rating } = body
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return { error: 'rating must be a whole number from 1 to 10' }
  }

  let comment = body.comment == null ? '' : body.comment
  if (typeof comment !== 'string') return { error: 'comment must be text' }
  comment = comment
    .replace(/\r\n?/g, '\n')
    .replace(UNSAFE_CHARS, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
  if (comment.length > FEEDBACK_LIMITS.maxComment) return { error: 'comment too long' }

  const product = body.product == null ? 'log-viewer' : body.product
  if (!PRODUCTS.includes(product)) return { error: 'unknown product' }
  const context = CONTEXTS.includes(body.context) ? body.context : ''

  return { value: { rating, comment, product, context } }
}

export async function handleFeedback(request, env) {
  const origin = request.headers.get('origin') || ''
  const originOk = CORS.test(origin)
  const cors = originOk
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {}

  if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors })
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors)
  if (!originOk) return json({ error: 'origin not allowed' }, 403)

  const raw = await request.text()
  if (raw.length > FEEDBACK_LIMITS.maxBody) return json({ error: 'too large' }, 413, cors)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad json' }, 400, cors)
  }

  const n = normalizeFeedback(body)
  // Honeypot: answer exactly like a success so a bot learns nothing.
  if (n.drop) return json({ ok: true }, 200, cors)
  if (n.error) return json({ error: n.error }, 400, cors)
  if (!env.USAGE_DB) return json({ error: 'unavailable' }, 503, cors)

  // Rate limits. Fail open on a limiter fault: one lost guard for a moment
  // is better than losing a real person's feedback, and the body is capped.
  if (env.DEBRIEF_LIMITER) {
    try {
      const prefix = ipPrefix(request.headers.get('cf-connecting-ip') || '')
      const net = env.DEBRIEF_LIMITER.get(env.DEBRIEF_LIMITER.idFromName('fb:' + prefix))
      const rl = await net
        .fetch(`https://do/take?limit=${FEEDBACK_LIMITS.perNetworkPerHour}&window=3600`)
        .then((r) => r.json())
      if (!rl.ok) return json({ error: 'rate limited', retryAfterS: rl.retryAfterS }, 429, cors)
      const all = env.DEBRIEF_LIMITER.get(env.DEBRIEF_LIMITER.idFromName('fb-budget'))
      const bd = await all.fetch(`https://do/budget?cap=${FEEDBACK_LIMITS.dailyCap}`).then((r) => r.json())
      if (!bd.ok) return json({ error: 'busy' }, 503, cors)
    } catch (e) {
      console.error('feedback limiter failed:', e?.message?.slice(0, 120))
    }
  }

  const v = n.value
  const createdAt = new Date().toISOString().slice(0, 16) + 'Z' // to the minute
  try {
    await env.USAGE_DB.prepare(
      `INSERT INTO lv_feedback (created_at, day, product, rating, comment, context) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(createdAt, createdAt.slice(0, 10), v.product, v.rating, v.comment, v.context)
      .run()
  } catch (e) {
    console.error('feedback write failed:', e?.message?.slice(0, 120))
    return json({ error: 'could not save' }, 500, cors)
  }
  return json({ ok: true }, 200, cors)
}

/**
 * Feedback for the /stats dashboard: all-time distribution, the last 28/7
 * days, and the latest comments. `score` is NPS-style on the 1–10 scale:
 * % rating 9–10 minus % rating 1–6.
 */
export async function feedbackSummary(env, { recent = 30, product = 'log-viewer' } = {}) {
  if (!env.USAGE_DB) return null
  const db = env.USAGE_DB
  const since = (d) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10)
  const [dist, win, latest] = await Promise.all([
    db.prepare(`SELECT rating, COUNT(*) AS n FROM lv_feedback WHERE product = ? GROUP BY rating`).bind(product).all(),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS n28,
           AVG(CASE WHEN day >= ? THEN rating END)   AS avg28,
           SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS n7,
           SUM(CASE WHEN comment != '' THEN 1 ELSE 0 END) AS commented
         FROM lv_feedback WHERE product = ?`,
      )
      .bind(since(28), since(28), since(7), product)
      .all(),
    db
      .prepare(`SELECT created_at, rating, comment, context FROM lv_feedback WHERE product = ? ORDER BY id DESC LIMIT ?`)
      .bind(product, recent)
      .all(),
  ])

  const counts = Array(10).fill(0)
  for (const r of dist.results || []) if (r.rating >= 1 && r.rating <= 10) counts[r.rating - 1] = r.n
  const total = counts.reduce((a, b) => a + b, 0)
  const promoters = counts[8] + counts[9]
  const passives = counts[6] + counts[7]
  const detractors = total - promoters - passives
  const w = (win.results && win.results[0]) || {}
  return {
    total,
    avg: total ? counts.reduce((a, n, i) => a + n * (i + 1), 0) / total : null,
    dist: counts, // index 0 = rating 1
    promoters,
    passives,
    detractors,
    score: total ? Math.round(((promoters - detractors) / total) * 100) : null,
    commented: w.commented || 0,
    last28: { count: w.n28 || 0, avg: w.avg28 ?? null },
    last7: { count: w.n7 || 0 },
    recent: (latest.results || []).map((r) => ({ at: r.created_at, rating: r.rating, comment: r.comment, context: r.context })),
  }
}
