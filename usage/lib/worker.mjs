/**
 * First-party anonymous usage counter — POST /api/usage.
 *
 * The log viewer (and other pages) fire a tiny sendBeacon here on key
 * events. We increment an aggregate daily tally in D1 (lv_usage) and
 * return 204. NOTHING personal is stored: no IP, no user id, no cookie,
 * no filename, no free text — only a known event name and a known
 * dimension value from closed allowlists. That makes it (a) complete,
 * not consent-undercounted like GA, (b) real-time, (c) ours to query
 * in /stats without GA's custom-dimension registration or 24-48h lag.
 *
 * Strict allowlists keep this from becoming a cardinality bomb or an
 * abuse surface: an unknown event or dim is dropped, not stored.
 */

// event → the set of dimension values it may carry ('' = no dim).
const ALLOW = {
  log_loaded: ['', 'blackbox', 'edgetx-csv', 'sample'],
  log_summary: ['', 'gps', 'nogps'],
  parse_failed: ['', 'unsupported_type', 'empty', 'no_header', 'corrupt', 'other'],
  debrief_shown: ['', 'clean', 'warning', 'critical'], // 'critical' = crash-grade (in-air power/link loss)
  narration_requested: [''],
  narration_completed: ['', 'cached', 'fresh'],
  share_opened: [''],
  // Anonymous fleet dimensions derived from the log in the browser — no
  // position, no filename, no content; only one low-cardinality bucket.
  fw_family: ['', 'betaflight', 'inav', 'emuflight'], // flight-controller firmware (blackbox logs)
  craft: ['', 'quad', 'wing', 'unknown'], // best-effort airframe type
}

const CORS = /^https:\/\/(www|latest)\.narenana\.com$|^https:\/\/([a-z0-9-]+\.)?edgetx-log-parser\.pages\.dev$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/

export async function handleUsage(request, env) {
  const origin = request.headers.get('origin') || ''
  const originOk = CORS.test(origin)
  const cors = originOk
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : {}

  if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: cors })
  if (!originOk) return new Response(null, { status: 403 })

  // sendBeacon posts text/plain; cap the read.
  let body
  try {
    const raw = await request.text()
    if (raw.length > 512) return new Response(null, { status: 413, headers: cors })
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400, headers: cors })
  }

  const event = typeof body.e === 'string' ? body.e : null
  const dim = typeof body.dim === 'string' ? body.dim : ''
  const allowedDims = ALLOW[event]
  if (!allowedDims || !allowedDims.includes(dim)) {
    // Unknown event or dim — accept the request (so the client never
    // retries or errors) but store nothing.
    return new Response(null, { status: 204, headers: cors })
  }

  if (env.USAGE_DB) {
    const day = new Date().toISOString().slice(0, 10)
    try {
      await env.USAGE_DB.prepare(
        `INSERT INTO lv_usage (day, event, dim, count) VALUES (?, ?, ?, 1)
         ON CONFLICT(day, event, dim) DO UPDATE SET count = count + 1`,
      ).bind(day, event, dim).run()
    } catch (e) {
      // Never fail the beacon on a D1 blip — it's fire-and-forget.
      console.error('usage write failed:', e?.message?.slice(0, 120))
    }
  }
  return new Response(null, { status: 204, headers: cors })
}

/**
 * Read the log-viewer usage funnel for the /stats dashboard: per-day
 * and rolled-up totals over the trailing `days` window.
 */
export async function usageSummary(env, days = 30) {
  if (!env.USAGE_DB) return null
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  // One pass keyed by day gives BOTH the window totals and the day-on-day
  // series — lv_usage is already a per-UTC-day rollup, so this is exact.
  const { results } = await env.USAGE_DB.prepare(
    `SELECT day, event, dim, SUM(count) AS n FROM lv_usage WHERE day >= ? GROUP BY day, event, dim`,
  ).bind(since).all()
  const rows = results || []
  const sum = (event, dim) => rows.filter(r => r.event === event && (dim == null || r.dim === dim)).reduce((a, r) => a + r.n, 0)
  const byDim = (event) => {
    const m = {}
    rows.filter(r => r.event === event && r.dim).forEach(r => { m[r.dim] = (m[r.dim] || 0) + r.n })
    return Object.entries(m).map(([dim, n]) => ({ dim, n })).sort((a, b) => b.n - a.n)
  }

  // Day-on-day series, zero-filled across the whole window (oldest → newest),
  // so charts draw a continuous line and the delta windows line up.
  const dayList = []
  for (let i = days - 1; i >= 0; i--) dayList.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10))
  const perDay = (event, dim) => {
    const m = {}
    rows.filter(r => r.event === event && (dim == null || r.dim === dim)).forEach(r => { m[r.day] = (m[r.day] || 0) + r.n })
    return dayList.map(d => m[d] || 0)
  }
  const daily = {
    days: dayList,
    loads: perDay('log_loaded', null),
    failed: perDay('parse_failed', null),
    summaries: perDay('log_summary', null), // flights analysed
    debriefs: perDay('debrief_shown', null),
    crashes: perDay('debrief_shown', 'critical'),
    narrations: perDay('narration_completed', null),
  }

  const loaded = sum('log_loaded', null)
  const failed = sum('parse_failed', null)
  return {
    days,
    loaded,
    failed,
    successRate: loaded + failed > 0 ? loaded / (loaded + failed) : null,
    byFormat: byDim('log_loaded'),
    byFailReason: byDim('parse_failed'),
    summaries: sum('log_summary', null),
    debriefShown: sum('debrief_shown', null),
    narrations: sum('narration_completed', null),
    // Anonymous fleet view.
    byOutcome: byDim('debrief_shown'), // clean / warning / critical
    crashes: sum('debrief_shown', 'critical'),
    byFwFamily: byDim('fw_family'), // betaflight / inav / emuflight
    byCraft: byDim('craft'), // quad / wing / unknown
    daily,
  }
}
