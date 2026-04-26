// Cloudflare Worker — staging router for `latest.narenana.com`.
//
// Forwards every incoming request to ONE OF TWO upstream hosts based on path:
//
//   /log-viewer, /log-viewer/*  → strip prefix → viewer host
//   everything else             → pass through  → website host
//
// The production defaults are baked into the constants below. They can be
// overridden per-deployment by `wrangler secret put VIEWER_HOST` or
// `WEBSITE_HOST` (no protocol — just the hostname). Cloudflare Pages and
// Workers Builds auto-create branch-preview URLs:
//
//   feat-foo.edgetx-log-parser.pages.dev   ← viewer branch preview
//   feat-foo.narenana-website.workers.dev  ← website branch preview
//
// `wrangler secret delete <name>` resets the override and the Worker falls
// back to the constant below — i.e. production. Default behaviour with no
// overrides: latest.narenana.com === narenana.com.
//
// (Secrets are used here rather than [vars] in wrangler.toml because we want
// edits to take effect without redeploying — `secret put` propagates in
// seconds.  Cloudflare also rejects same-name secrets if a [vars] entry
// already claims the name, so the constants live in code instead.)
//
// This Worker is intentionally tiny — all `/videos.json`, `/assets/*` etc
// handling lives in the website Worker upstream. We only intercept
// `/log-viewer/*` here so the viewer can be swapped independently.

const PROD_VIEWER_HOST = 'edgetx-log-parser.pages.dev'
const PROD_WEBSITE_HOST = 'narenana-website.narenana.workers.dev'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const viewer = env.VIEWER_HOST || PROD_VIEWER_HOST
    const website = env.WEBSITE_HOST || PROD_WEBSITE_HOST

    if (url.pathname === '/log-viewer' || url.pathname.startsWith('/log-viewer/')) {
      return forward(request, viewer, '/log-viewer')
    }

    return forward(request, website, '')
  },
}

/**
 * Forward `request` to the upstream host, optionally stripping `prefix` from
 * the path. Same semantics as the production Worker's forward(): preserves
 * method/headers/body, drops Host so the upstream dispatches to its own
 * project, and rewrites Location headers in 3xx responses to keep redirects
 * inside the prefix (the Pages 308 `/index.html` → `Location: /` quirk).
 */
async function forward(request, host, prefix) {
  if (!host) {
    return new Response(`latest.narenana.com is misconfigured: missing ${prefix ? 'VIEWER_HOST' : 'WEBSITE_HOST'}`, { status: 502 })
  }

  const url = new URL(request.url)
  let path = url.pathname

  if (prefix) {
    path = path.slice(prefix.length) || '/'
    if (!path.startsWith('/')) path = '/' + path
  }

  const target = `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}${path}${url.search}`
  const upstream = new Request(target, request)
  upstream.headers.delete('host')

  const response = await fetch(upstream, { redirect: 'manual' })

  if (prefix && response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location')
    if (location && location.startsWith('/') && !location.startsWith(prefix + '/') && location !== prefix) {
      const headers = new Headers(response.headers)
      headers.set('Location', prefix + (location === '/' ? '/' : location))
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  }

  return response
}
