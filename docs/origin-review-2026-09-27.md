# Origin review — 27 September 2026

Fetched origin and fast-forwarded the existing local redesign branches to the released defaults; no conflict resolution or source edits were needed. Website 661198a, FPV a023e83, Nanawing 2 08b2c89, log viewer 4470505. This review did not push, merge into main/master, or deploy. The release activity described in origin happened outside this review.

## Findings

- **P2 — statistics retains an empty first-flight date indefinitely.** `stats-worker/src/rollup.js:169-173` in fpvsim memoizes null and returns it for every subsequent request in the same isolate. Reproduction: read firstDay with an empty database, insert its first flight, read again: still null. This prevents closed-day rollups from discovering the new history until the isolate restarts. The existing test resets the memo between insertion and rechecking, masking this case. Do not cache null indefinitely; also invalidate the day's completion marker when the first flight arrives.
- **P2 — resumed asset downloads ignore If-Range.** `src/index.js:209-240` handles Range itself but never evaluates If-Range against the current asset validator. A request with Range bytes=0-2 and If-Range "old" receives 206 and NEW from an asset with ETag "new"; it should receive the complete new representation. A client resuming an old file can splice incompatible bytes. Honor If-Range or serve a full 200 when it does not match.

## Verification

Statistics-worker tests: 74/74. Nanawing 2 unit tests: 212/212. Website SEO tests: 17/17. Asset hash gate: 63 files current. Both findings reproduced with isolated local mocks, without writing production data. Full browser/offline suites and visual inspection were not repeated in this review.

Catalog integration checks against the existing theme-preview-v2 local snapshot: 64 passed, one opt-in mutation test skipped, zero failed. Initial default local state contained only one ready model, so it was unsuitable for the catalog inventory assertions. Product code has not been changed to satisfy a test fixture.
