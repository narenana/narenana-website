// Generated from catalog/catalog.css — edit that, then: npm run catalog:css
export const CSS = `/* narenana Wings — shares the umbrella site's tokens so /wings/ feels native. */
:root {
  --bg: #0e1117;
  --fg: #e6edf3;
  --muted: #8b949e;
  --accent: #1f9bd9;
  --accent-bright: #3eb5e8;
  --card: #161b22;
  --border: #30363d;
  --ok: #3fb950;
  --warn: #d29922;
  --bad: #f85149;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.6;
}

a { color: inherit; }

/* --- nav ---------------------------------------------------------------- */
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  position: sticky;
  top: 0;
  background: rgba(14, 17, 23, 0.85);
  backdrop-filter: blur(8px);
  z-index: 10;
}
.nav-back { color: var(--muted); text-decoration: none; }
.nav-back:hover { color: var(--fg); }
.nav-sep { color: var(--border); }
.nav-here { color: var(--accent-bright); text-decoration: none; font-weight: 600; }

.wrap { max-width: 860px; margin: 0 auto; padding: 40px 24px 64px; }

h1 {
  font-size: clamp(2rem, 5.5vw, 3.2rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.1;
  margin: 0 0 14px;
}
h1 .accent { color: var(--accent-bright); }
.kit-h { font-size: clamp(1.7rem, 4vw, 2.4rem); margin-bottom: 10px; }

.lede { font-size: 1.1rem; color: var(--muted); margin: 0 0 28px; max-width: 42em; }
.lede em { color: var(--fg); font-style: italic; }

.crumb { color: var(--muted); text-decoration: none; font-size: 0.9rem; display: inline-block; margin-bottom: 18px; }
.crumb:hover { color: var(--accent-bright); }

/* --- the headline insight ---------------------------------------------- */
.insight {
  background: linear-gradient(180deg, rgba(31, 155, 217, 0.10), rgba(31, 155, 217, 0.03));
  border: 1px solid rgba(31, 155, 217, 0.35);
  border-radius: 14px;
  padding: 22px 24px;
  margin: 0 0 44px;
}
.insight-h { font-size: 1.15rem; font-weight: 700; margin: 0 0 10px; color: var(--accent-bright); letter-spacing: 0; text-transform: none; }
.insight p { margin: 0 0 10px; color: var(--muted); }
.insight p:last-child { margin-bottom: 0; }
.insight strong { color: var(--fg); }
.insight a { color: var(--accent-bright); }

/* --- section headings --------------------------------------------------- */
.sec {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 44px 0 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.count {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 1px 9px;
  font-size: 0.75rem;
  color: var(--fg);
}
.sec-sub { color: var(--muted); font-size: 0.9rem; margin: 0 0 16px; }

/* --- shop header -------------------------------------------------------- */
.shop-head { border-bottom: 1px solid var(--border); background: var(--card); }
.shop-head-in { max-width: 1140px; margin: 0 auto; padding: 26px 24px; }
.shop-h1 { font-size: clamp(1.5rem, 3.2vw, 2rem); margin: 0 0 4px; letter-spacing: -0.02em; }
.shop-sub { margin: 0; color: var(--muted); font-size: 0.88rem; }

.shop { max-width: 1140px; margin: 0 auto; padding: 20px 24px 64px; }

/* --- filter / sort bar -------------------------------------------------- */
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 0 16px;
}
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.chip span { opacity: 0.55; margin-left: 4px; font-weight: 500; }
.chip:hover { color: var(--fg); border-color: var(--accent); }
.chip.is-on { background: var(--accent); border-color: var(--accent); color: #06222e; }
.chip.is-on span { opacity: 0.7; }
.sort { color: var(--muted); font-size: 0.85rem; display: flex; align-items: center; gap: 8px; }
.sort select {
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 8px;
  padding: 7px 10px;
  font-family: inherit;
  font-size: 0.85rem;
}

.banner {
  background: rgba(31, 155, 217, 0.09);
  border: 1px solid rgba(31, 155, 217, 0.3);
  border-radius: 10px;
  padding: 12px 16px;
  margin: 0 0 20px;
  font-size: 0.88rem;
  color: var(--muted);
}
.banner strong { color: var(--accent-bright); }

/* --- product grid ------------------------------------------------------- */
.prods {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
}
.prod {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color 120ms, transform 120ms;
}
.prod:hover { border-color: var(--accent); transform: translateY(-2px); }
.prod-link { text-decoration: none; color: inherit; display: flex; flex-direction: column; flex: 1; }

/* White image tile — sellers' shots are a mix of studio cutouts and grass
   photos; a white ground is the only thing that makes them sit together. */
.prod-img { position: relative; background: #fff; aspect-ratio: 4 / 3; }
.prod-img img { width: 100%; height: 100%; object-fit: contain; display: block; }
.prod-noimg {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: #bbb; font-size: 0.8rem; background: #f4f4f4;
}
.prod-veil {
  position: absolute; inset: 0;
  background: rgba(14, 17, 23, 0.62);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700;
  letter-spacing: 0.03em; text-transform: uppercase;
}
.tag {
  position: absolute; top: 8px; left: 8px;
  font-size: 0.65rem; font-weight: 700;
  padding: 3px 7px; border-radius: 5px;
  text-transform: uppercase; letter-spacing: 0.04em;
  z-index: 1;
}
.tag-in { background: var(--accent); color: #06222e; }
.tag-off { background: var(--ok); color: #04260c; left: auto; right: 8px; }

.prod-body { padding: 12px 13px 10px; flex: 1; display: flex; flex-direction: column; }
.prod-brand { margin: 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.prod-name { margin: 2px 0 3px; font-size: 0.95rem; font-weight: 700; line-height: 1.25; }
.prod-spec { margin: 0 0 10px; font-size: 0.78rem; color: var(--muted); }
.prod-price { margin-top: auto; display: flex; align-items: baseline; gap: 7px; }
.mrp { color: var(--muted); text-decoration: line-through; font-size: 0.78rem; }
.prod-build {
  margin: 6px 0 0;
  font-size: 0.74rem;
  color: var(--muted);
  border-top: 1px dashed var(--border);
  padding-top: 6px;
}
.prod-build strong { color: var(--fg); font-weight: 700; }

.prod-cta {
  display: block;
  /* Inside the card anchor (the whole card is one tap target); auto top
     margin pins it to the bottom so cards align across the row. */
  margin: auto 13px 13px;
  background: var(--accent);
  color: #06222e;
  text-align: center;
  padding: 9px;
  border-radius: 8px;
  font-size: 0.83rem;
  font-weight: 700;
}
.prod:hover .prod-cta { background: var(--accent-bright); }
.prod-cta.is-off { background: transparent; border: 1px solid var(--border); color: var(--muted); }
.prod:hover .prod-cta.is-off { background: transparent; border-color: var(--accent); color: var(--fg); }

.empty { color: var(--muted); text-align: center; padding: 40px 0; }

/* --- legacy card (kept for the detail page's alt block) ----------------- */
.grid { display: grid; gap: 14px; margin: 16px 0 0; padding: 0; list-style: none; }
@media (min-width: 680px) { .grid { grid-template-columns: 1fr 1fr; } }

.card {
  display: block;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  text-decoration: none;
  height: 100%;
  transition: border-color 120ms, transform 120ms;
}
.card:hover { border-color: var(--accent); transform: translateY(-1px); }
.card.is-dead { opacity: 0.72; }
.card.is-dead:hover { opacity: 1; }

.card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
/* Let the title own the row; the price shrinks rather than crushing it. */
.card-top > div:first-child { flex: 1 1 auto; min-width: 0; }
.card-title { margin: 0 0 2px; font-size: 1.05rem; font-weight: 700; line-height: 1.3; }
.card-meta { margin: 0; color: var(--muted); font-size: 0.85rem; }
.card-blurb { color: var(--muted); font-size: 0.9rem; margin: 12px 0 14px; }
.card-foot { display: flex; flex-wrap: wrap; gap: 6px; }
.card-alt {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  font-size: 0.85rem;
  color: var(--muted);
}
.card-alt strong { color: var(--accent-bright); }

/* --- price -------------------------------------------------------------- */
.price { font-size: 1.05rem; font-weight: 700; white-space: nowrap; text-align: right; }
.price-lg { font-size: 1.9rem; text-align: left; }
.price-pre { font-size: 0.72rem; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.price.is-muted { color: var(--muted); font-weight: 600; }
/* Import estimates are long ("₹20,000–₹28,000 landed, imported") — let them
   wrap and stay small instead of squeezing the kit name into three lines. */
.price-est { font-size: 0.82rem; font-weight: 600; white-space: normal; line-height: 1.3; flex: 0 0 auto; }
.price-est .price-pre { font-size: 0.66rem; }

/* --- badges ------------------------------------------------------------- */
.badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 20px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.badge.ok { color: var(--ok); border-color: rgba(63, 185, 80, 0.4); }
.badge.warn { color: var(--warn); border-color: rgba(210, 153, 34, 0.4); }
.badge.bad { color: var(--bad); border-color: rgba(248, 81, 73, 0.4); }
.badge.made { color: var(--accent-bright); border-color: rgba(62, 181, 232, 0.4); }

/* --- kit page ----------------------------------------------------------- */
.kit-badges { display: flex; gap: 6px; margin-bottom: 16px; }
.kit-key {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  align-items: center;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
  margin-bottom: 20px;
}
.spec { display: flex; flex-wrap: wrap; gap: 24px; margin: 0; }
.spec dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.spec dd { margin: 2px 0 0; font-weight: 600; font-size: 0.95rem; }

.flag {
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 0.88rem;
  margin: 0 0 12px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.flag strong { color: var(--fg); margin-right: 4px; }
.flag-warn { border-color: rgba(210, 153, 34, 0.45); background: rgba(210, 153, 34, 0.07); }
.flag-warn strong { color: var(--warn); }

.cta {
  display: inline-block;
  background: var(--accent);
  color: #06222e;
  padding: 12px 22px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.95rem;
  text-decoration: none;
  margin: 8px 0 6px;
}
.cta:hover { background: var(--accent-bright); }
.tax { font-size: 0.85rem; color: var(--warn); margin: 4px 0 0; }
.tax strong { color: var(--warn); }

.vars { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 10px; }
.vars th {
  text-align: left;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 600;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--border);
}
.vars th:last-child, .vars td:last-child { text-align: right; }
.vars td { padding: 10px 0; border-bottom: 1px solid var(--border); }
.vars tbody tr:last-child td { border-bottom: none; }
.vars td:last-child { font-weight: 700; white-space: nowrap; }

.recipes { margin-top: 44px; }

/* --- recipe tabs -------------------------------------------------------- */
.tabs { display: flex; gap: 6px; margin: 16px 0 18px; flex-wrap: wrap; }
.tab {
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 20px;
  padding: 7px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
}
.tab:hover { color: var(--fg); border-color: var(--accent); }
.tab.is-on { color: #06222e; background: var(--accent); border-color: var(--accent); }

.rp-sum { color: var(--muted); font-size: 0.95rem; margin: 0 0 16px; max-width: 46em; }
.rp-table td { vertical-align: top; }
.rp-role {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  padding-right: 18px !important;
}
.rp-table a { color: var(--accent-bright); text-decoration: none; font-weight: 600; }
.rp-table a:hover { text-decoration: underline; }
.badge-sm { font-size: 0.62rem; padding: 1px 7px; margin-left: 7px; vertical-align: 1px; }
.rp-note { display: block; color: var(--muted); font-size: 0.8rem; margin-top: 2px; }
.rp-vendor { display: block; color: var(--border); font-size: 0.72rem; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.04em; }

.rp-table tfoot td { border-bottom: none; color: var(--muted); font-size: 0.85rem; padding-top: 12px; }
.rp-table tfoot td:last-child { color: var(--fg); font-weight: 600; }
.rp-table tfoot tr:first-child td { border-top: 1px solid var(--border); }
.rp-total td { font-size: 1rem !important; color: var(--fg) !important; font-weight: 700 !important; padding-top: 6px !important; }
.rp-total td:last-child { color: var(--accent-bright) !important; font-size: 1.2rem !important; }

.rp-foot { font-size: 0.8rem; color: var(--muted); margin: 14px 0 0; }
.is-warn { color: var(--warn); }

/* --- footer ------------------------------------------------------------- */
.foot {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 24px 56px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.82rem;
}
.foot p { margin: 0 0 8px; }
.foot a { color: var(--muted); }
.foot a:hover { color: var(--accent-bright); }
`
