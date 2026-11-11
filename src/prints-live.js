// The weekly check on the curated 3D prints of the aircraft landing pages (owner, 24 Oct 2026:
// "validate if the listings are still up; retire if any project or image becomes unavailable").
//
// Each Sunday the hourly cron checks a slice of the prints (SLICE per hour from 04:00 UTC, so a
// run stays far inside the Free plan's 50 outbound requests): the designer's page and the
// picture we show. The result lands in VIDEOS_KV under KEY. A print is retired only on a
// definite sign that it is gone: a 404 or 410, a soft-404 page (the site's generic title and
// picture), or a picture that answers 404 or 410. A bot check, a 403, a 5xx or a timeout proves
// nothing, so it keeps the print's last state. A retired print that comes back healthy returns.
// On each render the landing page drops retired prints, a group left empty, and their entries
// in the page's ItemList (fillPrints); the edge cache holds a render for 15 minutes at most.
import chupito from '../content/nanawing/chupito-simulator.json' with { type: 'json' }

export const KEY = 'landing:prints'
export const SLICE = 4
export const FIRST_HOUR = 4 // UTC, Sundays
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

// Every page with a prints block, by path; and every print across them, in a stable order.
export const PRINT_PAGES = Object.fromEntries([chupito].filter((c) => c.prints).map((c) => [c.path, c]))
export const allPrints = (pages = PRINT_PAGES) => Object.values(pages).flatMap((c) => c.prints.groups.flatMap((g) => g.items)).filter((p) => p.id)

const norm = (s) => String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim()
const modelNumber = (id) => String(id).replace(/^[a-z]+-/, '')

/** What a designer's page says about the print: 'ok', 'gone' (definite) or 'unknown'. */
export function classifyPage(print, status, html = '') {
  if (status === 404 || status === 410) return { state: 'gone', reason: `page ${status}` }
  if (status !== 200) return { state: 'unknown', reason: `page ${status}` }
  if (/<title>\s*Just a moment/i.test(html) || /challenge-platform|cf-chl-/i.test(html)) return { state: 'unknown', reason: 'bot check' }
  const title = norm((html.match(/<title>([^<]*)/i) || [])[1])
  const ogUrl = (html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i) || [])[1] || ''
  const ogImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1] || ''
  const siteDefault = !ogImage || /ThingiverseOpenGraph|\/site\/img\//i.test(ogImage)
  const named = title.includes(norm(print.title).slice(0, 24)) || ogUrl.includes(modelNumber(print.id))
  if (named && !siteDefault) return { state: 'ok', reason: 'page ok' }
  if (!named && siteDefault) return { state: 'gone', reason: 'soft 404' }
  return { state: 'unknown', reason: named ? 'no picture on the page' : 'title changed' }
}

/** What the picture's URL says: 'ok', 'gone' (definite) or 'unknown'. */
export function classifyImage(status, contentType = '') {
  if (status === 404 || status === 410) return { state: 'gone', reason: `image ${status}` }
  if (status === 200 && /^image\//i.test(contentType)) return { state: 'ok', reason: 'image ok' }
  return { state: 'unknown', reason: `image ${status}${contentType ? ` ${contentType.split(';')[0]}` : ''}` }
}

/** One print: gone if either half is definitely gone, ok if both are ok, otherwise unknown. */
export function combine(page, image) {
  if (page.state === 'gone' || image.state === 'gone') return { state: 'gone', reason: page.state === 'gone' ? page.reason : image.reason }
  if (page.state === 'ok' && image.state === 'ok') return { state: 'ok', reason: 'ok' }
  return { state: 'unknown', reason: page.state === 'unknown' ? page.reason : image.reason }
}

async function probe(url, wantHtml) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: wantHtml ? 'text/html' : 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const type = r.headers.get('content-type') || ''
    const html = wantHtml && type.includes('html') ? await r.text() : ''
    if (!html) await r.body?.cancel()
    return { status: r.status, type, html }
  } catch {
    return { status: 0, type: '', html: '' }
  }
}

export async function checkPrint(print) {
  const page = await probe(print.href, true)
  const image = print.image ? await probe(print.image, false) : { status: 0, type: '' }
  return combine(classifyPage(print, page.status, page.html), print.image ? classifyImage(image.status, image.type) : { state: 'unknown', reason: 'no picture recorded' })
}

/** The prints this hour should check, or none outside the Sunday window. */
export function sliceFor(scheduledTime, prints = allPrints()) {
  const at = new Date(scheduledTime)
  if (at.getUTCDay() !== 0) return []
  const n = at.getUTCHours() - FIRST_HOUR
  if (n < 0) return []
  return prints.slice(n * SLICE, n * SLICE + SLICE)
}

/** Fold one check into the stored record. An unknown result keeps the print's last state. */
export function record(stored, print, result, now) {
  const prev = stored.prints?.[print.id]
  const state = result.state === 'unknown' ? (prev?.state === 'gone' ? 'gone' : prev?.state || 'ok') : result.state
  return {
    ...stored,
    prints: {
      ...(stored.prints || {}),
      [print.id]: { state, since: prev?.state === state ? prev.since : now, checked: now, last: result.state, reason: result.reason, title: print.title },
    },
  }
}

export const retiredIds = (stored) => new Set(Object.entries(stored?.prints || {}).filter(([, v]) => v.state === 'gone').map(([id]) => id))

/** The hourly cron's share of the weekly check. A definite 'gone' is confirmed once before it counts. */
export async function checkPrintsSlice(env, scheduledTime, { check = checkPrint, prints = allPrints() } = {}) {
  const due = sliceFor(scheduledTime, prints)
  if (!due.length || !env.VIDEOS_KV) return null
  let stored = JSON.parse((await env.VIDEOS_KV.get(KEY)) || '{}')
  const now = new Date(scheduledTime).toISOString()
  for (const p of due) {
    let result = await check(p)
    if (result.state === 'gone') result = await check(p) // a second look before a print is retired
    stored = record(stored, p, result, now)
    if (result.state !== 'ok') console.log(`prints check: ${p.id} ${result.state} (${result.reason}) ${p.title}`)
  }
  stored.checked = now
  await env.VIDEOS_KV.put(KEY, JSON.stringify(stored))
  return stored
}

export async function loadRetired(env) {
  try {
    return retiredIds(JSON.parse((await env.VIDEOS_KV?.get(KEY)) || '{}'))
  } catch (e) {
    console.error('prints status unavailable:', e)
    return new Set()
  }
}

/** Drop retired prints from a landing page: the card, a group left empty, the whole section if
 *  nothing is left (and the jump links to it), and the matching ItemList entries. */
export function fillPrints(page, retired, copy) {
  if (!retired.size || !copy?.prints) return page
  const items = copy.prints.groups.flatMap((g) => g.items)
  const gone = items.filter((p) => retired.has(p.id))
  if (!gone.length) return page
  const goneHrefs = new Set(gone.map((p) => p.href))
  const emptyGroups = new Set(copy.prints.groups.map((g, i) => (g.items.every((p) => retired.has(p.id)) ? String(i) : null)).filter(Boolean))
  const allGone = gone.length === items.length
  let json = ''
  const rw = new HTMLRewriter()
    .on('li[data-print]', { element(el) { if (retired.has(el.getAttribute('data-print'))) el.remove() } })
    .on('div[data-print-group]', { element(el) { if (emptyGroups.has(el.getAttribute('data-print-group'))) el.remove() } })
    .on('script[type="application/ld+json"]', {
      text(t) {
        json += t.text
        if (!t.lastInTextNode) { t.remove(); return }
        try {
          const data = JSON.parse(json)
          for (const entry of data['@graph'] || []) {
            if (entry['@type'] !== 'ItemList') continue
            entry.itemListElement = entry.itemListElement.filter((e) => !goneHrefs.has(e.url)).map((e, i) => ({ ...e, position: i + 1 }))
          }
          data['@graph'] = (data['@graph'] || []).filter((e) => e['@type'] !== 'ItemList' || e.itemListElement.length)
          t.replace(JSON.stringify(data).replace(/</g, '\\u003c'), { html: true })
        } catch {
          t.replace(json, { html: true })
        }
        json = ''
      },
    })
  if (allGone) rw.on('section#prints', { element(el) { el.remove() } }).on('a[href="#prints"]', { element(el) { el.remove() } })
  return rw.transform(page)
}
