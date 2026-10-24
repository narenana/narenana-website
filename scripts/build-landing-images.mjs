// Writes a landing page's pictures in the site's sizes from their masters. It only resizes and
// encodes (owner, 24 Oct 2026: no image is composited or edited by script; Astra makes the hero
// and the log-viewer picture, the bundle photos are the seller's, the print pictures the
// designers'):
//   node scripts/build-landing-images.mjs content/nanawing/chupito-simulator.json
// Reads from the page's content:
//   hero.image.source.{master, phoneMaster} → site/assets/nanawing/<file>-<w>.webp (hero.image.widths)
//                                            and <phone.file>-<w>.webp (hero.image.phone.widths)
//   buy.variants[].image.master            → <aircraft>-bundle-<id>-{400,800}.webp
//   prints.groups[].items[].master         → <aircraft>-print-<id>-{400,800}.webp
//   fly.image.master                       → <fly.image.file>-<w>.webp (a real sim frame; outline by Astra)
//   logs.image.master                      → <logs.image.file>-<w>.webp (logs.image.widths)
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const copy = JSON.parse(readFileSync(process.argv[2] || 'content/nanawing/chupito-simulator.json', 'utf8'));
const OUT = 'site/assets/nanawing';
const encode = (from, w, to) => sharp(from).resize({ width: w, withoutEnlargement: true }).webp({ quality: 84 }).toFile(to);
const need = (f) => { if (!existsSync(f)) throw new Error(`missing ${f}`); return f; };
const wrote = [];

const hero = copy.hero.image;
if (hero?.source?.master) {
  for (const w of hero.widths) await encode(need(hero.source.master), w, `${OUT}/${hero.file}-${w}.webp`);
  if (hero.phone) for (const w of hero.phone.widths) await encode(need(hero.source.phoneMaster), w, `${OUT}/${hero.phone.file}-${w}.webp`);
  wrote.push(`hero ${hero.widths.join('/')}${hero.phone ? ` + phone ${hero.phone.widths.join('/')}` : ''}`);
}

const bundles = (copy.buy?.variants || []).filter((v) => v.image?.master);
for (const v of bundles) for (const w of [400, 800]) await encode(need(v.image.master), w, `${OUT}/${copy.aircraft}-bundle-${v.id}-${w}.webp`);
if (bundles.length) wrote.push(`${bundles.length} bundle pictures`);

const prints = (copy.prints?.groups || []).flatMap((g) => g.items).filter((p) => p.master && existsSync(p.master));
for (const p of prints) for (const w of [400, 800]) await encode(p.master, w, `${OUT}/${copy.aircraft}-print-${p.id}-${w}.webp`);
if (prints.length) wrote.push(`${prints.length} print pictures`);

const fly = copy.fly?.image;
if (fly?.master) {
  for (const w of fly.widths) await encode(need(fly.master), w, `${OUT}/${fly.file}-${w}.webp`);
  wrote.push(`sim frame ${fly.widths.join('/')}`);
}

const logs = copy.logs?.image;
if (logs?.master) {
  for (const w of logs.widths) await encode(need(logs.master), w, `${OUT}/${logs.file}-${w}.webp`);
  wrote.push(`log viewer ${logs.widths.join('/')}`);
}
console.log(`wrote ${wrote.join(', ')}`);
