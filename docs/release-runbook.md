# Redesign release runbook

## Current boundary

The owner authorized pushing the redesign to feature branches on 24 September. Main-branch merges, preview/production deployment, sitemap submission and production database writes remain unauthorized. Use [skip ci] on the push tip to prevent connected Pages builds; do not open a PR that triggers preview deployment. The isolated D1 snapshot contains disposable test fixtures and MUST NOT be uploaded to production.

## Before approval

1. Use the four release revisions recorded in `release-readiness-review.md`; confirm their clean tracked state and build output.
2. Run website catalog and SEO tests, sitemap + link audits, and Worker dry-run. Start all four local previews before crawling. Do not rebuild an app while crawling it.
3. Run both simulator suites/typechecks/builds, Nanawing 2 browser/offline gates, FPV offline update probe, and log parser tests/build. Verify Nanawing 2's committed build is identical after a second build.
4. Review dependency exceptions in `release-dependencies.md`, remaining real-device checks, and the final preview.
5. Confirm release revisions have incorporated current upstream work. The owner specifically requires pulling Nanawing 2 origin before deployment: fetch origin, integrate origin/main into the release branch, resolve generated output through a rebuild and repeat validation. Recheck immediately before any future authorized release; a previously fetched revision is not sufficient if origin has advanced. Never pull into or push main as part of this preparation.

## Authorized deployment order (not executed)

1. Publish the log viewer build with its header Share control and corrected guide pages.
2. Publish the website Worker/assets immediately afterward to remove the legacy proxy injection. The new log app suppresses the legacy widget when its own launcher exists, so the interim old Worker is compatible. Keep the release coordinated for routing and cache consistency. Test the combined `/log-viewer/` route before announcing the release.
3. Publish Nanawing and Nanawing 2 builds. Preserve Nanawing 2 notices, offline manifest and its generated build mirror.
4. Verify homepage/product/category/watch/guide routes, redirects, 404s, live leaderboard, seller image proxy and admin authentication. Check cron/queue health read-only and confirm existing database bindings are unchanged. No redesign schema migration is required.
5. Test a returning browser, fresh browser, installed/offline simulator and log app. Inspect shared links and public social cards.
6. Only then submit/check sitemaps and representative Product/VideoObject URLs in Search Console/Rich Results and inspect social unfurls. Monitor real-user Web Vitals and indexing afterward.

## Rollback

Before deployment, record the currently active Worker/Pages deployment IDs for each app. If rollback is required, restore those exact prior deployments and their matching assets; never restore the local test database. Roll back the website and log viewer together so shared chrome/routing remain compatible. Restore both the previous Nanawing 2 shell and verified offline manifest; do not overwrite individual cached assets piecemeal. Check online reload followed by offline boot after rollback.

These instructions are preparation only, not permission to execute a release.

## Read-only preflight snapshot — 24 September 2026

Existing production smoke checks passed all nine routes, including 15 video-feed entries, anonymous admin/API 401 and a real missing-page 404. See `release-public-smoke.json`; rerun `node scripts/release-public-smoke.mjs` before release. This validates the existing service, not the undeployed redesign. Website infrastructure configuration and catalog migrations are unchanged from the original baseline.

Rollback candidates observed from Cloudflare deployment metadata (re-read immediately before deployment):

| Application | Deployment / version | Source |
|---|---|---|
| Website Worker | Deployment 8f2639a3-5943-4d75-b367-c8346b482616; version aaad215c-e50b-4d53-8dce-fe893549cd0d at 100% | 22 September deployment |
| Nanawing FPV | 30da74f4-3371-4d21-b1d8-292e7982031e | 07b47da |
| Nanawing 2 | 56c43b02-2404-4001-942d-b16f6a16f83a | 288838c |
| Log viewer | 099917ae-49b4-4a93-bb13-131cc71d8482 (latest successful entry) | a12147d |

The newer log deployment a03768f2-17a0-495e-be0e-6ddc5316788f reports Failure and must not be selected as a rollback target merely because it is first in the list. Confirm the active successful alias again before release. No deployment or rollback was executed.
