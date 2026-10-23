// The live Wings content on an aircraft landing page (content/nanawing/<page>.json with a
// wingsSlug, e.g. /nanawing/chupito-simulator/ → /wings/tbs-chupito/). The static page carries
// slots with fallback sentences:
//   <p class="ac-live" data-wings="<slug>">                      one line: the headline price and stock
//   <div class="ac-offers" data-wings-offers="<slug>:<bundle>">  that bundle's seller table
//   <div class="ac-offers" data-wings-offers="<slug>:other">     listings matching no bundle (card hidden until filled)
// Per request the Worker fills them with what the catalog knows today, under the product page's
// own rules (comparableOffers: the headline is the cheapest live, new, single-unit, unflagged
// listing; a flagged amount is never quoted; offerOrder: live, then out of stock, then gone).
// Cached at the edge by src/index.js like the aircraft page's lap records.
import { one, all } from '../catalog/lib/db.mjs'
import { comparableOffers, conditionOf, dayOf, offerOrder } from '../catalog/lib/public.mjs'
import { configLabel } from '../catalog/lib/product-overview.mjs'
import { inr } from '../catalog/lib/util.mjs'
import chupito from '../content/nanawing/chupito-simulator.json' with { type: 'json' }

// Landing pages with live Wings content, by path: { tag (edge-cache tag and x-<tag>-cache header),
// slug, variants (the page's bundles, with their title patterns and empty-state lines) }.
export const LANDINGS = Object.fromEntries([chupito].filter((c) => c.wingsSlug).map((c) => [c.path, { tag: `landing-${c.aircraft}`, slug: c.wingsSlug, variants: c.buy?.variants ?? [] }]))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ext = 'target="_blank" rel="noopener nofollow"'
const nSellers = (n) => `${n} Indian seller${n === 1 ? '' : 's'}`
const sellersIn = (list) => new Set(list.map((o) => o.source_name).filter(Boolean)).size
const when = (o) => o?.last_checked ?? o?.last_seen
// A withheld (flagged) amount is never shown; the seller's page has the price.
const HELD = 'Price on the seller’s page'

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
    return `In stock at ${nSellers(sellersIn(live))} · ${HELD.toLowerCase()}${latest ? ` · last checked ${dayOf(latest)}` : ''}`
  }
  const seenMin = seed && !seed.in_stock ? seed.price_inr : null
  const n = sellersIn(checked)
  return `Out of stock at ${n === 1 ? 'the 1 Indian seller' : `all ${nSellers(n)}`} we check${seenMin ? ` · last seen ${inr(seenMin)}${when(seed) ? ` on ${dayOf(when(seed))}` : ''}` : ''}`
}

/** Which bundle a listing is, from its title: the first variant (in matchPriority order) whose
 *  pattern matches; 'other' when none does. */
export function bundleOf(offer, variants) {
  const ordered = [...variants].sort((a, b) => (a.matchPriority ?? 99) - (b.matchPriority ?? 99))
  return ordered.find((v) => new RegExp(v.match, 'i').test(offer.title || ''))?.id ?? 'other'
}

/** The seller table for a list of offers, as HTML (the product page's rows in the landing page's
 *  own markup); null when the list is empty. Only an in-stock listing gets a Buy button; an
 *  out-of-stock one links as View; a gone one has no link. */
export function offersTable(offers) {
  const rows = offerOrder(offers)
  if (!rows.length) return null
  const badge = (text) => ` <span class="ac-offer-badge">${text}</span>`
  const row = (o) => {
    const state = o.dead ? 'is-gone' : o.in_stock ? 'is-live' : 'is-oos'
    const seller = o.dead ? esc(o.source_name) : `<a href="${esc(o.url_canonical)}" ${ext}>${esc(o.source_name)}</a>`
    const flags = `${o.grey_import ? badge('import') : ''}${o.made_in_india ? badge('Made in India') : ''}${conditionOf(o.title) === 'used' ? badge('pre-owned') : ''}`
    const config = `${esc(configLabel(o, 'Not stated'))}${o.pack_qty > 1 ? ` ×${o.pack_qty}` : ''}${o.variant ? `<small>${esc(o.variant)}</small>` : ''}`
    const price = o.flagged ? `<span class="ac-offer-held">${HELD}</span>` : Number.isFinite(o.price_inr) && o.price_inr > 0 ? inr(o.price_inr) : '—'
    const checked = when(o) ? `<small>last checked ${dayOf(when(o))}</small>` : ''
    const stock = o.dead ? 'Listing removed' : o.in_stock ? 'In stock' : 'Out of stock'
    const buy = o.dead ? '' : `<a class="ac-btn ac-btn-sm${o.in_stock ? '' : ' ac-btn-quiet'}" href="${esc(o.url_canonical)}" ${ext}>${o.in_stock ? 'Buy' : 'View'}&nbsp;<span aria-hidden="true">↗</span></a>`
    return `<tr class="${state}"><th scope="row" class="ac-offer-seller">${seller}${flags}</th><td class="ac-offer-config">${config}</td><td class="ac-offer-price">${price}${checked}</td><td class="ac-offer-stock">${stock}</td><td class="ac-offer-buy">${buy}</td></tr>`
  }
  const tax = offers.some((o) => o.tax_included === 0) ? '<p class="ac-note">Some sellers list prices excluding tax or duty, so the checkout total is higher.</p>' : ''
  return `<div class="ac-table-wrap" role="region" aria-label="Listings at Indian sellers" tabindex="0"><table class="ac-offers-table"><thead><tr><th scope="col">Seller</th><th scope="col">Config</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col"><span class="sr-only">Seller page</span></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>${tax}`
}

/** { line, tables: { <bundle id or 'other'>: html | null } } for the ready master with this slug,
 *  from the catalog database; null without one. A bundle with no listing gets its own
 *  empty-state line; 'other' is null unless something matched no bundle. */
export async function wingsOffers(env, slug, variants) {
  if (!env.CATALOG_DB) return null
  const m = await one(env, `SELECT id FROM master_model WHERE slug=? AND status='ready'`, slug)
  if (!m) return null
  const offers = await all(
    env,
    `SELECT o.config, o.pack_qty, o.note AS variant, k.*, s.name AS source_name, s.grey_import, s.made_in_india, s.tax_included
     FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id
     WHERE o.master_model_id=? AND k.review_status='approved'
     ORDER BY k.dead ASC, k.in_stock DESC, k.price_inr ASC`,
    m.id,
  )
  const tables = {}
  for (const v of variants) tables[v.id] = offersTable(offers.filter((o) => bundleOf(o, variants) === v.id)) ?? `<p class="ac-note">${esc(v.none)}</p>`
  tables.other = offersTable(offers.filter((o) => bundleOf(o, variants) === 'other'))
  return { line: offerLine(offers), tables }
}

/** Fill the page's slots. A database failure marks the render degraded (served, not cached)
 *  and leaves the fallback sentences in place. */
export async function fillWings(page, env, state, landing) {
  const { slug, variants } = landing
  let data = null
  try {
    data = await wingsOffers(env, slug, variants)
  } catch (e) {
    state.degraded = true
    console.error('wings content unavailable:', e)
  }
  if (!data) return page
  return new HTMLRewriter()
    .on('p.ac-live[data-wings]', {
      element(el) {
        if (data.line && el.getAttribute('data-wings') === slug) el.setInnerContent(data.line, { html: true })
      },
    })
    .on('div.ac-offers[data-wings-offers]', {
      element(el) {
        const [s, bundle] = (el.getAttribute('data-wings-offers') || '').split(':')
        if (s === slug && data.tables[bundle]) el.setInnerContent(data.tables[bundle], { html: true })
      },
    })
    .on('article.ac-variant-other[hidden]', {
      element(el) {
        if (data.tables.other) el.removeAttribute('hidden')
      },
    })
    .transform(page)
}
