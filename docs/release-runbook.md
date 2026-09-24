# Redesign release runbook

## Current boundary

The owner authorized pushing the redesign to feature branches on 24 September. Main-branch merges, preview/production deployment, sitemap submission and production database writes remain unauthorized. Use [skip ci] on the push tip to prevent connected Pages builds; do not open a PR that triggers preview deployment. The isolated D1 snapshot contains disposable test fixtures and MUST NOT be uploaded to production.

## Before approval

1. Use the four release revisions recorded in `release-readiness-review.md`; confirm their clean tracked state and build output.
2. Run website catalog and SEO tests, sitemap + link audits, and Worker dry-run. Start all four local previews before crawling. Do not rebuild an app while crawling it.
3. Run both simulator suites/typechecks/builds, Nanawing 2 browser/offline gates, FPV offline update probe, and log parser tests/build. Verify Nanawing 2's committed build is identical after a second build.
4. Review dependency exceptions in `release-dependencies.md`, remaining real-device checks, and the final preview.
5. Confirm release revisions have incorporated current upstream work. The owner specifically requires pulling Nanawing 2 origin before deployment: fetch origin, integrate origin/main into the release branch, resolve generated output through a rebuild and repeat validation. Recheck immediately before any future authorized release; a previously fetched revision is not sufficient if origin has advanced. Never pull into or push main as part of this preparation.

## How every repo is merged (applies to all four)

Every push to a production branch deploys: Workers Builds for the website (`master`), the Pages Git integration for the three apps. So the merge itself is the deploy.

- Merge with a merge commit whose message does **not** start with `[skip ci]`: `git merge --no-ff <release-branch> -m "Release: redesign (<app>)"`. Never fast-forward: every release branch tip is a `[skip ci]` commit, and a fast-forward would make it the production head, so the Pages apps would silently skip their deploy while the website still deploys.
- One repo at a time. Before starting the next, wait for the Cloudflare build to report **Success** and confirm the live site serves the new build (new asset hashes), not just that the push went through.
- **Freeze other pushes to website `master`** for the release window. Tell any other thread working in the repo. A push from anyone during the window deploys whatever `master` holds.

## Authorized deployment order (not executed)

The order matters because of one dependency: the new website Worker stops injecting the old Share widget into `/log-viewer/`, and only the new log-viewer build has its own. Website before log viewer = `/log-viewer/` has no Share button until the log viewer ships. Log viewer before website is compatible (the new log app hides the legacy widget when its own launcher exists). No app links to the website's `/assets/family/*` files (each ships its own copy), so nothing else depends on the order.

0. **Preflight.**
   - Re-run `git ls-remote` for all four repos and confirm each release branch contains current `origin` work.
   - Record the live deployment of each app (IDs in the table below) and one asset URL per app, so both the change and a rollback can be verified.
   - Website release branch:
     - `npm run assets:check` must pass. If it doesn't, run `npm run assets:version`, then commit.
     - Catalog suite with `CATALOG_TEST_MUTATE=1` and the SEO suite, both against a local worker, must pass.
     - `PUBLIC_CACHE_RELEASE` in `catalog/lib/worker.mjs` must differ from the value production uses, so pages edge-cached from the old build are never served by the new one.
1. **Log viewer.** Merge to its production branch, following the merge rule above. Wait for Pages Success. Confirm `https://www.narenana.com/log-viewer/` (still served by the OLD website Worker) shows the new asset hashes and exactly one `#nn-share-launcher`, with no visible legacy `#nn-shr`.
2. **Website.** Merge to `master`. Workers Builds deploys it. Wait for Success, then check:
   - `/log-viewer/` has no `#nn-shr` and still has the one new Share launcher.
   - Homepage: shows "Listings from N Indian sellers" and four catalog cards. A second GET of `/` returns `x-home-cache: HIT`, and a second GET of a product page returns `x-cat-cache: HIT`.
   - Versioned assets (`/assets/...?v=<hash>`) return `Cache-Control: public, max-age=31536000, immutable`.
   - `https://narenana-website.narenana.workers.dev/` returns `X-Robots-Tag: noindex, nofollow`, and www does not.
   - The `/sitemap.xml` product count equals the in-stock model count on `/wings/browse/`.
   - Anonymous `/admin` and `/api/*` return 401.
   - The next `*/15` cron run updates `job:last` (admin → System).
   - **D1 reads:** Cloudflare dashboard → D1 → catalog → Metrics. Rows read per day must stay far below the free 5M cap. A homepage render reads about 4,100 rows and is edge-cached for about 15 minutes.
3. **latest-router (optional, manual).** `cd latest-router && npx wrangler deploy`. It is not auto-deployed. The main Worker already marks its workers.dev host (what latest.narenana.com forwards to) as noindex. This adds router-level noindex for the forwarded `/log-viewer/` path too.
4. **Nanawing and Nanawing 2**, in either order, one at a time. Preserve Nanawing 2 notices, its offline manifest and its generated build mirror. Check online reload, then offline boot.
5. Verify homepage, product, category, watch and guide routes, redirects, 404s, the live leaderboard, the seller image proxy and admin authentication. Test a returning browser, a fresh browser, the installed/offline simulator and the log app. Inspect shared links and social cards. No schema migration is required.
6. Only then submit/check sitemaps and representative Product/VideoObject URLs in Search Console/Rich Results. A submitted sitemap is not undone by a rollback. Monitor real-user Web Vitals and indexing afterwards.

## Rollback (durable)

A dashboard or `wrangler rollback` alone does NOT hold. Because production branches auto-deploy, the next push to `master` (from any thread) rebuilds HEAD and silently ships the redesign again. Every rollback therefore has two parts:

1. **Instant:** website `npx wrangler rollback <version-id>` (or dashboard → Workers → narenana-website → Deployments). For Pages apps, dashboard → the project → Deployments → the recorded ID → Rollback. Never restore the local test database.
2. **Durable, immediately after:** in each rolled-back repo, `git revert -m 1 <release-merge-commit>` and push to the production branch. The message must not start with `[skip ci]`. Keep the push freeze until that revert build reports Success, then confirm the live asset hashes match the recorded pre-release ones.

Roll back in **reverse** deployment order: sims, then website, then log viewer. An old website with a new log viewer is compatible; a new website with an old log viewer leaves `/log-viewer/` without Share. Restore both the previous Nanawing 2 shell and its verified offline manifest together; don't overwrite cached assets piecemeal. Check online reload followed by offline boot after rollback.

Edge-cached pages do not leak across a rollback. The redesign keys its cached pages on URL + `PUBLIC_CACHE_RELEASE`, while the pre-redesign build (`master` at `c3d95f3`) keys on the plain URL, so neither build can serve the other's cached HTML.

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
