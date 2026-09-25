# Redesign release runbook

## Current boundary

The owner authorized pushing the redesign to feature branches on 24 September. Main-branch merges, preview/production deployment, sitemap submission and production database writes remain unauthorized. Use [skip ci] on the push tip to prevent connected Pages builds and Workers Builds previews; do not open a PR that triggers preview deployment. The isolated D1 snapshot contains disposable test fixtures and MUST NOT be uploaded to production.

## Release revisions (exact)

Merge these revisions and nothing else. Each was validated as recorded in `release-readiness-review.md`.

| Repo | Branch | Revision |
|---|---|---|
| Website (`narenana-website`) | `fix/redesign-release-review` | Code revision **9d29abd**. Later commits on the branch may change `docs/` only; `git diff 9d29abd origin/fix/redesign-release-review -- . ':(exclude)docs'` must print nothing. |
| Log viewer (`edgetx-log-parser`) | `fix/log-viewer-404-assets` | **231ee2a**: `codex/site-theme-seo` a79165d plus the 404-page asset-path fix |
| Nanawing (`fpvsim`) | `codex/site-theme-seo` | **c60e87a** |
| Nanawing 2 (`nanawing2`) | `codex/site-theme-seo` | **62ec4a5**. **Not releasable as-is:** `origin/main` has moved to 0c113cf (three commits, including a new verify-before-promote deploy workflow). Integrate it first; see "Before approval" item 5. |

Never merge `codex/redesign-release` (4d751ed) into the website: it lacks the pre-production fixes, including the homepage query that read ~474,000 D1 rows per view. If a branch in the table has moved past the recorded revision, stop and re-review before merging it.

## Before approval

1. Check out exactly the revisions in the table above; confirm their clean tracked state and build output.
2. Run the website catalog and SEO tests, sitemap and link audits, and the Worker dry run. Start all four local previews before crawling. Do not rebuild an app while crawling it.
3. Run both simulator suites/typechecks/builds, the Nanawing 2 browser/offline gates, the FPV offline update probe, and the log parser tests/build. Verify Nanawing 2's committed build is identical after a second build.
4. Review dependency exceptions in `release-dependencies.md`, remaining real-device checks, and the final preview.
5. Confirm the release revisions include current upstream work. `git fetch` each repo and check `git merge-base --is-ancestor origin/<main> <release revision>`. The owner specifically requires pulling Nanawing 2 origin before deployment: integrate `origin/main` into the release branch, resolve generated output through a rebuild and repeat validation. As of 24 September, Nanawing 2 `origin/main` (0c113cf) is NOT contained in 62ec4a5. Recheck immediately before any authorized release; a previously fetched revision is not sufficient if origin has advanced. Never pull into or push main as part of this preparation.

## How every repo is merged (applies to all four)

Every push to a production branch deploys. The website deploys through Workers Builds on `master`. Nanawing and the log viewer deploy through the Pages Git integration. Nanawing 2 deploys through its GitHub Actions workflow on `main`, which verifies a candidate deployment before promoting it. So the merge itself is the deploy.

- Merge with a merge commit whose message does **not** start with `[skip ci]`: `git merge --no-ff <release-revision> -m "Release: redesign (<app>)"`. Never fast-forward. Every release branch tip is a `[skip ci]` commit, and a fast-forward would make it the production head, so the apps would silently skip their deploy while the website still deploys.
- One repo at a time. Before starting the next, wait for the build to report **Success** and confirm the live site serves the new build (new asset hashes), not just that the push went through.
- **Freeze other pushes to website `master`** for the release window, and tell any other thread working in the repo. A push from anyone during the window deploys whatever `master` holds.

### Standing rules for every website deploy (not only this release)

- **Asset versions are a deploy gate.** `wrangler.toml` `[build]` runs `node scripts/version-assets.mjs --check` before every `wrangler deploy`, including the Workers Builds deploy on each push to `master`. If any `/assets` reference is stale, broken or hand-labelled, the build fails and production keeps the previous version. The fix is always `npm run assets:version`, then commit. This matters because the Worker serves a current `?v=<hash>` URL as immutable for a year.
- **Edge-cache keys follow the deployed version.** Public HTML (homepage and catalog) is cached under keys that include the Worker version id (`CF_VERSION_METADATA`). A deploy or rollback therefore never serves another build's cached pages. No manual cache step or `PUBLIC_CACHE_RELEASE` bump is needed.

## Authorized deployment order (not executed)

The order matters because of one dependency. The new website Worker stops injecting the old Share widget into `/log-viewer/`, and only the new log-viewer build has its own.

- Website before log viewer: `/log-viewer/` has no Share button until the log viewer ships.
- Log viewer before website: compatible. The new log app hides the legacy widget when its own launcher exists.

No app links to the website's `/assets/family/*` files; each ships its own copy. In the log viewer this is true from 231ee2a: before that revision its 404 page linked the website's copies, which the old website does not have. So nothing else depends on the order.

0. **Preflight.**
   - Confirm every revision in the table above (and item 5 of "Before approval").
   - Record the live deployment of each app (IDs in the table below) and one asset URL per app, so both the change and a rollback can be verified.
   - Website, on the release revision:
     - `npm run assets:check` must pass.
     - The catalog suite with `CATALOG_TEST_MUTATE=1` and the SEO suite, both against a local worker, must pass.
     - `npx wrangler deploy --dry-run` must pass. It runs the same asset gate as the real deploy.
1. **Log viewer.** Merge to its production branch, following the merge rule above, and wait for Pages Success. Then check:
   - `https://www.narenana.com/log-viewer/` (still served by the OLD website Worker) shows the new asset hashes and exactly one `#nn-share-launcher`, with no visible legacy `#nn-shr`.
   - `https://www.narenana.com/log-viewer/no-such-page` renders the styled 404 page with its avatar.
2. **Website.** Merge to `master`. Workers Builds deploys it. Wait for Success, then run these checks.
   - **Log viewer:** `/log-viewer/` has no `#nn-shr` and still has the one new Share launcher. `/log-viewer` (no slash) 301s to `/log-viewer/`.
   - **Homepage:** shows "Listings from N Indian sellers" and four catalog cards.
   - **Edge cache.** The cache is per Cloudflare data centre, so compare responses from the same one: the `cf-ray` header ends in the data-centre code, e.g. `-BOM`. Repeat `curl -sI https://www.narenana.com/` until two consecutive responses show the same code; the second must carry `x-home-cache: HIT`. Do the same for a product page, which must carry `x-cat-cache: HIT`. HEAD requests are answered from the same entries.
   - **Assets:** versioned assets (`/assets/...?v=<hash>`) return `Cache-Control: public, max-age=31536000, immutable`.
   - **Noindex:** `https://narenana-website.narenana.workers.dev/` returns `X-Robots-Tag: noindex, nofollow`, and www does not.
   - **Sitemap vs in stock.** The sitemap must list exactly the in-stock models. Run the suite's read-only check against production (GET requests only): `CATALOG_BASE=https://www.narenana.com node --test --test-name-pattern="in-stock only" catalog/test/suite.mjs`. Landing pages are excluded by the test, so counting `<loc>` lines by hand gives a false failure.
   - **Admin:** anonymous `/admin` and `/api/*` return 401.
   - **Cron:** the next `*/15` cron run updates `job:last` (admin → System).
   - **D1 reads:** Cloudflare dashboard → D1 → catalog → Metrics. Rows read per day must stay far below the free 5M cap. Each render is edge-cached for about 15 minutes. Measured on the production snapshot:
     - homepage: about 4,100 rows per render;
     - grid, landing, browse, sitemap and the shared 404: about 2,000–4,300 rows each;
     - product page: about 650 rows.
3. **latest-router (optional, manual).** `cd latest-router && npx wrangler deploy`. It is not auto-deployed. The main Worker already marks its workers.dev host (what latest.narenana.com forwards to) as noindex. This adds router-level noindex for the forwarded `/log-viewer/` path too.
4. **Nanawing and Nanawing 2**, in either order, one at a time. Preserve Nanawing 2 notices, its offline manifest and its generated build mirror. Check online reload, then offline boot.
5. **Final checks.**
   - Verify homepage, product, category, watch and guide routes, redirects, 404s, the live leaderboard, the seller image proxy and admin authentication.
   - Test a returning browser, a fresh browser, the installed/offline simulator and the log app.
   - Inspect shared links and social cards.
   - No schema migration is required.
6. **Sitemaps last.** Only then submit/check sitemaps and representative Product/VideoObject URLs in Search Console/Rich Results. A submitted sitemap is not undone by a rollback. Monitor real-user Web Vitals and indexing afterwards.

## Rollback (durable)

A dashboard or `wrangler rollback` alone does NOT hold. Because production branches auto-deploy, the next push to `master` (from any thread) rebuilds HEAD and silently ships the redesign again. Every rollback therefore has two parts:

1. **Instant:**
   - Website: `npx wrangler rollback <version-id>`, or dashboard → Workers → narenana-website → Deployments.
   - Pages apps: dashboard → the project → Deployments → the recorded ID → Rollback.
   - Never restore the local test database.
2. **Durable, immediately after:** in each rolled-back repo, `git revert -m 1 <release-merge-commit>` and push to the production branch. The message must not start with `[skip ci]`. Keep the push freeze until that revert build reports Success, then confirm the live asset hashes match the recorded pre-release ones.

Roll back in **reverse** deployment order: sims, then website, then log viewer.

- An old website with a new log viewer is compatible. A new website with an old log viewer leaves `/log-viewer/` without Share.
- Restore both the previous Nanawing 2 shell and its verified offline manifest together; don't overwrite cached assets piecemeal.
- Check online reload followed by offline boot after rollback.

**Edge-cached pages across a rollback.** The redesign builds every cache key from scratch: page parameters plus `__release=<tag>.<deployed version id>`. It never reads an incoming `__release`, so no request can make it serve another build's entry, and each deployed version has its own keys. The pre-redesign build (`master` at `c3d95f3`) keys on the plain request URL. It could only serve a redesign entry for a request that spells out that entry's full key, including the version id, which is never exposed, within the 15-minute TTL. In practice the two builds don't share cached HTML.

### Re-release after a rollback

After `git revert -m 1`, `master` holds a commit that undoes the release. Merging the release branch again does **not** bring the redesign back: git considers those commits already merged, so only commits made after the revert would ship. To re-release:

1. On a new branch from `master`, revert the revert: `git revert <revert-commit>`. This restores the redesign.
2. Merge or cherry-pick the fix commits onto that branch.
3. Re-run the full preflight (item 0) **on the resulting tree**, not on the original release branch: `assets:check`, both suites and the dry run.
4. Merge that branch to `master` with the merge rule above.

These instructions are preparation only, not permission to execute a release.

## Read-only preflight snapshot — 24 September 2026

Existing production smoke checks passed all nine routes, including 15 video-feed entries, anonymous admin/API 401 and a real missing-page 404. See `release-public-smoke.json`; rerun `node scripts/release-public-smoke.mjs` before release. This validates the existing service, not the undeployed redesign. Website infrastructure configuration and catalog migrations are unchanged from the original baseline. The website Worker gains one binding, `version_metadata` (`CF_VERSION_METADATA`), which needs no dashboard setup.

Rollback candidates observed from Cloudflare deployment metadata (re-read immediately before deployment):

| Application | Deployment / version | Source |
|---|---|---|
| Website Worker | Deployment 8f2639a3-5943-4d75-b367-c8346b482616; version aaad215c-e50b-4d53-8dce-fe893549cd0d at 100% | 22 September deployment |
| Nanawing FPV | 30da74f4-3371-4d21-b1d8-292e7982031e | 07b47da |
| Nanawing 2 | 56c43b02-2404-4001-942d-b16f6a16f83a | 288838c |
| Log viewer | 099917ae-49b4-4a93-bb13-131cc71d8482 (latest successful entry) | a12147d |

The newer log deployment a03768f2-17a0-495e-be0e-6ddc5316788f reports Failure and must not be selected as a rollback target merely because it is first in the list. Confirm the active successful alias again before release. Nanawing 2 production has since changed deployment method (see above), so re-read its rollback target too. No deployment or rollback was executed.
