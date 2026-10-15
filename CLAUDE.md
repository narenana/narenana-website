# Working notes for this repo

## Until 17 Nov 2026: keep the one-site plan up to date

Owner decision, 6 Oct 2026: narenana is moving every indexable page onto www.narenana.com, one folder per product
(`/nanawing/`, `/nanawing2/`, `/log-viewer/`, `/wings/`). This repo becomes the one content home. The plan, with
milestones M1–M6, is [`docs/site-consolidation-plan.md`](docs/site-consolidation-plan.md).

If your change touches anything a visitor can read (maps, courses, aircraft, controls, log formats, feature or
privacy claims, prices or seller wording, the header or footer, a page title) or adds, removes or renames a page or
URL, update the plan as part of the same work:

1. Add a dated line to its **Change log**: what changed, repo and commit, milestone affected.
2. Page or URL added, removed or renamed: update its **URL map**. Fact changed: update its **Fact inventory** row,
   and fix the other copies listed there or add them to the M2 list.
3. If your change moves a milestone's date or scope, edit the milestone and say why.

A plan-only commit uses `[skip ci]`. This section is removed when the plan closes.

## Copy follows the brand voice guide (owner, 14–15 Oct 2026)

Every string a visitor reads (pages, `content/**.json`, generated pages, meta and og text, JSON-LD, alt text, share cards)
follows [`.claude/brand-voice-guidelines.md`](.claude/brand-voice-guidelines.md). That file is the source of truth; the
fpvsim repo keeps a synced copy.

- Its first section is the owner's rule: write about the pilot, not the product. Say what the pilot can do, achieve and
  enjoy. Never say how a feature works or how a number was measured, and never sell a limit.
- **Review gate.** Before copy reaches the owner, a preview or master, run the brand-voice quality-assurance agent in strict
  mode on the **whole page** the change touches, not only the changed lines. Fix every finding, re-run it until it is clean,
  then read every line yourself against the guide's five checks. On 15 Oct 2026 a section the guide already banned ("Where
  the numbers come from") was still live on `/nanawing/aircraft/`, because edits to that page were only checked line by line.
- New feedback from the owner goes into the guide, with his example.
