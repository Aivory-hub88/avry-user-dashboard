/**
 * Aivory AI Readiness Assessment Report — Premium Editorial PDF Generator
 *
 * Premium consultancy-grade design (McKinsey / BCG / Deloitte tier).
 * Cover/back: dark background images preserved. Inner pages: white editorial.
 * Font: real Manrope (Regular/Bold) + Doto embedded from /public/fonts as TTF,
 * with a Helvetica fallback if the embed fails for any reason.
 * Inner palette: #ffffff bg · #3a7a3a accent · #0a1a0f text.
 */

import jsPDF from 'jspdf'
import type { DiagnosticContext, ImprovementItem } from '@/types/diagnostic'
import { asset } from '@/lib/asset'
import { COVER_FRONT_BG, COVER_BACK_BG, COVER_WORDMARK, COVER_MICROGRAPHIC, COVER_FOOTER_BADGE, SIGNATURE_WHITE, SIGNATURE_DARK } from '@/lib/pdfAssets'

// ── Inner-page palette ─────────────────────────────────────────────────────────
export const INK       = '#0a1a0f'   // primary text, display values
export const ACCENT    = '#3a7a3a'   // section labels, bars, badges, ring arc
// NOTE: greys below are tuned to clear WCAG AA (>=4.5:1) against #ffffff.
// The previous values (#888/#bbb/#aaa/#999/#ccc) fell as low as ~1.3:1 and
// were effectively unreadable in print/PDF — this was a real defect, not a
// stylistic choice, so it's fixed here rather than left as-is.
export const MUTED     = '#5c5c5c'   // body text, descriptions (~7.0:1)
export const LABEL     = '#6e6e6e'   // small labels, sub notes (~5.1:1)
export const LABEL_A   = '#6e6e6e'   // metric labels (~5.1:1)
export const UNIT_C    = '#6e6e6e'   // unit text (~5.1:1)
export const TRACK     = '#e8e8e4'   // bar tracks, grid borders, cell dividers
export const RULE      = '#e0e0d8'   // section-label rule, card borders
export const FOOTER_C  = '#767676'   // footer text (~4.5:1, deliberately the dimmest passing grey)
export const SEC_LBL   = '#6a9a6a'   // section label text
export const VAL_MID   = '#444444'   // diagnostic context values
export const CONTENT_C = '#666666'   // improvement content
export const WARN_AMB  = '#a07010'   // amber badge text

// Badges
const BADGE_G_BG  = '#eaf4e4'
const BADGE_G_BD  = '#c0ddb0'
const BADGE_A_BG  = '#fef3e2'
const BADGE_A_BD  = '#f0d080'

// Cover palette (unchanged — dark bg images)
const COVER_BG  = '#1e3327'
const COVER_TXT = '#3a5a3a'

// ── Layout ─────────────────────────────────────────────────────────────────────
export const PAGE_W = 210
export const PAGE_H = 297
export const ML = 18
export const MR = 18
export const CW = PAGE_W - ML - MR // 174 mm

// ── Font helpers ───────────────────────────────────────────────────────────────
// Manrope / Doto are design-intent fonts; helvetica is the jsPDF fallback.
// To embed true Manrope/Doto, bundle base64-encoded TTF files (follow-up).
let FONT_LOADED = false
let DOTO_LOADED = false
export const F  = () => FONT_LOADED ? 'Manrope' : 'helvetica'
export const FB = () => FONT_LOADED ? 'Manrope' : 'helvetica'
export const FD = () => DOTO_LOADED ? 'Doto' : 'helvetica' // score ring numbers

// ── Utility functions ──────────────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

export function setC(pdf: jsPDF, hex: string, t: 'fill' | 'text' | 'draw' = 'fill') {
  const [r, g, b] = hexToRgb(hex)
  if (t === 'fill') pdf.setFillColor(r, g, b)
  else if (t === 'text') pdf.setTextColor(r, g, b)
  else pdf.setDrawColor(r, g, b)
}

function fmtCurrency(v: number | null | undefined, currency = 'USD'): string {
  if (v == null || !isFinite(v)) return '\u2014'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
}
function fmtPct(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? '\u2014' : `${v.toFixed(1)}%`
}
function fmtMonths(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '\u2014'
  const m = Math.round(v)
  return m >= 12 ? `${(m / 12).toFixed(1)} yrs` : `${m} mo`
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Letter-spaced text — simulates CSS letter-spacing (spacing in mm). */
export function spacedText(
  pdf: jsPDF, text: string, x: number, y: number, spacing: number,
  opts?: { align?: 'left' | 'center' | 'right' },
): number {
  let totalW = 0
  for (const ch of text) totalW += pdf.getTextWidth(ch)
  totalW += Math.max(0, text.length - 1) * spacing

  let sx = x
  if (opts?.align === 'center') sx = x - totalW / 2
  else if (opts?.align === 'right') sx = x - totalW

  for (const ch of text) {
    pdf.text(ch, sx, y)
    sx += pdf.getTextWidth(ch) + spacing
  }
  return totalW
}

// ── Font loader — embeds the real Manrope + Doto TTFs (public/fonts) into the
// jsPDF document so rendered text is actually Manrope/Doto, not Helvetica.
// Falls back to Helvetica (FONT_LOADED stays false) if any fetch fails —
// asset() is required here because these are plain fetch() calls, which,
// unlike next/image or next/link, do NOT get the Next.js basePath ("/dashboard")
// auto-prepended. Without it these 404 in production (see cover image bug).
async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = await r.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  } catch {
    return null
  }
}

export async function loadManrope(pdf: jsPDF): Promise<void> {
  try {
    const [regular, bold] = await Promise.all([
      fetchAsBase64(asset('/fonts/Manrope-Regular.ttf')),
      fetchAsBase64(asset('/fonts/Manrope-Bold.ttf')),
    ])

    if (regular) {
      pdf.addFileToVFS('Manrope-Regular.ttf', regular)
      pdf.addFont('Manrope-Regular.ttf', 'Manrope', 'normal')
    }
    if (bold) {
      pdf.addFileToVFS('Manrope-Bold.ttf', bold)
      pdf.addFont('Manrope-Bold.ttf', 'Manrope', 'bold')
    }
    FONT_LOADED = !!(regular && bold)
  } catch {
    FONT_LOADED = false
  }

  try {
    const doto = await fetchAsBase64(asset('/fonts/Doto-Regular.ttf'))
    if (doto) {
      pdf.addFileToVFS('Doto-Regular.ttf', doto)
      pdf.addFont('Doto-Regular.ttf', 'Doto', 'normal')
      DOTO_LOADED = true
    }
  } catch {
    DOTO_LOADED = false
  }
}

// ── Image loaders ──────────────────────────────────────────────────────────────
async function loadImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string>((res, rej) => {
      const rd = new FileReader()
      rd.onload = () => res(rd.result as string)
      rd.onerror = rej
      rd.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function loadSvgAsPngDataUrl(
  url: string, width: number, height: number,
): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const svgText = await r.text()
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    return await new Promise<string | null>((res) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 2
        canvas.width = width * scale
        canvas.height = height * scale
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          res(canvas.toDataURL('image/png'))
        } else res(null)
        URL.revokeObjectURL(blobUrl)
      }
      img.onerror = () => { URL.revokeObjectURL(blobUrl); res(null) }
      img.src = blobUrl
    })
  } catch {
    return null
  }
}

async function renderTextToPngDataUrl(
  text: string, font: string, color: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    try {
      document.fonts.ready.then(() => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        const scale = 2
        ctx.font = font
        const lines = text.split('\n')
        const fsMatch = font.match(/(\d+)px/)
        const fontSize = fsMatch ? parseInt(fsMatch[1], 10) : 36
        const lineHeight = fontSize * 1.2
        let maxW = 0
        lines.forEach((l) => { const w = ctx.measureText(l).width; if (w > maxW) maxW = w })
        canvas.width = Math.ceil(maxW) * scale
        canvas.height = Math.ceil(lines.length * lineHeight) * scale
        ctx.scale(scale, scale)
        ctx.font = font
        ctx.fillStyle = color
        ctx.textBaseline = 'top'
        let yy = 0
        lines.forEach((l) => { ctx.fillText(l, 0, yy); yy += lineHeight })
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width / scale, height: canvas.height / scale })
      })
    } catch { resolve(null) }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
//  PAGE PRIMITIVES — inner pages
// ══════════════════════════════════════════════════════════════════════════════

/** White background fill for every inner page. */
// Soft warm-white radial gradient shared with the free-diagnostic card
// (radial-gradient(120% 90% at 28% 0%, #fff, #fbfaf7 45%, #f2f0ea)). Rendered
// once to a canvas and cached, so every inner page carries the same subtle
// paper texture instead of flat white. Falls back to flat white if the canvas
// is unavailable (SSR / no DOM) — the page still prints.
let _contentBgCache: string | null = null
function getContentBg(): string | null {
  if (_contentBgCache) return _contentBgCache
  try {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    const scale = 3
    canvas.width = PAGE_W * scale
    canvas.height = PAGE_H * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const cx = canvas.width * 0.28
    const r = Math.max(canvas.width, canvas.height) * 1.05
    const grad = ctx.createRadialGradient(cx, 0, 0, cx, 0, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.45, '#fbfaf7')
    grad.addColorStop(1, '#f2f0ea')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    _contentBgCache = canvas.toDataURL('image/png')
    return _contentBgCache
  } catch {
    return null
  }
}

export function pageBg(pdf: jsPDF) {
  const bg = getContentBg()
  if (bg) {
    pdf.addImage(bg, 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST')
  } else {
    setC(pdf, '#ffffff', 'fill')
    pdf.rect(0, 0, PAGE_W, PAGE_H, 'F')
  }
}

/** Footer: AIVORY™ · CONFIDENTIAL left, aivory.uk right, divider above. */
export function pageFooter(pdf: jsPDF) {
  const fY = PAGE_H - 8
  // Divider line above footer
  setC(pdf, TRACK, 'draw')
  pdf.setLineWidth(0.18)
  pdf.line(ML, fY - 4, ML + CW, fY - 4)
  // Footer text
  setC(pdf, FOOTER_C, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(7) // 9px
  spacedText(pdf, 'AIVORY\u2122 \u00b7 CONFIDENTIAL', ML, fY, 0.25) // 0.1em
  spacedText(pdf, 'AIVORY.UK', PAGE_W - MR, fY, 0.25, { align: 'right' })
}

/** Section label: 9px uppercase #6a9a6a, 0.5px rule extending right, 10mm margin-bottom. */
export function sectionLabel(pdf: jsPDF, y: number, title: string): number {
  setC(pdf, SEC_LBL, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(7) // 9px
  const tw = spacedText(pdf, title.toUpperCase(), ML, y, 0.5) // 0.2em

  // Extending rule
  setC(pdf, RULE, 'draw')
  pdf.setLineWidth(0.18) // 0.5px
  pdf.line(ML + tw + 4, y - 1.2, ML + CW, y - 1.2)

  return y + 10 // ~28px margin-bottom
}

/** Renders a narrative block and returns the new Y position. */
export function renderNarrative(pdf: jsPDF, y: number, text: string): number {
  setC(pdf, CONTENT_C, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(10) // Increased for better readability
  pdf.setLineHeightFactor(1.5)
  const lines = pdf.splitTextToSize(text, CW)
  pdf.text(lines, ML, y + 4)
  pdf.setLineHeightFactor(1.15)
  return y + lines.length * 5.2 + 8
}

/** 0.5px horizontal divider in TRACK colour. */
export function thinDiv(pdf: jsPDF, y: number, x1 = ML, x2 = ML + CW): number {
  setC(pdf, TRACK, 'draw')
  pdf.setLineWidth(0.18)
  pdf.line(x1, y, x2, y)
  return y + 4
}

/**
 * Only starts a new page when the next block genuinely won't fit — replaces
 * the old pattern of an unconditional pdf.addPage() before every named
 * section, which forced short sections (e.g. a single opportunity card, or
 * 3 next-step rows) onto their own near-empty page and broke reading flow.
 * `needed` is a conservative estimate of the space the upcoming block's
 * header + opening content requires.
 */
export function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 16) {
    pdf.addPage()
    pageBg(pdf)
    pageFooter(pdf)
    return 16
  }
  return y
}

/**
 * A short connective sentence bridging two sections — gives the report a
 * narrated, editorial flow instead of reading as disconnected data blocks.
 * Styled as a left-accent-bar callout so it reads distinctly from both the
 * section narrative above it and the section label below it.
 */
export function renderTransition(pdf: jsPDF, y: number, text: string): number {
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(9.5)
  pdf.setLineHeightFactor(1.55)
  const lines = pdf.splitTextToSize(text, CW - 8)
  const textH = lines.length * 4.9
  const blockH = textH + 8

  setC(pdf, ACCENT, 'fill')
  pdf.rect(ML, y, 0.7, textH + 1, 'F')

  setC(pdf, '#3f5c3f', 'text')
  pdf.text(lines, ML + 6, y + 4.2)
  pdf.setLineHeightFactor(1.15)

  return y + blockH + 6
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

/** Linearly interpolate between two hex colours (0-1). */
function lerpHex(a: string, b: string, t: number): [number, number, number] {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]
}

/**
 * Score arc — ring with a gradient progress sweep (deep forest → bright
 * mint, matching the on-screen ScoreRing), a soft outer halo, and gauge
 * tick marks at 0/25/50/75/100. jsPDF has no native SVG-style gradient
 * stroke, so the gradient is faked by interpolating the stroke colour
 * segment-by-segment along the arc.
 */
async function scoreArc(
  pdf: jsPDF, cx: number, cy: number, r: number, score: number, label: string,
) {
  const pct = score / 100
  const start = -Math.PI / 2

  // Soft ambient halo behind the ring — low-opacity accent disc
  const gs = (pdf as unknown as { GState: new (p: Record<string, number>) => unknown; setGState: (g: unknown) => void })
  if (gs.GState) {
    gs.setGState(new gs.GState({ opacity: 0.07 }))
    setC(pdf, ACCENT, 'fill')
    pdf.circle(cx, cy, r + 5, 'F')
    gs.setGState(new gs.GState({ opacity: 1 }))
  }

  // Round linecaps for the arc strokes
  pdf.setLineCap(1) // round

  // Background track ring — #e8e8e4, 7px ≈ 2.5mm
  setC(pdf, TRACK, 'draw')
  pdf.setLineWidth(2.5)
  const bgSegs = 80
  for (let i = 0; i < bgSegs; i++) {
    const a1 = start + (2 * Math.PI * i) / bgSegs
    const a2 = start + (2 * Math.PI * (i + 1)) / bgSegs
    pdf.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2))
  }

  // Tick marks at 0/25/50/75/100 — instrument-panel detail
  setC(pdf, '#b8b8b0', 'draw')
  pdf.setLineWidth(0.5)
  ;[0, 25, 50, 75, 100].forEach((tick) => {
    const a = start + 2 * Math.PI * (tick / 100)
    const inner = r - 5
    const outer = r - 2.2
    pdf.line(cx + inner * Math.cos(a), cy + inner * Math.sin(a), cx + outer * Math.cos(a), cy + outer * Math.sin(a))
  })

  // Progress arc — gradient sweep from deep forest (#7fae6f) to bright
  // mint (#d9ecc9), 7px ≈ 2.5mm, interpolated per segment.
  pdf.setLineWidth(2.5)
  const end = start + 2 * Math.PI * pct
  const segs = Math.max(1, Math.round(80 * pct))
  for (let i = 0; i < segs; i++) {
    const t = segs > 1 ? i / (segs - 1) : 0
    const [rr, gg, bb] = lerpHex('#7fae6f', '#d9ecc9', t)
    pdf.setDrawColor(rr, gg, bb)
    const a1 = start + (end - start) * (i / segs)
    const a2 = start + (end - start) * ((i + 1) / segs)
    pdf.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2))
  }

  // Bright tip dot — reinforces the "gauge needle" read
  if (pct > 0) {
    setC(pdf, '#eef6e6', 'fill')
    pdf.circle(cx + r * Math.cos(end), cy + r * Math.sin(end), 1.6, 'F')
  }

  pdf.setLineCap(0) // reset to butt

  // Score number — Doto 36px ≈ 27pt, #0a1a0f
  const scoreImg = await renderTextToPngDataUrl(
    String(score), '400 36px "Doto", monospace', INK,
  )
  if (scoreImg) {
    const swMm = scoreImg.width * 0.264583
    const shMm = scoreImg.height * 0.264583
    pdf.addImage(scoreImg.dataUrl, 'PNG', cx - swMm / 2, cy - shMm / 2 + 1.5, swMm, shMm, undefined, 'FAST')
  } else {
    setC(pdf, INK, 'text')
    pdf.setFont(FD(), 'normal')
    pdf.setFontSize(27)
    pdf.text(String(score), cx, cy + 3, { align: 'center' })
  }

  // Status label below number — 9px #6a9a6a uppercase
  setC(pdf, SEC_LBL, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(7)
  spacedText(pdf, label.toUpperCase(), cx, cy + 10, 0.3, { align: 'center' })

  // COMPOSITE SCORE below ring — 9px #bbb
  setC(pdf, LABEL, 'text')
  pdf.setFontSize(7)
  spacedText(pdf, 'COMPOSITE SCORE', cx, cy + r + 8, 0.25, { align: 'center' })
}

/** Dimension bar: name (11px #888) · 1.5px track · green fill · value right (Doto 13px #0a1a0f). */
function dimBar(
  pdf: jsPDF, x: number, y: number, w: number, label: string, score: number,
): number {
  // Name
  setC(pdf, MUTED, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5) // 11px
  pdf.text(cap(label), x, y + 3)

  // Value — right-aligned, Doto 13px
  setC(pdf, INK, 'text')
  pdf.setFont(FD(), 'normal')
  pdf.setFontSize(10) // 13px
  pdf.text(String(score), x + w, y + 3, { align: 'right' })

  // Track + fill — 1.5px, rounded ends and a gradient fill (matching the
  // on-screen dimension bars) instead of a flat rectangle.
  const barY = y + 6
  const barH = 0.9
  setC(pdf, TRACK, 'fill')
  pdf.roundedRect(x, barY - barH / 2, w, barH, barH / 2, barH / 2, 'F')
  const fillW = w * (score / 100)
  if (fillW > 0) {
    const segN = Math.max(1, Math.round(fillW / 3))
    for (let i = 0; i < segN; i++) {
      const t0 = i / segN
      const t1 = (i + 1) / segN
      const [rr, gg, bb] = lerpHex('#5f8f52', '#a9c99a', (t0 + t1) / 2)
      pdf.setFillColor(rr, gg, bb)
      pdf.rect(x + fillW * t0, barY - barH / 2, fillW * (t1 - t0) + 0.1, barH, 'F')
    }
    setC(pdf, '#a9c99a', 'fill')
    pdf.circle(x + fillW - barH / 2, barY, barH / 2, 'F')
    setC(pdf, '#5f8f52', 'fill')
    pdf.circle(x + barH / 2, barY, barH / 2, 'F')
  }

  return y + 14
}

/** Opportunity card — bordered, with header badge, 4-col metrics, impact bar. */
function oppCard(
  pdf: jsPDF, opp: DiagnosticContext['opportunities'][0], y: number,
  fmt: (v: number | null | undefined) => string,
): number {
  const qL: Record<string, string> = {
    quick_win: 'QUICK WIN', major_project: 'MAJOR PROJECT',
    fill_in: 'FILL IN', thankless_task: 'LOW VALUE',
  }
  const drL: Record<string, string> = {
    ready: 'Data Ready', needs_prep: 'Needs Data Prep', not_ready: 'Not Ready',
  }

  const sav = (opp.estimatedSavingsLocal ?? ((opp as any).estimatedSavingsIDR ?? null)) as number | null
  const pad = 7.5 // ~22px
  const padT = 7   // ~20px
  const cardH = 52

  // Card border — 0.5px solid #e0e0d8, border-radius 6px ≈ 2mm
  setC(pdf, '#ffffff', 'fill')
  pdf.roundedRect(ML, y, CW, cardH, 2, 2, 'F')
  setC(pdf, RULE, 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(ML, y, CW, cardH, 2, 2, 'S')

  // ── Header: title + badge ──
  setC(pdf, INK, 'text')
  pdf.setFont(FB(), 'bold') // weight 500
  pdf.setFontSize(10.5) // 14px
  const titleLines = pdf.splitTextToSize(opp.title, CW - 55)
  pdf.text(titleLines[0] || opp.title, ML + pad, y + padT + 5)

  // Badge — bg #eaf4e4, border #c0ddb0, text #3a7a3a
  const tagText = qL[opp.quadrant] ?? opp.quadrant.toUpperCase()
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6) // 8px
  const tagTw = pdf.getTextWidth(tagText)
  const tagPadX = 2.8 // 8px
  const tagPadY = 1   // 3px
  const tagW = tagTw + tagPadX * 2
  const tagH = 4.5
  const tagX = ML + CW - pad - tagW
  const tagY = y + padT

  setC(pdf, BADGE_G_BG, 'fill')
  pdf.roundedRect(tagX, tagY, tagW, tagH, 1, 1, 'F')
  setC(pdf, BADGE_G_BD, 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(tagX, tagY, tagW, tagH, 1, 1, 'S')
  setC(pdf, ACCENT, 'text')
  pdf.text(tagText, tagX + tagPadX, tagY + 3.2)

  // ── Metrics row — 4 columns ──
  const mY = y + padT + 14
  const metrics = [
    { l: 'IMPACT', v: `${opp.impact}/10` },
    { l: 'EFFORT', v: `${opp.effort}/10` },
    { l: 'TIME TO VALUE', v: `${opp.timeToValueWeeks}w` },
    { l: 'EST. SAVINGS', v: sav != null ? `${fmt(sav)}/yr` : '\u2014' },
  ]
  const mw = (CW - pad * 2) / 4
  metrics.forEach((m, i) => {
    const mx = ML + pad + i * mw
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(6) // 8px
    pdf.text(m.l, mx, mY)
    setC(pdf, INK, 'text')
    pdf.setFont(FB(), 'bold') // weight 500
    pdf.setFontSize(10.5) // 14px
    pdf.text(m.v, mx, mY + 7)
  })

  // ── Impact bar ──
  const barY = y + cardH - padT - 4
  const barW = CW - pad * 2
  // Label left
  setC(pdf, LABEL, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6.4) // 8.5px
  pdf.text('IMPACT', ML + pad, barY - 1.5)
  // Track + fill
  setC(pdf, TRACK, 'fill')
  pdf.rect(ML + pad, barY, barW, 0.53, 'F')
  setC(pdf, ACCENT, 'fill')
  pdf.rect(ML + pad, barY, barW * (opp.impact / 10), 0.53, 'F')
  // Data readiness + complexity right-aligned
  const drText = `${drL[opp.dataReadiness] ?? opp.dataReadiness} \u00b7 ${cap(opp.complexity ?? 'medium')}`
  setC(pdf, UNIT_C, 'text')
  pdf.setFontSize(6.4) // 8.5px
  pdf.text(drText, ML + CW - pad, barY - 1.5, { align: 'right' })

  return y + cardH + 3.5 // 10px margin-bottom
}

/** Next-step row: number left · title + description right · dividers. */
function nextStepRow(
  pdf: jsPDF, y: number, stepNum: string, title: string, body: string,
): number {
  // Guarantee the whole row fits on the current page before drawing — a long
  // body used to run straight through the page footer (no per-row page break).
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5)
  pdf.setLineHeightFactor(1.65)
  const measured = pdf.splitTextToSize(body, CW - 13)
  pdf.setLineHeightFactor(1.15)
  y = ensureSpace(pdf, y, 7 + 10 + measured.length * 5.2 + 7)

  thinDiv(pdf, y)
  y += 7 // ~20px padding-top

  // Step number — 10px #bbb, letter-spacing 0.12em
  setC(pdf, LABEL, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(7.5) // 10px
  spacedText(pdf, stepNum, ML, y + 4, 0.3) // 0.12em

  // Title — 13px weight 500, #0a1a0f
  const contentX = ML + 13 // ~36px gap
  setC(pdf, INK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(10) // 13px
  pdf.text(title, contentX, y + 4)

  // Body — 11px #888, line-height 1.65
  setC(pdf, MUTED, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5) // 11px
  pdf.setLineHeightFactor(1.65)
  const bl = pdf.splitTextToSize(body, CW - 13)
  pdf.text(bl, contentX, y + 10)
  pdf.setLineHeightFactor(1.15)

  return y + 10 + bl.length * 5.2 + 7 // ~20px padding-bottom
}

/**
 * Pre-measures the height an improvementBlock will actually need, mirroring
 * its own line-splitting exactly. The previous code checked a flat 60mm
 * threshold before drawing, but a block with 3 long paragraphs plus a
 * before/after card easily exceeds 100mm — the block would start near the
 * bottom of the page and run straight through the footer.
 */
function measureImprovementBlockHeight(pdf: jsPDF, item: ImprovementItem): number {
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5)
  const cLines = pdf.splitTextToSize(item.currentState, CW - 4)
  const aLines = pdf.splitTextToSize(item.recommendedAction, CW - 4)
  const iLines = pdf.splitTextToSize(item.operationalImpact, CW - 4)

  let h = 14 // title + badge
  h += cLines.length * 5 + 5 + 4 // label + lines + gap
  h += aLines.length * 5 + 5 + 4
  h += iLines.length * 5 + 4 + 4

  if (item.before && item.after) {
    const bLines = pdf.splitTextToSize(item.before, (CW - 14) / 2 - 4)
    const afLines = pdf.splitTextToSize(item.after, (CW - 14) / 2 - 4)
    const bHeight = Math.max(bLines.length, afLines.length) * 4 + 10
    h += bHeight + 6
  }

  return h + 9 // bottom divider + margin
}

/** Improvement block: title + priority badge + 3 labeled content rows. */
function improvementBlock(pdf: jsPDF, item: ImprovementItem, y: number): number {
  const isHigh = item.priority === 'high'
  const badgeBg = isHigh ? '#fde2e2' : BADGE_A_BG
  const badgeBd = isHigh ? '#f0a0a0' : BADGE_A_BD
  const badgeTx = isHigh ? '#a01010' : WARN_AMB

  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5) // 11px
  const cLines = pdf.splitTextToSize(item.currentState, CW - 4)
  const aLines = pdf.splitTextToSize(item.recommendedAction, CW - 4)
  const iLines = pdf.splitTextToSize(item.operationalImpact, CW - 4)

  // Title — 13px weight 500
  setC(pdf, INK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(10) // 13px
  const tLines = pdf.splitTextToSize(item.title, CW - 55)
  pdf.text(tLines[0] || item.title, ML, y + 5)

  // Priority badge
  const prLabel = `${item.priority.toUpperCase()} PRIORITY`
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6) // 8px
  const prTw = pdf.getTextWidth(prLabel) + 5.6
  const prH = 4.5
  const prX = ML + CW - prTw
  setC(pdf, badgeBg, 'fill')
  pdf.roundedRect(prX, y, prTw, prH, 1, 1, 'F')
  setC(pdf, badgeBd, 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(prX, y, prTw, prH, 1, 1, 'S')
  setC(pdf, badgeTx, 'text')
  pdf.text(prLabel, prX + 2.8, y + 3.2)

  let cy = y + 14

  // CURRENT STATE
  setC(pdf, LABEL, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6) // 8px
  pdf.text('CURRENT STATE', ML, cy)
  cy += 4
  setC(pdf, CONTENT_C, 'text')
  pdf.setFontSize(8.5) // 11px
  pdf.setLineHeightFactor(1.65)
  pdf.text(cLines, ML, cy)
  pdf.setLineHeightFactor(1.15)
  cy += cLines.length * 5 + 5

  // RECOMMENDED ACTION
  setC(pdf, LABEL, 'text')
  pdf.setFontSize(6)
  pdf.text('RECOMMENDED ACTION', ML, cy)
  cy += 4
  setC(pdf, CONTENT_C, 'text')
  pdf.setFontSize(8.5)
  pdf.setLineHeightFactor(1.65)
  pdf.text(aLines, ML, cy)
  pdf.setLineHeightFactor(1.15)
  cy += aLines.length * 5 + 5

  // OPERATIONAL IMPACT
  setC(pdf, LABEL, 'text')
  pdf.setFontSize(6)
  pdf.text('OPERATIONAL IMPACT', ML, cy)
  cy += 4
  setC(pdf, CONTENT_C, 'text')
  pdf.setFontSize(8.5)
  pdf.setLineHeightFactor(1.65)
  pdf.text(iLines, ML, cy)
  pdf.setLineHeightFactor(1.15)
  cy += iLines.length * 5 + 4

  if (item.before && item.after) {
    cy += 4
    const bLines = pdf.splitTextToSize(item.before, (CW - 14) / 2 - 4)
    const afLines = pdf.splitTextToSize(item.after, (CW - 14) / 2 - 4)
    
    const boxW = (CW - 10) / 2
    const bHeight = Math.max(bLines.length, afLines.length) * 4 + 10
    
    setC(pdf, '#fef2f2', 'fill')
    pdf.roundedRect(ML, cy, boxW, bHeight, 1.5, 1.5, 'F')
    setC(pdf, '#fca5a5', 'draw')
    pdf.setLineWidth(0.18)
    pdf.roundedRect(ML, cy, boxW, bHeight, 1.5, 1.5, 'S')
    
    setC(pdf, '#ef4444', 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(5.5)
    spacedText(pdf, 'BEFORE', ML + 3, cy + 4, 0.4)
    
    setC(pdf, CONTENT_C, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8)
    pdf.setLineHeightFactor(1.4)
    pdf.text(bLines, ML + 3, cy + 8)
    
    const afX = ML + boxW + 10
    setC(pdf, '#f0fdf4', 'fill')
    pdf.roundedRect(afX, cy, boxW, bHeight, 1.5, 1.5, 'F')
    setC(pdf, '#bbf7d0', 'draw')
    pdf.setLineWidth(0.18)
    pdf.roundedRect(afX, cy, boxW, bHeight, 1.5, 1.5, 'S')
    
    setC(pdf, '#22c55e', 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(5.5)
    spacedText(pdf, 'AFTER', afX + 3, cy + 4, 0.4)
    
    setC(pdf, CONTENT_C, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8)
    pdf.text(afLines, afX + 3, cy + 8)
    pdf.setLineHeightFactor(1.15)
    
    setC(pdf, LABEL, 'draw')
    pdf.setLineWidth(0.4)
    const ax = ML + boxW + 3
    const ay = cy + bHeight / 2
    pdf.line(ax, ay, ax + 4, ay)
    pdf.line(ax + 2.5, ay - 1.5, ax + 4, ay)
    pdf.line(ax + 2.5, ay + 1.5, ax + 4, ay)
    
    cy += bHeight + 6
  }

  // Bottom divider
  thinDiv(pdf, cy)
  return cy + 5
}

// ══════════════════════════════════════════════════════════════════════════════
//  COVER & BACK COVER
// ══════════════════════════════════════════════════════════════════════════════

export async function applyPremiumCovers(
  pdf: jsPDF,
  type: 'front' | 'back',
  title: string = '',
  meta?: { company?: string; date?: string; reportId?: string },
) {
  // Tighter cover margin (matches the mockups' ~12mm).
  const CML = 12

  // Every graphic on the covers is an INLINE base64 image (see lib/pdfAssets.ts):
  // pdf.addImage() gets the bytes directly, so a logo/background can never go
  // missing from a fetch/canvas/basePath failure. All cover TEXT is drawn with
  // pdf.text() using the Manrope font embedded into the PDF (loadManrope), so it
  // is vector-crisp and does not depend on the browser having the web font.

  // Full-bleed background
  pdf.addImage(type === 'front' ? COVER_FRONT_BG : COVER_BACK_BG, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST')

  if (type === 'front') {
    // Top-right: slim all-white AIVORY wordmark (900x187 → 4.813:1)
    const wmW = 42
    const wmH = wmW * (187 / 900)
    pdf.addImage(COVER_WORDMARK, 'PNG', PAGE_W - CML - wmW, 13, wmW, wmH, undefined, 'FAST')

    // Headline — uppercase, 2 lines, tight leading, lower-left. Width-fitted so
    // the longest line lands at ~122mm regardless of font metrics.
    const titleLines = (title || 'AI Readiness\nAssessment Report').toUpperCase().split('\n')
    setC(pdf, '#ffffff', 'text')
    pdf.setFont(F(), 'normal')
    let tfs = 40
    pdf.setFontSize(tfs)
    const widest = Math.max(...titleLines.map((l) => pdf.getTextWidth(l)))
    if (widest > 0) tfs = tfs * (122 / widest)
    pdf.setFontSize(tfs)
    const lineGap = tfs * 0.3528 * 1.04 // pt→mm, tight leading
    const titleTopBaseline = 165 // baseline of first line (mm)
    titleLines.forEach((l, i) => pdf.text(l, CML, titleTopBaseline + i * lineGap))
    const titleWmm = Math.max(...titleLines.map((l) => pdf.getTextWidth(l)))

    // Ring glyph, right of the second title line (vector — nothing to load)
    setC(pdf, '#ffffff', 'draw')
    pdf.setLineWidth(0.7)
    pdf.circle(CML + titleWmm + 12, titleTopBaseline + lineGap - tfs * 0.3528 * 0.36, 6.3, 'S')

    // Company Name — large, shrink-to-fit so long names never overflow
    if (meta?.company) {
      setC(pdf, '#ffffff', 'text')
      pdf.setFont(F(), 'normal')
      let cfs = 26
      pdf.setFontSize(cfs)
      const cw = pdf.getTextWidth(meta.company)
      const maxW = PAGE_W - 2 * CML
      if (cw > maxW) { cfs = cfs * (maxW / cw); pdf.setFontSize(cfs) }
      pdf.text(meta.company, CML, 210)
    }

    // Date — DD MM YY, muted, wide-spaced
    if (meta?.date) {
      let fd = meta.date
      const d = new Date(meta.date)
      if (!isNaN(d.getTime())) {
        fd = `${String(d.getDate()).padStart(2, '0')}  ${String(d.getMonth() + 1).padStart(2, '0')}  ${String(d.getFullYear()).slice(-2)}`
      }
      setC(pdf, '#a9bfa4', 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(15)
      spacedText(pdf, fd, CML, 223, 0.4)
    }

    // Tagline bottom-left
    setC(pdf, '#ffffff', 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(11)
    pdf.text('Make AI make sense®', CML, PAGE_H - 14)

    // Footer credential strip, bottom-right (1700x165 → 10.30:1)
    const fW = 76
    const fH = fW * (165 / 1700)
    pdf.addImage(COVER_FOOTER_BADGE, 'PNG', PAGE_W - CML - fW, PAGE_H - 12 - fH, fW, fH, undefined, 'FAST')
  } else {
    // Back cover — single centred all-white AIVORY lockup (1900x545 → 3.486:1)
    const mW = 99
    const mH = mW * (545 / 1900)
    pdf.addImage(COVER_MICROGRAPHIC, 'PNG', PAGE_W / 2 - mW / 2, 154 - mH / 2, mW, mH, undefined, 'FAST')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EDITORIAL SPREAD — a full-bleed "thesis" page between the cover and the
//  data pages, in the style of a consulting-firm opening provocation. Gives
//  the report a premium editorial rhythm (cover → thesis → data → close)
//  instead of jumping straight from cover into charts.
// ══════════════════════════════════════════════════════════════════════════════
function editorialSpread(pdf: jsPDF, context: DiagnosticContext) {
  pdf.addPage()
  setC(pdf, COVER_BG, 'fill')
  pdf.rect(0, 0, PAGE_W, PAGE_H, 'F')

  const cx = ML
  const companyLabel = context.company || 'your team'
  const topOppTitle = context.opportunities?.[0]?.title

  // Eyebrow
  setC(pdf, '#8fb87f', 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(7.5)
  spacedText(pdf, 'A NOTE FROM AIVORY', cx, 58, 0.5)

  // Salutation
  setC(pdf, '#ffffff', 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(17)
  pdf.text(`Dear ${companyLabel},`, cx, 78)

  // Letter body — a short, warm framing of what the report contains,
  // in place of the earlier pull-quote treatment (which read as an
  // out-of-context KPI statement rather than an actual thesis).
  setC(pdf, '#dce8d6', 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(11.5)
  pdf.setLineHeightFactor(1.7)

  const p1 = `Thank you for completing the AI Readiness Assessment. What follows is a diagnostic of where ${companyLabel} stands today: not a generic scorecard, but a reading of your own answers, your goals, your constraints, and the gap between where you are and where you're aiming to be.`
  const p1Lines = pdf.splitTextToSize(p1, CW - 10)
  pdf.text(p1Lines, cx, 94)
  let ny = 94 + p1Lines.length * 6.3 + 8

  const p2 = topOppTitle
    ? `The findings point to a clear starting point: ${topOppTitle.toLowerCase()}, alongside the financial case and a sequenced plan to act on it. Every number that follows traces back to what you told us.`
    : `The pages ahead lay out your composite readiness score, the opportunities with the fastest path to ROI, and a sequenced plan to act on them. Every number that follows traces back to what you told us.`
  const p2Lines = pdf.splitTextToSize(p2, CW - 10)
  pdf.text(p2Lines, cx, ny)
  ny += p2Lines.length * 6.3 + 14
  pdf.setLineHeightFactor(1.15)

  setC(pdf, '#8fb87f', 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(11)
  pdf.text('Warmly, The Aivory Team', cx, ny)

  // Aivory signature (white) beneath the sign-off — inline asset, cannot fail.
  {
    const sigW = 46
    const sigH = sigW * (62.9 / 498.7)
    pdf.addImage(SIGNATURE_WHITE, 'PNG', cx, ny + 8, sigW, sigH, undefined, 'FAST')
  }

  // Bottom supporting data strip — composite score as a grounding stat
  const stripY = PAGE_H - 46
  setC(pdf, '#3f5c46', 'draw')
  pdf.setLineWidth(0.18)
  pdf.line(ML, stripY, ML + CW, stripY)

  setC(pdf, '#8fb87f', 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.4)
  spacedText(pdf, 'COMPOSITE READINESS SCORE', ML, stripY + 9, 0.3)

  setC(pdf, '#ffffff', 'text')
  pdf.setFont(FD(), 'normal')
  pdf.setFontSize(15)
  pdf.text(`${Math.round(context.scores.composite)}`, ML, stripY + 20)

  setC(pdf, '#a9c4a0', 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.4)
  const mLabel = context.scores.maturityLevel.toUpperCase()
  spacedText(pdf, mLabel, ML + CW, stripY + 20, 0.3, { align: 'right' })
  setC(pdf, '#a9c4a0', 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6.4)
  spacedText(pdf, 'MATURITY LEVEL', ML + CW, stripY + 9, 0.3, { align: 'right' })
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function exportReportToPdf(
  _elementId: string,
  companyName: string,
  context?: DiagnosticContext,
) {
  if (!context) {
    try {
      const raw = localStorage.getItem('aivory_diagnostic_context')
      if (raw) context = JSON.parse(raw) as DiagnosticContext
    } catch { /* ignore */ }
  }
  if (!context) throw new Error('No diagnostic context')

  const { scores, calculations, opportunities, risks, qualitative, roomForImprovement } = context
  const currency = (context.currency || 'USD') as 'USD' | 'EUR' | 'GBP' | 'IDR'
  const fmt = (v: number | null | undefined) => fmtCurrency(v, currency)

  const pdf = new jsPDF('p', 'mm', 'a4')
  await loadManrope(pdf)

  // Report meta
  const sd = new Date(context.submittedAt)
  const reportId = `RPT-${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}${String(sd.getDate()).padStart(2, '0')}-001`
  const dateStr = sd.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ════════════════════════════════════════════════════════════════════════════
  await applyPremiumCovers(pdf, 'front', `AI Readiness\nAssessment Report`, {
    company: context.company,
    date: dateStr,
    reportId,
  })

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — EDITORIAL SPREAD (thesis / pull-quote page)
  // ════════════════════════════════════════════════════════════════════════════
  editorialSpread(pdf, context)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — EXECUTIVE SCORECARD
  // ════════════════════════════════════════════════════════════════════════════
  pdf.addPage()
  pageBg(pdf)
  pageFooter(pdf)
  let y = 16

  y = sectionLabel(pdf, y, 'Executive Scorecard')

  y = renderNarrative(pdf, y, `Your company/organization operates at an advanced "${scores.maturityLevel}" maturity level with a composite score of ${Math.round(scores.composite)}, driven by strong scores in People and Governance. Fully aligned leadership and previous AI successes indicate a culture primed for scaled deployment. However, a lagging Process score (${Math.round(scores.process)}) highlights significant friction stemming from manual data entry and repetitive workflows. Standardizing these operations is critical to unlocking the team's full potential and transitioning from localized successes to systemic efficiency.`)

  // ── Two-column: score ring left · dimension bars right ──
  const arcCx = ML + 35
  const arcCy = y + 30
  const arcR = 20
  await scoreArc(pdf, arcCx, arcCy, arcR, scores.composite, scores.maturityLevel)

  const barX = ML + 82
  const barW = CW - 82
  let by = y + 2
  const dims: Array<'strategy' | 'data' | 'process' | 'people' | 'governance'> = [
    'strategy', 'data', 'process', 'people', 'governance',
  ]
  dims.forEach((d) => {
    by = dimBar(pdf, barX, by, barW, d, (scores as unknown as Record<string, number>)[d] ?? 0)
  })

  y = Math.max(arcCy + arcR + 12, by) + 6

  // ── Financial metrics — 2×2 grid ──
  const gap = 0.4
  const bdr = 0.2
  const cellW = (CW - gap - 2 * bdr) / 2
  const cellH = 40 // was 33 — too tight, crowded the divider against the unit text
  const gridH = cellH * 2 + gap + 2 * bdr
  const gridY = y

  // Outer container fill (gap/border colour)
  setC(pdf, TRACK, 'fill')
  pdf.roundedRect(ML, gridY, CW, gridH, 2, 2, 'F')

  // 4 white cells
  setC(pdf, '#ffffff', 'fill')
  const cx0 = ML + bdr
  const cx1 = ML + bdr + cellW + gap
  const cy0 = gridY + bdr
  const cy1 = gridY + bdr + cellH + gap
  pdf.rect(cx0, cy0, cellW, cellH, 'F')
  pdf.rect(cx1, cy0, cellW, cellH, 'F')
  pdf.rect(cx0, cy1, cellW, cellH, 'F')
  pdf.rect(cx1, cy1, cellW, cellH, 'F')

  // Outer border stroke
  setC(pdf, TRACK, 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(ML, gridY, CW, gridH, 2, 2, 'S')

  // Tile content rendering helper — vertical rhythm reworked so the divider
  // sits clear of the unit text above it (was 1mm, nearly touching) and the
  // sub-label has even breathing room on both sides of that divider.
  function tileContent(
    tx: number, ty: number, tw: number,
    label: string, value: string, unit: string, sub: string,
  ) {
    const padX = 8
    const padY = 9
    const ix = tx + padX
    const iy = ty + padY

    // Label — 8.5px uppercase #aaa, letter-spacing 0.14em
    setC(pdf, LABEL_A, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6.4) // 8.5px
    spacedText(pdf, label.toUpperCase(), ix, iy, 0.32) // 0.14em

    // Value — 26px weight 300 #0a1a0f
    setC(pdf, INK, 'text')
    pdf.setFont(F(), 'normal') // weight 300 → normal
    pdf.setFontSize(19) // 26px
    pdf.text(value, ix, iy + 11)

    // Unit — 11px #999
    setC(pdf, UNIT_C, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(8.5) // 11px
    pdf.text(unit, ix, iy + 17)

    // Sub — divider + 9px #bbb uppercase, letter-spacing 0.06em
    const subDivY = iy + 21
    setC(pdf, TRACK, 'draw')
    pdf.setLineWidth(0.18)
    pdf.line(ix, subDivY, tx + tw - padX, subDivY)
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7) // 9px
    spacedText(pdf, sub.toUpperCase(), ix, subDivY + 5.5, 0.15) // 0.06em
  }

  // Tile 1 — Total Annual Savings
  tileContent(cx0, cy0, cellW,
    'Total Annual Savings',
    fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD),
    'labor + process',
    `${cap(calculations.confidenceLevel ?? 'medium')} confidence`,
  )

  // Tile 2 — Hours Reclaimed/yr
  tileContent(cx1, cy0, cellW,
    'Hours Reclaimed/yr',
    calculations.hoursReclaimedPerYear != null
      ? String(calculations.hoursReclaimedPerYear.toLocaleString()) : '\u2014',
    'efficiency adjusted',
    `${Math.round((calculations.efficiencyFactor ?? 0.75) * 100)}% efficiency factor`,
  )

  // Tile 3 — Payback Period
  tileContent(cx0, cy1, cellW,
    'Payback Period',
    fmtMonths(calculations.paybackMonths),
    `on ${fmt(calculations.assumedBudgetMidpointLocal)} investment`,
    (calculations.paybackMonths ?? 0) <= 36
      ? 'Investment recovered yr 3'
      : `Break-even ~${((calculations.paybackMonths ?? 0) / 12).toFixed(1)} yrs`,
  )

  // Tile 4 — 3-Year ROI
  tileContent(cx1, cy1, cellW,
    '3-Year ROI',
    fmtPct(calculations.threeYearROIPercent),
    'net of investment',
    `Cost of inaction: ${fmt(calculations.costOfInaction90DaysLocal)}/90d`,
  )

  y = gridY + gridH + 4

  // ── Transition into Opportunity Analysis ──
  y = ensureSpace(pdf, y, 26)
  y = renderTransition(pdf, y, `These scores translate into a concrete set of opportunities, starting with the fastest path to measurable ROI.`)

  // ════════════════════════════════════════════════════════════════════════════
  // OPPORTUNITY ANALYSIS
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, 55)
  y = sectionLabel(pdf, y, 'Opportunity Analysis')

  y = renderNarrative(pdf, y, `Targeted automation offers immediate relief for your company/organization's core pain points in slow customer onboarding and repetitive content generation. Deploying quick wins can deliver tangible results in as little as 5 to 8 weeks. These initial initiatives directly address manual bottlenecks while requiring relatively low implementation effort. Securing these early operational victories will establish momentum for more complex, multi-step agent deployments in the future.`)

  if (opportunities.length === 0) {
    setC(pdf, MUTED, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8.5)
    pdf.text('No opportunities identified.', ML, y + 6)
  } else {
    for (const opp of opportunities) {
      if (y > PAGE_H - 65) {
        pdf.addPage()
        pageBg(pdf)
        pageFooter(pdf)
        y = 16
      }
      y = oppCard(pdf, opp, y, fmt)
    }
  }

  // ── Transition into Next Steps ──
  y = ensureSpace(pdf, y, 26)
  y = renderTransition(pdf, y, `Turning this analysis into results starts with a clear, sequenced set of actions.`)

  // ════════════════════════════════════════════════════════════════════════════
  // NEXT STEPS
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, 45)
  y = sectionLabel(pdf, y, 'Next Steps')

  // Dynamic content
  const topOpp = opportunities[0]
  const autoGap = (context.quantitative.targetAutomationPct ?? 0) - (context.quantitative.currentAutomationPct ?? 0)
  const autoGapStr = autoGap > 0 ? `${autoGap}%` : ''

  y = nextStepRow(pdf, y, '01',
    'Review your opportunities',
    topOpp
      ? `Start with ${topOpp.title} \u2014 highest impact${topOpp.dataReadiness === 'ready' ? ', data ready' : ''}, ${topOpp.timeToValueWeeks}-week time to value. This is your fastest path to measurable ROI.`
      : 'Review the opportunities identified in this assessment and prioritise based on impact, data readiness, and time to value.',
  )

  y = nextStepRow(pdf, y, '02',
    'Generate your AI System Blueprint',
    'Turn these findings into a deployment-ready architecture. Your Blueprint maps data sources, agent structure, and workflow sequencing.',
  )

  y = nextStepRow(pdf, y, '03',
    'Deploy on Aivory\u2122',
    `Launch your first agent, connect your channels, and start closing the ${autoGapStr ? autoGapStr + ' ' : ''}automation gap (the difference between your current automation level of ${context.quantitative.currentAutomationPct ?? 0}% and your target of ${context.quantitative.targetAutomationPct ?? 0}%).`,
  )



  // ── Transition into ROI Projection ──
  y = ensureSpace(pdf, y, 26)
  y = renderTransition(pdf, y, `Here is the financial case underpinning that sequence.`)

  // ════════════════════════════════════════════════════════════════════════════
  // ROI PROJECTION
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, 70)
  y = sectionLabel(pdf, y, 'ROI Projection')

  y = renderNarrative(pdf, y, `An initial AI infrastructure investment of ${fmt(calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD)} is projected to generate a strong ${fmtPct(calculations.threeYearROIPercent)} three-year ROI and reclaim ${Math.round(calculations.hoursReclaimedPerYear || 0).toLocaleString()} hours of team capacity annually. The financial model indicates full payback in ${((calculations.paybackMonths || 0) / 12).toFixed(1)} years, driven by ${fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD)} in continuous annual savings. Crucially, delaying this deployment incurs a direct "cost of inaction" totaling ${fmt(calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR)} every 90 days. Committing to execution now halts this ongoing capital bleed and rapidly shifts human resources toward higher-value, strategic work.`)

  // ── 3 primary metrics across top ──
  // gap gives each column breathing room on both sides of its divider —
  // the previous 0.5mm gap let the divider run straight through the "3" of
  // "3-YEAR ROI", a cramped/cheap-looking collision.
  const roiGap = 6
  const roiW = (CW - roiGap * 2) / 3
  const roiMetrics = [
    {
      l: 'Total Annual Savings',
      v: fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD),
      n: 'labor + process savings',
    },
    {
      l: 'Hours Reclaimed',
      v: calculations.hoursReclaimedPerYear != null
        ? `${calculations.hoursReclaimedPerYear.toLocaleString()} hrs` : '\u2014',
      n: 'per year, efficiency adjusted',
    },
    {
      l: '3-Year ROI',
      v: fmtPct(calculations.threeYearROIPercent),
      n: 'net of investment',
    },
  ]

  const roiTop = y
  roiMetrics.forEach((m, i) => {
    const rx = ML + i * (roiW + roiGap)

    // Label — 8.5px #aaa
    setC(pdf, LABEL_A, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6.4)
    spacedText(pdf, m.l.toUpperCase(), rx, roiTop, 0.32)

    // Value — large
    setC(pdf, INK, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(19) // 26px
    pdf.text(m.v, rx, roiTop + 12)

    // Note — 9px #bbb
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    pdf.text(m.n, rx, roiTop + 18)

    // Vertical divider between metrics — centred in the gap, clear of text
    if (i < roiMetrics.length - 1) {
      setC(pdf, TRACK, 'draw')
      pdf.setLineWidth(0.18)
      const dividerX = rx + roiW + roiGap / 2
      pdf.line(dividerX, roiTop - 2, dividerX, roiTop + 20)
    }
  })

  y = roiTop + 26
  thinDiv(pdf, y)
  y += 4

  // ── Methodology section ──
  if (calculations.hasEnoughDataForProjection && calculations.assumedHourlyRateLocal != null) {
    y = sectionLabel(pdf, y, 'Methodology')

    const effPct = Math.round((calculations.efficiencyFactor ?? 0.75) * 100)
    const hrs = calculations.hoursReclaimedPerYear ?? 0
    const rateNote = calculations.smallTeamRateApplied ? ' (opp-cost)' : ' (industry)'

    const steps: [string, string, string][] = [
      ['01', 'Hours reclaimed per year',
        `${hrs} hrs = manual hrs/wk \u00d7 52 \u00d7 gap \u00d7 ${effPct}%`],
      ['02', 'Annual labor savings',
        `${fmt(calculations.annualLaborSavingsLocal)} = ${hrs} hrs \u00d7 ${fmt(calculations.assumedHourlyRateLocal)}/hr${rateNote}`],
      ['03', 'Annual process savings',
        `${fmt(calculations.annualProcessSavingsLocal)} = 20% of labor savings`],
      ['04', 'Total annual savings',
        `${fmt(calculations.totalAnnualSavingsLocal)} = labor + process`],
    ]
    if (calculations.assumedBudgetMidpointLocal != null) {
      steps.push(['05', 'Payback period',
        `${fmtMonths(calculations.paybackMonths)} = investment \u00f7 savings/yr \u00d7 12`])
      steps.push(['06', '3-Year ROI',
        `${fmtPct(calculations.threeYearROIPercent)} = (savings\u00d73 \u2212 investment) \u00f7 investment \u00d7 100`])
    }

    steps.forEach(([num, desc, result]) => {
      if (y > PAGE_H - 18) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

      thinDiv(pdf, y)
      y += 3

      // Step number — 9px #bbb
      setC(pdf, LABEL, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7)
      pdf.text(num, ML, y + 3.5)

      // Description — 11px #888
      setC(pdf, MUTED, 'text')
      pdf.setFontSize(8.5)
      pdf.text(desc, ML + 12, y + 3.5)

      // Result — 11px weight 500 #0a1a0f
      setC(pdf, INK, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(8.5)
      const rl = pdf.splitTextToSize(result, CW - 75)
      pdf.text(rl, ML + 62, y + 3.5)
      y += Math.max(7, rl.length * 4.5) + 2
    })

    // Negative ROI warning
    const roi3 = calculations.threeYearROIPercent
    if (roi3 != null && roi3 < 0 && calculations.totalAnnualSavingsLocal != null && calculations.assumedBudgetMidpointLocal != null) {
      if (y > PAGE_H - 45) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }
      y += 4

      const sav3 = calculations.totalAnnualSavingsLocal * 3
      const budget = calculations.assumedBudgetMidpointLocal
      const bey = (budget / calculations.totalAnnualSavingsLocal).toFixed(1)
      const need = budget / 3

      setC(pdf, '#fef3e2', 'fill')
      const wH = 34
      pdf.roundedRect(ML, y, CW, wH, 2, 2, 'F')
      setC(pdf, BADGE_A_BD, 'draw')
      pdf.setLineWidth(0.18)
      pdf.roundedRect(ML, y, CW, wH, 2, 2, 'S')

      setC(pdf, WARN_AMB, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(8)
      pdf.text('Why is 3-Year ROI negative?', ML + 7, y + 7)

      setC(pdf, MUTED, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7.5)
      const wl = pdf.splitTextToSize(
        `3-year savings (${fmt(sav3)}) fall ${fmt(budget - sav3)} short of investment (${fmt(budget)}). Break-even ~${bey} yrs.`,
        CW - 14,
      )
      pdf.text(wl, ML + 7, y + 13)

      let warningY = y + 13 + wl.length * 4 + 3
      setC(pdf, ACCENT, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(7)
      pdf.text('Path A: ', ML + 7, warningY)
      setC(pdf, MUTED, 'text')
      pdf.setFont(F(), 'normal')
      pdf.text(`Start with ${fmt(sav3)} or less.`, ML + 7 + pdf.getTextWidth('Path A: '), warningY)
      warningY += 5
      setC(pdf, ACCENT, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.text('Path B: ', ML + 7, warningY)
      setC(pdf, MUTED, 'text')
      pdf.setFont(F(), 'normal')
      pdf.text(`Push savings to ${fmt(need)}/yr+.`, ML + 7 + pdf.getTextWidth('Path B: '), warningY)
      y += wH + 5
    } else if (roi3 != null && roi3 >= 0) {
      y += 4
      setC(pdf, '#eaf5e4', 'fill')
      pdf.roundedRect(ML, y, CW, 9, 2, 2, 'F')
      setC(pdf, ACCENT, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(7.5)
      pdf.text('\u2713  Investment fully recovered within 3 years.', ML + 7, y + 5.5)
      y += 13
    }

    // Confidence line — centred, 9px #bbb
    y += 4
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    pdf.text(
      `Labor rate: ${fmt(calculations.assumedHourlyRateLocal)}/hr  \u00b7  Efficiency factor: ${effPct}%  \u00b7  Confidence: ${calculations.confidenceLevel ?? 'medium'}`,
      PAGE_W / 2, y, { align: 'center' },
    )
  }

  // ── Transition into Diagnostic Context ──
  y = ensureSpace(pdf, y, 26)
  y = renderTransition(pdf, y, `These projections are grounded in the specific context your team described in this assessment.`)

  // ════════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC CONTEXT
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, 45)
  y = sectionLabel(pdf, y, 'Diagnostic Context')

  const ctxRows: [string, string][] = [
    ['Primary Business Objective', qualitative.primaryObjective || 'Not provided'],
    ['Top Pain Points', qualitative.topPainPoints || 'Not provided'],
    ['AI / Technical Capability', qualitative.aiCapability || 'Not provided'],
    ['Implementation Approach', qualitative.implementApproach || 'Not provided'],
    ['Leadership Alignment', qualitative.leadershipAlignment || 'Not provided'],
    ['Prior AI Attempts', qualitative.priorAIAttempts || 'Not provided'],
    ['Consequence of Delay', qualitative.delayConsequence || 'Not provided'],
    ['Risk / Error Tolerance', qualitative.errorTolerance || 'Not provided'],
    ['Data Residency', qualitative.dataResidency || 'Not provided'],
    ['Compliance Requirements', qualitative.compliance?.length ? qualitative.compliance.join(', ') : 'None'],
  ]

  const labelColW = 44

  ctxRows.forEach(([lbl, val]) => {
    if (y > PAGE_H - 22) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

    // Row divider
    thinDiv(pdf, y)
    y += 3

    // Label — 8.5px uppercase #6a9a6a, bold, letter-spacing 0.12em
    setC(pdf, SEC_LBL, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6.4) // 8.5px
    spacedText(pdf, lbl.toUpperCase(), ML, y + 4, 0.3) // 0.12em

    // Value — 12px #444, line-height 1.6
    setC(pdf, VAL_MID, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(9) // 12px
    pdf.setLineHeightFactor(1.6)
    const vl = pdf.splitTextToSize(val, CW - labelColW - 4)
    pdf.text(vl, ML + labelColW, y + 4)
    pdf.setLineHeightFactor(1.15)

    y += Math.max(vl.length * 5 + 4, 10)
  })

  // ════════════════════════════════════════════════════════════════════════════
  // ROOM FOR IMPROVEMENT + RISK REGISTER
  // ════════════════════════════════════════════════════════════════════════════
  if (Array.isArray(roomForImprovement) && roomForImprovement.length > 0) {
    // ── Transition into Room for Improvement ──
    y = ensureSpace(pdf, y, 26)
    y = renderTransition(pdf, y, `Against that context, this is where the greatest friction and opportunity lie.`)

    y = ensureSpace(pdf, y, 55)
    y = sectionLabel(pdf, y, 'Room for Improvement')

    const gap = (context.quantitative.targetAutomationPct ?? 0) - (context.quantitative.currentAutomationPct ?? 0)
    y = renderNarrative(pdf, y, `Your company/organization currently maintains ${context.quantitative.currentAutomationPct ?? 0}% automation coverage against a strategic target of ${context.quantitative.targetAutomationPct ?? 0}%. This ${gap}% gap represents the manual effort continuously wasted on routine data entry and unoptimized tasks. Closing this deficit requires standardizing undocumented core workflows, which is the root cause of the lower Process score. Bridging this gap will ensure consistent, reliable inputs for AI agents and drastically reduce ongoing operational friction.`)

    roomForImprovement.forEach((item) => {
      y = ensureSpace(pdf, y, measureImprovementBlockHeight(pdf, item))
      y = improvementBlock(pdf, item, y)
    })

    // ── Risk Register — inline callout at bottom ──
    if (y > PAGE_H - 30) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }
    y += 6

    if (risks.length === 0) {
      // Section label inline
      setC(pdf, SEC_LBL, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7)
      const rLblW = spacedText(pdf, 'RISK REGISTER', ML, y, 0.5)

      // Green checkmark + no risks text
      setC(pdf, ACCENT, 'text')
      pdf.setFontSize(7)
      pdf.text('\u2713', ML + rLblW + 6, y)
      setC(pdf, LABEL, 'text')
      pdf.text('No risks detected.', ML + rLblW + 10, y)
    } else {
      y = sectionLabel(pdf, y, 'Risk Register')
      const sevC: Record<string, string> = { HIGH: '#c04040', MEDIUM: WARN_AMB, LOW: ACCENT }
      const sorted = [...risks].sort((a, b) =>
        ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[a.severity]! -
        ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[b.severity]!,
      )

      sorted.forEach((risk) => {
        if (y > PAGE_H - 22) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

        const c = sevC[risk.severity] ?? MUTED
        pdf.setFont(F(), 'normal')
        pdf.setFontSize(8.5)
        const rl = pdf.splitTextToSize(risk.risk, CW - 30)

        thinDiv(pdf, y)
        y += 3

        // Severity tag
        setC(pdf, c, 'text')
        pdf.setFont(F(), 'normal')
        pdf.setFontSize(6.4)
        const stw = pdf.getTextWidth(risk.severity)
        spacedText(pdf, risk.severity, ML, y + 3.5, 0.2)

        // Risk text
        setC(pdf, INK, 'text')
        pdf.setFont(F(), 'normal')
        pdf.setFontSize(8.5)
        pdf.text(rl, ML + stw + 8, y + 3.5)

        // Source
        if (risk.source) {
          setC(pdf, LABEL, 'text')
          pdf.setFontSize(6)
          pdf.text(`Source: ${risk.source}`, ML + stw + 8, y + 3.5 + rl.length * 4.5 + 2)
        }

        y += Math.max(rl.length * 4.5 + 6, 8) + (risk.source ? 5 : 0)
      })
    }
  } else if (risks.length > 0) {
    // No improvements but risks exist
    pdf.addPage()
    pageBg(pdf)
    pageFooter(pdf)
    y = 16
    y = sectionLabel(pdf, y, 'Risk Register')
    const sevC: Record<string, string> = { HIGH: '#c04040', MEDIUM: WARN_AMB, LOW: ACCENT }
    const sorted = [...risks].sort((a, b) =>
      ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[a.severity]! -
      ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[b.severity]!,
    )
    sorted.forEach((risk) => {
      if (y > PAGE_H - 22) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }
      const c = sevC[risk.severity] ?? MUTED
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(8.5)
      const rl = pdf.splitTextToSize(risk.risk, CW - 30)
      thinDiv(pdf, y)
      y += 3
      setC(pdf, c, 'text')
      pdf.setFontSize(6.4)
      const stw = pdf.getTextWidth(risk.severity)
      spacedText(pdf, risk.severity, ML, y + 3.5, 0.2)
      setC(pdf, INK, 'text')
      pdf.setFontSize(8.5)
      pdf.text(rl, ML + stw + 8, y + 3.5)
      if (risk.source) {
        setC(pdf, LABEL, 'text')
        pdf.setFontSize(6)
        pdf.text(`Source: ${risk.source}`, ML + stw + 8, y + 3.5 + rl.length * 4.5 + 2)
      }
      y += Math.max(rl.length * 4.5 + 6, 8) + (risk.source ? 5 : 0)
    })
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CLOSING NOTE — synthesizes the report into a single closing statement
  // before the back cover, so the document ends on a narrated conclusion
  // rather than stopping mid-data on the last risk row.
  // ════════════════════════════════════════════════════════════════════════════
  pdf.addPage()
  pageBg(pdf)
  pageFooter(pdf)
  y = 16

  y = sectionLabel(pdf, y, 'Closing Note')

  const companyLabel = context.company || 'Your organization'
  const gapPct = (context.quantitative.targetAutomationPct ?? 0) - (context.quantitative.currentAutomationPct ?? 0)
  const closingTopOpp = opportunities[0]
  const closingSavings = fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD)

  y = renderNarrative(pdf, y, `${companyLabel} enters this next phase with a composite readiness score of ${Math.round(scores.composite)}, a "${scores.maturityLevel}" foundation strong enough to move from isolated wins to systemic execution. The path forward is not abstract: it starts with ${closingTopOpp ? closingTopOpp.title.toLowerCase() : 'the highest-impact opportunity identified in this assessment'}${gapPct > 0 ? `, and closes the ${gapPct}% automation gap` : ''} one phase at a time. Every figure in this report traces back to the answers your team provided, and every recommendation is sized to what is realistically achievable within the next planning cycle.`)

  y += 2
  y = renderNarrative(pdf, y, `None of this requires a leap of faith. The next step is simply to turn this diagnostic into a deployment plan, and begin compounding the ${closingSavings} in annual savings this analysis identified.`)

  y += 6
  thinDiv(pdf, y)
  y += 8
  setC(pdf, SEC_LBL, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(9.5)
  pdf.text('Warmly, The Aivory Team', ML, y)

  // Aivory signature (grey, colour-adjusted for the light page) closing the
  // document — inline asset, cannot fail.
  {
    const sigW = 46
    const sigH = sigW * (62.9 / 498.7)
    pdf.addImage(SIGNATURE_DARK, 'PNG', ML, y + 6, sigW, sigH, undefined, 'FAST')
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BACK COVER
  // ════════════════════════════════════════════════════════════════════════════
  pdf.addPage()
  await applyPremiumCovers(pdf, 'back')

  pdf.save(`AI_Readiness_Report_${companyName.replace(/\s+/g, '_')}.pdf`)
}
