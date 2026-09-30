-- Owner decisions of 2026-09-30, after the curator dry run (migration 0019
-- seeded the Sky Surfer proposal and the Free-plan defaults).
-- Replay-safe: every statement is guarded or idempotent.

-- The owner, 2026-09-30: "there are multiple Chupito sets in the catalog
-- which obviously are the same plane." #518 merges on its own; #344's listing
-- states no wingspan, so the second AI opinion stays below the threshold.
INSERT INTO curator_directive (kind, payload, status, approved_by, approved_at, source)
SELECT 'merge', '{"keep":43,"absorb":344,"expect":{"keep_slug":"tbs-chupito","absorb_slug":"tbs-chupito-set"}}', 'approved', 'owner', 1790726400000, 'owner 2026-09-30: all Chupito sets are the same plane'
WHERE NOT EXISTS (SELECT 1 FROM curator_directive WHERE source = 'owner 2026-09-30: all Chupito sets are the same plane')
  AND EXISTS (SELECT 1 FROM master_model WHERE id = 43) AND EXISTS (SELECT 1 FROM master_model WHERE id = 344);

-- The owner's Sky Surfer answer keeps #425 (brand not stated by the seller)
-- and #514 (V4, 1500mm) as their own pages: record those pairs as rejected so
-- no dedup pass, old or new, proposes or auto-merges them.
INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at)
SELECT p.a, p.b, 0, 'owner 2026-09-30: keep separate (Sky Surfer proposal)', 'rejected', 1790726400000, 1790726400000
FROM (SELECT 67 AS a, 425 AS b UNION ALL SELECT 68, 425 UNION ALL SELECT 67, 514 UNION ALL SELECT 68, 514) p
WHERE EXISTS (SELECT 1 FROM master_model WHERE id = p.a) AND EXISTS (SELECT 1 FROM master_model WHERE id = p.b)
ON CONFLICT(a_id, b_id) DO UPDATE SET status = 'rejected', reason = excluded.reason, decided_at = excluded.decided_at;

-- The account is on Workers Paid (owner, 2026-09-30): 10x the Free per-tick
-- budgets, and a daily Neuron cap of about twice the free allocation, so at
-- most ~$0.11/day of overage. Both stay editable in Admin > AI curator.
UPDATE setting SET v = '10' WHERE k = 'curator_scale';
UPDATE setting SET v = '20000' WHERE k = 'curator_neuron_cap';
