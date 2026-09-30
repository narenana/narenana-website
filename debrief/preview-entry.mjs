/**
 * Standalone PREVIEW worker for the Flight Debrief narration API.
 * Deployed as its own script (narenana-debrief-preview) so the main
 * narenana-website worker stays untouched until D2 is signed off —
 * then src/index.js routes /api/debrief to handleDebrief and this
 * preview retires. Same code path either way.
 */
import { handleDebrief, DebriefLimiter } from './lib/worker.mjs'

export { DebriefLimiter }
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/debrief') return handleDebrief(request, env)
    return new Response('narenana debrief preview', { status: 404 })
  },
}
