async function fetchProducts(options = {}) {
  const ORIGIN = 'https://www.multiplex-rc.de';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.text();
  }

  function decodeEntities(s) {
    if (!s) return '';
    const named = {
      auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',amp:'&',
      quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',laquo:'«',
      raquo:'»',ldquo:'“',rdquo:'”',bdquo:'„',lsquo:'‘',rsquo:'’',sbquo:'‚',
      hellip:'…',reg:'®',copy:'©',trade:'™',euro:'€',deg:'°',middot:'·',bull:'•',
      eacute:'é',egrave:'è',agrave:'à',ccedil:'ç',shy:'',
    };
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z]+);/g, (m, name) => (name in named ? named[name] : m));
  }
  const stripTags = (s) => (s || '').replace(/<[^>]*>/g, ' ');
  const plain = (s) => decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();

  // The storefront always double-quotes attributes and escapes inner quotes as
  // HTML entities, so matching content="([^"]*)" is safe (won't truncate on ').
  function metaContent(html, name) {
    const reA = new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]*?content="([^"]*)"', 'i');
    const reB = new RegExp('<meta[^>]+content="([^"]*)"[^>]*?name=["\']' + name + '["\']', 'i');
    const m = html.match(reA) || html.match(reB);
    return m ? m[1] : '';
  }

  // 1. Discover the German product-items sitemap via the sitemap index.
  const sitemapCandidates = [];
  try {
    const idx = await get(ORIGIN + '/sitemap.xml');
    const childLocs = [...idx.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map((m) => m[1].trim());
    for (const loc of childLocs) if (/sitemap-items-website-de\.xml/i.test(loc)) sitemapCandidates.push(loc);
    if (!sitemapCandidates.length) for (const loc of childLocs) if (/items/i.test(loc)) sitemapCandidates.push(loc);
  } catch (e) { /* fall through to hard fallback */ }
  if (!sitemapCandidates.length) sitemapCandidates.push(ORIGIN + '/userdata/sitemap-items-website-de.xml');

  let itemUrls = [];
  for (const sm of sitemapCandidates) {
    try {
      const xml = await get(sm);
      itemUrls.push(...[...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map((m) => m[1].trim()));
    } catch (e) { /* skip a bad child sitemap */ }
  }
  itemUrls = [...new Set(itemUrls)].filter((u) => /-p\d+\/?$/.test(u));

  // 2. Keep only complete flying models. The shop prefixes sellable models with
  //    rr- (receiver-ready), rtf- (ready-to-fly), bk-/kit- (Bausatz/kit),
  //    arf-/pnp-. Everything else in the item list is a spare part / accessory /
  //    servo / motor / battery, so we also drop any slug carrying a part word.
  const slugOf = (u) => { const m = u.match(/\/de\/(.*?)-p\d+\/?$/); return m ? m[1].toLowerCase() : u.toLowerCase(); };
  const MODEL_PREFIX = /^(rr|rtf|bk|kit|arf|pnp)-/i;
  const PART = /(tragflaech|flaechen|fluegel|rumpf|leitwerk|seitenruder|hoehenruder|hoehenleitwerk|querruder|kabinenhaube|\bhaube|klarsicht|dekor|aufkleber|servoset|kabelsatz|antriebssatz|\bantrieb\b|motorspant|motorhaube|motortraeger|kabinenrahmen|kleinteile|kunststoffteil|nasenleist|ersatz|o-ring|oring|arretierstift|ruderhorn|gestaenge|anlenkung|spinner|luftschraube|propeller|klappluftschraube|\bblatt\b|blaetter|\bakku|lipo|\bregler\b|zubehoer|\btasche|magnet|feder|\brad\b|raeder|radschuh|radverkleid|fahrwerk|spornrad|\bsporn\b|scharnier|verschluss|abdeckung|halter|\bclip\b|stecker|buchse|\bpin\b|mitnehmer|adapter|\bnase\b|winglet|wartungsklappe|verkleidung|strebe|streben|\bholm|\bkufe|kufen|hutzen|\brohr|\bstab\b|staeb|steckung|verstreb|\bfolie|kohlerohr|\bcfk\b|\bgfk\b|led-set|schwimmer|schleppkupplung|impellergondel|empfaenger|\brx-)/i;
  const productUrls = itemUrls.filter((u) => { const s = slugOf(u); return MODEL_PREFIX.test(s) && !PART.test(s); });

  // 3. Fetch each model page. Product data is server-rendered ONLY into <title>
  //    and <meta name="Description">; the page body, price and images are
  //    JS-injected client-side and not present for a plain fetch, so image_urls
  //    is always empty for this site.
  const MAX = 150;
  const allTargets = productUrls.slice(0, MAX);
  const offset = Math.max(0, options.offset || 0);
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : allTargets.length;
  const targets = allTargets.slice(offset, offset + limit);
  const out = [];
  for (let i = 0; i < targets.length; i++) {
    const url = targets[i];
    try {
      const html = await get(url);
      let rawTitle = plain((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
      rawTitle = rawTitle
        .replace(/\s*\|\s*Multiplex\s*\|\s*MULTIPLEX\s*$/i, '')
        .replace(/\s*\|\s*MULTIPLEX\s*$/i, '');
      const title = rawTitle.replace(/^\s*[0-9][0-9\-]*\s+/, '').trim() || rawTitle.trim();
      const body_text = plain(metaContent(html, '[Dd]escription'));
      const idm = url.match(/-p(\d+)\/?$/);
      const ext_id = idm ? 'p' + idm[1] : url;
      if (title) out.push({ ext_id, title, url, body_text, image_urls: [] });
    } catch (e) { /* skip individual page failure */ }
    if (i < targets.length - 1) await sleep(120);
  }
  out.total = allTargets.length;
  out.nextOffset = offset + targets.length;
  out.done = out.nextOffset >= allTargets.length;
  return out;
}
export default fetchProducts
