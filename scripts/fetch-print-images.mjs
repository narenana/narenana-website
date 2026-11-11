// Fetches each curated 3D print's preview picture from the designer's own page (its og:image) and
// keeps it as a master under assets-src/, so the landing page can show it beside the credit:
//   node scripts/fetch-print-images.mjs content/nanawing/chupito-simulator.json
// Writes, per print: an `id` (mw-<model> or tv-<thing>), the source `image` URL (the weekly check in
// src/prints-live.js tests it) and the master file assets-src/nanawing/<aircraft>/prints/<id>.<ext>.
// The picture is the designer's; the page credits them and links their page beside it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const contentPath = process.argv[2] || 'content/nanawing/chupito-simulator.json';
const copy = JSON.parse(readFileSync(contentPath, 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const dir = `assets-src/nanawing/${copy.aircraft}/prints`;
mkdirSync(dir, { recursive: true });

export const printId = (href) => {
  const mw = href.match(/makerworld\.com\/[a-z-]+\/models\/(\d+)/);
  if (mw) return `mw-${mw[1]}`;
  const tv = href.match(/thingiverse\.com\/thing:(\d+)/);
  if (tv) return `tv-${tv[1]}`;
  throw new Error(`no id for ${href}`);
};
const decode = (s) => s.replace(/&amp;/g, '&');
// curl, not Node's fetch: both model sites answer Node's fetch with a 403 bot check, but serve curl.
const get = (url) => execFileSync('curl', ['-sSL', '-m', '40', '-A', UA, '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 });
const split = (buf) => { const i = buf.lastIndexOf(10); return { status: Number(buf.subarray(i + 1).toString()), body: buf.subarray(0, i) }; };

let failed = 0;
for (const p of copy.prints.groups.flatMap((g) => g.items)) {
  p.id = printId(p.href);
  if (p.master && existsSync(p.master) && !process.argv.includes('--refresh')) continue; // keep what we have; --refresh fetches again
  try {
    const page = split(get(p.href));
    if (page.status !== 200) throw new Error(`page ${page.status}`);
    const html = page.body.toString('utf8');
    const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1];
    if (!og) throw new Error('no og:image');
    const image = decode(og);
    if (/ThingiverseOpenGraph|\/site\/img\//.test(image)) throw new Error('site default picture (the print may be gone)');
    const res = split(get(image));
    if (res.status !== 200) throw new Error(`image ${res.status}`);
    const buf = res.body;
    const meta = await sharp(buf).metadata(); // throws if it isn't an image
    const file = `${dir}/${p.id}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`;
    writeFileSync(file, buf);
    p.image = image;
    p.master = file;
    console.log(`ok   ${p.id} ${meta.width}x${meta.height} ${p.title}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${p.id} ${p.title}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 6000)); // be gentle: MakerWorld answers a burst with a bot check
}
writeFileSync(contentPath, JSON.stringify(copy, null, 2) + '\n');
console.log(failed ? `${failed} print(s) without a picture` : 'every print has a picture');
