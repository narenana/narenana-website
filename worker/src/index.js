// Cloudflare Worker — path-prefix router.
//
// Routes:
//   /log-viewer, /log-viewer/*  → strip prefix → LOG_VIEWER_ORIGIN
//   everything else             → pass through  → CUSTOMER_SITE_ORIGIN
//
// Both origins are env vars set in wrangler.toml (dev) or on the dashboard
// (prod). Requests are forwarded with their original method, headers and body
// so caching, range requests, etc. all work as the upstream Pages deployment
// expects.

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/log-viewer' || url.pathname.startsWith('/log-viewer/')) {
      return forward(request, env.LOG_VIEWER_ORIGIN, '/log-viewer')
    }

    return forward(request, env.CUSTOMER_SITE_ORIGIN, '')
  },
}

/**
 * Forward `request` to `origin`, optionally stripping `prefix` from the path.
 * Preserves query string, method, headers and body. Disables Cloudflare's
 * caching of the redirect so the upstream's cache-control headers win.
 */
async function forward(request, origin, prefix) {
  if (!origin) {
    return new Response('Routing misconfigured: missing origin', { status: 502 })
  }

  const url = new URL(request.url)
  let path = url.pathname

  if (prefix) {
    path = path.slice(prefix.length) || '/'
    if (!path.startsWith('/')) path = '/' + path
  }

  const target = origin.replace(/\/$/, '') + path + url.search

  // Clone the request so we can swap the URL while keeping method/headers/body.
  const upstream = new Request(target, request)

  // Pages deployments inspect Host to dispatch to the right project. Drop our
  // domain's Host so the upstream sees its own.
  upstream.headers.delete('host')

  return fetch(upstream)
}
