/**
 * Regenerates lib/pdfAssets.ts — the fail-proof inline cover assets used by the
 * PDF report generator (lib/pdfExport.ts).
 *
 * WHY this exists: the PDF cover must NEVER render with a missing logo or
 * background. Fetching SVG/JPEG from /public at runtime and rasterizing through
 * an offscreen canvas can silently fail (basePath mismatch, fetch/CORS error,
 * canvas or web-font timing). So instead every cover graphic is pre-rasterized
 * to a PNG (logos, kept all-white) or re-encoded as JPEG (backgrounds) and
 * inlined as a base64 data URI. At runtime jsPDF.addImage() gets the bytes
 * directly — no network, no canvas, no fonts, no basePath.
 *
 * Sources live next to this script (all-white SVG variants + the two cover
 * background JPEGs). Run:  node scripts/pdf-assets/build.mjs
 *
 * Requires `sharp` (already a project dependency) for SVG→PNG rasterization.
 * micrographic.svg (back lockup) contains LIVE TEXT set in Akkurat and Aux
 * Mono — run this on a machine with both fonts installed, or librsvg will
 * substitute a fallback face in the committed raster.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '..', 'lib', 'pdfAssets.ts')

// name → source file, kind, and (for SVG) the rasterization width in px.
const ASSETS = [
  // 2026-10-10 cover refresh: backgrounds come from the design team's A4
  // 300dpi PNGs (frontend-nextjs/public/images/"Document Report Cover "),
  // re-encoded here to 150dpi JPEG (1240px, q82) — the PDF never needs more for a gradient.
  { name: 'COVER_FRONT_BG',     file: 'front-bg-src.jpg', kind: 'bg' },
  { name: 'COVER_BACK_BG',      file: 'back-bg-src.jpg',  kind: 'bg' },
  // Closing-note signatures (AIVORY | TECH LAB): like the back lockup, the
  // source SVGs carry the OLD wordmark, so it is swapped for the 2026 one,
  // recoloured to each variant's ink (white / #5b5b5b).
  { name: 'SIGNATURE_WHITE',    file: 'signature-white.svg', kind: 'signature', width: 1000, color: [255, 255, 255] },
  { name: 'SIGNATURE_DARK',     file: 'signature-dark.svg',  kind: 'signature', width: 1000, color: [0x5b, 0x5b, 0x5b] },
  // Tightly trimmed pieces for the 2026-10 cover layout — placed by their
  // exact glyph bounds (see *_SIZE exports), so no padding guesswork.
  // wordmark-2026.svg = the landing navbar wordmark (frontend-nextjs-landing
  // public/aivory-wordmark.svg) — the official logo with the thin curved A.
  { name: 'COVER_WORDMARK_TRIM', file: 'wordmark-2026.svg', kind: 'svg', width: 1400, trim: true },
  // Back lockup: micrographic.svg still carries the OLD wordmark (notched A).
  // Its big AIVORY is erased and the 2026 wordmark composited into the same
  // box (left-aligned, same cap height) — see buildBackLockup().
  { name: 'COVER_BACK_LOCKUP',   file: 'micrographic.svg', kind: 'backLockup', width: 2400, trim: true, dilate: 1 },
  // footer.svg is one long strip; the new front cover uses its left group
  // ("ALL RIGHTS RESERVED ©2026", top-centre) and right group ("design
  // labs", bottom-right) separately. Fractions are of the strip's width.
  { name: 'COVER_STRIP_RIGHTS',  file: 'footer.svg',       kind: 'svg', width: 3400, trim: true, crop: [0, 0.29] },
  { name: 'COVER_STRIP_LABS',    file: 'footer.svg',       kind: 'svg', width: 3400, trim: true, crop: [0.72, 1] },
]

/** Bounding box of non-transparent pixels inside [x0,x1)×[y0,y1). */
function alphaBox(data, info, x0, y0, x1, y1) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

async function buildBackLockup(a) {
  const base = await sharp(readFileSync(join(HERE, a.file)), { density: 600 }).resize({ width: a.width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data, info } = base
  // The big wordmark is the block left of the vertical divider, in the top half.
  const box = alphaBox(data, info, 0, 0, Math.round(info.width * 0.57), Math.round(info.height * 0.5))
  if (!box) throw new Error('back lockup: old wordmark not found')
  for (let y = box.top; y < box.top + box.height; y++) for (let x = box.left; x < box.left + box.width; x++) data[(y * info.width + x) * 4 + 3] = 0
  // Width per the design mockup: the wordmark spans ~47% of the lockup,
  // leaving air before the divider; vertically centred on the old box.
  const targetW = Math.min(box.width, Math.round(info.width * 0.47))
  const fitted = await sharp(readFileSync(join(HERE, 'wordmark-2026.svg')), { density: 1200 }).trim().resize({ width: targetW }).png().toBuffer()
  const fm = await sharp(fitted).metadata()
  const top = box.top + Math.round((box.height - fm.height) / 2)
  const composed = await sharp(data, { raw: info }).composite([{ input: fitted, left: box.left, top }]).raw().toBuffer({ resolveWithObject: true })
  // The source's pill/divider/ruler are ~0.05mm hairlines at print size; the
  // design renders them heavier. A 1px dilation (at 2400px) matches it.
  return sharp(dilate(composed.data, composed.info.width, composed.info.height, a.dilate ?? 0), { raw: composed.info }).png().toBuffer()
}

/** Grows white glyphs by r px (max filter on alpha, round kernel). */
function dilate(data, w, h, r) {
  if (!r) return data
  const out = Buffer.from(data)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w || dx * dx + dy * dy > r * r + r) continue
        const al = data[(yy * w + xx) * 4 + 3]
        if (al > m) m = al
      }
    }
    const i = (y * w + x) * 4
    out[i] = out[i + 1] = out[i + 2] = 255
    out[i + 3] = m
  }
  return out
}

/** The 2026 wordmark, trimmed, at `width` px, recoloured to `rgb` (alpha kept). */
async function wordmark2026(width, rgb = [255, 255, 255]) {
  const { data, info } = await sharp(readFileSync(join(HERE, 'wordmark-2026.svg')), { density: 1200 })
    .trim().resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2] }
  return sharp(data, { raw: info }).png().toBuffer()
}

async function buildSignature(a) {
  const { data, info } = await sharp(readFileSync(join(HERE, a.file)), { density: 600 }).resize({ width: a.width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Old wordmark = everything left of the divider (~59% of the width).
  const box = alphaBox(data, info, 0, 0, Math.round(info.width * 0.56), info.height)
  if (!box) throw new Error(`${a.name}: old wordmark not found`)
  for (let y = box.top; y < box.top + box.height; y++) for (let x = box.left; x < box.left + box.width; x++) data[(y * info.width + x) * 4 + 3] = 0
  // Fit inside the old box (same footprint), left-aligned, vertically centred.
  let mark = await wordmark2026(box.width, a.color)
  let mm = await sharp(mark).metadata()
  if (mm.height > box.height) {
    mark = await wordmark2026(Math.floor(box.width * box.height / mm.height), a.color)
    mm = await sharp(mark).metadata()
  }
  const top = box.top + Math.round((box.height - mm.height) / 2)
  return sharp(data, { raw: info }).composite([{ input: mark, left: box.left, top }]).png({ compressionLevel: 9 }).toBuffer()
}

async function encode(a) {
  const buf = readFileSync(join(HERE, a.file))
  if (a.kind === 'signature') {
    return { mime: 'image/png', b64: (await buildSignature(a)).toString('base64') }
  }
  if (a.kind === 'backLockup') {
    let png = await buildBackLockup(a)
    if (a.trim) png = await sharp(png).trim().png({ compressionLevel: 9 }).toBuffer()
    const { width, height } = await sharp(png).metadata()
    return { mime: 'image/png', b64: png.toString('base64'), size: [width, height] }
  }
  if (a.kind === 'jpeg') {
    return { mime: 'image/jpeg', b64: buf.toString('base64') }
  }
  if (a.kind === 'bg') {
    const jpg = await sharp(buf).flatten({ background: '#0d3b33' }).resize({ width: 1240 }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    return { mime: 'image/jpeg', b64: jpg.toString('base64') }
  }
  // High density → crisp rasterization → resize to target width.
  let img = sharp(buf, { density: 600 }).resize({ width: a.width })
  if (a.crop) {
    const meta = await sharp(await img.png().toBuffer()).metadata()
    const left = Math.round(meta.width * a.crop[0])
    const width = Math.round(meta.width * a.crop[1]) - left
    img = sharp(await img.png().toBuffer()).extract({ left, top: 0, width, height: meta.height })
  }
  let png = await img.png({ compressionLevel: 9 }).toBuffer()
  if (a.trim) png = await sharp(png).trim().png({ compressionLevel: 9 }).toBuffer()
  const { width, height } = await sharp(png).metadata()
  return { mime: 'image/png', b64: png.toString('base64'), size: [width, height] }
}

const header = `/**
 * Fail-proof cover assets — pre-rasterized to PNG (logos, all-white) and JPEG
 * (backgrounds), inlined as base64 data URIs so a cover graphic can never go
 * missing from a runtime fetch/canvas/basePath failure. jsPDF.addImage() gets
 * the pixels directly.
 *
 * GENERATED FILE — do not hand-edit. Regenerate: node scripts/pdf-assets/build.mjs
 */
`

const parts = [header, '']
for (const a of ASSETS) {
  const { mime, b64, size } = await encode(a)
  parts.push(`export const ${a.name} = 'data:${mime};base64,${b64}'`, '')
  if (a.trim) parts.push(`export const ${a.name}_SIZE: [number, number] = [${size[0]}, ${size[1]}]`, '')
}
writeFileSync(OUT, parts.join('\n'))
console.log(`Wrote ${OUT} (${(Buffer.byteLength(parts.join('\n')) / 1024).toFixed(0)}KB)`)
