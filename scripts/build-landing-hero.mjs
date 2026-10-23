// Composes a landing page's hero from a backdrop master and the sim's own render of the aircraft
// (the render is accurate to the real wing; generated art is not), then writes the site sizes:
//   node scripts/build-landing-hero.mjs content/nanawing/chupito-simulator.json
// Reads hero.image.source: { background (a master under assets-src/), aircraft (the render with
// alpha), desktop: { x, y, w } and phone: { x, y, w } as fractions of the canvas }, and writes
// site/assets/nanawing/<file>-<w>.webp for hero.image.widths (2:1) and the phone crop (3:4).
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const copy = JSON.parse(readFileSync(process.argv[2] || 'content/nanawing/chupito-simulator.json', 'utf8'));
const img = copy.hero.image;
const src = img.source;
if (!src) throw new Error('hero.image.source is missing');
for (const f of [src.background, src.aircraft]) if (!existsSync(f)) throw new Error(`missing ${f}`);

async function compose(width, height, place, outFile) {
  const bg = await sharp(src.background).resize(width, height, { fit: 'cover', position: place.position || 'centre' }).toBuffer();
  const wing = await sharp(src.aircraft).resize({ width: Math.round(width * place.w) }).png().toBuffer();
  const meta = await sharp(wing).metadata();
  // A soft shadow under the wing seats it in the scene.
  const shadow = await sharp(wing).blur(40).modulate({ brightness: 0.2 }).ensureAlpha(0.38).toBuffer();
  const left = Math.round(width * place.x), top = Math.round(height * place.y);
  const out = await sharp(bg).composite([
    { input: shadow, left: left + Math.round(meta.width * 0.04), top: top + Math.round(meta.height * 0.2) },
    { input: wing, left, top },
  ]).webp({ quality: 82 }).toBuffer();
  await sharp(out).toFile(outFile);
  return outFile;
}

const widest = Math.max(...img.widths);
const master = await compose(widest, widest / 2, src.desktop, `site/assets/nanawing/${img.file}-${widest}.webp`);
for (const w of img.widths.filter((w) => w !== widest)) {
  await sharp(master).resize({ width: w }).webp({ quality: 82 }).toFile(`site/assets/nanawing/${img.file}-${w}.webp`);
}
if (img.phone) {
  const pw = Math.max(...img.phone.widths);
  await compose(pw, Math.round(pw * 4 / 3), src.phone, `site/assets/nanawing/${img.phone.file}-${pw}.webp`);
}
console.log(`wrote hero: ${img.widths.join('/')} and phone ${img.phone?.widths.join('/') ?? 'none'}`);
