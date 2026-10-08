// Code-native social card using the existing simulator render; no remote assets.
// Run from the repo root: node scripts/build-aircraft-social-card.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

const { social } = JSON.parse(readFileSync('content/nanawing/aircraft.json', 'utf8'));
const text = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const card = social.card;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#087bc1"/><stop offset="1" stop-color="#063958"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#sky)"/>
  <path d="M700 0H1200V580H360Z" fill="#ffffff" opacity=".04"/>
  <path d="M850 0H1200V580H530Z" fill="#ffffff" opacity=".04"/>
  <text x="62" y="65" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="3">${text(card.eyebrow)}</text>
  <text x="58" y="155" fill="#fff" font-family="Arial,sans-serif" font-size="68" font-weight="700" letter-spacing="-3">${text(card.headline)}</text>
  <rect x="62" y="195" width="60" height="5" fill="#f2c200"/>
  <text x="62" y="255" fill="#fff" font-family="Arial,sans-serif" font-size="33" font-weight="700">${text(card.aircraft)}</text>
  <text x="62" y="325" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="26">${text(card.details[0])}</text>
  <text x="62" y="362" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="26">${text(card.details[1])}</text>
  <rect x="62" y="416" width="340" height="58" rx="4" fill="#ff8500"/>
  <text x="85" y="453" fill="#15191c" font-family="Arial,sans-serif" font-size="24" font-weight="700">${text(card.cta)}</text>
</svg>`);
const wing = await sharp('site/assets/nanawing/aircraft/spectre-1400.webp').resize({ width: 730 }).png().toBuffer();
const footer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect y="580" width="1200" height="50" fill="#063958"/>
  <text x="62" y="611" fill="#d3ebfa" font-family="Arial,sans-serif" font-size="17">${text(card.credit)}</text>
  <text x="1138" y="611" text-anchor="end" fill="#fff" font-family="Arial,sans-serif" font-size="21" font-weight="700">narenana<tspan fill="#ff8500">.</tspan></text>
</svg>`);
const output = `site${social.image}`;
mkdirSync(dirname(output), { recursive: true });
await sharp(background).composite([
  { input: wing, left: 445, top: 170 },
  { input: footer, left: 0, top: 0 },
]).jpeg({ quality: 92, mozjpeg: true }).toFile(output);
console.log(`wrote ${output} (1200×630)`);
