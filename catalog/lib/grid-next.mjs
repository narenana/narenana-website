// NEW faceted catalog grid — served ONLY behind ?ui=next. Fully additive and
// isolated so the live site and its stylesheet are never touched:
//   • reuses catalog.css design tokens + .shop-head / .prod / .prods classes
//     (catalog.css itself is edited 0 bytes)
//   • all new chrome is styled by a namespaced inline <style> (.fx-*) that ships
//     only on this page
//   • reads role_tags (JSON array already stored on masters; [0] = primary)
//   • power switch = server navigation; role/size/condition/sort = client-side
//     instant filtering over an embedded dataset (progressive enhancement:
//     no-JS still gets a consistent, filtered in-stock grid for the chosen power)
import { esc, inr } from './util.mjs'
import { all } from './db.mjs'
import { page, ROLE_PRIMARY, conditionOf, dayOf, lowerFirst } from './public.mjs'
import { displayName, statedConfig } from './product-overview.mjs'

const ROLE_VOCAB = ['Trainer', 'Sport / Park Flyer', 'Aerobatic / 3D', 'Warbird', 'Jet / EDF', 'Glider / Sailplane', 'FPV / Flying Wing', 'Scale Civilian', 'Airliner']
const SIZE_BUCKETS = [['small', 'Small · under 1 m'], ['medium', 'Medium · 1–1.5 m'], ['large', 'Large · over 1.5 m']]
const SORTS = ['price-desc', 'price-asc', 'span-desc', 'span-asc', 'name', 'popular']
// Most-popular is the DEFAULT sort (YouTube-led pop_score, relevance-gated;
// 100% in-stock coverage). Keep the client URL-omission rule in FX_JS in sync.
const DEFAULT_SORT = 'popular'
// boundary is inclusive of the label ranges: medium = [1000, 1500], large = >1500
const sizeOf = (mm) => (!mm ? '' : mm < 1000 ? 'small' : mm <= 1500 ? 'medium' : 'large')
const ri = (t) => ROLE_VOCAB.indexOf(t)
// JSON embedded in an inline <script> must not let a '<' start a </script> break-out.
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
const SITE = 'https://www.narenana.com'

// ---- SEO landing pages: flat slugs → {power, roles} + page metadata ----
export const ROLE_SLUG = { warbirds: 'Warbird', jets: 'Jet / EDF', fpv: 'FPV / Flying Wing', trainers: 'Trainer', gliders: 'Glider / Sailplane', 'scale-planes': 'Scale Civilian', aerobatic: 'Aerobatic / 3D', 'sport-planes': 'Sport / Park Flyer', airliners: 'Airliner' }
export const SLUG_OF_ROLE = Object.fromEntries(Object.entries(ROLE_SLUG).map(([s, r]) => [r, s]))
export const ROLE_H1 = { Warbird: 'Warbird', 'Jet / EDF': 'Jet & EDF', 'FPV / Flying Wing': 'FPV & flying-wing', Trainer: 'Trainer', 'Glider / Sailplane': 'Glider & sailplane', 'Scale Civilian': 'Scale civilian', 'Aerobatic / 3D': 'Aerobatic & 3D', 'Sport / Park Flyer': 'Sport & park flyer', Airliner: 'Airliner' }

// ---- catalog search --------------------------------------------------------
// A search token matches a model when it appears in the brand/name/slug text
// (substring, so partial typing works and "heewing" matches via the flattened
// form), OR names a craft type (mapped to a role tag), OR names a power class.
// Every token must match SOMETHING — "nitro warbird" = warbirds with power gas.
const SEARCH_ROLE_WORDS = {
  trainer: 'Trainer', trainers: 'Trainer', beginner: 'Trainer',
  warbird: 'Warbird', warbirds: 'Warbird',
  jet: 'Jet / EDF', jets: 'Jet / EDF', edf: 'Jet / EDF',
  fpv: 'FPV / Flying Wing', vtol: 'FPV / Flying Wing', flyingwing: 'FPV / Flying Wing',
  glider: 'Glider / Sailplane', gliders: 'Glider / Sailplane', sailplane: 'Glider / Sailplane',
  aerobatic: 'Aerobatic / 3D', '3d': 'Aerobatic / 3D',
  civilian: 'Scale Civilian', cessna: 'Scale Civilian',
  sport: 'Sport / Park Flyer', park: 'Sport / Park Flyer', parkflyer: 'Sport / Park Flyer',
  airliner: 'Airliner', airliners: 'Airliner',
}
const SEARCH_POWER_WORDS = { electric: 'electric', nitro: 'gas', gas: 'gas', petrol: 'gas' }
export function searchRows(rows, q) {
  const toks = (q || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 8)
  if (!toks.length) return rows
  return rows.filter((m) => {
    const hay = ' ' + ((m.brand || '') + ' ' + (m.name || '') + ' ' + (m.slug || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
    const flat = hay.replace(/ /g, '')
    let tags = []
    try { tags = JSON.parse(m.role_tags || '[]') } catch {}
    return toks.every((t) => {
      if (hay.includes(t) || flat.includes(t)) return true
      const role = SEARCH_ROLE_WORDS[t]
      if (role && tags.includes(role)) return true
      const pw = SEARCH_POWER_WORDS[t]
      if (pw) return (m.power || 'electric') === pw
      return false
    })
  })
}
const POWER_SLUG = { electric: 'electric', nitro: 'gas', gas: 'gas' }
export const LANDING_ROLE_SLUGS = Object.keys(ROLE_SLUG)

// slug → { power:'electric'|'gas'|'all', roles:[], roleSlug } | null
export function resolveLanding(slug) {
  if (ROLE_SLUG[slug]) return { power: 'all', roles: [ROLE_SLUG[slug]], roleSlug: slug }
  if (POWER_SLUG[slug]) return { power: POWER_SLUG[slug], roles: [], roleSlug: '' }
  for (const ps of ['electric', 'nitro', 'gas']) {
    if (slug.startsWith(ps + '-')) {
      const rest = slug.slice(ps.length + 1)
      if (ROLE_SLUG[rest]) return { power: POWER_SLUG[ps], roles: [ROLE_SLUG[rest]], roleSlug: rest }
    }
  }
  return null
}

// How the landings name their planes: sentence case, acronyms kept (FPV, EDF,
// 3D, RC), led by the words buyers search with. base: the page noun; lead: the
// all-power H1 noun when it says more ('… for beginners': Trainer is the strict
// forgiving-beginner role); many/one: counts in copy ('30 trainers'); short: a
// related-page link label.
const ROLE_NOUN = {
  Trainer: { base: 'trainer RC planes', lead: 'Trainer RC planes for beginners', many: 'trainers', one: 'trainer', short: 'trainers' },
  'Sport / Park Flyer': { base: 'sport and park flyer RC planes', many: 'sport planes and park flyers', one: 'sport plane or park flyer', short: 'sport planes' },
  'FPV / Flying Wing': { base: 'FPV and flying wing RC planes', many: 'FPV planes and flying wings', one: 'FPV plane or flying wing', short: 'FPV wings' },
  'Glider / Sailplane': { base: 'RC gliders and sailplanes', many: 'gliders and sailplanes', one: 'glider or sailplane', short: 'gliders' },
  Warbird: { base: 'warbird RC planes', many: 'warbirds', one: 'warbird', short: 'warbirds' },
  'Jet / EDF': { base: 'RC jets and EDF planes', many: 'jets and EDF planes', one: 'jet or EDF plane', short: 'jets' },
  'Aerobatic / 3D': { base: 'aerobatic and 3D RC planes', many: 'aerobatic and 3D planes', one: 'aerobatic or 3D plane', short: 'aerobatic planes' },
  'Scale Civilian': { base: 'scale civilian RC planes', many: 'scale civilian planes', one: 'scale civilian plane', short: 'scale planes' },
  Airliner: { base: 'airliner RC planes', many: 'airliners', one: 'airliner', short: 'airliners' },
}
const POWER_WORD = { electric: 'electric', gas: 'nitro and gas' }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export const TITLE_MAX = 60

// A landing's nouns: { lead, many, one, crumb }, naming the power on
// electric-X / nitro-X pages ('Electric trainer RC planes', '22 electric trainers').
export function landingNoun(L) {
  const pw = L.power === 'all' ? '' : POWER_WORD[L.power] || ''
  const r = L.roles.length ? ROLE_NOUN[L.roles[0]] : null
  if (!r) return { lead: cap(`${pw} RC planes`), many: `${pw} planes`, one: `${pw} plane`, crumb: cap(`${pw} planes`) }
  const many = pw ? `${pw} ${lowerFirst(r.many)}` : r.many
  return {
    lead: pw ? cap(`${pw} ${lowerFirst(r.base)}`) : r.lead || cap(r.base),
    many,
    one: pw ? `${pw} ${lowerFirst(r.one)}` : r.one,
    crumb: cap(many),
  }
}

// page metadata for a resolved landing (H1, title, breadcrumbs, nouns). The
// meta description is written from the landing's price summary (landingDesc).
function landingMeta(cat, L, slug) {
  const noun = landingNoun(L)
  const h1 = `${noun.lead} in India`
  // No ₹ in titles: Google keeps showing a title after the price moves.
  const title = [`${noun.lead}: prices in India | narenana`, `${noun.lead} in India | narenana`].find((t) => t.length <= TITLE_MAX) || `${noun.lead} | narenana`
  const crumbs = [{ name: 'Home', url: '/' }, { name: cat.name, url: `${cat.path_prefix}/` }]
  // nitro-X sits under /nitro/. electric-X sits straight under the hub, which
  // is the electric grid (/electric/ 301s to it).
  if (L.power === 'gas' && L.roles.length) crumbs.push({ name: 'Nitro and gas planes', url: `${cat.path_prefix}/nitro/` })
  crumbs.push({ name: noun.crumb, url: `${cat.path_prefix}/${slug}/` })
  return { h1, noun, title, path: `${cat.path_prefix}/${slug}/`, crumbs }
}

// ---- our own ₹ figures (SEO rec 5) ----------------------------------------
// gridDataNext's live_offers: each model's listings that are in stock, still
// listed, not held for review (flagged) and priced. Nothing else feeds a
// figure, so a withheld price cannot leak into a summary.
const liveOffers = (m) => {
  if (Array.isArray(m.live_offers)) return m.live_offers.filter(Boolean)
  try {
    const a = JSON.parse(m.live_offers || '[]')
    return Array.isArray(a) ? a.filter(Boolean) : []
  } catch {
    return []
  }
}

// Price summary for a set of in-stock models (gridDataNext rows). A figure is
// the lowest price of one new unit (the product pages' comparableOffers rules),
// counted under the configuration the listing states (statedConfig: a stored
// 'kit' the seller never called one is '', not stated).
//   models   in-stock models (the grid's count)
//   sellers  distinct sellers with a live, priced listing among them: the rule
//            of the homepage's seller count (HOME_SELLER_COUNT_SQL)
//   multi    models with live, priced listings at two or more sellers
//   from     lowest price across every configuration, or null
//   bands    { kit|arf|pnp|rtf|combo|'': { n, from } }: models, lowest price
//   first/last  oldest and newest check among those listings (ms)
export function priceSummary(rows) {
  const sellers = new Set()
  const bands = {}
  let from = null, multi = 0, first = null, last = null
  for (const m of rows) {
    const offers = liveOffers(m)
    const own = new Set(offers.map((o) => o.s).filter(Boolean))
    for (const s of own) sellers.add(s)
    if (own.size >= 2) multi++
    const best = {}
    for (const o of offers) {
      const at = Number(o.at) || 0
      if (at) {
        first = first == null ? at : Math.min(first, at)
        last = last == null ? at : Math.max(last, at)
      }
      if (o.q !== 1 || !(o.p > 0) || conditionOf(o.t) !== 'new') continue
      const c = statedConfig({ config: o.c, title: o.t, url_canonical: o.u })
      if (best[c] == null || o.p < best[c]) best[c] = o.p
      if (from == null || o.p < from) from = o.p
    }
    for (const [c, p] of Object.entries(best)) {
      const b = (bands[c] ||= { n: 0, from: p })
      b.n++
      b.from = Math.min(b.from, p)
    }
  }
  return { models: rows.length, sellers: sellers.size, multi, from, bands, first, last }
}

// '29 Sep 2026', '27–29 Sep 2026', '30 Aug – 2 Sep 2026' ('' without dates).
export function checkedRange(first, last) {
  if (!first || !last) return ''
  const a = new Date(first), b = new Date(last)
  const da = dayOf(first), db = dayOf(last)
  if (da === db) return db
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${da} – ${db}`
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${da.replace(/ \d{4}$/, '')} – ${db}`
  return `${a.getUTCDate()}–${db}`
}

const nSellers = (n) => `${n} Indian seller${n === 1 ? '' : 's'}`
const joinList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
// Prose order and names of the stated configurations (combos, and listings
// that state none, appear only in the table).
const BAND_PROSE = [['kit', 'kits'], ['rtf', 'ready-to-fly'], ['pnp', 'plug-and-play'], ['arf', 'ARFs']]
const bandsProse = (sum) => BAND_PROSE.filter(([c]) => sum.bands[c])

// Landing intro, from the same numbers as its meta description and table:
// '30 trainers in stock at 7 Indian sellers, from ₹1,650. Kits start at
// ₹2,189, ready-to-fly at ₹7,790 … 8 are sold by two or more sellers. Prices
// as last checked 27–29 Sep 2026.'

// Landing meta description: the '₹ from' figure and the seller count first,
// then as many configuration figures as fit beside the check date, the most
// common configuration first (the date goes only if not even the head fits).
export const DESC_MAX = 155
export function landingDesc(noun, sum) {
  const what = `${sum.models} ${sum.models === 1 ? noun.one : noun.many}`
  if (!sum.sellers || !sum.from) return `${what} in stock at Indian sellers, with prices and stock as last checked and a link straight to each seller.`
  const head = `${what} in stock at ${nSellers(sum.sellers)}, from ${inr(sum.from)}.`
  const when = checkedRange(sum.first, sum.last)
  const tail = when ? ` Prices as last checked ${when}.` : ' Prices as last checked.'
  // The configurations most of these models come in first (ARFs on nitro pages).
  const bands = bandsProse(sum).sort(([a], [b]) => sum.bands[b].n - sum.bands[a].n).map(([c, w]) => `${w} from ${inr(sum.bands[c].from)}`)
  for (const end of [tail, ''])
    for (let k = bands.length; k >= 0; k--) {
      const d = `${head}${k ? ` ${cap(bands.slice(0, k).join(', '))}.` : ''}${end}`
      if (d.length <= DESC_MAX) return d
    }
  return head.slice(0, DESC_MAX)
}

// Table labels for the configurations, in table order ('' = not stated).
const BAND_ROWS = [['kit', 'Kit (airframe only)'], ['arf', 'ARF (almost ready to fly)'], ['pnp', 'PNP (plug and play)'], ['rtf', 'RTF (ready to fly)'], ['combo', 'Combo (with motor or electronics)'], ['', 'Configuration not stated']]
const glanceNote = (sum, notStated) => {
  const when = checkedRange(sum.first, sum.last)
  return `<p class="fx-gnote">Lowest price for one new unit${when ? `, as last checked ${esc(when)}` : ', as last checked'}. Prices held for review are left out. Kit: the airframe only; you add the power system, servos and radio. PNP: the power system is fitted; you add a receiver and battery. RTF: comes with a radio.${notStated ? ' Some listings don’t say which they are, so check the seller’s page before you buy.' : ''}</p>`
}
const glanceTable = (head, body, note, cls = '') =>
  `<section class="fx-glance" aria-labelledby="fx-glance"><h2 id="fx-glance">Prices at a glance</h2><div class="fx-gscroll"><table class="fx-gt${cls ? ` ${cls}` : ''}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${note}</section>`

// A landing's table: one row per configuration its listings state.
function landingGlance(sum) {
  const rows = BAND_ROWS.filter(([c]) => sum.bands[c])
  if (!rows.length) return ''
  const body = rows.map(([c, label]) => `<tr><th scope="row">${esc(label)}</th><td>${sum.bands[c].n}</td><td>${inr(sum.bands[c].from)}</td></tr>`).join('')
  return glanceTable(['Configuration', 'Models', 'From'], body, glanceNote(sum, !!sum.bands['']))
}

// The hub's table: every type across both powers (as its landing shows it),
// then the electric and nitro/gas totals, so a page titled 'RC plane prices
// in India' covers nitro too. A type links its landing when that is indexable.
// Each row's in-stock count sits under its label, so the table fits a phone.
const HUB_TYPES = ['trainers', 'sport-planes', 'fpv', 'gliders', 'warbirds', 'jets', 'aerobatic', 'scale-planes', 'airliners']
const HUB_LABEL = { trainers: 'Trainers', 'sport-planes': 'Sport planes', fpv: 'FPV wings', gliders: 'Gliders', warbirds: 'Warbirds', jets: 'Jets and EDF', aerobatic: 'Aerobatic and 3D', 'scale-planes': 'Scale planes', airliners: 'Airliners' }
const tagged = (rows, role) => rows.filter((m) => { try { return JSON.parse(m.role_tags || '[]').includes(role) } catch { return false } })
const isGas = (m) => m.power === 'gas'
function hubGlance(cat, all, valid) {
  const whole = priceSummary(all)
  if (!whole.from) return ''
  const link = (slug, label) => (valid?.has(slug) ? `<a href="${cat.path_prefix}/${slug}/">${esc(label)}</a>` : esc(label))
  const lines = HUB_TYPES.map((slug) => ({ slug, rows: tagged(all, ROLE_SLUG[slug]) }))
    .filter((x) => x.rows.length)
    .map((x) => ({ label: link(x.slug, HUB_LABEL[x.slug]), sum: priceSummary(x.rows) }))
  const electric = all.filter((m) => !isGas(m)), gas = all.filter(isGas)
  if (electric.length) lines.push({ label: 'All electric', sum: priceSummary(electric), total: true, note: ', listed above' })
  if (gas.length) lines.push({ label: link('nitro', 'All nitro and gas'), sum: priceSummary(gas), total: true })
  const cell = (price) => (price ? `<td>${inr(price)}</td>` : '<td class="is-none">—</td>')
  const body = lines.map(({ label, sum, total, note = '' }) => `<tr${total ? ' class="is-total"' : ''}><th scope="row">${label}<span class="fx-gn">${sum.models} in stock${note}</span></th>${cell(sum.from)}${cell(sum.bands.kit?.from)}${cell(sum.bands.pnp?.from)}${cell(sum.bands.rtf?.from)}</tr>`).join('')
  return glanceTable(['Type', 'From', 'Kit', 'PNP', 'RTF'], body, glanceNote(whole, !!whole.bands['']), 'is-hub')
}

// Hub title, description and intro from the same numbers. all: every in-stock
// model of both powers (the grid below shows the electric ones).
function hubCopy(cat, all) {
  const whole = priceSummary(all)
  const electric = priceSummary(all.filter((m) => !isGas(m)))
  const gas = priceSummary(all.filter(isGas))
  const when = checkedRange(whole.first, whole.last)
  const title = whole.sellers >= 2 ? `RC plane prices in India: ${whole.sellers} sellers compared | narenana` : 'RC plane prices in India | narenana'
  const pw = [electric.from && `electric from ${inr(electric.from)}`, gas.from && `nitro and gas from ${inr(gas.from)}`].filter(Boolean)
  const head = whole.sellers ? `${whole.models} RC planes in stock at ${nSellers(whole.sellers)}${pw.length ? `: ${pw.join(', ')}` : ''}.` : `${whole.models} RC planes in stock at Indian sellers, with prices and stock as last checked.`
  const desc = [head + (when ? ` Prices as last checked ${when}.` : ''), head].find((d) => d.length <= DESC_MAX) || head.slice(0, DESC_MAX)
  return { title, desc, when, whole, models: whole.models }
}

// Practise-first lines for the types a sim covers. Laptop or desktop only:
// never a phone claim. Nanawing 2 is the line-of-sight sim, Nanawing the FPV
// wing sim.
const PRACTISE = {
  Trainer: 'Practise circuits and landings line of sight in <a href="https://nanawing2.narenana.com/">Nanawing 2</a> before you risk the real plane. It runs free in your browser on a laptop or desktop.',
  'FPV / Flying Wing': 'Practise hand launches and landings in <a href="https://sim.narenana.com/">Nanawing</a> before you risk the real wing. It runs free in your browser on a laptop or desktop. After a real flight, replay your iNAV or EdgeTX log on a 3D map in the <a href="/log-viewer/">log viewer</a>.',
}
// Types a buyer of each type often compares next.
const RELATED = {
  trainers: ['sport-planes', 'scale-planes', 'gliders'],
  'sport-planes': ['trainers', 'aerobatic', 'warbirds'],
  fpv: ['gliders', 'sport-planes', 'jets'],
  gliders: ['fpv', 'trainers', 'sport-planes'],
  warbirds: ['jets', 'scale-planes', 'aerobatic'],
  jets: ['warbirds', 'fpv', 'aerobatic'],
  aerobatic: ['sport-planes', 'warbirds', 'jets'],
  'scale-planes': ['warbirds', 'trainers', 'sport-planes'],
  airliners: ['jets', 'scale-planes'],
}
const browseLine = (pref) => `See <a href="${pref}/browse/">every model in stock</a> on one page, or read <a href="/catalog-methodology/">how we check prices and stock</a>.`
// Plain internal links under a landing's editorial: related types (indexable
// landings only), every model in stock, and how prices are checked.
function landingMore(cat, landing, valid) {
  const pref = cat.path_prefix
  const { L } = landing
  const ok = (s) => !!valid?.has(s)
  const a = (s, label) => `<a href="${pref}/${s}/">${esc(label)}</a>`
  let rel = []
  if (L.roles.length && L.power !== 'all') {
    // electric-X / nitro-X: the other power's page, then the all-power page.
    const r = ROLE_NOUN[L.roles[0]]
    const otherPw = L.power === 'gas' ? 'electric' : 'gas'
    const other = `${otherPw === 'gas' ? 'nitro' : 'electric'}-${L.roleSlug}`
    if (ok(other)) rel.push(a(other, `${POWER_WORD[otherPw]} ${lowerFirst(r.many)}`))
    if (ok(L.roleSlug)) rel.push(a(L.roleSlug, `${lowerFirst(r.many)} of any power`))
  } else if (L.roles.length) {
    rel = (RELATED[L.roleSlug] || []).filter(ok).map((s) => a(s, ROLE_NOUN[ROLE_SLUG[s]].short))
  }
  // /nitro/: its per-type pages, under one 'nitro and gas'.
  const byType = !L.roles.length && L.power === 'gas' ? HUB_TYPES.filter((s) => ok(`nitro-${s}`)).map((s) => a(`nitro-${s}`, ROLE_NOUN[ROLE_SLUG[s]].short)) : []
  const lines = []
  if (L.roles.length && PRACTISE[L.roles[0]]) lines.push(PRACTISE[L.roles[0]])
  if (rel.length) lines.push(`Also compare prices on ${joinList(rel)}.`)
  if (byType.length) lines.push(`Compare nitro and gas ${joinList(byType)}.`)
  lines.push(browseLine(pref))
  return `<section class="fx-more">${lines.map((l) => `<p>${l}</p>`).join('')}</section>`
}

// A landing is an indexable page only with at least this many in-stock models.
export const LANDING_MIN = 3

// Indexable landing slugs: the sitemap, IndexNow, the /browse/ hub, the grid's
// Browse-by-type nav and the power tabs all use this one set. masters rows
// need: power, role_tags, any_stock.
// electric-X is listed only when nitro-X also qualifies. Without a nitro half,
// electric-X shows (almost) the same models as the all-power X page, and the
// two compete as near-duplicates; X carries the role alone (the landing route
// 301s electric-X to it, see landingRedirect). There is no /electric/ page:
// the hub IS the electric grid, so /electric/ 301s to it (SEO rec 5).
export function validLandings(masters, min = LANDING_MIN) {
  const parse = (rt) => { try { return JSON.parse(rt || '[]') } catch { return [] } }
  const live = masters.filter((m) => m.any_stock)
  const n = (pw, role) => live.filter((m) => (!pw || (m.power || 'electric') === pw) && (!role || parse(m.role_tags).includes(role))).length
  const out = []
  for (const [slug, role] of Object.entries(ROLE_SLUG)) if (n(null, role) >= min) out.push(slug)
  for (const [pslug, pw] of [['electric', 'electric'], ['nitro', 'gas']]) {
    if (pw === 'gas' && n(pw) >= min) out.push(pslug)
    for (const [rslug, role] of Object.entries(ROLE_SLUG))
      if (n(pw, role) >= min && (pw === 'gas' || n('gas', role) >= min)) out.push(`${pslug}-${rslug}`)
  }
  return out
}

// electric-X → X while nitro-X does not qualify (validLandings has dropped
// electric-X), and /electric/ → the hub ('') always: the hub is the electric
// grid. Returns the slug to 301 to ('' = the hub), or null. Dynamic: once
// nitro-X has the stock, electric-X serves again and returns to the sitemap.
export function landingRedirect(slug, valid) {
  if (slug === 'electric') return ''
  if (!slug.startsWith('electric-')) return null
  const rslug = slug.slice('electric-'.length)
  return ROLE_SLUG[rslug] && !valid.has(`nitro-${rslug}`) ? rslug : null
}

// A product page's links into the landings (SEO rec 3). It reads the model's
// STORED role tags only (the reviewed taxonomy is never re-inferred) and orders
// them by the fixed ROLE_PRIMARY priority, since stored order is not a
// priority order. Only valid (indexable) landings get an href:
//   types   every tag, in priority order, linked to its role landing
//   primary the first type whose landing is valid: the breadcrumb level
//   power   electric-X / nitro-X for the primary role when valid, else
//           /nitro/ for a nitro model; electric otherwise stays plain text
// valid: a Set of validLandings() slugs.
export function productLandings(cat, m, valid) {
  let tags = []
  try { tags = JSON.parse(m.role_tags || '[]') } catch {}
  if (!Array.isArray(tags)) tags = []
  const href = (slug) => (slug && valid?.has(slug) ? `${cat.path_prefix}/${slug}/` : null)
  const types = ROLE_PRIMARY.filter((r) => tags.includes(r)).map((role) => ({ role, label: ROLE_H1[role], crumb: cap(ROLE_NOUN[role]?.base || `${ROLE_H1[role]} RC planes`), href: href(SLUG_OF_ROLE[role]) }))
  const primary = types.find((t) => t.href) || null
  const gas = (m.power || 'electric') === 'gas'
  const roleSlug = primary ? SLUG_OF_ROLE[primary.role] : null
  const power = { label: gas ? 'Nitro / gas' : 'Electric', href: href(roleSlug && `${gas ? 'nitro' : 'electric'}-${roleSlug}`) || (gas ? href('nitro') : null) }
  return { types, primary, power }
}

// { electric, gas } in-stock model counts for the power tabs, from
// gridDataNext rows (the same numbers as the worker's gridCounts).
export function powerCounts(rows) {
  const c = { electric: 0, gas: 0 }
  for (const r of rows) c[r.power === 'gas' ? 'gas' : 'electric']++
  return c
}

// Every IN-STOCK ready master (>=1 live approved offer). Powers the /browse/
// HTML sitemap. In-stock only by owner decision: we don't funnel crawl equity
// or shoppers to products we can't currently sell. Same rule as the grid and
// the XML sitemap. any_stock is kept for validLandings and is always 1 here.
export async function browseData(env, cat) {
  return all(
    env,
    `SELECT m.slug, m.brand, m.name, m.role_tags, COALESCE(m.power,'electric') AS power,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
     FROM master_model m
     CROSS JOIN offer o ON o.master_model_id=m.id
     CROSS JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
     WHERE m.category_id=? AND m.status='ready'
     GROUP BY m.id
     HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1
     ORDER BY m.brand COLLATE NOCASE, m.name COLLATE NOCASE`,
    cat.id,
  )
}

const BZ_CSS = `<style>
.bz{max-width:1000px;margin:0 auto;padding:22px 20px 60px}
.bz-crumbs{font-size:12px;color:var(--muted);margin-bottom:14px}
.bz-crumbs a{color:var(--muted);text-decoration:none}.bz-crumbs a:hover{text-decoration:underline}
.bz-h1{font-family:'Barlow Condensed',system-ui,sans-serif;font-weight:800;font-size:clamp(1.6rem,4vw,2.3rem);letter-spacing:-.02em;margin:0 0 8px}
.bz-lede{color:var(--muted);max-width:66ch;margin:0 0 26px}
.bz-qform{display:flex;max-width:430px;margin:0 0 28px}
.bz-q{flex:1;min-width:0;border:1.5px solid var(--faint);border-right:0;border-radius:10px 0 0 10px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:14px;padding:9px 13px}
.bz-q:focus{border-color:var(--ink);outline:none}
.bz-qbtn{border:1.5px solid var(--ink);border-radius:0 10px 10px 0;background:var(--ink);color:var(--paper,#fcf9f1);font:inherit;font-size:13px;font-weight:600;padding:9px 16px;cursor:pointer}
.bz-sec{margin:0 0 30px}
.bz-sec h2{font-family:'Barlow Condensed',system-ui,sans-serif;font-size:1.15rem;font-weight:800;margin:0 0 12px;padding-bottom:6px;border-bottom:1.5px solid var(--faint);scroll-margin-top:70px}
.bz-n{font-family:'JetBrains Mono',monospace;font-size:.7em;color:var(--muted);font-weight:500;margin-left:5px}
.bz-list,.bz-land{list-style:none;margin:0;padding:0;columns:2;column-gap:26px}
@media(min-width:760px){.bz-list,.bz-land{columns:3}}
.bz-list li,.bz-land li{break-inside:avoid;margin:0 0 7px;font-size:14px;line-height:1.32}
.bz a{color:var(--ink);text-decoration:none}.bz a:hover{color:var(--orange-deep);text-decoration:underline}
.bz-land a{color:var(--orange-deep);font-weight:600}
</style>`

// HTML sitemap / "browse all" hub: every landing page + every product link,
// grouped by primary type. A crawlable hub so no product page is orphaned —
// the XML sitemap lists the URLs, this passes internal-link equity to them too.
export function renderBrowse(cat, masters, landings) {
  const pfx = cat.path_prefix
  const parse = (rt) => { try { return JSON.parse(rt || '[]') } catch { return [] } }
  // Each landing by its own H1 noun, in sentence case ('Electric trainer RC planes').
  const landingLabel = (slug) => {
    const L = resolveLanding(slug)
    return L ? landingNoun(L).lead : slug
  }
  const landingLinks = landings
    .map((s) => ({ s, label: landingLabel(s) }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ s, label }) => `<li><a href="${pfx}/${esc(s)}/">${esc(label)}</a></li>`)
    .join('')

  const groups = new Map()
  for (const m of masters) {
    const role = parse(m.role_tags)[0] || 'Other'
    if (!groups.has(role)) groups.set(role, [])
    groups.get(role).push(m)
  }
  const sections = [...ROLE_VOCAB, 'Other']
    .filter((r) => groups.has(r))
    .map((role) => {
      const items = groups
        .get(role)
        .map((m) => `<li><a href="${pfx}/${esc(m.slug)}/">${esc(displayName(m))}</a></li>`)
        .join('')
      return `<section class="bz-sec"><h2 id="${esc(SLUG_OF_ROLE[role] || 'other')}">${esc(ROLE_H1[role] || 'Other')}<span class="bz-n">${groups.get(role).length}</span></h2><ul class="bz-list">${items}</ul></section>`
    })
    .join('')

  const total = masters.length
  const body = `<main class="bz">
<nav class="bz-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="${pfx}/">${esc(cat.name)}</a> › All models</nav>
<h1 class="bz-h1">All RC plane models</h1>
<p class="bz-lede">Every RC plane in stock right now: ${total} models, with prices as last checked at Indian sellers. Browse by category, or by type below.</p>
<form class="bz-qform" role="search" action="${pfx}/" method="get"><input class="bz-q" type="search" name="q" placeholder="Search models — name, brand or type…" aria-label="Search models"/><button class="bz-qbtn" type="submit">Search</button></form>
<section class="bz-sec"><h2>Browse by category</h2><ul class="bz-land">${landingLinks}</ul></section>
${sections}
</main>${BZ_CSS}`

  return page({
    title: `All RC plane models in India (${total}) | narenana`,
    desc: `Index of every RC plane in stock in the narenana catalog: ${total} models across warbirds, FPV wings, trainers, jets, gliders and more, with prices as last checked.`,
    path: `${pfx}/browse/`,
    body,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'All RC plane models', url: `${SITE}${pfx}/browse/` },
  })
}

const specLine = (m) => {
  try {
    const s = JSON.parse(m.specs || '{}')
    return [s.spanMM && `${s.spanMM}mm`, s.auwG && `${s.auwG}g`].filter(Boolean).join(' · ')
  } catch { return '' }
}

// All in-stock ready masters for one power (no pagination — the client filters).
// Condition is derived per-offer and split into two in-stock signals so a master
// with BOTH a new and a used listing is correctly filterable as either.
// live_offers (JSON; nulls for the other listings) feeds priceSummary: only
// listings in stock, still listed, not flagged and priced. It is never embedded
// in the page.
export async function gridDataNext(env, cat, power) {
  const USED = `(LOWER(k.title) LIKE '%pre-owned%' OR LOWER(k.title) LIKE '%pre owned%' OR LOWER(k.title) LIKE '%preowned%'
                 OR LOWER(k.title) LIKE '%sparingly used%' OR LOWER(k.title) LIKE '%(used)%' OR LOWER(k.title) LIKE '%refurbished%')`
  return all(
    env,
    `SELECT m.id, m.slug, m.brand, m.name, m.power, m.role_tags, m.specs, m.hero_image, m.pop_score,
            COUNT(DISTINCT k.source_id) AS sellers,
            COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero_any,
            COALESCE(MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND COALESCE(k.flagged,'')='' AND k.price_inr>0 AND o.pack_qty=1 AND NOT (LOWER(k.title) LIKE '%pre-owned%' OR LOWER(k.title) LIKE '%pre owned%' OR LOWER(k.title) LIKE '%preowned%' OR LOWER(k.title) LIKE '%sparingly used%' OR LOWER(k.title) LIKE '%(used)%' OR LOWER(k.title) LIKE '%refurbished%') THEN k.price_inr END), MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND COALESCE(k.flagged,'')='' AND k.price_inr>0 THEN k.price_inr END)) AS min_price,
            CAST(json_extract(m.specs,'$.spanMM') AS INTEGER) AS span_mm,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 AND ${USED} THEN 1 ELSE 0 END) AS preowned_stock,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 AND NOT ${USED} THEN 1 ELSE 0 END) AS new_stock,
            json_group_array(CASE WHEN k.in_stock=1 AND k.dead=0 AND COALESCE(k.flagged,'')='' AND k.price_inr>0
              THEN json_object('s',k.source_id,'p',k.price_inr,'q',o.pack_qty,'c',o.config,'t',k.title,'u',k.url_canonical,'at',COALESCE(k.last_checked,k.last_seen)) END) AS live_offers
     FROM master_model m
     CROSS JOIN offer o ON o.master_model_id=m.id
     CROSS JOIN sku k ON k.id = o.sku_id AND k.review_status='approved'
     WHERE m.category_id=? AND m.status='ready' ${power === 'all' ? '' : "AND COALESCE(m.power,'electric')=?"}
     GROUP BY m.id
     HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1`,
    ...(power === 'all' ? [cat.id] : [cat.id, power]),
  )
}

const chip = (f, v, label, count, on, extra = '') =>
  `<button class="fx-chip ${extra} ${on ? 'is-on' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-f="${f}" data-v="${esc(v)}">` +
  `${extra.includes('cb') ? '<span class="fx-cbx" aria-hidden="true"></span>' : ''}${esc(label)}<b class="fx-n">${count}</b></button>`

function cardNext(it, pref, hidden, priority = false) {
  const m = it.m
  const hero = m.hero_any ?? m.hero_image
  const price = m.min_price
  const preOwnedOnly = it.cp && !it.cn // only obtainable pre-owned → surface the tag
  return `<li class="prod" data-id="${m.id}"${hidden ? ' style="display:none"' : ''}>
    <a class="prod-link" href="${pref}/${esc(m.slug)}/">
      <div class="prod-img">${hero ? `<img src="/img/master/${m.id}" alt="${esc(displayName(m))}" width="800" height="600" loading="${priority ? 'eager' : 'lazy'}" fetchpriority="${priority ? 'high' : 'auto'}" />` : '<div class="prod-noimg">No image</div>'}${preOwnedOnly ? '<span class="prod-tag" style="position:absolute;top:8px;left:8px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#7a4a00;background:#f7e2b8;border-radius:5px;padding:2px 7px">PRE-OWNED</span>' : ''}</div>
      <div class="prod-body">
        <p class="prod-brand">${esc(m.brand)}</p>
        <h2 class="prod-name">${esc(m.name)}</h2>
        <p class="prod-spec">${esc(specLine(m))}</p>
        <div class="prod-price">${price ? `<div class="price"><span class="price-pre">from</span> ${inr(price)}</div>` : '<div class="price is-muted">Price under review</div>'}${m.sellers > 1 ? `<span class="mrp" style="text-decoration:none">${m.sellers} sellers</span>` : ''}</div>
      </div>
      <span class="prod-cta">${m.sellers > 1 ? `Compare ${m.sellers} sellers` : 'View & buy'}</span>
    </a></li>`
}

export function renderGridNext(cat, rows, opts = {}) {
  const landing = opts.landing || null // { L, slug }
  const Lmeta = landing ? landingMeta(cat, landing.L, landing.slug) : null
  const power = opts.power === 'gas' ? 'gas' : opts.power === 'all' ? 'all' : 'electric'
  const sort = SORTS.includes(opts.sort) ? opts.sort : DEFAULT_SORT
  const cond = ['new', 'pre-owned'].includes(opts.cond) ? opts.cond : 'all'
  const selRoles = (opts.roles || []).filter((t) => ROLE_VOCAB.includes(t))
  const selSizes = (opts.sizes || []).filter((k) => SIZE_BUCKETS.some((s) => s[0] === k))
  // Power-tab counts. The worker scopes them to the role on a role landing.
  const counts = opts.counts || { electric: 0, gas: 0 }
  // Indexable landing slugs (validLandings). null in unit renders that omit it.
  const valid = opts.valid || null
  const pref = cat.path_prefix
  // Search mode: rows arrive power='all' and get filtered here; facet chips are
  // built from the filtered items, so they narrow WITHIN the results.
  const q = (opts.q || '').trim().slice(0, 60)
  if (q) rows = searchRows(rows, q)

  const items = rows.map((m) => {
    let tags = []
    try { tags = JSON.parse(m.role_tags || '[]') } catch {}
    tags = (Array.isArray(tags) ? tags : []).filter((t) => ROLE_VOCAB.includes(t)) // vocab-only (drops "Other"; hardens the embed)
    return { m, tags, size: sizeOf(m.span_mm), cn: !!m.new_stock, cp: !!m.preowned_stock, price: m.min_price ?? null, span: m.span_mm || 0, pop: m.pop_score ?? null }
  })

  const mRoles = (it) => !selRoles.length || selRoles.some((t) => it.tags.includes(t))
  const mSizes = (it) => !selSizes.length || selSizes.includes(it.size)
  const mCond = (it) => cond === 'all' || (cond === 'new' ? it.cn : it.cp)
  const visible = (it) => mRoles(it) && mSizes(it) && mCond(it)
  const resultN = items.filter(visible).length

  // contextual facets present in this power
  const rolesPresent = ROLE_VOCAB.filter((t) => items.some((it) => it.tags.includes(t)))
  const sizesPresent = SIZE_BUCKETS.filter(([k]) => items.some((it) => it.size === k))
  const hasCond = items.some((it) => it.cp) // only offer the condition facet when some listing is pre-owned

  // server-side facet counts (mirror the client; keeps no-JS correct)
  const roleCount = (t) => items.filter((it) => it.tags.includes(t) && mSizes(it) && mCond(it)).length
  const sizeCount = (k) => items.filter((it) => it.size === k && mRoles(it) && mCond(it)).length
  const condCount = (c) => items.filter((it) => (c === 'new' ? it.cn : it.cp) && mRoles(it) && mSizes(it)).length

  // server initial order (client re-sorts identically)
  const cmp = (a, b) => {
    if (sort === 'name') return a.m.name.localeCompare(b.m.name)
    if (sort === 'popular') return (b.pop ?? -1) - (a.pop ?? -1) || (b.price ?? -1) - (a.price ?? -1)
    if (sort === 'span-desc') return (b.span || 0) - (a.span || 0)
    if (sort === 'span-asc') return (a.span || 1e9) - (b.span || 1e9)
    const pa = a.price ?? (sort === 'price-asc' ? 1e12 : -1), pb = b.price ?? (sort === 'price-asc' ? 1e12 : -1)
    return sort === 'price-asc' ? pa - pb : pb - pa
  }
  const ordered = [...items].sort(cmp)

  // Power tabs. A power with no models here gets no tab (a role with no nitro
  // stock shows no Nitro tab, instead of a link to an empty filter page). An
  // all-power role landing whose models are all one power IS that power's view.
  const hasPower = (p) => counts[p] > 0
  const onPower = power === 'all' && landing?.L.roles.length && hasPower('electric') !== hasPower('gas') ? (hasPower('electric') ? 'electric' : 'gas') : power
  const powerHref = (p) => {
    if (landing) {
      if (p === onPower) return Lmeta.path
      // The sibling landing (electric-warbirds <-> nitro-warbirds, electric <->
      // nitro) when it is a valid, indexable page.
      const ps = p === 'gas' ? 'nitro' : 'electric'
      const sibling = landing.L.roleSlug ? `${ps}-${landing.L.roleSlug}` : ps
      if (valid?.has(sibling)) return `${pref}/${sibling}/`
    }
    // Otherwise the power's own indexable page: Electric → the hub, Nitro → /nitro/.
    if (sort === DEFAULT_SORT) {
      if (p === 'electric') return `${pref}/`
      if (valid ? valid.has('nitro') : counts.gas >= LANDING_MIN) return `${pref}/nitro/`
    }
    const qs = new URLSearchParams()
    if (p !== 'electric') qs.set('power', p)
    if (landing?.L.roles.length) qs.set('role',landing.L.roles.join(','))
    if (sort !== DEFAULT_SORT) qs.set('sort', sort)
    const s = qs.toString()
    return `${pref}/${s ? '?' + s : ''}`
  }
  const powerSeg = (id) => `<div class="fx-seg" id="${id}" role="navigation" aria-label="Power category">` +
    [['electric', 'Electric'], ['gas', 'Nitro / Gas']].filter(([p]) => p === onPower || hasPower(p))
      .map(([p, label]) => `<a class="fx-seg-b ${onPower === p ? 'is-on' : ''}" href="${powerHref(p)}">${label} <span>${counts[p]}</span></a>`).join('') + '</div>'

  const roleChips = rolesPresent.map((t) => chip('role', t, t, roleCount(t), selRoles.includes(t), `fx-cb fx-r-${ri(t)}`)).join('')
  const sizeChips = sizesPresent.map(([k, label]) => chip('size', k, label, sizeCount(k), selSizes.includes(k), 'fx-cb fx-size')).join('')
  const condChips = `${chip('cond', 'all', 'All', items.filter(mRoles).filter(mSizes).length, cond === 'all')}${chip('cond', 'new', 'New', condCount('new'), cond === 'new')}${chip('cond', 'pre-owned', 'Pre-owned', condCount('pre-owned'), cond === 'pre-owned')}`

  const sortSel = `<select id="fx-sort" class="fx-sortsel" aria-label="Sort">${[['popular', 'Most popular'], ['price-desc', 'Price: high to low'], ['price-asc', 'Price: low to high'], ['span-desc', 'Wingspan: large to small'], ['span-asc', 'Wingspan: small to large'], ['name', 'Name: A → Z']].map(([v, t]) => `<option value="${v}"${sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`

  const condLabel = (c) => (c === 'new' ? 'New' : 'Pre-owned')
  const nActive = selRoles.length + selSizes.length + (cond !== 'all' ? 1 : 0)
  const activeTags = [...selRoles.map((t) => ['role', t, t]), ...selSizes.map((k) => ['size', k, SIZE_BUCKETS.find((s) => s[0] === k)[1]]), ...(cond !== 'all' ? [['cond', cond, condLabel(cond)]] : [])]
    .map(([f, v, label]) => `<span class="fx-atag" data-f="${f}" data-v="${esc(v)}">${esc(label)}<button aria-label="Remove">×</button></span>`).join('')

  // Keep filter metadata compact; nonmatching cards are created only when a
  // visitor selects them. Search engines receive the selected results as HTML.
  const fxData = items.map((it) => ({ i: it.m.id, t: it.tags, s: it.size, cn: it.cn, cp: it.cp, sp: it.span, p: it.price, o: it.pop,
    n: it.m.name, b: it.m.brand, u: it.m.slug, h: !!(it.m.hero_any ?? it.m.hero_image), ns: it.m.sellers, sl: specLine(it.m) }))

  // Our own ₹ figures (SEO rec 5), from the listings a product page would
  // quote: a landing's in-stock models, or on the hub every in-stock model of
  // both powers (opts.all), so its nitro rows and totals are real.
  const hub = !landing && !q && power === 'electric' && Array.isArray(opts.all)
  const lsum = Lmeta ? priceSummary(ordered.filter(visible).map((it) => it.m)) : null
  const hc = hub ? hubCopy(cat, opts.all) : null
  const gsum = !Lmeta && !hub ? priceSummary(rows) : null
  const when = hc ? hc.when : checkedRange((lsum || gsum).first, (lsum || gsum).last)
  const checked = when ? `prices last checked ${when}` : 'prices as last checked at Indian sellers'

  // header: landing pages get their own H1 + breadcrumbs + intro; the hub is
  // the 'RC plane prices in India' page (its grid shows the electric models).
  // ?power=gas canonicalises to /nitro/, so it is named like that page.
  const gasMeta = !Lmeta && !q && power === 'gas' ? landingMeta(cat, resolveLanding('nitro'), 'nitro') : null
  const h1 = Lmeta ? Lmeta.h1 : gasMeta ? gasMeta.h1 : 'RC plane prices in India'
  // One short line under the H1 (owner, 2026-10-04: the header was too verbose):
  // how many, at how many sellers, from what price, last checked when. The
  // per-configuration figures are in the price table below the grid, and the
  // power tabs carry the electric / nitro split.
  const line = (what, sum, w) => (sum?.sellers && sum.from ? `${what} at ${nSellers(sum.sellers)}, from ${inr(sum.from)}${w ? ` · last checked ${w}` : ''}` : null)
  const subTxt = q
    ? `${resultN} result${resultN === 1 ? '' : 's'} for “${q}” · electric & nitro, in stock`
    : Lmeta ? line(`${resultN} ${resultN === 1 ? Lmeta.noun.one : Lmeta.noun.many}`, lsum, when) ?? `${resultN} ${resultN === 1 ? Lmeta.noun.one : Lmeta.noun.many} in stock · ${checked}`
    : hub ? line(`${hc.models} RC planes`, hc.whole, when) ?? `${items.length} electric RC planes in stock · ${checked}`
    : `${items.length} ${power === 'gas' ? 'nitro and gas' : 'electric'} RC planes in stock · ${checked}`
  const crumbHtml = Lmeta ? `<nav class="fx-crumbs" aria-label="Breadcrumb">${Lmeta.crumbs.map((c, i) => i < Lmeta.crumbs.length - 1 ? `<a href="${esc(c.url)}">${esc(c.name)}</a>` : `<span aria-current="page">${esc(c.name)}</span>`).join(' <i>›</i> ')}</nav>` : ''
  const glanceHtml = Lmeta ? landingGlance(lsum) : hub ? hubGlance(cat, opts.all, valid) : ''
  // Editorial: the landing's own row; the hub shows the editorial of the
  // /electric/ page it replaced (opts.content).
  const content = landing ? landing.content : hub ? opts.content : ''
  const moreHtml = landing ? landingMore(cat, landing, valid) : hub ? `<section class="fx-more"><p>${browseLine(pref)}</p></section>` : ''
  // Structured data on EVERY grid state, not just landings: BreadcrumbList
  // (default Home › category when no landing) + an ItemList of the first
  // visible results (capped — the full list would bloat the page).
  const crumbLd = Lmeta
    ? { '@type': 'BreadcrumbList', itemListElement: Lmeta.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(i < Lmeta.crumbs.length - 1 ? { item: SITE + c.url } : {}) })) }
    : { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'narenana', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: `${cat.name} in India` }] }
  const listLd = {
    '@type': 'ItemList', numberOfItems: resultN,
    itemListElement: ordered.filter(visible).slice(0, 24).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: displayName(it.m), url: `${SITE}${pref}/${it.m.slug}/` })),
  }
  const gridLd = { '@context': 'https://schema.org', '@graph': [crumbLd, listLd] }
  // Crawlable internal links — ONLY to indexable landings, the same valid set
  // as the sitemap (a thin landing such as 2 airliners serves noindex and is
  // not linked). Unit renders without the set fall back to what this page has.
  // No Electric link: the hub is the electric grid (/electric/ 301s to it).
  const linkable = (s) => (valid ? valid.has(s) : s === 'nitro' ? counts.gas > 0 : rolesPresent.includes(ROLE_SLUG[s]))
  const browseHtml = `<nav class="fx-browse" aria-label="Browse by type"><span>Browse by type</span>${LANDING_ROLE_SLUGS.filter(linkable).map((s) => `<a href="${pref}/${s}/">${esc(ROLE_H1[ROLE_SLUG[s]])}</a>`).join('')}${linkable('nitro') ? `<a href="${pref}/nitro/">Nitro / gas</a>` : ''}</nav>`

  const body = `
  <div class="shop-head"><div class="shop-head-in">
    ${crumbHtml || '<p class="shop-kicker">narenana catalog</p>'}
    <h1 class="shop-h1">${esc(h1)}</h1>
    <p class="shop-sub" id="fx-sub">${esc(subTxt)}</p>
    <div class="fx-bar">${q ? `<a class="fx-qclear" href="${pref}/">← all models</a>` : powerSeg('fx-powmain')}<form class="fx-qform" role="search" action="${pref}/" method="get"><input class="fx-q" type="search" name="q" value="${esc(q)}" placeholder="Search models — name, brand or type…" aria-label="Search models"/><button class="fx-qbtn" type="submit" aria-label="Search">Search</button></form><button class="fx-fbtn" id="fx-open" aria-haspopup="dialog" aria-expanded="false">Filter &amp; Sort<span class="fx-badge" id="fx-badge"${nActive ? '' : ' hidden'}>${nActive}</span></button></div>
  </div></div>
  <main class="shop">
    <div class="fx-summary">
      <span class="fx-rescount"><b id="fx-nres">${resultN}</b> models</span>
      <div class="fx-active" id="fx-active">${activeTags}</div>
      <button class="fx-clear" id="fx-clear"${nActive ? '' : ' hidden'}>Clear all</button>
    </div>
    <ul class="prods" id="fx-grid">${ordered.filter(visible).map((it,i) => cardNext(it, pref, false,i<2)).join('')}</ul>
    <p class="empty" id="fx-empty"${resultN ? ' hidden' : ''}>No models match — try removing a filter.</p>
    ${glanceHtml /* below the grid: shoppers came for the planes (owner, 2026-10-04) */}
    ${content ? `<section class="fx-content">${content}</section>` : ''}
    ${moreHtml}
    ${browseHtml}

    <div class="fx-backdrop" id="fx-backdrop" hidden>
      <div class="fx-modal" role="dialog" aria-modal="true" aria-labelledby="fx-mtitle">
        <header class="fx-modal-head"><h2 id="fx-mtitle">Filter &amp; Sort</h2><button class="fx-mx" id="fx-mx" aria-label="Close">×</button></header>
        <div class="fx-modal-body">
          <div class="fx-frow"><span class="fx-fgl">Category</span>${powerSeg('fx-powmodal')}</div>
          <div class="fx-frow"><span class="fx-fgl">Type <em id="fx-rolehint"></em></span><div class="fx-chips" id="fx-roles">${roleChips}</div></div>
          <div class="fx-frow"><span class="fx-fgl">Size</span><div class="fx-chips" id="fx-sizes">${sizeChips}</div></div>
          <div class="fx-frow" id="fx-condwrap"${hasCond ? '' : ' hidden'}><span class="fx-fgl">Condition</span><div class="fx-chips" id="fx-conds">${condChips}</div></div>
          <div class="fx-frow"><span class="fx-fgl">Sort</span>${sortSel}</div>
        </div>
        <footer class="fx-modal-foot"><button class="fx-mclear" id="fx-mclear">Clear all</button><button class="fx-mshow" id="fx-mshow">Show <b id="fx-mshown">${resultN}</b> models</button></footer>
      </div>
    </div>
  </main>
  <style>${FX_CSS}</style>
  <script>var FX_DATA=${jsonSafe(fxData)},FX_POWER=${jsonSafe(power)},FX_SORT=${jsonSafe(sort)},FX_INIT=${jsonSafe({ roles: selRoles, sizes: selSizes, cond })},FX_PREF=${jsonSafe(pref)},FX_NOURL=${landing ? 'true' : 'false'},FX_Q=${jsonSafe(q)};</script>
  <script>${FX_JS}</script>`

  // Canonical discipline (mirrors the proven classic-grid rules): ?power=gas
  // duplicates the /nitro/ landing → canonical THERE, not to the electric grid
  // whose content is disjoint (the case where Google ignores the canonical).
  // Any other non-default filter/sort state is noindex — crawlable, not indexed.
  const filtered = !landing && (!!q || selRoles.length > 0 || selSizes.length > 0 || cond !== 'all' || sort !== DEFAULT_SORT)
  // A landing below the stock threshold still serves (visitors, old links) but
  // is noindex,follow: it is not in the sitemap or the nav either.
  const thin = !!(landing && valid && !valid.has(landing.slug))
  return page({
    title: Lmeta ? Lmeta.title : hc ? hc.title : gasMeta ? gasMeta.title : 'RC plane prices in India | narenana',
    desc: Lmeta ? landingDesc(Lmeta.noun, lsum) : hc ? hc.desc : gasMeta ? landingDesc(gasMeta.noun, gsum) : 'RC planes in stock at Indian sellers, with prices and stock as last checked and a link straight to each seller.',
    path: Lmeta ? Lmeta.path : power === 'gas' ? `${pref}/nitro/` : `${pref}/`,
    body,
    jsonld: gridLd,
    noindex: filtered || thin || undefined,
  })
}

// ---- namespaced styles (reuse catalog.css tokens; --line→--faint, --good→--green) ----
const FX_CSS = `
.fx-crumbs{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);margin:0 0 10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.fx-crumbs a{color:var(--muted);text-decoration:none}
.fx-crumbs a:hover{color:var(--ink);text-decoration:underline}
.fx-crumbs i{font-style:normal;opacity:.5}
.fx-crumbs [aria-current]{color:var(--ink);font-weight:700}
.fx-glance{margin:40px 0 28px;max-width:760px}
@media (max-width:600px){.fx-gt.is-hub th:nth-child(n+3),.fx-gt.is-hub td:nth-child(n+3){display:none}}
.fx-glance h2{font-family:'Barlow Condensed',system-ui,sans-serif;font-size:1.25rem;font-weight:800;margin:0 0 8px;color:var(--ink)}
.fx-gscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.fx-gt{border-collapse:collapse;width:100%;font-size:.88rem}
.fx-gt th,.fx-gt td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--faint);white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--ink)}
.fx-gt th[scope="row"],.fx-gt thead th:first-child{text-align:left;white-space:normal;font-weight:600}
.fx-gt thead th{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;border-bottom-width:1.5px}
.fx-gt td.is-none{color:var(--muted)}
.fx-gn{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:var(--muted);margin-top:1px}
.fx-gt tr.is-total th,.fx-gt tr.is-total td{font-weight:700}
.fx-gt a{color:#0669a6;font-weight:700;text-decoration:none}
.fx-gt a:hover{text-decoration:underline}
.fx-gnote{color:var(--muted);font-size:.8rem;line-height:1.5;margin:8px 0 0;max-width:72ch}
.fx-more{margin:28px 0 0;max-width:72ch}
.fx-more p{color:var(--muted);line-height:1.65;margin:0 0 .8em}
.fx-more a{color:var(--orange-deep);text-decoration:none;font-weight:700}
.fx-more a:hover{text-decoration:underline}
@media(max-width:640px){.fx-gt th,.fx-gt td{padding:6px 5px}.fx-gt{font-size:.82rem}}
.fx-content{margin:40px 0 0;max-width:72ch}
.fx-content h2{font-family:'Barlow Condensed',system-ui,sans-serif;font-size:1.3rem;font-weight:800;margin:1.4em 0 .4em;color:var(--ink)}
.fx-content h3{font-weight:800;font-size:1.05rem;margin:1.2em 0 .3em;color:var(--ink)}
.fx-content p,.fx-content li{color:var(--muted);line-height:1.65;margin:0 0 .9em}
.fx-content a{color:var(--orange-deep);text-decoration:none;font-weight:700}
.fx-content a:hover{text-decoration:underline}
.fx-browse{margin:44px 0 0;padding-top:20px;border-top:1.5px solid var(--faint);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:baseline;font-size:.9rem}
.fx-browse>span{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.fx-browse a{color:#0669a6;text-decoration:none;font-weight:700}
.fx-browse a:hover{text-decoration:underline}
.fx-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px}
.fx-qform{display:flex;flex:1;min-width:220px;max-width:430px}
.fx-q{flex:1;min-width:0;border:1.5px solid var(--faint);border-right:0;border-radius:10px 0 0 10px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:14px;padding:9px 13px;outline-offset:-1.5px}
.fx-q:focus{border-color:var(--ink)}
.fx-qbtn{border:1.5px solid var(--ink);border-radius:0 10px 10px 0;background:var(--ink);color:var(--paper,#fcf9f1);font:inherit;font-size:13px;font-weight:600;padding:9px 16px;cursor:pointer}
.fx-qbtn:hover{opacity:.88}
.fx-qclear{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);text-decoration:none;white-space:nowrap}
.fx-qclear:hover{color:var(--ink);text-decoration:underline}
.fx-seg{display:inline-flex;border:2px solid var(--ink);border-radius:999px;overflow:hidden;background:var(--card)}
.fx-seg-b{text-decoration:none;border-right:2px solid var(--ink);color:var(--muted);font-family:'DM Sans',system-ui,sans-serif;font-weight:700;font-size:.9rem;padding:9px 18px;white-space:nowrap}
.fx-seg-b:last-child{border-right:none}
.fx-seg-b:hover{color:var(--ink)}
.fx-seg-b.is-on{background:var(--orange);color:var(--ink-2)}
.fx-seg-b span{font-family:'JetBrains Mono',monospace;font-size:.7rem;opacity:1;margin-left:4px}
.fx-fbtn{margin-left:auto;display:inline-flex;align-items:center;gap:7px;border:2px solid var(--ink);background:var(--card);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;font-weight:800;font-size:.9rem;padding:8px 16px;border-radius:999px;cursor:pointer;white-space:nowrap}
.fx-fbtn:hover,.fx-fbtn[aria-expanded="true"]{background:var(--ink);color:var(--card)}
.fx-badge{background:var(--orange);color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace}
.fx-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.fx-rescount{color:var(--muted);font-size:.95rem}
.fx-rescount b{color:var(--ink);font-size:1.1rem;font-family:'Barlow Condensed',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.fx-active{display:flex;gap:6px;flex-wrap:wrap}
.fx-atag{display:inline-flex;align-items:center;gap:5px;background:color-mix(in srgb,var(--orange) 15%,transparent);color:var(--orange-deep);border-radius:999px;padding:3px 6px 3px 11px;font-size:12px;font-weight:700}
.fx-atag button{border:none;background:none;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
.fx-clear{border:none;background:none;color:var(--muted);font-family:inherit;font-weight:700;font-size:12.5px;text-decoration:underline;cursor:pointer}
.fx-chip{appearance:none;display:inline-flex;align-items:center;border:1.5px solid var(--faint);background:transparent;color:var(--muted);border-radius:999px;padding:6px 12px;font-family:'DM Sans',system-ui,sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.fx-chip .fx-n{opacity:1;margin-left:5px;font-weight:700}
.fx-chip:hover:not(:disabled){border-color:var(--ink);color:var(--ink)}
.fx-chip.is-on{color:#fff;border-color:transparent;background:var(--ink)}
.fx-chip:disabled{opacity:.32;cursor:not-allowed;text-decoration:line-through}
.fx-cb{padding-left:9px}
.fx-cbx{display:inline-block;width:13px;height:13px;border:1.6px solid currentColor;border-radius:3px;margin-right:7px;position:relative;opacity:.5;flex:none}
.fx-chip.is-on .fx-cbx{opacity:1;background:#fff;border-color:#fff}
.fx-chip.is-on .fx-cbx::after{content:"";position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid var(--ink);border-width:0 2px 2px 0;transform:rotate(45deg)}
.fx-r-0.is-on{background:#3a7d44}.fx-r-1.is-on{background:#7a8b3a}.fx-r-2.is-on{background:#c8641a}.fx-r-3.is-on{background:#8a5a2b}.fx-r-4.is-on{background:#3b6ea5}.fx-r-5.is-on{background:#4aa3a0}.fx-r-6.is-on{background:#6a5acd}.fx-r-7.is-on{background:#b0873a}.fx-r-8.is-on{background:#5b6b7a}
.fx-backdrop{position:fixed;inset:0;background:rgba(15,44,57,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px}
.fx-backdrop[hidden]{display:none}
.fx-modal{background:var(--card);border:2px solid var(--ink);border-radius:16px;width:100%;max-width:540px;max-height:85vh;min-height:min(664px,85vh);display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden}
.fx-modal-head{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:2px solid var(--ink)}
.fx-modal-head h2{margin:0;font-family:'Barlow Condensed',system-ui,sans-serif;font-size:1.15rem;font-weight:800}
.fx-mx{border:none;background:none;color:var(--muted);font-size:26px;line-height:1;cursor:pointer;padding:0 4px}
.fx-mx:hover{color:var(--ink)}
.fx-modal-body{overflow-y:auto;flex:1 1 auto;min-height:0;padding:18px 20px;display:flex;flex-direction:column;gap:18px}
.fx-frow{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.fx-fgl{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.fx-fgl em{font-style:normal;opacity:.7;text-transform:none;letter-spacing:0;font-weight:400}
.fx-chips{display:flex;gap:6px;flex-wrap:wrap}
.fx-sortsel{appearance:none;-webkit-appearance:none;font-family:'DM Sans',system-ui,sans-serif;font-size:.85rem;font-weight:700;color:var(--ink);background-color:var(--card);border:2px solid var(--ink);border-radius:999px;padding:9px 34px 9px 16px;cursor:pointer;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%230F2C39' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 12px center}
.fx-modal-foot{display:flex;align-items:center;gap:12px;padding:14px 20px;border-top:1.5px solid var(--faint)}
.fx-mclear{border:none;background:none;color:var(--muted);font-family:inherit;font-weight:700;font-size:13px;text-decoration:underline;cursor:pointer}
.fx-mshow{margin-left:auto;border:2px solid var(--orange-deep);background:var(--orange);color:#fff;border-radius:999px;padding:10px 24px;font-family:inherit;font-weight:800;cursor:pointer}
.fx-mshow:hover{background:var(--orange-deep)}
@media(max-width:640px){.fx-backdrop{align-items:flex-end;padding:0}.fx-modal{max-width:none;border-radius:16px 16px 0 0;max-height:90vh}}
`

// ---- client engine (reads the FX_* globals; no template-literal interpolation) ----
const FX_JS = `(function(){
  var state={roles:new Set(FX_INIT.roles),sizes:new Set(FX_INIT.sizes),cond:FX_INIT.cond||'all',sort:FX_SORT};
  var SIZELABEL={small:'Small · under 1 m',medium:'Medium · 1–1.5 m',large:'Large · over 1.5 m'};
  var CONDLABEL={'new':'New','pre-owned':'Pre-owned'};
  var grid=document.getElementById('fx-grid');
  var cardEls={}; [].slice.call(grid.querySelectorAll('.prod')).forEach(function(c){cardEls[c.getAttribute('data-id')]=c;});
  function textEl(tag,cls,text){var el=document.createElement(tag);el.className=cls;el.textContent=text==null?'':text;return el;}
  function ensureCard(d){
    if(cardEls[d.i])return cardEls[d.i];
    var li=textEl('li','prod','');li.setAttribute('data-id',d.i);
    var link=textEl('a','prod-link','');link.href=FX_PREF+'/'+encodeURIComponent(d.u)+'/';
    var picture=textEl('div','prod-img','');
    if(d.h){var img=document.createElement('img');img.src='/img/master/'+d.i;img.alt=(d.b&&!/^unbranded$/i.test(d.b)?d.b+' ':'')+d.n;img.width=800;img.height=600;img.loading='lazy';picture.appendChild(img);}else{picture.appendChild(textEl('div','prod-noimg','No image'));}
    if(d.cp&&!d.cn){var badge=textEl('span','prod-tag','PRE-OWNED');picture.appendChild(badge);}
    var body=textEl('div','prod-body','');body.appendChild(textEl('p','prod-brand',d.b));body.appendChild(textEl('h3','prod-name',d.n));body.appendChild(textEl('p','prod-spec',d.sl));
    var price=textEl('div','prod-price','');price.appendChild(textEl('div',d.p?'price':'price is-muted',d.p?'from ₹'+Number(d.p).toLocaleString('en-IN'):'Price under review'));
    if(d.ns>1){var sellers=textEl('span','mrp',d.ns+' sellers');sellers.style.textDecoration='none';price.appendChild(sellers);}
    body.appendChild(price);link.appendChild(picture);link.appendChild(body);link.appendChild(textEl('span','prod-cta',d.ns>1?'Compare '+d.ns+' sellers':'View & buy'));li.appendChild(link);cardEls[d.i]=li;return li;
  }
  function mRoles(d){if(!state.roles.size)return true;for(var i=0;i<d.t.length;i++)if(state.roles.has(d.t[i]))return true;return false;}
  function mSizes(d){return state.sizes.size===0||state.sizes.has(d.s);}
  function mCond(d){return state.cond==='all'||(state.cond==='new'?d.cn:d.cp);}
  function results(){return FX_DATA.filter(function(d){return mRoles(d)&&mSizes(d)&&mCond(d);});}
  function cmp(a,b){
    if(state.sort==='name'){return a.n.localeCompare(b.n);}
    if(state.sort==='popular'){var oa=a.o==null?-1:a.o,ob=b.o==null?-1:b.o;return (ob-oa)||((b.p==null?-1:b.p)-(a.p==null?-1:a.p));}
    if(state.sort==='span-desc'){return (b.sp||0)-(a.sp||0);}
    if(state.sort==='span-asc'){return (a.sp||1e9)-(b.sp||1e9);}
    var pa=a.p==null?(state.sort==='price-asc'?1e12:-1):a.p, pb=b.p==null?(state.sort==='price-asc'?1e12:-1):b.p;
    return state.sort==='price-asc'?pa-pb:pb-pa;
  }
  function setChip(btn,on){btn.classList.toggle('is-on',on);btn.setAttribute('aria-checked',on?'true':'false');}
  function render(){
    var res=results();
    var vis={}; res.forEach(function(d){vis[d.i]=1;});
    [].slice.call(document.querySelectorAll('#fx-roles .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=FX_DATA.filter(function(d){return d.t.indexOf(v)>-1&&mSizes(d)&&mCond(d);}).length;
      btn.querySelector('.fx-n').textContent=n; btn.disabled=n===0&&!state.roles.has(v); setChip(btn,state.roles.has(v));
    });
    [].slice.call(document.querySelectorAll('#fx-sizes .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=FX_DATA.filter(function(d){return d.s===v&&mRoles(d)&&mCond(d);}).length;
      btn.querySelector('.fx-n').textContent=n; btn.disabled=n===0&&!state.sizes.has(v); setChip(btn,state.sizes.has(v));
    });
    [].slice.call(document.querySelectorAll('#fx-conds .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=v==='all'?FX_DATA.filter(function(d){return mRoles(d)&&mSizes(d);}).length:FX_DATA.filter(function(d){return (v==='new'?d.cn:d.cp)&&mRoles(d)&&mSizes(d);}).length;
      btn.querySelector('.fx-n').textContent=n; setChip(btn,state.cond===v);
    });
    var hint=document.getElementById('fx-rolehint'); if(hint)hint.textContent=state.roles.size?'· '+state.roles.size+' selected':'· tick any that apply';
    res.sort(cmp);
    for(var id in cardEls){cardEls[id].style.display=vis[id]?'':'none';}
    res.forEach(function(d){var card=ensureCard(d);card.style.display='';grid.appendChild(card);});
    document.getElementById('fx-nres').textContent=res.length;
    document.getElementById('fx-mshown').textContent=res.length;
    document.getElementById('fx-empty').hidden=res.length>0;
    var act=document.getElementById('fx-active'); act.innerHTML='';
    function atag(f,v,label){var s=document.createElement('span');s.className='fx-atag';s.textContent=label;var x=document.createElement('button');x.setAttribute('aria-label','Remove');x.textContent='×';x.onclick=function(){toggle(f,v,true);};s.appendChild(x);act.appendChild(s);}
    state.roles.forEach(function(v){atag('role',v,v);});
    state.sizes.forEach(function(v){atag('size',v,SIZELABEL[v]||v);});
    if(state.cond!=='all')atag('cond',state.cond,CONDLABEL[state.cond]||state.cond);
    var nA=state.roles.size+state.sizes.size+(state.cond!=='all'?1:0);
    document.getElementById('fx-clear').hidden=!nA;
    var badge=document.getElementById('fx-badge'); badge.hidden=!nA; badge.textContent=nA;
    if(!FX_NOURL)try{var p=new URLSearchParams();if(FX_Q)p.set('q',FX_Q);else if(FX_POWER!=='electric')p.set('power',FX_POWER);
      if(state.roles.size)p.set('role',Array.from(state.roles).join(','));
      if(state.sizes.size)p.set('size',Array.from(state.sizes).join(','));
      if(state.cond!=='all')p.set('cond',state.cond);
      if(state.sort!=='popular')p.set('sort',state.sort);
      history.replaceState(null,'',FX_PREF+'/?'+p.toString());}catch(e){}
  }
  function toggle(f,v,off){
    if(f==='role'){state.roles.has(v)?state.roles.delete(v):(off?state.roles.delete(v):state.roles.add(v));}
    else if(f==='size'){state.sizes.has(v)?state.sizes.delete(v):(off?state.sizes.delete(v):state.sizes.add(v));}
    else if(f==='cond'){state.cond=(off||state.cond===v)?'all':v;}
    render();
  }
  document.getElementById('fx-roles').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b&&!b.disabled)toggle('role',b.getAttribute('data-v'));});
  document.getElementById('fx-sizes').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b&&!b.disabled)toggle('size',b.getAttribute('data-v'));});
  document.getElementById('fx-conds').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b)toggle('cond',b.getAttribute('data-v'));});
  document.getElementById('fx-sort').addEventListener('change',function(e){state.sort=e.target.value;render();});
  var bd=document.getElementById('fx-backdrop'),ob=document.getElementById('fx-open');
  function setModal(o){bd.hidden=!o;ob.setAttribute('aria-expanded',o?'true':'false');document.body.style.overflow=o?'hidden':'';if(o){var x=document.getElementById('fx-mx');if(x)x.focus();}else{ob.focus();}}
  ob.onclick=function(){setModal(true);};
  document.getElementById('fx-mx').onclick=function(){setModal(false);};
  document.getElementById('fx-mshow').onclick=function(){setModal(false);};
  bd.onclick=function(e){if(e.target===bd)setModal(false);};
  document.addEventListener('keydown',function(e){if(bd.hidden)return;if(e.key==='Escape'){e.preventDefault();setModal(false);}if(e.key==='Tab'){var items=Array.from(bd.querySelectorAll('button,input,select,a[href]')).filter(function(el){return !el.disabled&&el.getClientRects().length;});var first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  var ca=function(){state.roles.clear();state.sizes.clear();state.cond='all';render();};
  document.getElementById('fx-clear').onclick=ca;
  document.getElementById('fx-mclear').onclick=ca;
  render();
})();`
