# Landing pages: the rules and the auditor

A landing page on www.narenana.com exists to be found for one search phrase and to send the pilot
into a flight. Everything else on it (videos, prints, buying, logs) is there so the page gets
discovered for every query about that aircraft. The first one is `/nanawing/chupito-simulator/`
(`content/nanawing/chupito-simulator.json`, built by `scripts/build-nanawing-landing.mjs`).

These rules are checked by `npm run landing:audit -- content/nanawing/<page>.json`
(`scripts/landing-audit.mjs`). Run it before a preview or a merge; it exits non-zero on any failure.
Rules the auditor cannot judge (taste, truth of a claim) are marked **(human)**.

## S. Search

- S0. A top-wing page lives at the wing's own short name, maker added only when the bare name is ambiguous:
  `/chupito/`, `/mojito/`, `/t1-ranger/`, `/atomrc-dolphin/` (owner, 24 Oct 2026: "url being narenana.com/chupito").
  No other page on the site may take a wing's name.
- S1. One target phrase per page, declared as `seo.phrase` (e.g. "Chupito simulator"). The `<title>` carries it
  and is at most 60 characters before the site suffix. The URL slug carries it.
- S2. The meta description is 70 to 155 characters, names the aircraft, and says what the pilot gets.
- S3. Exactly one H1, and it carries the phrase. H2s head every section and carry an `id`; H3s sit under an H2;
  no level is skipped. Every in-page link (`#…`) resolves to an id on the page.
- S4. JSON-LD parses and carries WebPage, BreadcrumbList, FAQPage when there is a FAQ, a VideoObject per embedded
  video and an ItemList for any curated list. Canonical is the www URL; robots is index,follow.
- S5. The page is in `site/sitemap.xml` and in the Worker's sitemap list with a lastmod no later than today, and it is
  linked from the homepage, the hangar page and the Wings product page of the same aircraft (`seo.linkedFrom`).
- S6. Every H2 names the aircraft and the pilot's action in the words pilots search with (owner, 24 Oct 2026: "the title
  needs to say analyse chupito logs"). Pull the phrases from Google's suggestions for the aircraft (kit, PNP, manual, iNAV
  setup, price, 3D print, logs) and answer the common ones in the FAQ. Record the phrases in the page's `_seo` note.
- S7. Every section shows something, not only text: videos, the sim frame, the bundle photos (the seller's, with consent
  and credit), the print pictures (the designers', beside their credit) and a picture of the log viewer.
- S8. Curated third-party links (the prints) are checked weekly by the Worker (src/prints-live.js): a print whose page or
  picture is definitely gone is dropped from the page and its ItemList; a bot check never retires one.
- S9. Every content image has alt text (empty only inside a link that is labelled another way), real width and height,
  and loads lazily, except the hero, which loads first with `fetchpriority="high"`.
- S10. Every internal link on the page answers 200 on the local Worker (the auditor checks it when `wrangler dev` runs).
- S11. The page HTML stays under 120 KB and the hero picture under 150 KB.

## H. Hero and first screen

- H1. The primary CTA ("Fly the … now", the sim's play link with the aircraft preselected) is inside the hero and
  fully visible in the first screen on a 14-inch laptop (1366×768) and on a phone (390×844). No horizontal overflow.
- H2. The hero artwork shows this aircraft and nothing else: no other aircraft from the hangar, no other
  product. Its alt text names the aircraft and no other. The files are not reused from the homepage or any other
  page (compared by content hash).
- H3. The hero carries the eyebrow, the H1, one sub-line and the CTA; the lede and everything else sit below it.
- H4. **(human)** A tagline claim ("the only …") is checked before it ships and the check is recorded in the page's
  `_h1` note, with the date; it comes down the day it stops being true.
- H5. The hero and share pictures are made by Astra (ChatGPT’s image model, in the Codex app on the owner’s machine),
  never composited by a script or by hand (owner, 24 Oct 2026). They start from the maker’s own photographs when the
  maker’s permission covers them (Team BlackSheep: yes, owner 24 Oct 2026), otherwise from the sim’s render. Masters live
  under `assets-src/<area>/`; `npm run landing:images` only resizes and encodes them (the hero, the bundle photos, the print pictures, the log-viewer picture), and the share
  card script only prints the words over `social.card.background`. The maker is credited and linked under the picture.

## L. Layout

- L1. A landing page is laid out as a product page (owner, 24 Oct 2026: "think Apple product page like iPad"), not a
  scenery backdrop with a floating plane, which the homepage already has. In order: a sticky product nav (the wing's
  name, the page's stops as verbs, a play button); a dark centred hero (eyebrow, H1, one line, the play button, a link to
  the bundles), then the wing itself under the words; the videos; a dark band for the sim (the render, the figures as
  large tiles, the small print, the play button, the habits to learn on a real in-sim frame); the bundles side by side
  with their live seller tables; then prints, logs, thanks, questions and a dark closing band.
- L2. Every jump target clears the sticky nav (a scroll margin on every id), and the nav keeps the play button on a phone.

## C. Copy

- C1. Every heading promises what the pilot gets or does ("Learn to launch it", "Watch it flat out"). Never a filler
  ("Worth your time too", "More", "Other", "Also") or a reading task ("Check the numbers"). If no such heading exists,
  show the content without one. (Owner, 23 Oct 2026; see `.claude/brand-voice-guidelines.md`.)
- C2. The brand voice guide applies to every string: write about the pilot, not the product; no banned words
  (explore, discover, unlock, elevate, journey, experience, seamless, immersive, next-level); numbers as numerals;
  sizes with no space before mm.
- C3. One disclaimer, in small print, once. "Official" appears only in the FAQ answer that denies it.
- C4. **(human)** Run the brand-voice QA agent in strict mode on the whole page before the owner sees it; treat its
  suggested headings with the same suspicion as your own.

## T. Trust and links

- T1. The maker is credited and linked wherever the aircraft is shown (Team BlackSheep's terms for the Chupito).
- T2. Every outbound link opens in a new tab with `rel="noopener"`; seller links from the Worker add `nofollow`.
- T3. Third-party titles (videos, prints) are quoted verbatim with the channel or designer named; our own videos
  carry our captions.
- T4. Prices and stock come from the catalog per request (`src/wings-live.js`) and are never baked into the page;
  the words are "last checked", never "current".

## G. Share

- G1. The share card is 1200×630, shows this aircraft clearly, carries the tagline as its headline and the maker
  credit in its footer. `og:title`, `og:description`, `og:image`, `twitter:card` and an image alt are present.
- G2. **(human)** Read the card as a stranger would in a WhatsApp preview: one idea, one aircraft, legible at 300px wide.
- G3. The share card shows the page headline in full (owner, 24 Oct 2026: "we have a good headline. use it in the social
  share"), the same words as `og:title` and `twitter:title`; `og:image` declares 1200×630 and its type.

## SEO checklist (10 points)

`npm run landing:audit` ends with a score; a point counts only when every rule under it passes. Ship at 10/10
(owner, 24 Oct 2026: "make sure this page has all the seo checklist 10/10").

1. Title and URL carry the phrase (S1).
2. Meta description: the aircraft, a benefit, 70–155 characters (S2).
3. One H1 with the phrase, no skipped heading levels, every H2 anchored (S3).
4. Every H2 names the aircraft in search words (S6).
5. Structured data: WebPage, BreadcrumbList, FAQPage, a VideoObject per video, the ItemList, and the sim as a free
   SoftwareApplication (S4).
6. Images: alt, real sizes, the hero first and the rest lazy (S9).
7. Discovery: in both sitemaps with a lastmod, linked from three or more pages, every internal link resolves (S5, S10).
8. Share: the headline on the card and in `og:title`, the card's size declared, twitter tags matching (G1–G3).
9. First screen: the play button visible on a laptop and a phone, no sideways scroll (H1).
10. Weight: the page and its hero stay light (S11).
