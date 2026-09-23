# Redesign release runbook

## Current boundary

All work is local. No push, preview deployment, production deployment, sitemap submission or production database write is authorized. The isolated D1 snapshot contains disposable test fixtures and MUST NOT be uploaded to production.

## Before approval

1. Use the four release revisions recorded in `release-readiness-review.md`; confirm their clean tracked state and build output.
2. Run website catalog and SEO tests, sitemap + link audits, and Worker dry-run. Start all four local previews before crawling. Do not rebuild an app while crawling it.
3. Run both simulator suites/typechecks/builds, Nanawing 2 browser/offline gates, FPV offline update probe, and log parser tests/build. Verify Nanawing 2's committed build is identical after a second build.
4. Review dependency exceptions in `release-dependencies.md`, remaining real-device checks, and the final preview.
5. Confirm release revisions have incorporated current upstream work. Fetching refs is read-only; any new changes require revalidation.

## Authorized deployment order (not executed)

1. Publish the log viewer build with its header Share control and corrected guide pages.
2. Publish the website Worker/assets immediately afterward to remove the legacy proxy injection. Treat these as a coordinated release; the interim old Worker can inject an obsolete Share widget. Test the combined `/log-viewer/` route before announcing the release.
3. Publish Nanawing and Nanawing 2 builds. Preserve Nanawing 2 notices, offline manifest and its generated build mirror.
4. Verify homepage/product/category/watch/guide routes, redirects, 404s, live leaderboard, seller image proxy and admin authentication. Check cron/queue health read-only and confirm existing database bindings are unchanged. No redesign schema migration is required.
5. Test a returning browser, fresh browser, installed/offline simulator and log app. Inspect shared links and public social cards.
6. Only then submit/check sitemaps and representative Product/VideoObject URLs in Search Console/Rich Results and inspect social unfurls. Monitor real-user Web Vitals and indexing afterward.

## Rollback

Before deployment, record the currently active Worker/Pages deployment IDs for each app. If rollback is required, restore those exact prior deployments and their matching assets; never restore the local test database. Roll back the website and log viewer together so shared chrome/routing remain compatible. Restore both the previous Nanawing 2 shell and verified offline manifest; do not overwrite individual cached assets piecemeal. Check online reload followed by offline boot after rollback.

These instructions are preparation only, not permission to execute a release.
