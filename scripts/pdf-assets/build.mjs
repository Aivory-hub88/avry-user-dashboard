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
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', '..', 'lib', 'pdfAssets.ts')

// name → source file, kind, and (for SVG) the rasterization width in px.
const ASSETS = [
  { name: 'COVER_FRONT_BG',     file: 'front-bg.jpg',     kind: 'jpeg' },
  { name: 'COVER_BACK_BG',      file: 'back-bg.jpg',      kind: 'jpeg' },
  { name: 'COVER_WORDMARK',     file: 'wordmark.svg',     kind: 'svg', width: 900 },
  { name: 'COVER_MICROGRAPHIC', file: 'micrographic.svg', kind: 'svg', width: 1900 },
  { name: 'COVER_FOOTER_BADGE', file: 'footer.svg',       kind: 'svg', width: 1700 },
]

async function encode(a) {
  const buf = readFileSync(join(HERE, a.file))
  if (a.kind === 'jpeg') {
    return { mime: 'image/jpeg', b64: buf.toString('base64') }
  }
  // High density → crisp rasterization → resize to target width.
  const png = await sharp(buf, { density: 600 }).resize({ width: a.width }).png({ compressionLevel: 9 }).toBuffer()
  return { mime: 'image/png', b64: png.toString('base64') }
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
  const { mime, b64 } = await encode(a)
  parts.push(`export const ${a.name} = 'data:${mime};base64,${b64}'`, '')
}
writeFileSync(OUT, parts.join('\n'))
console.log(`Wrote ${OUT} (${(Buffer.byteLength(parts.join('\n')) / 1024).toFixed(0)}KB)`)
