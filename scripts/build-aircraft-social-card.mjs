// Code-native social card using the existing simulator render; no remote assets.
// Run from the repo root: node scripts/build-aircraft-social-card.mjs [content/nanawing/<page>.json]
// The page's social.card gives the words and, for an aircraft landing page, its render (card.image).
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

const { social } = JSON.parse(readFileSync(process.argv[2] || 'content/nanawing/aircraft.json', 'utf8'));
const text = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const card = social.card;
// A photographic backdrop (card.background, a master under assets-src/) sits under a left-to-right
// darkening so the words stay legible; without one, the blue gradient.
const photo = card.background && existsSync(card.background)
  ? await sharp(card.background).resize(1200, 630, { fit: 'cover', position: 'entropy' }).png().toBuffer()
  : null;
// card.aircraft may be one line or several (a narrow column clears an aircraft already in the
// backdrop); the details and the button follow it down. One line keeps the original layout.
const sub = [].concat(card.aircraft);
// card.headline may be one line (68px, the original layout) or two (60px, so a long headline
// keeps its full words); everything under it moves down with it.
const head = [].concat(card.headline);
const headSize = head.length > 1 ? 60 : 68;
const headY = (i) => (head.length > 1 ? 132 + i * 66 : 155);
const barY = head.length > 1 ? headY(head.length - 1) + 28 : 195;
const subTop = barY + 60;
const detailsTop = subTop + 70 + (sub.length - 1) * 40;
const ctaTop = detailsTop + (card.details.length - 1) * 37 + 54;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#087bc1"/><stop offset="1" stop-color="#063958"/></linearGradient>
  <linearGradient id="shade" x2="1" y2="0"><stop stop-color="#08141e" stop-opacity=".82"/><stop offset=".55" stop-color="#08141e" stop-opacity=".55"/><stop offset="1" stop-color="#08141e" stop-opacity=".1"/></linearGradient></defs>
  <rect width="1200" height="630" fill="${photo ? 'url(#shade)' : 'url(#sky)'}"/>
  <path d="M700 0H1200V580H360Z" fill="#ffffff" opacity="${photo ? 0 : 0.04}"/>
  <path d="M850 0H1200V580H530Z" fill="#ffffff" opacity="${photo ? 0 : 0.04}"/>
  <text x="62" y="65" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${text(card.eyebrow)}</text>
  ${head.map((line, i) => `<text x="58" y="${headY(i)}" fill="#fff" font-family="Arial,sans-serif" font-size="${headSize}" font-weight="700" letter-spacing="-3">${text(line)}</text>`).join('')}
  <rect x="62" y="${barY}" width="60" height="5" fill="#f2c200"/>
  ${sub.map((line, i) => `<text x="62" y="${subTop + i * 40}" fill="#fff" font-family="Arial,sans-serif" font-size="33" font-weight="700">${text(line)}</text>`).join('')}
  ${card.details.map((line, i) => `<text x="62" y="${detailsTop + i * 37}" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="26">${text(line)}</text>`).join('')}
  <rect x="62" y="${ctaTop}" width="340" height="58" rx="4" fill="#ff8500"/>
  <text x="85" y="${ctaTop + 37}" fill="#15191c" font-family="Arial,sans-serif" font-size="24" font-weight="700">${text(card.cta)}</text>
</svg>`);
// card.place puts the render where it clears the words (the Chupito's photo card: scratch cardfit search, 24 Oct 2026).
const place = { left: 445, top: 170, width: 730, ...(card.place || {}) };
// card.imageInBackground: the backdrop already carries the aircraft (made by Astra), so no render is laid over it.
const wing = card.imageInBackground ? null : await sharp(card.image || 'site/assets/nanawing/aircraft/spectre-1400.webp').resize({ width: place.width }).png().toBuffer();
const footer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect y="580" width="1200" height="50" fill="#063958"/>
  <text x="62" y="611" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="17">${text(card.credit)}</text>
  <text x="1138" y="611" text-anchor="end" fill="#fff" font-family="Arial,sans-serif" font-size="21" font-weight="700">narenana<tspan fill="#ff8500">.</tspan></text>
</svg>`);
const output = `site${social.image}`;
mkdirSync(dirname(output), { recursive: true });
const layers = [
  ...(photo ? [{ input: background, left: 0, top: 0 }] : []),
  ...(wing ? [{ input: wing, left: place.left, top: place.top }] : []),
  { input: footer, left: 0, top: 0 },
];
await sharp(photo ?? background).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toFile(output);
console.log(`wrote ${output} (1200×630)`);
