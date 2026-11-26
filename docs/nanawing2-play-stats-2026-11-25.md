# Nanawing 2 mode and landing metrics

Owner request, 25 November 2026. Feature branch `codex/landing-challenge-stats`
extends the actual authenticated page `/stats/nanawing?sim=nanawing2#play`, also
embedded by the existing `/stats` Nanawing tab. Production is unchanged.

New Summary cards and Play & landings tab show free-flight/challenge pilots,
launches and page sessions; pilots who fly both; A/B/C counts and percentages;
interrupted/unconfirmed attempts; touchdown accuracy/descent, bounces, crashes and
off-runway arrivals; aircraft/control breakdowns and daily grades. Date chips use
14/30/90 UTC days. Unknown history is labelled, not guessed. Failure retains the
last good render with a stale marker; an initial failure does not show zeroes.

`src/play-dashboard.js` is copied byte-for-byte from the companion fpvsim stats
worker branch. `src/nanawing-dashboard.js` retains this site's Basic-auth routing,
absolute API adapter, Portfolio link and embedded-height protocol. The existing
auth/no-store/CSP remains. The Nanawing 1 view does not show or request this panel.
Whole-page copy corrections remove unsupported identity, coverage, touch-device
and hardware explanations discovered while reviewing the new metrics.

The data API comes from the shared worker's new `/play-summary` route, with
`sim=nanawing2`. It needs fpvsim's companion schema/API release first. The game
change is Nanawing 2 PR 114; deploy it after backend and dashboard, with explicit
owner flight acceptance and release approval. Old clients keep their existing
telemetry and appear as mode unknown. This page cannot reconstruct older grades.

Local validation uses the real authenticated page, actual simulator-generated
A/B/C events, the real stats worker and in-memory SQLite. API requests are
intercepted locally. It tests range chips, Summary navigation, product switching,
stale/error handling and unchanged unauthenticated denial. Screenshots contain
fixture data, not production measurements. Run from the Nanawing 2 checkout:

    node scripts/verify-play-stats.mjs <fpvsim checkout> <website checkout>

No production deployment, state change, new secret or binding is needed just to
review this branch. Release requires separately deploying this website after the
worker, then checking the existing `/stats` iframe and direct page.
