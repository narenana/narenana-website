// One-off asset generator (run manually, NOT part of the deploy).
//
//   npm install            # sharp + png-to-ico are devDependencies
//   node scripts/gen-assets.mjs
//
// Hand-authored SOURCE masters live in ../assets-src/ (versioned, NOT deployed):
//   - icon-master.png   crisp, full-bleed square brand mark
//   - hero-master.png   16:9 hero / social photo
//
// Produces, under site/assets/ (+ site/favicon.ico):
//   - favicon.ico              multi-res 16/32/48 from icon-master
//   - icon-192.png / -512.png  PWA manifest icons (full-bleed) from icon-master
//   - icon-maskable-512.png    Android adaptive icon — glyph in the 80% safe zone
//   - apple-touch-icon.png     180px iOS home-screen icon
//   - avatar.jpg               512px logo (rel=icon jpeg + JSON-LD logo)
//   - banner.jpg               1600x900 hero (og:image / twitter:image fallback)
//   - banner-800/-1600 .webp/.avif   responsive hero variants
//   - shot-log-viewer / shot-nanawing .webp/.avif   right-sized card screenshots
//
// The shot-*.jpg screenshots are hand-placed sources (kept as <img> fallbacks);
// everything else is regenerated from the masters. Re-run after changing a
// source and commit the regenerated output.

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ASSETS = new URL('../site/assets/', import.meta.url)
const SITE = new URL('../site/', import.meta.url)
const SRC = new URL('../assets-src/', import.meta.url)
const a = (name) => fileURLToPath(new URL(name, ASSETS))
const site = (name) => fileURLToPath(new URL(name, SITE))
const src = (name) => fileURLToPath(new URL(name, SRC))

async function icons() {
  const MASTER = src('icon-master.png')

  // Sample the master's top-left corner (clean background) so the maskable
  // padding matches exactly — no seam ring around the safe-zone glyph.
  const { data: corner } = await sharp(MASTER)
    .extract({ left: 0, top: 0, width: 16, height: 16 })
    .resize(1, 1)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bg = { r: corner[0], g: corner[1], b: corner[2] }

  // Full-bleed PWA icons, straight from the master.
  await sharp(MASTER).resize(512, 512, { fit: 'cover' }).png().toFile(a('icon-512.png'))
  await sharp(MASTER).resize(192, 192, { fit: 'cover' }).png().toFile(a('icon-192.png'))

  // iOS home-screen icon — 180px, full-bleed (iOS applies its own rounding).
  await sharp(MASTER).resize(180, 180, { fit: 'cover' }).png().toFile(a('apple-touch-icon.png'))

  // Maskable icon — glyph scaled into the ~72% safe zone with the background
  // bled to the edges, so Android's adaptive-icon mask can't clip the aircraft.
  const inner = Math.round(512 * 0.72)
  const pad = Math.round((512 - inner) / 2)
  const glyph = await sharp(MASTER).resize(inner, inner, { fit: 'cover' }).png().toBuffer()
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([{ input: glyph, top: pad, left: pad }])
    .png()
    .toFile(a('icon-maskable-512.png'))

  // Multi-res .ico for legacy / browser-tab favicons.
  const icoSizes = [16, 32, 48]
  const pngBufs = await Promise.all(
    icoSizes.map((s) => sharp(MASTER).resize(s, s, { fit: 'cover' }).png().toBuffer()),
  )
  await writeFile(site('favicon.ico'), await pngToIco(pngBufs))

  // avatar.jpg (rel=icon jpeg + Organization JSON-LD logo) — high quality, no
  // chroma subsampling so the hard edges stay clean.
  await sharp(MASTER)
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(a('avatar.jpg'))

  console.log('icons: favicon.ico, icon-192, icon-512, icon-maskable-512, apple-touch-icon, avatar.jpg')
}

async function hero() {
  // 1600x900 JPEG fallback for the hero <picture> + og:image / twitter:image.
  await sharp(src('hero-master.png'))
    .resize(1600, 900, { fit: 'cover' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(a('banner.jpg'))
  console.log('hero: banner.jpg')
}

async function variants(name, widths, { webpQ = 80, avifQ = 52 } = {}) {
  const stem = name.replace(/\.[^.]+$/, '')
  for (const w of widths) {
    const suffix = widths.length > 1 ? `-${w}` : ''
    await sharp(a(name)).resize({ width: w }).webp({ quality: webpQ }).toFile(a(`${stem}${suffix}.webp`))
    await sharp(a(name)).resize({ width: w }).avif({ quality: avifQ, effort: 4 }).toFile(a(`${stem}${suffix}.avif`))
    console.log(`variants: ${stem}${suffix}.{webp,avif}`)
  }
}

await icons()
await hero()
// Hero: full-width, responsive — 800 for phones, 1600 for desktop/retina.
await variants('banner.jpg', [800, 1600])
// Card screenshots: shown small & lazy — a single right-sized width is plenty.
await variants('shot-log-viewer.jpg', [960])
await variants('shot-nanawing.jpg', [960])
console.log('done')
