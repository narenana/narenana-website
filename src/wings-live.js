// The live Wings price line on an aircraft landing page (content/nanawing/<page>.json with a
// wingsSlug, e.g. /nanawing/chupito-simulator/ → /wings/tbs-chupito/). The static page carries
// <p class="ac-live" data-wings="<slug>"> with a fallback sentence; per request the Worker
// replaces it with what the catalog knows today, in the product page's own words
// (comparableOffers: the headline price is the cheapest live, new, single-unit, unflagged
// listing; a flagged amount is never quoted). Cached at the edge by src/index.js like the
// aircraft page's lap records.
import { one, all } from '../catalog/lib/db.mjs'
import { comparableOffers, conditionOf, dayOf } from '../catalog/lib/public.mjs'
import { inr } from '../catalog/lib/util.mjs'
import chupito from '../content/nanawing/chupito-simulator.json' with { type: 'json' }

// Landing pages with a live price line, by path: { tag (edge-cache tag and x-<tag>-cache header), slug }.
export const LANDINGS = Object.fromEntries([chupito].filter((c) => c.wingsSlug).map((c) => [c.path, { tag: `landing-${c.aircraft}`, slug: c.wingsSlug }]))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nSellers = (n) => `${n} Indian seller${n === 1 ? '' : 's'}`
const sellersIn = (list) => new Set(list.map((o) => o.source_name).filter(Boolean)).size
const when = (o) => o?.last_checked ?? o?.last_seen

/** The one-line stock and price state for a model's approved offers, as HTML; null when no
 *  seller we check lists it (the page's own fallback sentence then stays). */
export function offerLine(offers) {
  const checked = offers.filter((o) => !o.dead)
  if (!checked.length) return null
  const live = checked.filter((o) => o.in_stock)
  const { seed } = comparableOffers(offers)
  const liveMin = seed?.in_stock ? seed.price_inr : null
  if (liveMin) {
    return `<strong>From ${inr(liveMin)}</strong> at ${esc(seed.source_name)}${conditionOf(seed.title) === 'used' ? ' (pre-owned)' : ''} · in stock at ${nSellers(sellersIn(live))}${when(seed) ? ` · last checked ${dayOf(when(seed))}` : ''}`
  }
  if (live.length) {
    // Every live listing's price is held for review: in stock, and the amount is the seller's to show.
    const latest = Math.max(0, ...live.map((o) => when(o) || 0))
    return `In stock at ${nSellers(sellersIn(live))} · price on the seller’s page${latest ? ` · last checked ${dayOf(latest)}` : ''}`
  }
  const seenMin = seed && !seed.in_stock ? seed.price_inr : null
  const n = sellersIn(checked)
  return `Out of stock at ${n === 1 ? 'the 1 Indian seller' : `all ${nSellers(n)}`} we check${seenMin ? ` · last seen ${inr(seenMin)}${when(seed) ? ` on ${dayOf(when(seed))}` : ''}` : ''}`
}

/** offerLine() for the ready master with this slug, from the catalog database. */
export async function wingsOfferLine(env, slug) {
  if (!env.CATALOG_DB) return null
  const m = await one(env, `SELECT id FROM master_model WHERE slug=? AND status='ready'`, slug)
  if (!m) return null
  const offers = await all(
    env,
    `SELECT o.config, o.pack_qty, k.*, s.name AS source_name
     FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id
     WHERE o.master_model_id=? AND k.review_status='approved'
     ORDER BY k.dead ASC, k.in_stock DESC, k.price_inr ASC`,
    m.id,
  )
  return offerLine(offers)
}

/** Fill the page's <p class="ac-live" data-wings="slug"> slot. A database failure marks the
 *  render degraded (served, not cached) and leaves the fallback sentence in place. */
export async function fillWingsLine(page, env, state, slug) {
  let line = null
  try {
    line = await wingsOfferLine(env, slug)
  } catch (e) {
    state.degraded = true
    console.error('wings line unavailable:', e)
  }
  if (line === null) return page
  return new HTMLRewriter()
    .on('p.ac-live[data-wings]', {
      element(el) {
        if (el.getAttribute('data-wings') === slug) el.setInnerContent(line, { html: true })
      },
    })
    .transform(page)
}
