// Live lap records for www.narenana.com/nanawing/aircraft/ (scripts/build-nanawing-pages.mjs
// builds the page; this fills its <tbody data-records="<aircraft>"> slots per request).
// One board per course and aircraft, read through the FPVSIM_BOARD service binding
// (workers.dev sibling fetches are blocked on the same account — see src/stats.js) with
// the public URL as the fallback, e.g. in local dev. Pilot names are user input: always escaped.
import facts from '../content/_facts/nanawing.json' with { type: 'json' }
import copy from '../content/nanawing/aircraft.json' with { type: 'json' }

const BOARD = 'https://fpvsim-leaderboard.narenana.workers.dev/board'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }

async function board(env, url) {
  if (env.FPVSIM_BOARD) {
    try {
      const res = await env.FPVSIM_BOARD.fetch(url)
      if (res.ok) return res
    } catch {
      // fall through to the public URL
    }
  }
  return fetch(url)
}

/** { rows: { <aircraftId>: [{ course, ok, best, total }] }, degraded } — degraded if any board failed. */
export async function aircraftRecords(env) {
  const jobs = facts.aircraft.flatMap((a) => facts.courses.map((course) => ({ aircraft: a.id, course })))
  const results = await Promise.all(jobs.map(async ({ aircraft, course }) => {
    try {
      const params = new URLSearchParams({ course: course.id, aircraft, limit: '1' })
      const res = await board(env, `${BOARD}?${params}`)
      if (!res.ok) throw new Error(`board ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.entries)) throw new Error('no entries')
      const e = data.entries[0]
      const best = e && Number.isFinite(e.time_ms) && e.time_ms > 0
        ? { ms: e.time_ms, name: String(e.name ?? '').slice(0, 40), at: Number.isFinite(e.set_at) ? e.set_at : null }
        : null
      return { aircraft, course, ok: true, best, total: Number.isInteger(data.total) ? data.total : null }
    } catch {
      return { aircraft, course, ok: false, best: null, total: null }
    }
  }))
  const rows = {}
  for (const r of results) (rows[r.aircraft] ||= []).push(r)
  return { rows, degraded: results.some((r) => !r.ok) }
}

/** The <tbody> rows for one aircraft. A failed board keeps the static dash. */
export function recordRows(list) {
  return list.map(({ course, ok, best, total }) => {
    const pilots = ok && total ? ` · ${total} ${total === 1 ? 'pilot' : 'pilots'}` : ''
    const head = `<th scope="row">${esc(course.name)}<small>${esc(course.map)} · ${course.km.toFixed(1)} km${pilots}</small></th>`
    if (ok && best) {
      const who = esc(best.name || 'Pilot')
      const when = best.at ? day(best.at) : ''
      // .ac-by repeats pilot and date under the time; phones show it instead of the Pilot column.
      return `<tr>${head}<td class="ac-time">${(best.ms / 1000).toFixed(2)} s<small class="ac-by">${who}${when ? ` · ${when}` : ''}</small></td><td class="ac-pilot">${who}${when ? `<small>${when}</small>` : ''}</td></tr>`
    }
    if (ok) return `<tr>${head}<td class="ac-empty" colspan="2">${esc(copy.records.empty)}</td></tr>`
    return `<tr>${head}<td class="ac-time">—</td><td class="ac-pilot">—</td></tr>`
  }).join('')
}

/** Rewrites the page's record slots. */
export function withRecords(response, records) {
  return new HTMLRewriter()
    .on('tbody[data-records]', {
      element(el) {
        const list = records.rows[el.getAttribute('data-records')]
        if (list) el.setInnerContent(recordRows(list), { html: true })
      },
    })
    .transform(response)
}
