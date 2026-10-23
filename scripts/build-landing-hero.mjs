// Writes a landing page's hero pictures in the site's sizes from the masters Astra made
// (owner, 24 Oct 2026: nothing is composited here; this only resizes and encodes):
//   node scripts/build-landing-hero.mjs content/nanawing/chupito-simulator.json
// Reads hero.image.source: { master (the wide picture), phoneMaster (the square crop) } under
// assets-src/, and writes site/assets/nanawing/<file>-<w>.webp for hero.image.widths and
// <phone.file>-<w>.webp for hero.image.phone.widths.
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const copy = JSON.parse(readFileSync(process.argv[2] || 'content/nanawing/chupito-simulator.json', 'utf8'));
const img = copy.hero.image;
const src = img.source;
if (!src?.master) throw new Error('hero.image.source.master is missing');
if (img.phone && !src.phoneMaster) throw new Error('hero.image.source.phoneMaster is missing');
for (const f of [src.master, src.phoneMaster].filter(Boolean)) if (!existsSync(f)) throw new Error(`missing ${f}`);

const encode = (from, w, to) => sharp(from).resize({ width: w, withoutEnlargement: true }).webp({ quality: 84 }).toFile(to);
const master = await sharp(src.master).metadata();
for (const w of img.widths) await encode(src.master, w, `site/assets/nanawing/${img.file}-${w}.webp`);
if (img.phone) for (const w of img.phone.widths) await encode(src.phoneMaster, w, `site/assets/nanawing/${img.phone.file}-${w}.webp`);
console.log(`wrote hero ${img.widths.join('/')} from a ${master.width}×${master.height} master${img.phone ? ` and phone ${img.phone.widths.join('/')}` : ''}`);
