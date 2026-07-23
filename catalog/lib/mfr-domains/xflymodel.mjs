async function fetchProducts() {
  const ORIGIN = 'https://xflymodel.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      return null;
    }
  }

  // Normalize any href/loc to an absolute product URL on the canonical origin, or null.
  function normalize(raw) {
    if (!raw) return null;
    let u = raw.trim().replace(/^\.\.\//, '/').replace(/&amp;/g, '&');
    try {
      const abs = new URL(u, ORIGIN + '/');
      // canonicalize host (site mixes www / non-www)
      let path = abs.pathname;
      if (!/\.html?$/i.test(path)) return null;
      const slug = path.replace(/^\//, '').toLowerCase();
      // Must be an xfly product page (airplane or jet), not listing/aux pages.
      if (!/^xfly-.*(rc-airplane|rc-jet)\.html?$/.test(slug)) return null;
      if (slug === 'xfly-rc-airplane.html') return null;           // category listing
      if (/(review|photo|sitemap|contact|about|payment|shipping)/.test(slug)) return null;
      return ORIGIN + '/' + slug;
    } catch (e) {
      return null;
    }
  }

  function hrefsFrom(html) {
    const out = [];
    const re = /href\s*=\s*["']([^"']+\.html?)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = normalize(m[1]);
      if (n) out.push(n);
    }
    return out;
  }

  // ---- 1. Seed discovery: sitemap + listing page + homepage ----
  const seedUrls = [
    ORIGIN + '/sitemap.xml',
    ORIGIN + '/xfly-rc-airplane.html',
    ORIGIN + '/index.html',
    ORIGIN + '/',
  ];
  const queue = [];
  const seen = new Set();
  function enqueue(u) {
    if (u && !seen.has(u)) { seen.add(u); queue.push(u); }
  }

  for (const s of seedUrls) {
    const txt = await get(s);
    if (!txt) continue;
    // sitemap <loc> entries
    const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m;
    while ((m = locRe.exec(txt)) !== null) enqueue(normalize(m[1]));
    // hrefs
    for (const h of hrefsFrom(txt)) enqueue(h);
  }

  // ---- helpers for product-page parsing ----
  const stripJunk = (h) =>
    h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<ins[\s\S]*?<\/ins>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

  const decode = (s) =>
    s.replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

  const toText = (h) =>
    decode(stripJunk(h).replace(/<[^>]+>/g, ' '))
      .replace(/[ \t\r\f ﻿]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ ]{2,}/g, ' ')
      .trim();

  function extractTitle(html) {
    let m = html.match(/<div[^>]*class=["'][^"']*product_title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (m) {
      const t = toText(m[1]).replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    m = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (m) {
      // Title is SEO-stuffed: "<name>, <junk>,<junk>" -> take up to first comma.
      let t = decode(m[1]).split(',')[0].trim();
      return t;
    }
    return '';
  }

  function extractImages(html) {
    const set = new Set();
    const re = /(?:src|data-src)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const src = m[1];
      if (!/\/products\//i.test(src)) continue;          // only product photos
      if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src)) continue;
      try {
        const abs = new URL(src.replace(/^\.\.\//, '/'), ORIGIN + '/');
        set.add(ORIGIN + abs.pathname);
      } catch (e) { /* ignore */ }
    }
    return [...set];
  }

  function extractDescription(html) {
    // Isolate main content: drop the sidebar/footer.
    let main = html;
    const sb = main.search(/<div[^>]+id=["']sidebar["']/i);
    if (sb > 0) main = main.slice(0, sb);
    main = stripJunk(main);

    // The rich description reliably starts at the product_des block.
    let start = main.search(/<div[^>]*class=["'][^"']*product_des[^"']*["']/i);
    if (start < 0) {
      // fallback: start at the shipping boilerplate that precedes the rich block
      start = main.search(/we will ship the package/i);
    }
    if (start < 0) {
      // fallback: start at the first <h2> after the price area
      const pm = main.search(/<div[^>]*class=["'][^"']*product_des/i);
      start = pm >= 0 ? pm : 0;
    }
    let block = start > 0 ? main.slice(start) : main;
    let text = toText(block);

    // Trim any trailing category-nav remnants if sidebar cut missed them.
    text = text.replace(/Xfly RC Airplane Cat[oa]gory[\s\S]*$/i, '').trim();
    return text;
  }

  // ---- 2. Crawl product pages (bounded), BFS to catch cross-linked products ----
  const products = [];
  const MAX = 150;
  let fetched = 0;
  while (queue.length && fetched < MAX) {
    const url = queue.shift();
    const html = await get(url);
    fetched++;
    await sleep(120);
    if (!html) continue;

    // harvest new product links from this page (BFS)
    for (const h of hrefsFrom(html)) enqueue(h);

    const title = extractTitle(html);
    const body_text = extractDescription(html);
    const image_urls = extractImages(html);
    if (!title) continue;

    const slug = url.split('/').pop().replace(/\.html?$/i, '');
    products.push({ ext_id: slug, title, url, body_text, image_urls });
  }

  return products;
}
export default fetchProducts
