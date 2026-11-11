// node --test usage/test/feedback.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFeedback, handleFeedback, feedbackSummary, FEEDBACK_LIMITS } from '../lib/feedback.mjs'

const ORIGIN = 'https://www.narenana.com'

/** Minimal D1 stand-in: records statements, answers SELECTs from `rows`. */
function fakeDb({ rows = [], failInsert = false } = {}) {
  const calls = []
  return {
    calls,
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...a) { stmt.args = a; return stmt },
        async run() {
          calls.push({ sql, args: stmt.args })
          if (failInsert) throw new Error('D1 down')
          return { success: true }
        },
        async all() {
          calls.push({ sql, args: stmt.args })
          return { results: rows.filter(Boolean).length ? answer(sql) : [] }
        },
      }
      return stmt
    },
  }
  function answer(sql) {
    if (/GROUP BY rating/.test(sql)) {
      const m = {}
      for (const r of rows) m[r.rating] = (m[r.rating] || 0) + 1
      return Object.entries(m).map(([rating, n]) => ({ rating: Number(rating), n }))
    }
    if (/AS n28/.test(sql)) {
      return [{ n28: rows.length, avg28: rows.reduce((a, r) => a + r.rating, 0) / rows.length, n7: rows.length, commented: rows.filter((r) => r.comment).length }]
    }
    return rows.slice().reverse().map((r, i) => ({ created_at: `2026-11-11T10:0${i}Z`, rating: r.rating, comment: r.comment || '', context: r.context || '' }))
  }
}

/** Durable Object namespace stand-in for DEBRIEF_LIMITER. */
function fakeLimiter({ takeOk = true, budgetOk = true } = {}) {
  const names = []
  return {
    names,
    idFromName(n) { names.push(n); return n },
    get() {
      return {
        async fetch(url) {
          const ok = url.includes('/take') ? takeOk : budgetOk
          return new Response(JSON.stringify(ok ? { ok: true } : { ok: false, retryAfterS: 1200 }))
        },
      }
    },
  }
}

const post = (body, { origin = ORIGIN, method = 'POST', raw } = {}) =>
  new Request('https://www.narenana.com/api/feedback', {
    method,
    headers: { origin, 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.7' },
    body: method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined,
  })

// ── normalizeFeedback ───────────────────────────────────────────────────
test('accepts a rating with no comment', () => {
  assert.deepEqual(normalizeFeedback({ rating: 8 }), { value: { rating: 8, comment: '', product: 'log-viewer', context: '' } })
})

test('rating must be an integer 1..10', () => {
  for (const rating of [0, 11, 7.5, '7', null, undefined, -1, NaN]) {
    assert.ok(normalizeFeedback({ rating }).error, `rejects ${String(rating)}`)
  }
  for (const rating of [1, 10]) assert.ok(normalizeFeedback({ rating }).value)
})

test('comment is trimmed, CRLF-normalised and stripped of control and bidi characters', () => {
  const { value } = normalizeFeedback({ rating: 9, comment: '  Great\r\nviewer\u0007‮!\u0000  ' })
  assert.equal(value.comment, 'Great\nviewer!')
})

test('long blank runs collapse; tabs and single newlines survive', () => {
  const { value } = normalizeFeedback({ rating: 5, comment: 'a\n\n\n\n\n\nb\tc' })
  assert.equal(value.comment, 'a\n\n\nb\tc')
})

test('comment length is capped', () => {
  assert.ok(normalizeFeedback({ rating: 5, comment: 'x'.repeat(FEEDBACK_LIMITS.maxComment) }).value)
  assert.equal(normalizeFeedback({ rating: 5, comment: 'x'.repeat(FEEDBACK_LIMITS.maxComment + 1) }).error, 'comment too long')
  assert.ok(normalizeFeedback({ rating: 5, comment: 42 }).error)
})

test('honeypot field drops the submission', () => {
  assert.deepEqual(normalizeFeedback({ rating: 10, website: 'http://spam.example' }), { drop: true })
  assert.ok(normalizeFeedback({ rating: 10, website: '' }).value)
})

test('product is allowlisted; unknown context falls back to empty', () => {
  assert.ok(normalizeFeedback({ rating: 4, product: 'other-app' }).error)
  assert.equal(normalizeFeedback({ rating: 4, context: 'blackbox' }).value.context, 'blackbox')
  assert.equal(normalizeFeedback({ rating: 4, context: '<script>' }).value.context, '')
  assert.ok(normalizeFeedback([1, 2]).error)
  assert.ok(normalizeFeedback(null).error)
})

// ── handleFeedback ──────────────────────────────────────────────────────
test('stores a valid submission and answers ok with CORS', async () => {
  const db = fakeDb()
  const lim = fakeLimiter()
  const res = await handleFeedback(post({ rating: 7, comment: 'Love the 3D replay', context: 'sample' }), { USAGE_DB: db, DEBRIEF_LIMITER: lim })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const insert = db.calls.find((c) => c.sql.startsWith('INSERT'))
  assert.ok(insert, 'inserted')
  const [createdAt, day, product, rating, comment, context] = insert.args
  assert.match(createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/)
  assert.equal(day, createdAt.slice(0, 10))
  assert.deepEqual([product, rating, comment, context], ['log-viewer', 7, 'Love the 3D replay', 'sample'])
  // Quota instances are feedback's own, never the debrief's.
  assert.deepEqual(lim.names, ['fb:203.0.113.7', 'fb-budget'])
})

test('rejects foreign origins, wrong methods, bad JSON and oversized bodies', async () => {
  const env = { USAGE_DB: fakeDb(), DEBRIEF_LIMITER: fakeLimiter() }
  assert.equal((await handleFeedback(post({ rating: 5 }, { origin: 'https://evil.example' }), env)).status, 403)
  assert.equal((await handleFeedback(post(null, { method: 'GET' }), env)).status, 405)
  assert.equal((await handleFeedback(post(null, { raw: '{nope' }), env)).status, 400)
  assert.equal((await handleFeedback(post(null, { raw: 'x'.repeat(FEEDBACK_LIMITS.maxBody + 1) }), env)).status, 413)
  assert.equal((await handleFeedback(post({ rating: 0 }), env)).status, 400)
  assert.equal(env.USAGE_DB.calls.length, 0, 'nothing written')
  const pre = await handleFeedback(post(null, { method: 'OPTIONS' }), env)
  assert.equal(pre.status, 204)
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/)
})

test('honeypot hits look like success but store nothing', async () => {
  const db = fakeDb()
  const res = await handleFeedback(post({ rating: 10, website: 'buy now' }), { USAGE_DB: db, DEBRIEF_LIMITER: fakeLimiter() })
  assert.equal(res.status, 200)
  assert.equal(db.calls.length, 0)
})

test('per-network rate limit and daily cap', async () => {
  const db = fakeDb()
  const limited = await handleFeedback(post({ rating: 6 }), { USAGE_DB: db, DEBRIEF_LIMITER: fakeLimiter({ takeOk: false }) })
  assert.equal(limited.status, 429)
  assert.equal((await limited.json()).retryAfterS, 1200)
  const capped = await handleFeedback(post({ rating: 6 }), { USAGE_DB: db, DEBRIEF_LIMITER: fakeLimiter({ budgetOk: false }) })
  assert.equal(capped.status, 503)
  assert.equal(db.calls.length, 0)
})

test('a D1 failure is a 500, not a silent success', async () => {
  const res = await handleFeedback(post({ rating: 6 }), { USAGE_DB: fakeDb({ failInsert: true }), DEBRIEF_LIMITER: fakeLimiter() })
  assert.equal(res.status, 500)
})

// ── feedbackSummary ─────────────────────────────────────────────────────
test('summary: average, 1–10 distribution, NPS-style score, latest first', async () => {
  const rows = [
    { rating: 10, comment: 'superb' },
    { rating: 9 },
    { rating: 8, comment: 'good' },
    { rating: 3, comment: 'crashed on my log', context: 'blackbox' },
  ]
  const s = await feedbackSummary({ USAGE_DB: fakeDb({ rows }) })
  assert.equal(s.total, 4)
  assert.equal(s.avg, 7.5)
  assert.deepEqual(s.dist, [0, 0, 1, 0, 0, 0, 0, 1, 1, 1])
  assert.deepEqual([s.promoters, s.passives, s.detractors], [2, 1, 1])
  assert.equal(s.score, 25) // (2 - 1) / 4
  assert.equal(s.commented, 3)
  assert.equal(s.recent[0].comment, 'crashed on my log')
  assert.equal(s.recent[0].context, 'blackbox')
})

test('summary with no rows is empty, not an error', async () => {
  const s = await feedbackSummary({ USAGE_DB: fakeDb() })
  assert.equal(s.total, 0)
  assert.equal(s.avg, null)
  assert.equal(s.score, null)
  assert.deepEqual(s.recent, [])
})
