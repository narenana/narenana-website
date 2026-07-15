// One-off asset generator (run manually, NOT part of the deploy).
//
//   npm install            # sharp + png-to-ico are devDependencies
//   node scripts/gen-assets.mjs
//
// Produces, under site/assets/ (+ site/favicon.ico):
//   - favicon.ico            multi-res 16/32/48 from avatar.jpg
//   - icon-192.png / -512.png  PWA manifest icons from avatar.jpg
//   - banner-800/-1600 .webp/.avif   responsive hero variants of banner.jpg
//   - shot-log-viewer / shot-nanawing .webp/.avif   right-sized card screenshots
//
// The JPEG originals are kept as <img> fallbacks; the <picture> sources in
// site/index.html point at these variants. Re-run after changing a source
// image and commit the regenerated output.

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ASSETS = new URL('../site/assets/', import.meta.url)
const SITE = new URL('../site/', import.meta.url)
const a = (name) => fileURLToPath(new URL(name, ASSETS))
const site = (name) => fileURLToPath(new URL(name, SITE))

async function icons() {
  // Square-crop the avatar, then emit PNGs + a multi-res .ico.
  const base = sharp(a('avatar.jpg')).resize(512, 512, { fit: 'cover' })
  await base.clone().png().toFile(a('icon-512.png'))
  await sharp(a('avatar.jpg')).resize(192, 192, { fit: 'cover' }).png().toFile(a('icon-192.png'))

  const icoSizes = [16, 32, 48]
  const pngBufs = await Promise.all(
    icoSizes.map((s) =>
      sharp(a('avatar.jpg')).resize(s, s, { fit: 'cover' }).png().toBuffer(),
    ),
  )
  await writeFile(site('favicon.ico'), await pngToIco(pngBufs))
  console.log('icons: favicon.ico, icon-192.png, icon-512.png')
}

async function variants(src, widths, { webpQ = 80, avifQ = 52 } = {}) {
  const stem = src.replace(/\.[^.]+$/, '')
  for (const w of widths) {
    const suffix = widths.length > 1 ? `-${w}` : ''
    await sharp(a(src)).resize({ width: w }).webp({ quality: webpQ }).toFile(a(`${stem}${suffix}.webp`))
    await sharp(a(src)).resize({ width: w }).avif({ quality: avifQ, effort: 4 }).toFile(a(`${stem}${suffix}.avif`))
    console.log(`variants: ${stem}${suffix}.{webp,avif}`)
  }
}

await icons()
// Hero: full-width, responsive — 800 for phones, 1600 for desktop/retina.
await variants('banner.jpg', [800, 1600])
// Card screenshots: shown small & lazy — a single right-sized width is plenty.
await variants('shot-log-viewer.jpg', [960])
await variants('shot-nanawing.jpg', [960])
console.log('done')
