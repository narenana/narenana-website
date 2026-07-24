async function fetchProducts(options = {}) {
  const BASE = 'https://seagullmodels.com/';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const MAX_FETCH = 250;          // safety cap on product-page fetches (current airplane count ~227)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const abs = (u) => {
    if (!u) return null;
    u = u.trim();
    if (u.startsWith('//')) return 'https:' + u;
    if (/^https?:\/\//i.test(u)) return u.replace(/^http:\/\//i, 'https://');
    return BASE + u.replace(/^\//, '');
  };

  const decode = (s) => s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/gi, ' ');

  const strip = (h) => decode(
    h.replace(/<script[\s\S]*?<\/script>/gi, '')
     .replace(/<style[\s\S]*?<\/style>/gi, '')
     .replace(/<br\s*\/?>/gi, '\n')
     .replace(/<\/(p|div|li|tr|h[1-6]|article)>/gi, '\n')
     .replace(/<[^>]+>/g, '')
  ).replace(/ /g, ' ')
   .replace(/[ \t]+/g, ' ')
   .replace(/ *\n */g, '\n')
   .replace(/\n{3,}/g, '\n\n')
   .replace(/^\s+|\s+$/g, '');

  const meta = (html, prop) => {
    let m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'));
    if (m) return decode(m[1]).trim();
    m = html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i'));
    return m ? decode(m[1]).trim() : null;
  };

  const get = (url, opts = {}) => fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
      ...(opts.headers || {}),
    },
    body: opts.body,
    signal: AbortSignal.timeout(15000),
  });

  const looksBlocked = (t) => /Just a moment|Checking your browser|cf-browser-verification|Attention Required|challenge-platform/i.test(t);

  // ---- 1. Enumerate the whole catalog via the site's Load-more RPC (Handler.ashx) ----
  // The category "Load more" button POSTs a SQL WhereClause to Handler.ashx and gets
  // back an HTML grid fragment (JSON .Data). WhereClause=1=1 returns every product.
  const rpc = async (pageIndex, pageSize) => {
    const params = new URLSearchParams({
      ClassPath: 'Main.BL.ProductBL',
      MethodName: 'ProductSearchByAjax',
      SelectClause: '',
      WhereClause: '1=1',
      SortClause: ' [TopLevel] DESC ',
      PageSize: String(pageSize),
      PageIndex: String(pageIndex),
      Parameter: 'grid',
    });
    const res = await get(BASE + 'Handler.ashx', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': BASE + 'gas-power-scale.html',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: params.toString(),
    });
    const txt = await res.text();
    if (looksBlocked(txt)) throw Object.assign(new Error('blocked'), { blocked: true });
    try { return (JSON.parse(txt).Data) || ''; } catch { return ''; }
  };

  // Parse a listing HTML fragment into {href,title,thumb} rows (split by product block).
  const parseListing = (data) => {
    const rows = [];
    const blocks = data.split(/<div class="Home-Product/i).slice(1);
    for (const b of blocks) {
      const href = (b.match(/href="([^"]+\.html)"/i) || [])[1];
      if (!href) continue;
      const title = decode(((b.match(/<a[^>]+title="([^"]*)"/i) || [])[1] || '')).trim();
      const thumb = (b.match(/<img[^>]+src="([^"]+)"/i) || [])[1];
      rows.push({ href, title, thumb: thumb ? abs(thumb) : null });
    }
    return rows;
  };

  const seen = new Map();
  let listing = await rpc(1, 1000);         // single big page returns the full catalog
  for (const r of parseListing(listing)) if (!seen.has(r.href)) seen.set(r.href, r);
  if (seen.size < 50) {                      // fallback: page through in small chunks
    for (let p = 1; p <= 40; p++) {
      const rs = parseListing(await rpc(p, 24));
      if (!rs.length) break;
      let added = 0;
      for (const r of rs) if (!seen.has(r.href)) { seen.set(r.href, r); added++; }
      if (added === 0 && p > 1) break;
      await sleep(120);
    }
  }
  let rows = [...seen.values()];

  // ---- Keep RC AIRPLANES: everything except the "accessories*" categories ----
  const planes = rows.filter((r) => !/^accessories/i.test(r.href));

  // Round-robin interleave by category so that, if MAX_FETCH ever binds, every
  // category (incl. the small electric ones) still gets description coverage.
  const buckets = new Map();
  for (const r of planes) {
    const c = r.href.split('/')[0];
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c).push(r);
  }
  const ordered = [];
  const lists = [...buckets.values()];
  for (let i = 0; ordered.length < planes.length; i++) {
    for (const l of lists) if (i < l.length) ordered.push(l[i]);
  }

  // ---- 2. Fetch each product page for full description + full-size images (bounded) ----
  const offset = Math.max(0, options.offset || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : ordered.length;
  const targets = ordered.slice(offset, offset + limit);
  const out = [];
  let fetches = 0;
  for (const r of targets) {
    const url = abs(r.href);
    const idm = r.href.match(/-(\d+)\.html$/);
    const ext_id = idm ? 'sea-' + idm[1] : r.href;
    let title = r.title || '';
    let body_text = '';
    let image_urls = [];

    if (fetches < MAX_FETCH) {
      fetches++;
      try {
        const res = await get(url);
        const html = await res.text();
        if (looksBlocked(html)) throw Object.assign(new Error('blocked'), { blocked: true });
        if (!title) {
          const og = meta(html, 'og:title') || '';
          title = og.replace(/\s*-\s*Seagull\s*Models?\s*$/i, '').replace(/,\s*[^,]*$/, '').trim();
        }
        const cm = html.match(/<article[^>]*id=["']Context["'][^>]*>([\s\S]*?)<\/article>/i);
        if (cm) body_text = strip(cm[1]);
        if (!body_text) body_text = meta(html, 'og:description') || '';
        let imgs = [...html.matchAll(/data-zoom-image=["']([^"']+)["']/gi)].map((m) => abs(m[1]));
        if (!imgs.length) {
          const og = meta(html, 'og:image');
          if (og) imgs = [abs(og)];
        }
        image_urls = [...new Set(imgs.filter(Boolean))];
        await sleep(120);
      } catch (e) {
        if (e && e.blocked) throw e;         // real CF challenge -> bubble up
        // transient network/parse error -> fall back to listing-only fields
      }
    }
    if (!image_urls.length && r.thumb) image_urls = [r.thumb];
    if (title || body_text || image_urls.length) {
      out.push({ ext_id, title, url, body_text, image_urls });
    }
  }
  out.total = ordered.length;
  out.nextOffset = offset + targets.length;
  out.done = out.nextOffset >= ordered.length;
  return out;
}
export default fetchProducts
