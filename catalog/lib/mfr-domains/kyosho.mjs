async function fetchProducts() {
  // Kyosho RC store (rc.kyosho.com, English storefront) is Magento with clean
  // schema.org JSON-LD on every product page. There is no working XML sitemap
  // and no products.json / Woo Store API, so we crawl the airplane category
  // tree ("rcplane" + discontinued "dis-rcplane"), collect product links from
  // the Magento product tiles, then parse JSON-LD on each product page.
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const ORIGIN = 'https://rc.kyosho.com';
  const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function getText(url) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (!res.ok) return '';
      return await res.text();
    } catch (e) {
      return '';
    }
  }

  function decodeEntities(s) {
    if (!s) return '';
    return s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  }

  function htmlToText(html) {
    if (!html) return '';
    let t = html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    t = decodeEntities(t);
    t = t.replace(/[ \t　]+/g, ' ')
         .replace(/ *\n */g, '\n')
         .replace(/\n{3,}/g, '\n\n')
         .trim();
    return t;
  }

  // canonicalize any product-tile href to /en/<sku>.html (category-path URLs
  // like /en/discontinued/dis-rcplane/56578bk.html resolve to /en/56578bk.html)
  function canonicalProduct(href) {
    try {
      const u = new URL(href, ORIGIN);
      if (u.hostname !== 'rc.kyosho.com') return null;
      const base = u.pathname.split('/').filter(Boolean).pop();
      if (!base || !/\.html$/i.test(base)) return null;
      return `${ORIGIN}/en/${base}`;
    } catch (e) {
      return null;
    }
  }

  // ---- 1. Crawl airplane categories (BFS, one level of subcategories) ----
  const seeds = [
    `${ORIGIN}/en/rcplane.html`,
    `${ORIGIN}/en/discontinued/dis-rcplane.html`,
  ];
  const catQueue = [...seeds];
  const seenCat = new Set(seeds);
  const productSet = new Set(); // canonical product urls
  const MAX_CATEGORIES = 40;
  let catCount = 0;

  while (catQueue.length && catCount < MAX_CATEGORIES) {
    const catUrl = catQueue.shift();
    catCount++;
    const html = await getText(catUrl);
    if (!html) continue;

    // product tiles: <a href="..." class="... product-item-link">
    const prodRe = /<a\s+[^>]*href="([^"]+)"[^>]*class="[^"]*product-item-link[^"]*"/gi;
    let m;
    while ((m = prodRe.exec(html)) !== null) {
      const c = canonicalProduct(m[1]);
      if (c) productSet.add(c);
    }

    // subcategory links under the same airplane path, non-numeric leaf slug
    const catRe = /href="(https:\/\/rc\.kyosho\.com\/en\/(?:discontinued\/dis-rcplane|rcplane)\/([a-z][a-z0-9_-]*)\.html)"/gi;
    while ((m = catRe.exec(html)) !== null) {
      const sub = m[1];
      const slug = m[2];
      // slug starting with a letter => subcategory (products start with a digit)
      if (!/^\d/.test(slug) && !seenCat.has(sub)) {
        seenCat.add(sub);
        catQueue.push(sub);
      }
    }
    await sleep(120);
  }

  // ---- 2. Fetch each product page, parse JSON-LD ----
  const productUrls = Array.from(productSet).slice(0, 150);
  const out = [];

  for (const url of productUrls) {
    const html = await getText(url);
    await sleep(120);
    if (!html) continue;

    // collect all JSON-LD blocks, pick the Product node
    let prod = null;
    const ldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let lm;
    while ((lm = ldRe.exec(html)) !== null && !prod) {
      let data;
      try { data = JSON.parse(lm[1].trim()); } catch (e) { continue; }
      const nodes = [];
      const collect = (d) => {
        if (!d) return;
        if (Array.isArray(d)) { d.forEach(collect); return; }
        if (typeof d === 'object') {
          if (d['@graph']) collect(d['@graph']);
          nodes.push(d);
        }
      };
      collect(data);
      for (const n of nodes) {
        const t = n['@type'];
        const isProd = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
        if (isProd) { prod = n; break; }
      }
    }

    // meta fallbacks
    const metaOG = (prop) => {
      const r = new RegExp('<meta[^>]+property="og:' + prop + '"[^>]+content="([^"]*)"', 'i');
      const mm = html.match(r);
      return mm ? decodeEntities(mm[1]) : '';
    };

    let title = (prod && prod.name) ? String(prod.name).trim() : metaOG('title');
    title = title.replace(/\s*-\s*KYOSHO RC\s*$/i, '').trim();
    if (!title) continue;

    let bodyText = '';
    if (prod && prod.description) bodyText = htmlToText(String(prod.description));
    if (!bodyText) bodyText = htmlToText(metaOG('description'));

    // images: prefer Magento fotorama gallery, then JSON-LD image, then og:image
    const imageUrls = [];
    const gm = html.match(/"data"\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])\s*,\s*"options"/);
    if (gm) {
      try {
        const arr = JSON.parse(gm[1]);
        for (const e of arr) {
          const src = e.full || e.img || e.thumb;
          if (src && !imageUrls.includes(src)) imageUrls.push(src);
        }
      } catch (e) { /* ignore */ }
    }
    if (imageUrls.length === 0 && prod && prod.image) {
      const imgs = Array.isArray(prod.image) ? prod.image : [prod.image];
      for (const i of imgs) if (i && !imageUrls.includes(i)) imageUrls.push(String(i));
    }
    if (imageUrls.length === 0) {
      const og = metaOG('image');
      if (og) imageUrls.push(og);
    }

    const canonUrl = (prod && prod.url) ? String(prod.url) : url;
    const sku = (prod && prod.sku) ? String(prod.sku) : null;
    const extId = sku || canonUrl;

    out.push({
      ext_id: extId,
      title,
      url: canonUrl,
      body_text: bodyText,
      image_urls: imageUrls,
    });
  }

  return out;
}
export default fetchProducts
