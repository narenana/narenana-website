async function fetchProducts() {
  const BASE = 'https://pilot-rc.com';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getJSON(url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  }

  // --- HTML entity decode (numeric + common named) ---
  const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
    ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
    rdquo: '”', ldquo: '“', deg: '°', trade: '™',
    reg: '®', copy: '©', eacute: 'é', prime: '′', Prime: '″',
  };
  function decodeEntities(s) {
    if (!s) return '';
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (n in NAMED ? NAMED[n] : m));
  }
  function stripHtml(html) {
    if (!html) return '';
    let t = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|br|h[1-6]|tr|table)>/gi, '\n')
      .replace(/<br\s*\/?>(?=)/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    t = decodeEntities(t);
    return t.replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function abs(u) {
    if (!u) return null;
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE + u;
    return u;
  }
  // collapse WP resize suffix "-1024x768" so size variants of one master dedupe
  function imgKey(u) {
    return u.replace(/-\d+x\d+(?=\.(jpe?g|png|webp|gif)(\?|$))/i, '');
  }
  function extractImages(html, ogImages) {
    const out = [];
    const seen = new Set();
    const push = raw => {
      const a = abs(raw);
      if (!a || !/^https?:\/\//i.test(a)) return;
      if (/\.svg(\?|$)/i.test(a)) return;
      const k = imgKey(a);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(a);
    };
    for (const og of ogImages || []) if (og && og.url) push(og.url);
    if (html) {
      for (const m of html.matchAll(/<img[^>]+?src=["']([^"']+)["']/gi)) push(m[1]);
    }
    return out.slice(0, 20);
  }

  // --- 1) category tree -> which category ids are airplanes ---
  const cats = await getJSON(`${BASE}/wp-json/wp/v2/categories?per_page=100&_fields=id,slug,parent`);
  const byId = Object.fromEntries(cats.map(c => [c.id, c]));
  const PLANE_ROOTS = new Set([4 /*acrobatic*/, 29 /*jets*/, 196 /*warbirds*/, 38 /*sport-scale*/, 8 /*prop-plane-sizes*/]);
  const DISCONTINUED = 62;
  function isPlaneCat(id) {
    let x = byId[id], guard = 0;
    while (x && guard++ < 20) {
      if (PLANE_ROOTS.has(x.id)) return true;
      x = byId[x.parent];
    }
    return false;
  }
  const planeCatIds = new Set(cats.filter(c => isPlaneCat(c.id)).map(c => c.id));

  // slugs/titles that look like PARTS even when filed under "discontinued"
  const PART_RE = /(servo|electrovalve|pneumatic-valve|alu-arm|-\d+ah\b|-\d+al\b|-\d+kg\b|\bkg\b|auto-start|retract|standoff|voltage|regulator|wingbag|wing-bag|fuselage-bag|suncover|sun-cover|neck-strap|t-shirt|jacket|apparel|fuel-(dot|bag|tank)|tank\b|prop\b|propell|hub|crash-kit|storage-rack|receiver|sbus|smoke-pump|electric-motor|motor\b|\besc\b|combo|manual)/i;

  // --- 2) pull all posts (paged) with full content ---
  const posts = [];
  for (let page = 1; page <= 6; page++) {
    let batch;
    try {
      batch = await getJSON(
        `${BASE}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,slug,link,title,content,categories,yoast_head_json`
      );
    } catch (e) {
      break; // page beyond range returns 400/empty
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    posts.push(...batch);
    if (batch.length < 100) break;
    await sleep(120);
  }

  // --- 3) classify + build ---
  const products = [];
  for (const p of posts) {
    const catIds = p.categories || [];
    const hasPlaneCat = catIds.some(c => planeCatIds.has(c));
    const slug = p.slug || (p.link || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
    const inDisc = catIds.includes(DISCONTINUED);
    const looksLikePart = PART_RE.test(slug);
    // plane if it sits in a plane category, or it's a discontinued item that
    // does NOT match the parts pattern (captures discontinued airframes)
    const isPlane = (hasPlaneCat && !looksLikePart) || (inDisc && !hasPlaneCat && !looksLikePart);
    if (!isPlane) continue;

    const html = p.content && p.content.rendered ? p.content.rendered : '';
    const title = decodeEntities((p.title && p.title.rendered ? p.title.rendered : '').trim());
    const body_text = stripHtml(html);
    const ogImgs = (p.yoast_head_json && p.yoast_head_json.og_image) || [];
    const image_urls = extractImages(html, ogImgs);
    if (!title) continue;
    products.push({
      ext_id: slug || String(p.id),
      title,
      url: p.link,
      body_text,
      image_urls,
    });
  }
  return products;
}
export default fetchProducts
