// Shared utilities: time, URL canonicalization (versioned), HTTP Basic auth.

export const now = () => Date.now() // epoch ms — the ONE timestamp format

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } })

export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN')

export const slugify = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
export const normName = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// --- URL canonicalization -------------------------------------------------
// THE identity rule for secondary matching (primary is platform_pid). Any
// change to this function MUST bump NORM_VERSION and ship a merge migration —
// see docs/ARCHITECTURE-catalog.md § Identity.
export const NORM_VERSION = 1
const STRIP_PARAMS = /^(utm_|fbclid|gclid|srsltid|ref$|ref_|mc_|igsh)/i

export function canonicalUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  u.protocol = u.protocol.toLowerCase()
  u.hostname = u.hostname.toLowerCase()
  u.hash = ''
  const keep = []
  for (const [k, v] of u.searchParams) if (!STRIP_PARAMS.test(k)) keep.push([k, v])
  u.search = ''
  for (const [k, v] of keep.sort((a, b) => a[0].localeCompare(b[0]))) u.searchParams.append(k, v)
  // Shopify: /collections/<x>/products/<h> and /products/<h> are the same page.
  u.pathname = u.pathname.replace(/\/collections\/[^/]+\/products\//, '/products/').replace(/\/+$/, '')
  return u.toString()
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// --- HTTP Basic auth ------------------------------------------------------
// One admin identity ('admin' + ADMIN_PASS secret). The browser manages the
// credential (native prompt; same-origin fetches attach it automatically), so
// nothing sits in localStorage. Comparison is timing-safe via digest equality.
const enc = new TextEncoder()
async function digestEq(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const ua = new Uint8Array(da)
  const ub = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

export async function basicAuth(request, env) {
  if (!env.ADMIN_PASS) return { ok: false, reason: 'unconfigured' }
  const h = request.headers.get('authorization') || ''
  if (h.startsWith('Basic ')) {
    let dec = ''
    try {
      // atob yields Latin-1; decode the bytes as UTF-8 so non-ASCII passwords
      // match the UTF-8 secret (realm advertises charset="UTF-8").
      const bin = atob(h.slice(6))
      dec = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    } catch {}
    const idx = dec.indexOf(':')
    const user = dec.slice(0, idx)
    const pass = dec.slice(idx + 1)
    if (user === 'admin' && (await digestEq(pass, env.ADMIN_PASS))) return { ok: true, actor: 'admin' }
  }
  return { ok: false, reason: 'denied' }
}

export const challenge = (reason) =>
  reason === 'unconfigured'
    ? new Response('admin not configured: set the ADMIN_PASS secret', { status: 503 })
    : new Response('auth required', { status: 401, headers: { 'www-authenticate': 'Basic realm="narenana catalog admin", charset="UTF-8"' } })
