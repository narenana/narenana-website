# Direction A cross-site rollout

The homepage remains the approved direction. The shared design uses the YouTube avatar, pale blue paper, charcoal text, blue accents and orange primary actions. Self-hosted Barlow Condensed, DM Sans and JetBrains Mono have accompanying license files.

## Source locations

- Website/catalog: C:/Users/Practo/Documents/wings (existing uncommitted homepage work preserved).
- FPV: C:/Users/Practo/Documents/site-theme-work/fpvsim — codex/site-theme-seo.
- Nanawing 2: C:/Users/Practo/Documents/site-theme-work/nanawing2 — codex/site-theme-seo.
- Log viewer: C:/Users/Practo/Documents/site-theme-work/log-viewer — codex/site-theme-seo.

Original active simulator checkouts were not edited. Separate application source/build boundaries remain intact. Pinned simulator shared assets were not altered; family branding is a local adapter. Flight physics, radio calibration and parsing algorithms are unchanged.

## Restart local preview

From the website directory:

```
npm run dev -- --port 8787 --persist-to .wrangler/theme-preview-v2 --var ADMIN_PASS:devpass
node scripts/preview-products.mjs
```

The first command uses an isolated local catalog snapshot. The second serves built app outputs on 8788/8789/8790 with correct static guide/leaderboard routes and preview noindex headers. Build each application before restarting if its source changes. Local preview-links.js rewrites navigation only on localhost/127.0.0.1.

Shared shell source: scripts/brand-shell.mjs and site/assets/family. Applications contain standalone copies so each can build/deploy independently. Keep those copies in sync when changing family navigation/fonts. Log editorial pages regenerate through scripts/gen-content.mjs; main watch/methodology pages through scripts/seo-content.mjs. Nanawing 2 requires npm run build:static and its generated build mirror.

No remote push, preview deployment or production deployment was performed. See seo-completion.md for exact test evidence and release-only checks.
