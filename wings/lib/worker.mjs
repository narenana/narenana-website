// narenana Wings — the whole lifecycle, in the Worker.
//
//   /wings/                render the live catalogue from KV
//   /wings/<slug>/         render a kit page
//   /wings/wings.css       stylesheet (bundled, cached)
//   /wings/img/<slug>      proxy + cache the seller's product image
//   /wings/admin           approval panel (token-gated data APIs)
//   /wings/api/*           candidates / decide / discover / refresh / img
//   scheduled()            cron: poll availability (12h) + discover (24h)
//
// KV (WINGS_KV) is the live source of truth. The committed JSON is only a SEED
// used on first read — every mutation (approve, refresh, discover) writes KV,
// so an approval is live to real users immediately, with no build or deploy.

import { CSS } from './styles.mjs'
import { renderIndex, renderKit } from './render.mjs'
import { ADMIN_HTML } from './admin-ui.mjs'
import { discover, refresh, candidateToKit } from './pipeline.mjs'
import { getHtml, ogImageFrom } from './catalog.mjs'
import kitsSeed from '../data/kits.json'
import sourcesSeed from '../data/sources.json'
import recipes from '../data/recipes.json'

const SOURCES = sourcesSeed.sources
const sourceById = Object.fromEntries(SOURCES.map((s) => [s.id, s]))
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

// --- KV state (seed on first read) ----------------------------------------
async function getCatalog(env) {
  const raw = env.WINGS_KV && (await env.WINGS_KV.get('wings:catalog'))
  return raw ? JSON.parse(raw) : kitsSeed.kits
}
const putCatalog = (env, kits) => env.WINGS_KV.put('wings:catalog', JSON.stringify(kits))
async function getCandidates(env) {
  const raw = env.WINGS_KV && (await env.WINGS_KV.get('wings:candidates'))
  return raw ? JSON.parse(raw) : []
}
const putCandidates = (env, c) => env.WINGS_KV.put('wings:candidates', JSON.stringify(c))

const dataFor = (kits) => ({ kits: kits.filter((k) => k.airframe === 'flying-wing'), sourceById, recipes })

// --- candidate triage (guess + score) -------------------------------------
const WING = /\bwing\b|delta|dart|interceptor|chiquita|micro ?bee|spec racer|speedster|batman|zohd|ar ?wing|mojito|talon|spear|efxtra|swift|glider|plank/i
const NOISE = /\b(fc|flight controller|motor|esc|propell|prop\b|battery|charger|servo|carbon|plywood|balsa|foam|wire|connector|magnet|film|tube|rod|glue|goggle|camera|vtx|antenna|receiver|transmitter|screw|skid|spare|package|accessor)/i
const score = (t = '') => (WING.test(t) ? 2 : 0) - (NOISE.test(t) ? 3 : 0)
const slugify = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const KNOWN = ['Vortex-RC', 'ATOMRC', 'HEEWING', 'HEE WING', 'Skywalker', 'ZOHD', 'TBS', 'LDARC', 'MAPBIRD', 'X-UAV', 'XUAV', 'SonicModell', 'Durafly', 'XFly', 'Top RC Hobby', 'FMS', 'H-King', 'Seagull']
const guessBrand = (t = '') => KNOWN.find((k) => new RegExp(`\\b${k.replace(/[-\s]/g, '.?')}\\b`, 'i').test(t)) ?? (t.trim().split(/[\s–—-]+/)[0] || '')
const guessSpan = (t = '') => {
  const m = t.match(/(\d{3,4})\s*mm/i) || t.match(/\b(\d{3,4})\b(?!\s*kv)/i)
  const n = m ? +m[1] : 0
  return n >= 400 && n <= 3000 ? n : ''
}
const cleanName = (t = '') => t.replace(/\s*[|–—-]\s*(UAV Marketplace|Robosync|Vortex-RC|Anubis.*|In India).*$/i, '').trim().slice(0, 60)

// --- auth -----------------------------------------------------------------
function authState(request, env) {
  if (!env.WINGS_ADMIN_TOKEN) return 'unconfigured'
  const tok = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return tok && tok === env.WINGS_ADMIN_TOKEN ? 'ok' : 'denied'
}

// --- image proxy ----------------------------------------------------------
// Some shops (anubisrc) hotlink-protect images: they 403 unless the Referer is
// their own domain. The Worker fetches server-side, so it can send a matching
// Referer + browser UA — then re-serves from our origin, where it just works.
const imgHeaders = (pageUrl) => {
  const h = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' }
  try {
    h.referer = new URL(pageUrl).origin + '/'
  } catch {}
  return h
}

async function proxyImage(env, kit) {
  const cacheKey = `wings:img:${kit.slug}`
  let src = kit.imgUrl || (env.WINGS_KV && (await env.WINGS_KV.get(cacheKey)))
  if (!src && kit.url) {
    const html = await getHtml(kit.url)
    src = html && ogImageFrom(html, kit.url)
    if (src && env.WINGS_KV) await env.WINGS_KV.put(cacheKey, src, { expirationTtl: 604800 })
  }
  if (!src) return new Response('no image', { status: 404 })
  const img = await fetch(src, { headers: imgHeaders(kit.url || src) })
  if (!img.ok) return new Response('image fetch failed', { status: 502 })
  return new Response(img.body, {
    status: 200,
    headers: { 'content-type': img.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' },
  })
}

// --- request handler ------------------------------------------------------
export async function handleWings(request, url, env, ctx) {
  const path = url.pathname.replace(/\/+$/, '') || '/wings'

  if (path === '/wings/wings.css')
    return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' } })

  if (path === '/wings/admin')
    return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })

  // ---- image proxy ----
  if (path.startsWith('/wings/img/')) {
    const slug = path.slice('/wings/img/'.length)
    const kit = (await getCatalog(env)).find((k) => k.slug === slug)
    if (!kit) return new Response('not found', { status: 404 })
    return proxyImage(env, kit)
  }

  // ---- candidate-image proxy ----
  // NOT behind the token: <img> tags can't send an Authorization header, so a
  // gated proxy 401s every thumbnail (which is exactly what happened). Safe to
  // open because it refuses any host that isn't a registered seller — it can't
  // be used as a general-purpose proxy.
  if (path === '/wings/api/img') {
    const sellerHost = (u) => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, '')
        return SOURCES.some((s) => s.home && new URL(s.home).hostname.replace(/^www\./, '') === h) ||
          /(^|\.)((cdn\.)?shopify\.com|zohocommercecdn\.com|zohostatic\.com)$/.test(h)
      } catch {
        return false
      }
    }
    const direct = url.searchParams.get('img')
    const u = url.searchParams.get('u')
    if ((direct && !sellerHost(direct)) || (u && !sellerHost(u))) return new Response('host not allowed', { status: 403 })
    let src = direct
    if (!src && u) {
      const html = await getHtml(u)
      src = html && ogImageFrom(html, u)
    }
    if (!src || !sellerHost(src)) return new Response('no image', { status: 404 })
    const img = await fetch(src, { headers: imgHeaders(u || src) })
    return new Response(img.body, { status: img.status, headers: { 'content-type': img.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'public, max-age=86400' } })
  }

  // ---- admin API (token-gated) ----
  if (path.startsWith('/wings/api/')) {
    const auth = authState(request, env)
    if (auth === 'unconfigured') return json({ error: 'admin not configured' }, 503)
    if (auth === 'denied') return json({ error: 'unauthorized' }, 401)
    const ep = path.slice('/wings/api/'.length)

    if (ep === 'candidates') {
      const [cands, kits] = [await getCandidates(env), await getCatalog(env)]
      const scored = cands
        .filter((c) => c.status === 'new')
        .map((c) => ({ ...c, score: score(c.title), guess: { brand: guessBrand(c.title), name: cleanName(c.title), spanMM: guessSpan(c.title), slug: slugify(c.title) } }))

      // Interleave by source (round-robin) so page 1 shows every seller instead
      // of one flooding it — the reason anubis "disappeared" behind aeromodellingtutor.
      const groups = {}
      for (const c of scored) (groups[c.source] ??= []).push(c)
      for (const g of Object.values(groups)) g.sort((a, b) => b.score - a.score)
      const order = Object.keys(groups).sort()
      const pending = []
      for (let i = 0; pending.length < scored.length; i++) for (const s of order) if (groups[s][i]) pending.push(groups[s][i])

      const perSource = order.map((id) => ({ id, total: groups[id].length, likely: groups[id].filter((c) => c.score > 0).length }))
      return json({ pending, perSource, counts: { pending: scored.length, likely: scored.filter((c) => c.score > 0).length, live: kits.length, rejected: cands.filter((c) => c.status === 'rejected').length } })
    }

    if (ep === 'decide' && request.method === 'POST') {
      const b = await request.json()
      const cands = await getCandidates(env)
      const c = cands.find((x) => x.url === b.url)
      if (!c) return json({ error: 'unknown candidate' }, 404)
      if (b.decision === 'reject') {
        c.status = 'rejected'
        await putCandidates(env, cands)
        return json({ ok: true })
      }
      const kits = await getCatalog(env)
      if (kits.some((k) => k.slug === b.slug)) return json({ error: `slug "${b.slug}" already exists` }, 409)
      kits.push(candidateToKit(c, b, sourceById[c.source]))
      await putCatalog(env, kits) // <-- live to real users right here
      c.status = 'accepted'
      await putCandidates(env, cands)
      return json({ ok: true, live: kits.length })
    }

    if (ep === 'discover' && request.method === 'POST') {
      const { candidates, found, stats, enriched } = await discover(SOURCES, await getCatalog(env), await getCandidates(env))
      await putCandidates(env, candidates)
      if (env.WINGS_KV) await env.WINGS_KV.put('wings:lastDiscover', new Date().toISOString())
      return json({ stats, foundCount: found.length, enriched })
    }

    if (ep === 'refresh' && request.method === 'POST') {
      const res = await refresh(await getCatalog(env), sourceById)
      await putCatalog(env, res.kits)
      if (env.WINGS_KV) await env.WINGS_KV.put('wings:lastRefresh', new Date().toISOString())
      return json({ changes: res.changes, problems: res.problems })
    }

    return json({ error: 'no route' }, 404)
  }

  // ---- public pages ----
  const kits = await getCatalog(env)
  if (path === '/wings') return html(renderIndex(dataFor(kits)))
  const slug = path.slice('/wings/'.length)
  const kit = kits.find((k) => k.slug === slug && k.airframe === 'flying-wing')
  if (kit) return html(renderKit(kit, dataFor(kits)))
  return html(renderIndex(dataFor(kits)), 404)
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' } })

// --- cron -----------------------------------------------------------------
export async function wingsScheduled(env, ctx) {
  if (!env.WINGS_KV) return
  const now = Date.now()
  const age = async (key) => {
    const t = await env.WINGS_KV.get(key)
    return t ? now - Date.parse(t) : Infinity
  }
  // Availability every ~12h; discovery every ~24h. Polling sellers hourly would
  // be rude and pointless — prices don't move that fast.
  if ((await age('wings:lastRefresh')) > 12 * 3600e3) {
    const res = await refresh(await getCatalog(env), sourceById)
    await putCatalog(env, res.kits)
    await env.WINGS_KV.put('wings:lastRefresh', new Date().toISOString())
  }
  if ((await age('wings:lastDiscover')) > 24 * 3600e3) {
    const { candidates } = await discover(SOURCES, await getCatalog(env), await getCandidates(env))
    await putCandidates(env, candidates)
    await env.WINGS_KV.put('wings:lastDiscover', new Date().toISOString())
  }
}
