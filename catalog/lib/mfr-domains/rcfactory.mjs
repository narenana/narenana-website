async function fetchProducts(options = {}) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const ORIGIN = 'https://www.rc-factory.eu';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function getText(url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml,text/xml' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.text();
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
      .replace(/&ldquo;|&rdquo;|&#822[01];/gi, '"')
      .replace(/&lsquo;|&rsquo;|&#821[67];/gi, "'")
      .replace(/&hellip;|&#8230;/gi, '...')
      .replace(/&ndash;|&#8211;/gi, '-')
      .replace(/&mdash;|&#8212;/gi, '-')
      .replace(/&deg;|&#176;/gi, ' deg ')
      .replace(/&eacute;/gi, 'e')
      .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ' '; } });
  }

  function htmlToText(html) {
    if (!html) return '';
    let s = html
      .replace(/\r\n?/g, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\s*(br|hr)\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|li|tr|h[1-6]|ul|ol)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/<[^>]*$/, ' '); // drop any dangling, unclosed trailing tag fragment
    s = decodeEntities(s);
    return s
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function abs(u) {
    if (!u) return null;
    if (u.startsWith('http')) return u;
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return ORIGIN + u;
    return ORIGIN + '/' + u;
  }

  // Read a <meta> content value for a given property/name key (handles either attr order).
  function metaContent(html, key) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\\\']' + k + '["\\\'][^>]*content=["\\\']([\\s\\S]*?)["\\\']', 'i'));
    if (m) return m[1];
    m = html.match(new RegExp('<meta[^>]+content=["\\\']([\\s\\S]*?)["\\\'][^>]*(?:property|name)=["\\\']' + k + '["\\\']', 'i'));
    return m ? m[1] : '';
  }

  // 1) Discover airplane product URLs from the sitemap.
  //    Airplanes live at /letadla/<series>/<product> (depth 3). Depth < 3 under
  //    /letadla is a category listing or the odd non-plane accessory.
  const sitemapXml = await getText(ORIGIN + '/sitemap.xml');
  const allLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const seen = new Set();
  const planeUrls = [];
  for (const loc of allLocs) {
    let p;
    try { p = new URL(loc); } catch { continue; }
    const segs = p.pathname.split('/').filter(Boolean);
    if (segs[0] === 'letadla' && segs.length >= 3) {
      const norm = ORIGIN + p.pathname;
      if (!seen.has(norm)) { seen.add(norm); planeUrls.push(norm); }
    }
  }

  const MAX = 150;
  const allTargets = planeUrls.slice(0, MAX);
  const offset = Math.max(0, options.offset || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : allTargets.length;
  const targets = allTargets.slice(offset, offset + limit);
  const products = [];

  for (let i = 0; i < targets.length; i++) {
    const url = targets[i];
    let html;
    try { html = await getText(url); }
    catch { await sleep(120); continue; }

    // Only treat as a real product page.
    if (!/id=["']product-info["']/.test(html) && !/id=["']product-detail["']/.test(html)) {
      await sleep(120); continue;
    }

    // title
    let title = '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = decodeEntities(h1[1].replace(/<[^>]+>/g, '')).trim();
    if (!title) title = decodeEntities(metaContent(html, 'og:title')).replace(/\s*-\s*RC Factory\s*$/i, '').trim();

    // canonical url
    const ogUrl = decodeEntities(metaContent(html, 'og:url')).trim() || url;

    // description: the active details tab-pane, from id="details" up to the
    // accessories / related-products block (or trailing inline <script>).
    let bodyHtml = '';
    const dStart = html.search(/id=["']details["']/i);
    if (dStart !== -1) {
      const gt = html.indexOf('>', dStart);
      const after = html.slice(gt !== -1 ? gt + 1 : dStart);
      const dEnd = after.search(/<div[^>]*id=["']product-category["']|<div[^>]*class=["']product-list|<script/i);
      bodyHtml = dEnd !== -1 ? after.slice(0, dEnd) : after.slice(0, 8000);
    }
    let body_text = htmlToText(bodyHtml);
    if (!body_text || body_text.length < 20) {
      body_text = decodeEntities(metaContent(html, 'og:description')).replace(/\s*(?:…|\.\.\.)\s*$/, '').trim();
    }

    // images: main cover + gallery data-full-image (full resolution), deduped
    const imgs = [];
    const cover = html.match(/class=["']product-cover[^"']*["'][\s\S]*?href=["']([^"']+)["']/i);
    if (cover) { const a = abs(cover[1]); if (a) imgs.push(a); }
    for (const m of html.matchAll(/data-full-image=["']([^"']+)["']/gi)) {
      const a = abs(m[1]); if (a) imgs.push(a);
    }
    if (imgs.length === 0) {
      const og = abs(decodeEntities(metaContent(html, 'og:image')).trim());
      if (og) imgs.push(og);
    }
    const image_urls = [...new Set(imgs)];

    // ext_id: SKU if present, else the URL handle
    let ext_id = '';
    const sku = html.match(/id=["']sku["'][^>]*>([\s\S]*?)<\/span>/i);
    if (sku) ext_id = decodeEntities(sku[1].replace(/<[^>]+>/g, '')).trim();
    if (!ext_id) ext_id = new URL(ogUrl).pathname.split('/').filter(Boolean).pop();

    if (title) products.push({ ext_id, title, url: ogUrl, body_text, image_urls });
    await sleep(120);
  }

  products.total = allTargets.length;
  products.nextOffset = offset + targets.length;
  products.done = products.nextOffset >= allTargets.length;
  return products;
}
export default fetchProducts
