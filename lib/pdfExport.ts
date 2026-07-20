/**
 * Aivory Business Operations Assessment Report — Premium Editorial PDF Generator
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
import {
  DIM_LABELS,
  fmtGap,
  humanizeRiskSource,
  buildLeadershipClause,
  buildVerdictNarrative,
  buildFirstMoves,
  buildExecutiveSummary,
  buildExecutiveInsight,
  buildAiEnablement,
  DIM_CONSEQUENCE_CHAINS,
  formatConsequenceChain,
  confidenceTileLabel,
  buildDimensionBenchmarkCaption,
  buildRoiTilesCaption,
  buildRiskRegisterCaption,
  buildFoldedConstraintNote,
} from '@/lib/readinessNarrative'
import { getIndustryBenchmark, formatVsMedian, BENCHMARK_DISCLAIMER } from '@/lib/industryBenchmarks'
import { quantifyPainPoints, formatPainPointHours, displayPainPointCost } from '@/lib/bottleneckQuantification'
import { getROISensitivity } from '@/services/deepDiagnostic'

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

// ── Design tokens ──────────────────────────────────────────────────────────────
// Named spacing/type scales, values chosen from what this file already uses
// most (grep-verified against every setFontSize()/`y + N` call below), not
// invented from scratch. The point isn't to migrate every literal in a
// 2000-line file in one pass — it's a lookup table so the NEXT tweak reaches
// for an existing rung instead of adding one more bespoke magic number, which
// is exactly how both bugs fixed in this pass happened: dimBar's "vs industry
// median" caption landing on top of the bar track, and Executive Summary's
// unconditional addPage() leaving a near-empty page. New sections and any
// future edits to existing sections should prefer these constants; a handful
// of the most mechanical, lowest-risk call sites (the pre-section
// `ensureSpace` transition guard) have been migrated below as the pattern.
//
// SPACING SCALE (mm):
//   SP.hair       = 2    tightest gaps — icon/bullet-to-label, caption nudges
//   SP.xs         = 4    divider-to-content gap (thinDiv, sectionLabel rule)
//   SP.sm         = 6    inter-block trailing margin (renderNarrative/renderTransition)
//   SP.md         = 8    section-intro spacing, callout vertical padding
//   SP.lg         = 14   row/card vertical rhythm (nextStepRow top pad, dimBar row height)
//   SP.transitionGuard = 26   headroom reserved via ensureSpace() before a renderTransition
//                              bridge line, so the bridge sentence never opens a page alone
export const SP = { hair: 2, xs: 4, sm: 6, md: 8, lg: 14, transitionGuard: 26 } as const

// TYPE SCALE (pt) — font sizes already in use in this file, named by role:
//   TS.micro    = 6      unit text, badge micro-labels, footnote disclaimers
//   TS.caption  = 6.4    metric captions, "vs median" notes, footer stat labels
//   TS.label    = 7      section labels (sectionLabel), status labels
//   TS.small    = 7.5    step numbers ("01"), small headings, SCORE DRIVERS heading
//   TS.body     = 8.5    paragraph/list body copy (dimBar names, risk text, next-step bodies)
//   TS.value    = 10     narrative body copy, title-weight small headings
//   TS.subhead  = 11.5   card/opportunity/improvement titles (C1: bumped from
//                        10.5 so a bold subhead sits a clear SIZE step — not
//                        just a weight step — above the 10pt normal body it
//                        captions; the old 10.5-vs-10 gap read as "same size,
//                        slightly bolder", i.e. the muddy hierarchy C1 fixes)
//   TS.metric   = 11.5   metric-grid values
//   TS.display  = 19     supporting tile figures (financial metric tiles)
//   TS.hero     = 30     the ONE dominant metric per section (C2) — ~3× the
//                        supporting figures around it (score ring uses ~30pt
//                        Doto to the dimension numbers' 10pt; the Financial
//                        Case hero mirrors that ratio)
// Not every call site has been migrated to reference TS — see the file-level
// design-QA notes — but new/edited sections should pick a rung from this
// scale rather than adding another one-off size.
export const TS = { micro: 6, caption: 6.4, label: 7, small: 7.5, body: 8.5, value: 10, title: 10.5, subhead: 11.5, metric: 11.5, sectionHeadline: 13, display: 19, hero: 30 } as const

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
  // Section headline must read as a HEADLINE — clearly larger than body copy.
  // It previously rendered at 7pt against 10pt body (renderNarrative), i.e.
  // 30% SMALLER than the text it introduced, which collapsed the hierarchy on
  // the printed page. TS.sectionHeadline (13pt) is ~1.3x body so the level is
  // unmistakable at a glance.
  pdf.setFontSize(TS.sectionHeadline)
  // Tracking eased from 0.5 → 0.35: letter-spacing that reads as deliberate at
  // 7pt becomes gappy once the glyphs are nearly twice the size.
  const tw = spacedText(pdf, title.toUpperCase(), ML, y, 0.35)

  // Extending rule — centred on the cap height of the (now taller) headline
  // rather than the old fixed −1.2mm, which would have crossed through the
  // glyphs. Cap height ≈ fontSize(pt) × 0.3528 mm/pt × ~0.7.
  const capHeight = TS.sectionHeadline * 0.3528 * 0.7
  setC(pdf, RULE, 'draw')
  pdf.setLineWidth(0.18) // 0.5px
  pdf.line(ML + tw + 4, y - capHeight / 2, ML + CW, y - capHeight / 2)

  return y + 12 // headline is taller — a little more breathing room beneath
}

/**
 * TABLE OF CONTENTS
 *
 * A single entry in the report's contents page. `page` is the 1-based jsPDF
 * page number the section's heading actually landed on — recorded at render
 * time, never predicted (see `tocMark` in exportReportToPdf).
 */
export interface TocEntry {
  title: string
  page: number
  /** Sub-sections (currently only Methodology, nested inside Financial Case). */
  sub?: boolean
}

/**
 * Draws the contents list onto an ALREADY-RESERVED page.
 *
 * jsPDF renders linearly, so a section's page number is unknowable until the
 * section is drawn. The two-pass approach used here:
 *   1. Immediately after the editorial letter, reserve a page (addPage + the
 *      standard pageBg/pageFooter treatment) and remember its page number.
 *   2. Render the whole report as normal, pushing a TocEntry with
 *      pdf.getCurrentPageInfo().pageNumber each time a section heading is
 *      actually emitted — so conditionally-skipped sections simply never get
 *      an entry, and a section pushed onto a fresh page by ensureSpace records
 *      the page it landed on, not the one it was measured from.
 *   3. At the end, pdf.setPage(reserved) and call this to fill it in.
 *
 * Deliberately draws NO background/footer of its own: those were applied when
 * the page was reserved, and re-running pageBg here would paint the gradient
 * image over the footer that is already on the page.
 */
export function renderContents(pdf: jsPDF, entries: TocEntry[]): void {
  let y = 16
  y = sectionLabel(pdf, y, 'Contents')

  entries.forEach((e) => {
    if (y > PAGE_H - 20) return // defensive: the list comfortably fits one page
    const indent = e.sub ? 8 : 0

    // Row rule above each entry — the same 0.18mm TRACK hairline the report
    // uses everywhere else, so the list reads as one editorial system.
    thinDiv(pdf, y - 4, ML + indent, ML + CW)

    setC(pdf, e.sub ? LABEL : INK, 'text')
    pdf.setFont(e.sub ? F() : FB(), e.sub ? 'normal' : 'bold')
    pdf.setFontSize(e.sub ? TS.body : TS.value)
    pdf.text(e.title, ML + indent, y + 2)

    setC(pdf, e.sub ? LABEL : MUTED, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(TS.body)
    pdf.text(String(e.page), ML + CW, y + 2, { align: 'right' })

    // Uniform row pitch, sub-entries included — an indent + lighter weight
    // already reads as "nested", and varying the pitch as well made the rules
    // around Methodology sit visibly off the rhythm of the rest of the list.
    y += SP.lg
  })
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

/**
 * Segment-aware sibling of renderNarrative — renders a paragraph as mixed
 * normal/bold runs so key figures and consequential phrases (composite
 * score, band name, weakest dimension, key dollar amounts) read as visually
 * weighted, enterprise-deliverable style, instead of uniform paragraph text.
 * Same font size/colour/line-height as renderNarrative; only the per-word
 * weight differs. Deliberately additive: renderNarrative's signature and
 * every existing plain-string call site are untouched, so nothing that
 * already works can regress. jsPDF's splitTextToSize has no concept of
 * mixed styling, so wrapping is done manually, word by word.
 */
function renderNarrativeSegments(
  pdf: jsPDF, y: number, segments: Array<{ text: string; bold?: boolean }>,
): number {
  pdf.setFontSize(10)
  pdf.setLineHeightFactor(1.5)

  const words: Array<{ text: string; bold: boolean }> = []
  segments.forEach((seg) => {
    seg.text.split(/(\s+)/).forEach((w) => {
      if (w.length === 0) return
      words.push({ text: w, bold: !!seg.bold })
    })
  })

  const lineHeight = 5.2
  const maxX = ML + CW
  let cx = ML
  let cy = y + 4

  words.forEach((w) => {
    const isSpace = w.text.trim().length === 0
    pdf.setFont(w.bold ? FB() : F(), w.bold ? 'bold' : 'normal')
    const ww = pdf.getTextWidth(w.text)
    if (!isSpace && cx + ww > maxX) {
      cx = ML
      cy += lineHeight
    }
    if (isSpace && cx === ML) return // don't indent a wrapped line with a leading space
    setC(pdf, w.bold ? INK : CONTENT_C, 'text')
    pdf.text(w.text, cx, cy)
    cx += ww
  })

  pdf.setLineHeightFactor(1.15)
  // Matches renderNarrative's `y + lines.length * 5.2 + 8` for the same
  // rendered line count (verified: for a single unwrapped line, cy stays
  // y+4, so this reduces to y + 1*5.2 + 8 exactly).
  return cy + 9.2
}

/**
 * Splits `text` into {text, bold} segments by marking each phrase in
 * `phrases` as bold (in the order it's found), leaving everything else at
 * normal weight. Lets 2-3 high-visibility call sites add inline emphasis to
 * strings built in lib/readinessNarrative.ts WITHOUT changing that file's
 * exported string-returning signatures — the on-screen result page calls
 * those same builders and renders plain text, so the shared sentence itself
 * must stay markup-free. The bolding here is a PDF-only presentation layer
 * on top of the identical shared sentence.
 */
function boldSubstrings(text: string, phrases: Array<string | null | undefined>): Array<{ text: string; bold: boolean }> {
  const unique = [...new Set(phrases.filter((p): p is string => !!p && p.length > 0))]
  if (unique.length === 0) return [{ text, bold: false }]
  // Longest first so a phrase that contains a shorter one (e.g. a full
  // opportunity title vs. a dimension label it happens to include) matches
  // as the more specific run.
  const sorted = unique.sort((a, b) => b.length - a.length)
  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  const boldSet = new Set(sorted)
  return text.split(re).filter((p) => p.length > 0).map((p) => ({ text: p, bold: boldSet.has(p) }))
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

  // Score number — C6: 28px Doto (was 36px). With the smaller ring radius the
  // old glyph nearly touched the ring stroke; 28px keeps the number the
  // section hero (still ~3× the dimension-bar numbers, C2) while leaving a
  // balanced margin of clear space inside the ring.
  const scoreImg = await renderTextToPngDataUrl(
    String(score), '400 28px "Doto", monospace', INK,
  )
  if (scoreImg) {
    const swMm = scoreImg.width * 0.264583
    const shMm = scoreImg.height * 0.264583
    pdf.addImage(scoreImg.dataUrl, 'PNG', cx - swMm / 2, cy - shMm / 2 + 1, swMm, shMm, undefined, 'FAST')
  } else {
    setC(pdf, INK, 'text')
    pdf.setFont(FD(), 'normal')
    pdf.setFontSize(21)
    pdf.text(String(score), cx, cy + 2.5, { align: 'center' })
  }

  // Status label below number — 9px #6a9a6a uppercase
  setC(pdf, SEC_LBL, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.6)
  spacedText(pdf, label.toUpperCase(), cx, cy + 8.5, 0.3, { align: 'center' })

  // COMPOSITE SCORE below ring — 9px #bbb
  setC(pdf, LABEL, 'text')
  pdf.setFontSize(6.6)
  spacedText(pdf, 'COMPOSITE SCORE', cx, cy + r + 7, 0.25, { align: 'center' })
}

/** Dimension bar: name (11px #888) · 1.5px track · green fill · value right (Doto 13px #0a1a0f). */
function dimBar(
  pdf: jsPDF, x: number, y: number, w: number, label: string, score: number,
  /** Phase E1.1/E2.1 — optional industry median (0-100). Undefined/null =
   *  no benchmark for this industry, bar renders exactly as before. */
  medianVsLabel?: string | null,
  median?: number | null,
): number {
  // Name
  setC(pdf, MUTED, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.5) // 11px
  pdf.text(cap(label), x, y + 3)

  // Value — right-aligned, Doto 13px (with "vs median" note alongside when present)
  setC(pdf, INK, 'text')
  pdf.setFont(FD(), 'normal')
  pdf.setFontSize(10) // 13px
  pdf.text(String(score), x + w, y + 3, { align: 'right' })
  if (medianVsLabel) {
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'italic')
    pdf.setFontSize(6.2)
    // Sits below the track (barY ± barH/2 ≈ y+5.55..y+6.45) — was previously
    // y+7.5, which overlapped the bar for this font size/leading.
    pdf.text(medianVsLabel, x + w, y + 9.5, { align: 'right' })
  }

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

  // Median marker — C3: a small filled DIAMOND (rotated square), not a thin
  // coloured tick. The solid-green bar fill and the median marker previously
  // differed only by hue (two greens → a faint amber line), which collapses
  // to near-identical greys in a B/W print. A diamond is distinguishable by
  // SHAPE alone, so the "your score vs industry median" read survives
  // grayscale. Drawn as two triangles sharing the top/bottom vertices, with a
  // thin white keyline so it stays legible even when it lands on the fill.
  if (typeof median === 'number') {
    const tickX = x + w * (Math.max(0, Math.min(100, median)) / 100)
    const hw = 1.15 // half-width (mm)
    const hh = 1.7  // half-height (mm)
    // White halo so the diamond reads on top of the green fill.
    setC(pdf, '#ffffff', 'draw')
    pdf.setLineWidth(0.9)
    pdf.line(tickX, barY - hh, tickX + hw, barY)
    pdf.line(tickX + hw, barY, tickX, barY + hh)
    pdf.line(tickX, barY + hh, tickX - hw, barY)
    pdf.line(tickX - hw, barY, tickX, barY - hh)
    // Filled diamond in a dark ink so it contrasts against both the fill and
    // the track in grayscale.
    setC(pdf, '#5a4a10', 'fill')
    pdf.triangle(tickX, barY - hh, tickX + hw, barY, tickX, barY + hh, 'F')
    pdf.triangle(tickX, barY - hh, tickX - hw, barY, tickX, barY + hh, 'F')
  }

  return y + (medianVsLabel ? 16.5 : 14)
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
  // C1 — subhead rung: 11.5pt bold sits a clear size+weight step above the
  // 10pt normal body copy (was 10.5pt, only ~0.5pt above body → muddy).
  pdf.setFontSize(11.5)
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
  // Track + fill. impact is a 0-10 scale (classifyQuadrant's 5.5 threshold in
  // services/deepDiagnostic.ts confirms it), but this renderer is the only
  // thing standing between a malformed/out-of-range value (a stale stored
  // context, bad manual data, a future scale change) and a bar that spills
  // past the card — clamp the fraction defensively rather than trust the
  // input is always in range.
  const impactFraction = Math.max(0, Math.min((opp.impact ?? 0) / 10, 1))
  setC(pdf, TRACK, 'fill')
  pdf.rect(ML + pad, barY, barW, 0.53, 'F')
  setC(pdf, ACCENT, 'fill')
  pdf.rect(ML + pad, barY, barW * impactFraction, 0.53, 'F')
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

  // Title — C1 subhead rung: 11pt bold, a clear step above 8.5pt body.
  const contentX = ML + 13 // ~36px gap
  setC(pdf, INK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(11)
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

  // Title — C1 subhead rung: 11.5pt bold, clear step above 10pt body.
  setC(pdf, INK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(11.5)
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
    const titleLines = (title || 'Business Operations\nAssessment').toUpperCase().split('\n')
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
    // (The decorative ring glyph that used to sit right of the second title
    // line was removed — it read as an unexplained artefact next to the
    // cover title rather than as brand furniture.)

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

  const p1 = `Thank you for completing the Business Operations Assessment. What follows is a diagnostic of where ${companyLabel} stands today: not a generic scorecard, but a reading of your own answers, your goals, your constraints, and the gap between where you are and where you're aiming to be.`
  const p1Lines = pdf.splitTextToSize(p1, CW - 10)
  pdf.text(p1Lines, cx, 94)
  let ny = 94 + p1Lines.length * 6.3 + 8

  const p2 = topOppTitle
    ? `The findings point to a clear starting point: ${topOppTitle.toLowerCase()}, alongside the financial case and a sequenced plan to act on it. Every number that follows traces back to what you told us.`
    : `The pages ahead lay out your composite operational health score, the opportunities with the fastest path to ROI, and a sequenced plan to act on them. Every number that follows traces back to what you told us.`
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
  spacedText(pdf, 'COMPOSITE OPERATIONAL HEALTH SCORE', ML, stripY + 9, 0.3)

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

/**
 * Reusable dark "A NOTE FROM AIVORY" letter page — the same treatment as the
 * diagnostic's editorialSpread, exported so the Blueprint and Roadmap exports
 * can open with the identical premium note (with the white Aivory signature).
 * Adds its own page. footerStats renders the grounding data strip.
 */
export function renderAivoryNote(
  doc: jsPDF,
  opts: {
    greeting: string
    paragraphs: string[]
    footerStats?: Array<{ label: string; value: string; align?: 'left' | 'right' }>
  },
) {
  doc.addPage()
  setC(doc, COVER_BG, 'fill')
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  const cx = ML

  setC(doc, '#8fb87f', 'text')
  doc.setFont(FB(), 'bold')
  doc.setFontSize(7.5)
  spacedText(doc, 'A NOTE FROM AIVORY', cx, 58, 0.5)

  setC(doc, '#ffffff', 'text')
  doc.setFont(F(), 'normal')
  doc.setFontSize(17)
  doc.text(opts.greeting, cx, 78)

  setC(doc, '#dce8d6', 'text')
  doc.setFont(F(), 'normal')
  doc.setFontSize(11.5)
  doc.setLineHeightFactor(1.7)
  let ny = 94
  opts.paragraphs.forEach((p) => {
    const lines = doc.splitTextToSize(p, CW - 10)
    doc.text(lines, cx, ny)
    ny += lines.length * 6.3 + 8
  })
  doc.setLineHeightFactor(1.15)

  ny += 6
  setC(doc, '#8fb87f', 'text')
  doc.setFont(F(), 'normal')
  doc.setFontSize(11)
  doc.text('Warmly, The Aivory Team', cx, ny)

  const sigW = 46
  const sigH = sigW * (62.9 / 498.7)
  doc.addImage(SIGNATURE_WHITE, 'PNG', cx, ny + 8, sigW, sigH, undefined, 'FAST')

  if (opts.footerStats?.length) {
    const stripY = PAGE_H - 46
    setC(doc, '#3f5c46', 'draw')
    doc.setLineWidth(0.18)
    doc.line(ML, stripY, ML + CW, stripY)
    opts.footerStats.forEach((st) => {
      const align = st.align ?? 'left'
      const x = align === 'right' ? ML + CW : ML
      setC(doc, '#8fb87f', 'text')
      doc.setFont(FB(), 'bold')
      doc.setFontSize(6.4)
      spacedText(doc, st.label.toUpperCase(), x, stripY + 9, 0.3, { align })
      setC(doc, '#ffffff', 'text')
      doc.setFont(F(), 'normal')
      doc.setFontSize(13)
      spacedText(doc, st.value, x, stripY + 20, 0.2, { align })
    })
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPORT NARRATIVE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Safe string coercion for qualitative values that may be strings or arrays. */
function qstr(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  return typeof v === 'string' ? v : ''
}

// fmtGap, RISK_SOURCE_LABELS/humanizeRiskSource, MATURITY_BANDS and
// DIM_CONSTRAINT_NOTES live in lib/readinessNarrative.ts — shared verbatim
// with the on-screen result page.

/** Labeled bullet list used by the Business Operations Analysis section. Handles page breaks. */
function renderAiList(pdf: jsPDF, y: number, heading: string, items: string[]): number {
  y = ensureSpace(pdf, y, 18)
  setC(pdf, SEC_LBL, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.6)
  spacedText(pdf, heading.toUpperCase(), ML, y, 0.3)
  y += 5
  for (const item of items) {
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8.8)
    const lines = pdf.splitTextToSize(String(item), CW - 7)
    y = ensureSpace(pdf, y, lines.length * 4.6 + 3)
    setC(pdf, ACCENT, 'text')
    pdf.text('•', ML + 1, y)
    setC(pdf, MUTED, 'text')
    pdf.setLineHeightFactor(1.45)
    pdf.text(lines, ML + 6, y)
    pdf.setLineHeightFactor(1.15)
    y += lines.length * 4.6 + 2.2
  }
  return y + 4
}

/**
 * Accent callout box — shared treatment for the AI-recommended next step
 * (Business Operations Analysis) and the Executive Insight blocks that close
 * every major section (§6 of the narrative brief). `label` defaults to the
 * original "RECOMMENDED NEXT STEP" so existing call sites are unaffected.
 */
function renderNextStepCallout(pdf: jsPDF, y: number, text: string, label = 'RECOMMENDED NEXT STEP'): number {
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(9)
  pdf.setLineHeightFactor(1.5)
  const lines = pdf.splitTextToSize(text, CW - 16)
  const boxH = lines.length * 4.8 + 13
  y = ensureSpace(pdf, y, boxH + 4)
  setC(pdf, '#eaf5e4', 'fill')
  pdf.roundedRect(ML, y, CW, boxH, 2, 2, 'F')
  setC(pdf, '#c0ddb0', 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(ML, y, CW, boxH, 2, 2, 'S')
  setC(pdf, ACCENT, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.2)
  spacedText(pdf, label, ML + 7, y + 6, 0.35)
  setC(pdf, '#2f4f2f', 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(9)
  pdf.setLineHeightFactor(1.5)
  pdf.text(lines, ML + 7, y + 11.5)
  pdf.setLineHeightFactor(1.15)
  return y + boxH + 6
}

/**
 * C4 — the closing call-to-action steps (AI Enablement) rendered as a single
 * filled, tinted CTA panel — deliberately DISTINCT from the Methodology's
 * plain numbered rows (grey numbers on hairline dividers). The most
 * business-important moment of the report must not read like documentation:
 * this block gets an accent-tinted card, a left accent spine, an eyebrow
 * header, and accent-filled step chips, so a reader instantly recognises it
 * as "what to do next" rather than more reference material. The whole panel
 * is measured up front and kept on one page (ensureSpace) so the CTA never
 * splits across a page break.
 */
function renderCtaSteps(
  pdf: jsPDF, y: number, heading: string,
  steps: Array<{ num: string; title: string; body: string }>,
): number {
  const padX = 8
  const numCol = 12
  const bodyX = ML + padX + numCol
  const bodyW = CW - padX * 2 - numCol
  const headerH = 9

  // Measure every row's body so the panel height is exact.
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(TS.body)
  const rows = steps.map((s) => {
    pdf.setLineHeightFactor(1.5)
    const lines = pdf.splitTextToSize(s.body, bodyW)
    pdf.setLineHeightFactor(1.15)
    const h = 5.5 /*title*/ + lines.length * 4.4 + 7 /*row padding*/
    return { ...s, lines, h }
  })
  const totalH = headerH + rows.reduce((a, r) => a + r.h, 0) + 6

  y = ensureSpace(pdf, y, totalH + 4)

  // Panel: accent-tinted fill + left accent spine (the distinct "this is the
  // CTA" signal; Methodology has neither).
  setC(pdf, '#eaf5e4', 'fill')
  pdf.roundedRect(ML, y, CW, totalH, 2.5, 2.5, 'F')
  setC(pdf, '#c0ddb0', 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(ML, y, CW, totalH, 2.5, 2.5, 'S')
  setC(pdf, ACCENT, 'fill')
  pdf.rect(ML, y + 2.5, 1.4, totalH - 5, 'F')

  // Eyebrow header.
  setC(pdf, ACCENT, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.4)
  spacedText(pdf, heading.toUpperCase(), ML + padX, y + 6.5, 0.4)

  let ry = y + headerH + 3
  rows.forEach((r, i) => {
    if (i > 0) {
      setC(pdf, '#cfe4c2', 'draw')
      pdf.setLineWidth(0.15)
      pdf.line(ML + padX, ry - 2, ML + CW - padX, ry - 2)
    }
    // Accent-filled step chip (numbered) — a filled marker, not a bare grey
    // number, so the steps read as actionable.
    setC(pdf, ACCENT, 'fill')
    pdf.circle(ML + padX + 2.4, ry + 1.6, 2.6, 'F')
    setC(pdf, '#ffffff', 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6)
    pdf.text(r.num, ML + padX + 2.4, ry + 2.5, { align: 'center' })

    // Title (subhead rung) + body.
    setC(pdf, '#25401f', 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(TS.subhead)
    pdf.text(r.title, bodyX, ry + 3)

    setC(pdf, '#3f5c3f', 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(TS.body)
    pdf.setLineHeightFactor(1.5)
    pdf.text(r.lines, bodyX, ry + 8)
    pdf.setLineHeightFactor(1.15)

    ry += r.h
  })

  return y + totalH + 6
}

/** Amber banner mirroring the on-screen low-confidence warning + missing inputs. */
function renderConfidenceBanner(pdf: jsPDF, y: number, confidence: string, missing: string[]): number {
  const msg =
    `${cap(confidence)} confidence projection — these figures are based on limited input data and internal benchmarks, and may not reflect actual outcomes.` +
    (missing.length ? ` Missing inputs: ${missing.join(', ')}.` : '')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(8.2)
  pdf.setLineHeightFactor(1.45)
  const lines = pdf.splitTextToSize(msg, CW - 14)
  const boxH = lines.length * 4.3 + 8
  y = ensureSpace(pdf, y, boxH + 4)
  setC(pdf, BADGE_A_BG, 'fill')
  pdf.roundedRect(ML, y, CW, boxH, 2, 2, 'F')
  setC(pdf, BADGE_A_BD, 'draw')
  pdf.setLineWidth(0.18)
  pdf.roundedRect(ML, y, CW, boxH, 2, 2, 'S')
  setC(pdf, WARN_AMB, 'text')
  pdf.text(lines, ML + 7, y + 5.5)
  pdf.setLineHeightFactor(1.15)
  return y + boxH + 6
}

/**
 * Compact metric grid (4 columns per row) for the secondary ROI figures.
 *
 * Sizing: values 11.5pt (TS.metric) → 8pt and row height 17mm → 13mm, the same
 * ~30% reduction applied to the primary Financial Case row above. Labels stay
 * at 5.6pt — they are already at the legibility floor for print, and the
 * product owner's note was about the metric BOXES and the number text, not the
 * eyebrows.
 *
 * The auto-shrink loop mirrors the primary row's: at 4 columns each cell is
 * only ~39.75mm wide, which a long currency string ("IDR 151,483,266") can
 * still exceed even at 8pt, and jsPDF will happily overrun into the
 * neighbouring column rather than wrap. Shrinking to a 6pt floor guarantees
 * the value stays inside its own cell for every currency.
 */
function renderMetricGrid(
  pdf: jsPDF, y: number,
  metrics: Array<{ l: string; v: string; n?: string }>,
): number {
  const cols = 4
  const gapX = 5
  const w = (CW - gapX * (cols - 1)) / cols
  const rowH = 13
  for (let i = 0; i < metrics.length; i += cols) {
    y = ensureSpace(pdf, y, rowH + 2)
    metrics.slice(i, i + cols).forEach((m, j) => {
      const x = ML + j * (w + gapX)
      setC(pdf, LABEL_A, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(5.6)
      spacedText(pdf, m.l.toUpperCase(), x, y, 0.18)
      setC(pdf, INK, 'text')
      pdf.setFont(F(), 'normal')
      let vSize = 8
      pdf.setFontSize(vSize)
      while (vSize > 6 && pdf.getTextWidth(m.v) > w - 1.5) {
        vSize -= 0.25
        pdf.setFontSize(vSize)
      }
      pdf.text(m.v, x, y + 5.5)
      if (m.n) {
        setC(pdf, LABEL, 'text')
        pdf.setFont(F(), 'normal')
        pdf.setFontSize(5.6)
        pdf.text(m.n, x, y + 9.5)
      }
    })
    y += rowH
  }
  return y
}

/** Conservative / Base / Optimistic 3-Year ROI range row. */
function renderScenarioRange(
  pdf: jsPDF, y: number,
  sc: { low?: number | null; base?: number | null; high?: number | null },
  effPct: number,
): number {
  const roiFmt = (v: number | null | undefined): string =>
    v == null || !isFinite(v) ? '—' : v >= 999 ? '>999%' : `${Math.round(v)}%`
  const cells: Array<{ l: string; v: string; bg: string; tx: string }> = [
    { l: 'CONSERVATIVE', v: roiFmt(sc.low), bg: '#f4f4f0', tx: MUTED },
    { l: 'BASE', v: roiFmt(sc.base), bg: '#eaf5e4', tx: ACCENT },
    { l: 'OPTIMISTIC', v: roiFmt(sc.high), bg: '#f4f4f0', tx: MUTED },
  ]
  y = ensureSpace(pdf, y, 30)
  setC(pdf, LABEL_A, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(6.4)
  spacedText(pdf, '3-YEAR ROI RANGE', ML, y, 0.32)
  y += 4
  const gapX = 4
  const w = (CW - gapX * 2) / 3
  cells.forEach((c, i) => {
    const x = ML + i * (w + gapX)
    setC(pdf, c.bg, 'fill')
    pdf.roundedRect(x, y, w, 14, 1.5, 1.5, 'F')
    setC(pdf, LABEL, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(5.6)
    spacedText(pdf, c.l, x + 4, y + 5, 0.25)
    setC(pdf, c.tx, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(11)
    pdf.text(c.v, x + 4, y + 11)
  })
  y += 18
  setC(pdf, LABEL, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6.4)
  pdf.text(`Range reflects 50%–90% automation efficiency; base case uses ${effPct}%.`, ML, y)
  return y + 6
}

/**
 * Operational Constraints (risk register) renderer — shared by both layout branches
 * (with and without an Operational Improvement Priorities section), replacing two
 * previously duplicated loops.
 */
function renderRiskRegister(
  pdf: jsPDF, y: number, risks: DiagnosticContext['risks'],
  // Contents tracking: pushed to only on the branch that actually emits an
  // "Operational Constraints" section heading. The zero-risk branch renders a
  // one-line "No risks detected" note rather than a section, so it must NOT
  // appear in the contents list.
  tocMark?: (title: string) => void,
): number {
  if (y > PAGE_H - 30) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 } else { y += 6 }

  if (risks.length === 0) {
    setC(pdf, SEC_LBL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    const rLblW = spacedText(pdf, 'OPERATIONAL CONSTRAINTS', ML, y, 0.5)
    setC(pdf, ACCENT, 'text')
    pdf.setFontSize(7)
    pdf.text('✓', ML + rLblW + 6, y)
    setC(pdf, LABEL, 'text')
    pdf.text('No risks detected.', ML + rLblW + 10, y)
    return y + 8
  }

  tocMark?.('Operational Constraints')
  y = sectionLabel(pdf, y, 'Operational Constraints')

  // Phase E2.6 — same builder as the on-screen RiskCard list caption, so
  // the high-severity concentration line reads identically on both surfaces.
  const riskCaption = buildRiskRegisterCaption(risks)
  if (riskCaption) {
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(6.8)
    const capLines = pdf.splitTextToSize(riskCaption, CW)
    pdf.text(capLines, ML, y)
    y += capLines.length * 3.2 + 3
  }

  const sevC: Record<string, string> = { HIGH: '#c04040', MEDIUM: WARN_AMB, LOW: ACCENT }
  const sorted = [...risks].sort((a, b) =>
    ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[a.severity]! -
    ({ HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>)[b.severity]!,
  )

  sorted.forEach((risk) => {
    const c = sevC[risk.severity] ?? MUTED
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8.5)
    const rl = pdf.splitTextToSize(risk.risk, CW - 30)

    // Break on the item's MEASURED height (risk lines + source line) — a fixed
    // threshold let multi-line items spill into the footer.
    const itemH = 3 + 3.5 + rl.length * 4.5 + (risk.source ? 7 : 0) + 4
    if (y + itemH > PAGE_H - 16) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

    thinDiv(pdf, y)
    y += 3

    setC(pdf, c, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(6.4)
    const stw = pdf.getTextWidth(risk.severity)
    spacedText(pdf, risk.severity, ML, y + 3.5, 0.2)

    setC(pdf, INK, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(8.5)
    pdf.text(rl, ML + stw + 8, y + 3.5)

    if (risk.source) {
      setC(pdf, LABEL, 'text')
      pdf.setFontSize(6)
      pdf.text(`Signal: ${humanizeRiskSource(risk.source)}`, ML + stw + 8, y + 3.5 + rl.length * 4.5 + 2)
    }

    y += Math.max(rl.length * 4.5 + 6, 8) + (risk.source ? 5 : 0)
  })
  return y
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function exportReportToPdf(
  _elementId: string,
  companyName: string,
  context?: DiagnosticContext,
  aiAnalysis?: Record<string, any> | null,
) {
  if (!context) {
    try {
      const raw = localStorage.getItem('aivory_diagnostic_context')
      if (raw) context = JSON.parse(raw) as DiagnosticContext
    } catch { /* ignore */ }
  }
  if (!context) throw new Error('No diagnostic context')

  const { scores, calculations, opportunities, risks, qualitative, roomForImprovement, scoreDrivers } = context
  const currency = (context.currency || 'USD') as 'USD' | 'EUR' | 'GBP' | 'IDR'
  const fmt = (v: number | null | undefined) => fmtCurrency(v, currency)
  const cAny = calculations as any
  const company = context.company || 'Your organization'

  const pdf = new jsPDF('p', 'mm', 'a4')
  await loadManrope(pdf)

  // Report meta
  const sd = new Date(context.submittedAt)
  const reportId = `RPT-${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}${String(sd.getDate()).padStart(2, '0')}-001`
  const dateStr = sd.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ════════════════════════════════════════════════════════════════════════════
  await applyPremiumCovers(pdf, 'front', `Business Operations\nAssessment`, {
    company: context.company,
    date: dateStr,
    reportId,
  })

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — EDITORIAL SPREAD (letter page)
  // ════════════════════════════════════════════════════════════════════════════
  editorialSpread(pdf, context)

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — CONTENTS (reserved now, filled in at the very end)
  //
  // Two-pass: jsPDF renders linearly, so no section's page number is known
  // until it is drawn. Reserve the page here so it sits between the editorial
  // letter and the Executive Summary, collect real page numbers via tocMark()
  // as each section renders, then setPage() back and draw the list before
  // save(). Same pageBg + pageFooter treatment as every other content page.
  // ════════════════════════════════════════════════════════════════════════════
  pdf.addPage()
  pageBg(pdf)
  pageFooter(pdf)
  const contentsPageNumber = pdf.getCurrentPageInfo().pageNumber

  const toc: TocEntry[] = []
  /**
   * Records the page a section heading ACTUALLY landed on. Must be called at
   * the heading itself — i.e. after any ensureSpace()/addPage() that precedes
   * it — otherwise a section pushed onto the next page would be indexed to the
   * page it was measured from. Sections that are conditionally skipped never
   * call this, so the contents list always reflects what was rendered.
   */
  const tocMark = (title: string, sub = false) => {
    toc.push({ title, page: pdf.getCurrentPageInfo().pageNumber, sub })
  }
  /** tocMark + sectionLabel in one call, for the linear sections below. */
  const tocSection = (yy: number, title: string): number => {
    tocMark(title)
    return sectionLabel(pdf, yy, title)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXECUTIVE SUMMARY — same builder as the on-screen page (readinessNarrative.ts)
  // ════════════════════════════════════════════════════════════════════════════
  pdf.addPage()
  pageBg(pdf)
  pageFooter(pdf)
  let y = 16

  y = tocSection(y, 'Executive Summary')

  const execScoreOf = (k: string) => Math.round((scores as unknown as Record<string, number>)[k] ?? 0)
  const execTopOpportunityTitle = opportunities[0]?.title ?? null
  const execBusinessValueLabel = (calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD) != null
    ? fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD)
    : null
  const execSummaryText = buildExecutiveSummary({
    company,
    composite: scores.composite,
    maturityLevel: scores.maturityLevel,
    weakestKey: scores.weakestDimension,
    weakestScore: execScoreOf(scores.weakestDimension),
    strongestKey: scores.strongestDimension,
    strongestScore: execScoreOf(scores.strongestDimension),
    businessValueLabel: execBusinessValueLabel,
    topOpportunityTitle: execTopOpportunityTitle,
  })
  // Bold the figures an executive scans for first: composite score, maturity
  // band, top opportunity, and the headline dollar figure — same shared
  // sentence as the on-screen page, PDF-only emphasis layered on top.
  // Bold targets track buildExecutiveSummary's wording — it says "N out of
  // 100", not "N/100" (the "/100" form belongs to the diagnosis narrative).
  y = renderNarrativeSegments(pdf, y, boldSubstrings(execSummaryText, [
    `${Math.round(scores.composite)} out of 100`,
    `"${scores.maturityLevel}"`,
    execTopOpportunityTitle?.toLowerCase() ?? null,
    execBusinessValueLabel,
  ]))

  // ════════════════════════════════════════════════════════════════════════════
  // OPERATIONAL HEALTH — continues directly beneath Executive Summary when
  // there's room instead of always forcing a fresh page, which previously
  // left Executive Summary looking like a near-empty page (a 3-4 sentence
  // block followed by ~80% blank space before the footer).
  // ════════════════════════════════════════════════════════════════════════════
  const opHealthTop = y + 4
  y = ensureSpace(pdf, opHealthTop, 150)
  if (y === opHealthTop) {
    y = thinDiv(pdf, y) + 4
  }

  y = tocSection(y, 'Operational Health')

  // Data-driven narrative — previously a hardcoded template that claimed
  // "fully aligned leadership and previous AI successes" regardless of the
  // user's actual answers.
  const scoreOf = (k: string) => Math.round((scores as unknown as Record<string, number>)[k] ?? 0)
  const strongestKey = scores.strongestDimension
  const weakestKey = scores.weakestDimension
  const leadershipRaw = qualitative.leadershipAlignment || ''
  const leadershipClause = buildLeadershipClause(leadershipRaw)
  const priorRaw = qualitative.priorAIAttempts || ''
  const isFirstAttempt = priorRaw.startsWith('No')
  const priorClause = isFirstAttempt
    ? 'As this is the organization’s first AI initiative, the sequencing below prioritises proven, low-complexity automations first.'
    : priorRaw
      ? 'Previous AI attempts give the team practical deployment experience to build on.'
      : ''
  // Deliberately does NOT restate "operates at a [band] maturity level with a
  // composite score of N" — the Executive Summary directly above already
  // opens with that exact claim, and the score ring a few lines below shows
  // it graphically. Repeating it a third way here read as copy-paste filler.
  // This section's job is the scorecard breakdown, so it leads with that.
  y = renderNarrative(pdf, y, `${DIM_LABELS[strongestKey] ?? cap(strongestKey)} (${scoreOf(strongestKey)}) is the strongest foundation to build on, while ${DIM_LABELS[weakestKey] ?? cap(weakestKey)} (${scoreOf(weakestKey)}) is the clearest gap and the first constraint to address. ${leadershipClause}${priorClause ? ' ' + priorClause : ''}`)

  // ── Two-column: score ring left · dimension bars right ──
  // C6: arcR 20 → 17 (the addendum flagged the ring + caption as oversized /
  // needing rebalance). Ring right edge = arcCx + arcR = 53+17 = 70mm, still
  // well clear of the dimension-bar column at barX = ML+82 = 100mm.
  const arcCx = ML + 35
  const arcCy = y + 28
  const arcR = 17
  await scoreArc(pdf, arcCx, arcCy, arcR, scores.composite, scores.maturityLevel)

  // Phase E1.1/E2.1 — industry benchmark overlay (pure display, no score
  // change). null when qualitative.industry is missing/unrecognized; every
  // consumer below degrades to its pre-Phase-E rendering in that case.
  const industryBenchmark = getIndustryBenchmark(qualitative.industry)
  if (industryBenchmark) {
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'italic')
    pdf.setFontSize(6.4)
    pdf.text(
      formatVsMedian(scores.composite, industryBenchmark.composite) ?? '',
      arcCx, arcCy + arcR + 15, { align: 'center' },
    )
  }

  const barX = ML + 82
  const barW = CW - 82
  let by = y + 2
  // All six dimensions — matches the on-screen radar. Old stored contexts may
  // predate the security dimension; skip keys that have no score rather than
  // rendering a bogus 0 bar.
  const dims: Array<'strategy' | 'data' | 'process' | 'people' | 'governance' | 'security'> = [
    'strategy', 'data', 'process', 'people', 'governance', 'security',
  ]
  dims.forEach((d) => {
    const s = (scores as unknown as Record<string, number | undefined>)[d]
    if (typeof s !== 'number') return
    const point = industryBenchmark?.[d]
    by = dimBar(pdf, barX, by, barW, DIM_LABELS[d] ?? d, s, point ? formatVsMedian(s, point) : null, point?.median ?? null)
  })
  if (industryBenchmark) {
    // Phase E2.6 — same builder as the on-screen DimensionBenchmarkBars
    // caption, so the "so what" line can never independently drift between
    // the two surfaces.
    const dimCaption = buildDimensionBenchmarkCaption(
      scores as unknown as Record<string, number>, industryBenchmark,
    )
    if (dimCaption) {
      setC(pdf, MUTED, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(6.4)
      const capLines = pdf.splitTextToSize(dimCaption, barW)
      pdf.text(capLines, barX, by + 2)
      by += capLines.length * 3 + 2
    }
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'italic')
    pdf.setFontSize(6)
    pdf.text(BENCHMARK_DISCLAIMER, barX, by + 2, { maxWidth: barW })
    by += 7
  }

  y = Math.max(arcCy + arcR + (industryBenchmark ? 20 : 12), by) + 6

  // Phase E1.2/E2.2 — compact "Score drivers" sub-list per dimension. Pulls
  // from the same context.scoreDrivers computed in
  // services/deepDiagnostic.ts as the on-screen DimensionDrivers accordion
  // — shared data, no PDF-only copy of the labels. Renders nothing when
  // scoreDrivers is absent (contexts stored before this feature shipped).
  if (scoreDrivers) {
    y = ensureSpace(pdf, y, 30)
    setC(pdf, ACCENT, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(7.5)
    pdf.text('SCORE DRIVERS', ML, y)
    y += 5

    dims.forEach((d) => {
      const items = scoreDrivers[d]
      if (!items || items.length === 0) return
      y = ensureSpace(pdf, y, 14)

      setC(pdf, INK, 'text')
      pdf.setFont(FB(), 'bold')
      pdf.setFontSize(7.5)
      pdf.text(DIM_LABELS[d] ?? d, ML, y)
      y += 4

      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7.2)
      pdf.setLineHeightFactor(1.35)
      items.slice(0, 3).forEach((item) => {
        const arrow = item.direction === 'raised' ? '+' : '-'
        setC(pdf, item.direction === 'raised' ? ACCENT : '#b8873a', 'text')
        pdf.text(arrow, ML + 2, y)
        setC(pdf, MUTED, 'text')
        const lines = pdf.splitTextToSize(item.label, CW - 8)
        pdf.text(lines, ML + 6, y)
        y += lines.length * 3.6 + 1
      })
      pdf.setLineHeightFactor(1.15)
      y += 2
    })
    y += 4
  }

  // (A boxed 4-tile "Financial metrics" preview used to sit here — Business
  // Value Created / Recovered Capacity / Payback / 3-Year ROI. It was removed
  // entirely: it fully duplicated the Financial Case section one page later,
  // which covers the same four figures plus seven more, borderless, in
  // proper detail. A teaser that repeats what the very next section says in
  // full is redundant, not a preview — Operational Health now ends with the
  // scorecard (ring + bars + drivers) and hands off to the Diagnosis.
  y += 4

  // ════════════════════════════════════════════════════════════════════════════
  // EXECUTIVE OPERATIONAL DIAGNOSIS — answers "what's slowing the business
  // down, and what do we do first?" directly from the score band.
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, SP.transitionGuard)
  y = renderTransition(pdf, y, `What this score means for ${company} — and what to do first — is summarised below.`)

  y = ensureSpace(pdf, y, 60)
  y = tocSection(y, 'Executive Operational Diagnosis')

  const verdictText = buildVerdictNarrative({
    company,
    composite: scores.composite,
    maturityLevel: scores.maturityLevel,
    weakestKey,
    weakestScore: scoreOf(weakestKey),
    strongestKey,
    strongestScore: scoreOf(strongestKey),
  })
  // Bold the score, band, and the weakest/strongest dimension clauses — the
  // read-in-ten-seconds version of "what's the verdict and why."
  y = renderNarrativeSegments(pdf, y, boldSubstrings(verdictText, [
    `${Math.round(scores.composite)}/100`,
    `"${scores.maturityLevel}"`,
    `${DIM_LABELS[weakestKey] ?? cap(weakestKey)} (${scoreOf(weakestKey)})`,
    `${DIM_LABELS[strongestKey] ?? cap(strongestKey)} (${scoreOf(strongestKey)})`,
  ]))

  // The first moves — numbered rows, ordered foundation → proof → mandate.
  const firstImprovement = Array.isArray(roomForImprovement) && roomForImprovement.length > 0
    ? roomForImprovement[0] : null
  const verdictTopOpp = opportunities[0] ?? null
  const hasBudgetInput = (calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD) != null
  const firstMoves = buildFirstMoves({
    firstImprovement,
    topOpportunity: verdictTopOpp,
    hasBudgetInput,
    leadershipClause,
  })
  firstMoves.forEach((move, i) => {
    y = nextStepRow(pdf, y, String(i + 1).padStart(2, '0'), move.title, move.body)
  })

  // Cause → effect chain for the weakest dimension — one narrative line via
  // the existing renderNarrative helper (same chain data the page renders as chips).
  const diagnosisChain = DIM_CONSEQUENCE_CHAINS[weakestKey]
  if (diagnosisChain) {
    y = ensureSpace(pdf, y, 14)
    y = renderNarrative(pdf, y, formatConsequenceChain(diagnosisChain))
  }

  // C5 — when there is exactly ONE operational constraint it does not earn a
  // standalone section (that reads empty/templated); it is folded here as a
  // single "Key constraint: …" line instead. Shared builder → identical
  // wording on the page. 0 risks → nothing; ≥2 → the standalone Operational
  // Constraints section still renders below.
  const foldedConstraint = buildFoldedConstraintNote(risks)
  if (foldedConstraint) {
    y = ensureSpace(pdf, y, 12)
    setC(pdf, INK, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(TS.body)
    const fcLines = pdf.splitTextToSize(foldedConstraint, CW)
    pdf.setLineHeightFactor(1.5)
    pdf.text(fcLines, ML, y)
    pdf.setLineHeightFactor(1.15)
    y += fcLines.length * 4.6 + 4
  }

  y = renderNextStepCallout(pdf, y, buildExecutiveInsight('diagnosis', { weakestKey }), 'EXECUTIVE INSIGHT')

  // ════════════════════════════════════════════════════════════════════════════
  // BUSINESS OPERATIONS ANALYSIS — the model-generated narrative the user
  // sees on screen. Numbers elsewhere stay deterministic; this section is
  // clearly labelled.
  // ════════════════════════════════════════════════════════════════════════════
  if (aiAnalysis && typeof aiAnalysis === 'object') {
    y = ensureSpace(pdf, y, 55)
    y = tocSection(y, 'Business Operations Analysis')

    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    const aiNote = 'Generated by the Aivory analysis model from your answers. All scores and financial figures elsewhere in this report remain deterministic.'
    const aiNoteLines = pdf.splitTextToSize(aiNote, CW)
    pdf.text(aiNoteLines, ML, y)
    y += aiNoteLines.length * 3.6 + 4

    const aiSummary = [aiAnalysis.narrative_summary, aiAnalysis.narrative, aiAnalysis.summary]
      .find((v) => typeof v === 'string' && v.trim())
    if (aiSummary) y = renderNarrative(pdf, y, String(aiSummary).trim())

    const aiStrengths = Array.isArray(aiAnalysis.strengths)
      ? aiAnalysis.strengths.slice(0, 5).map(String) : []
    const aiConstraintsRaw = aiAnalysis.primary_constraints ?? aiAnalysis.blockers
    const aiConstraints = Array.isArray(aiConstraintsRaw)
      ? aiConstraintsRaw.slice(0, 5).map(String) : []
    const aiOppsRaw = aiAnalysis.automation_opportunities ?? aiAnalysis.opportunities
    const aiOpps = Array.isArray(aiOppsRaw) ? aiOppsRaw.slice(0, 5).map(String) : []

    if (aiStrengths.length) y = renderAiList(pdf, y, 'Strengths', aiStrengths)
    if (aiConstraints.length) y = renderAiList(pdf, y, 'Primary Constraints', aiConstraints)
    if (aiOpps.length) y = renderAiList(pdf, y, 'Transformation Opportunities', aiOpps)

    if (typeof aiAnalysis.recommended_next_step === 'string' && aiAnalysis.recommended_next_step.trim()) {
      y = renderNextStepCallout(pdf, y, aiAnalysis.recommended_next_step.trim())
    }
  } else {
    y = ensureSpace(pdf, y, 14)
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7.5)
    const unavail = pdf.splitTextToSize(
      'Business operations analysis was unavailable for this submission. The diagnosis above and all figures in this report are derived deterministically from your answers.', CW)
    pdf.text(unavail, ML, y)
    y += unavail.length * 4 + 6
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BUSINESS CONTEXT — the inputs, placed BEFORE the analysis they ground.
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, SP.transitionGuard)
  y = renderTransition(pdf, y, 'That diagnosis rests on the specific context your team described in this assessment.')

  y = ensureSpace(pdf, y, 45)
  y = tocSection(y, 'Business Context')

  // E1.5 — enhance each pain point with its estimated hours/cost (real data
  // from `painPointHours` when present, otherwise an equal-weight allocation
  // of `hoursReclaimedPerYear` labeled "estimated allocation"). Shared
  // parsing/formatting with the on-screen result page via bottleneckQuantification.ts.
  const quantifiedPainPoints = quantifyPainPoints({
    topPainPoints: qualitative.topPainPoints,
    painPointHours: qualitative.painPointHours,
    hoursReclaimedPerYear: calculations.hoursReclaimedPerYear,
    assumedHourlyRateLocal: calculations.assumedHourlyRateLocal,
  })
  const topPainPointsDisplay = quantifiedPainPoints.length > 0
    ? quantifiedPainPoints
      .map((item) => {
        const hoursLabel = formatPainPointHours(item)
        if (!hoursLabel) return item.label
        const displayCost = displayPainPointCost(item)
        const costLabel = displayCost != null ? ` (~${fmt(displayCost)}/yr)` : ''
        return `${item.label} — ${hoursLabel}${costLabel}`
      })
      .join('; ')
    : qstr(qualitative.topPainPoints) || 'Not provided'

  const ctxRows: [string, string][] = [
    ['Primary Business Objective', qstr(qualitative.primaryObjective) || 'Not provided'],
    ['Top Pain Points', topPainPointsDisplay],
    ['AI / Technical Capability', qstr(qualitative.aiCapability) || 'Not provided'],
    ['Implementation Approach', qstr(qualitative.implementApproach) || 'Not provided'],
    ['Leadership Alignment', qstr(qualitative.leadershipAlignment) || 'Not provided'],
    ['Prior AI Attempts', qstr(qualitative.priorAIAttempts) || 'Not provided'],
    ['Consequence of Delay', qstr(qualitative.delayConsequence) || 'Not provided'],
    ['Risk / Error Tolerance', qstr(qualitative.errorTolerance) || 'Not provided'],
    ['Sources of Resistance', qstr(qualitative.resistanceSources) || 'None reported'],
    ['Data Residency', qstr(qualitative.dataResidency) || 'Not provided'],
    ['Compliance Requirements', qstr(qualitative.compliance) || 'None'],
  ]

  // Slice-2 optional intake answers — appended only when the user actually
  // provided them, so contexts predating the questions render identically.
  if (qstr(qualitative.kpiBaseline)) ctxRows.push(['Operational KPI Baselines', qstr(qualitative.kpiBaseline)])
  if (qstr(qualitative.processOwnership)) ctxRows.push(['Process Ownership', qstr(qualitative.processOwnership)])
  // Note: raw painPointHours text is no longer shown as its own row — it is
  // now folded into the "Top Pain Points" row above via quantifyPainPoints().

  const labelColW = 50

  ctxRows.forEach(([lbl, val]) => {
    if (y > PAGE_H - 22) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

    thinDiv(pdf, y)
    y += 3

    setC(pdf, SEC_LBL, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6.4)
    spacedText(pdf, lbl.toUpperCase(), ML, y + 4, 0.3)

    setC(pdf, VAL_MID, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(9)
    pdf.setLineHeightFactor(1.6)
    const vl = pdf.splitTextToSize(val, CW - labelColW - 4)
    pdf.text(vl, ML + labelColW, y + 4)
    pdf.setLineHeightFactor(1.15)

    y += Math.max(vl.length * 5 + 4, 10)
  })

  // ════════════════════════════════════════════════════════════════════════════
  // TRANSFORMATION OPPORTUNITIES
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, SP.transitionGuard)
  y = renderTransition(pdf, y, 'Against that context, these are the highest-leverage opportunities to pursue first.')

  y = ensureSpace(pdf, y, 55)
  y = tocSection(y, 'Transformation Opportunities')

  if (opportunities.length === 0) {
    // Coherent empty state — the previous build rendered the "immediate
    // relief" narrative and then contradicted it with "No opportunities
    // identified." on the next line.
    y = renderNarrative(pdf, y, `No automation opportunities could be derived from the stored assessment data. This usually means the assessment was completed on an earlier version of the analysis engine — re-running the Deep Diagnostic will generate a prioritised, ranked opportunity set for ${company}.`)
  } else {
    const painPoints = qstr(qualitative.topPainPoints).trim()
    const oppQuickWins = opportunities.filter((o) => o.quadrant === 'quick_win')
    const oppIntroPain = painPoints
      ? `the pain points ${company} reported (${painPoints})`
      : `${company}'s core operational bottlenecks`
    const oppTtvWeeks = oppQuickWins.length > 0
      ? Math.min(...oppQuickWins.map((o) => o.timeToValueWeeks))
      : Math.min(...opportunities.map((o) => o.timeToValueWeeks))
    y = renderNarrative(pdf, y, `Targeted automation offers immediate relief for ${oppIntroPain}. Deploying ${oppQuickWins.length > 0 ? 'quick wins' : 'the first initiatives'} can deliver tangible results in as little as ${oppTtvWeeks} weeks. These initial initiatives directly address manual bottlenecks while requiring relatively low implementation effort, and early operational victories will establish momentum for more complex, multi-step agent deployments.`)

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

  {
    const oppTop = opportunities[0] ?? null
    y = renderNextStepCallout(pdf, y, buildExecutiveInsight('opportunities', {
      topOpportunityTitle: oppTop?.title ?? null,
      topOpportunityTimeToValueWeeks: oppTop?.timeToValueWeeks ?? null,
      topOpportunityDataReadiness: oppTop?.dataReadiness ?? null,
    }), 'EXECUTIVE INSIGHT')
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FINANCIAL CASE
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, SP.transitionGuard)
  y = renderTransition(pdf, y, opportunities.length > 0
    ? 'Here is the financial case underpinning those opportunities.'
    : 'Here is the financial case built from the workload your team reported.')

  y = ensureSpace(pdf, y, 70)
  y = tocSection(y, 'Financial Case')

  // Mirror the on-screen low-confidence banner (incl. the missing inputs the
  // page shows) instead of burying confidence in a tile caption.
  if (!calculations.hasEnoughDataForProjection) {
    y = renderConfidenceBanner(
      pdf, y,
      calculations.confidenceLevel ?? 'low',
      Array.isArray(calculations.missingInputs) ? calculations.missingInputs : [],
    )
  }

  // Null-guarded narrative — never renders "investment of —" / "payback in
  // 0.0 years" when budget is missing.
  const roiHoursStr = Math.round(calculations.hoursReclaimedPerYear || 0).toLocaleString()
  const roiSavingsStr = fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD)
  const roiInactionStr = fmt(calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR)
  const roiComplete =
    calculations.paybackMonths != null &&
    calculations.threeYearROIPercent != null &&
    (calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD) != null
  // Express payback with the SAME months/years threshold the card uses
  // (fmtMonths: <12 → "N months", ≥12 → "X.X years"), so the prose and the
  // Payback Period tile can never disagree — the old prose always said
  // "(months/12).toFixed(1) years", rendering a 9-month payback as "0.8
  // years" (0.8×12 = 9.6 ≠ 9) beside a card reading "9 mo".
  const roiPaybackStr = calculations.paybackMonths != null
    ? ((calculations.paybackMonths as number) >= 12
        ? `${((calculations.paybackMonths as number) / 12).toFixed(1)} years`
        : `${Math.round(calculations.paybackMonths as number)} months`)
    : null
  const roiNarrative = roiComplete
    ? `An initial transformation investment of ${fmt(calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD)} is projected to generate a ${fmtPct(calculations.threeYearROIPercent)} three-year ROI and reclaim ${roiHoursStr} hours of team capacity annually. The financial model indicates full payback in ${roiPaybackStr}, driven by ${roiSavingsStr} in continuous annual savings. Crucially, delaying this transformation incurs a direct "operational cost of delay" totaling ${roiInactionStr} every 90 days. Committing to execution now halts this ongoing capital bleed and rapidly shifts human resources toward higher-value, strategic work.`
    : `Based on the manual workload your team reported, automation is projected to reclaim ${roiHoursStr} hours of team capacity annually${calculations.totalAnnualSavingsLocal != null || calculations.totalAnnualSavingsUSD != null ? `, worth an estimated ${roiSavingsStr} in continuous annual savings` : ''}.${calculations.costOfInaction90DaysLocal != null ? ` Delaying this transformation carries an estimated "operational cost of delay" of ${roiInactionStr} every 90 days.` : ''} Because no implementation budget was provided in the assessment, payback period and three-year ROI are not projected — supplying a budget range completes the financial model. These estimates carry ${calculations.confidenceLevel ?? 'low'} confidence and are based on internal benchmark assumptions rather than client-specific figures.`
  // Bold the figures the financial case hinges on: investment, 3-year ROI,
  // payback, savings, and cost-of-delay — the "so what" of the paragraph.
  const roiInvestmentStr = fmt(calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD)
  const roiPaybackYearsStr = roiPaybackStr
  y = renderNarrativeSegments(pdf, y, boldSubstrings(roiNarrative, roiComplete
    ? [roiInvestmentStr, fmtPct(calculations.threeYearROIPercent), roiPaybackYearsStr, roiSavingsStr, roiInactionStr]
    : [roiSavingsStr, roiInactionStr]))

  // ── 3 primary metrics across top ──
  const roiGap = 6
  const roiW = (CW - roiGap * 2) / 3
  const roiMetrics = [
    {
      l: 'Business Value Created',
      v: fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD),
      n: 'labor + process savings',
    },
    {
      l: 'Recovered Team Capacity',
      v: calculations.hoursReclaimedPerYear != null
        ? `${calculations.hoursReclaimedPerYear.toLocaleString()} hrs` : '—',
      n: 'per year, efficiency adjusted',
    },
    {
      l: '3-Year ROI',
      v: fmtPct(calculations.threeYearROIPercent),
      n: 'net of investment',
    },
  ]

  y = ensureSpace(pdf, y, 26)
  const roiTop = y
  roiMetrics.forEach((m, i) => {
    const rx = ML + i * (roiW + roiGap)
    // C2 — Business Value Created (i === 0) is the hero of the Financial Case,
    // accented and rendered at TS.display (19pt) against the two supporting
    // figures at TS.value (10pt), so the block reads "this is THE number,
    // these two support it" instead of three equally-weighted metrics.
    //
    // Sizing: hero 30pt (TS.hero) → 19pt (TS.display) and supporting 15pt →
    // 10pt (TS.value) — a ~35% reduction on both, per the product owner's
    // "30–40% smaller" note. The old 30pt hero forced long currency strings
    // ("IDR 151,483,266") straight into the auto-shrink loop below, so the
    // rendered size was unpredictable and the block sat cramped in its
    // column; at 19pt the same string fits its 54mm column outright. The
    // hero:supporting ratio stays ~1.9x, so dominance is unchanged — only the
    // absolute scale drops. Row height follows: 27mm → 21mm.
    const isHero = i === 0

    setC(pdf, isHero ? ACCENT : LABEL_A, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(6.4)
    spacedText(pdf, m.l.toUpperCase(), rx, roiTop, 0.32)

    setC(pdf, INK, 'text')
    pdf.setFont(F(), 'normal')
    let vSize = isHero ? TS.display : TS.value
    pdf.setFontSize(vSize)
    while (vSize > 7 && pdf.getTextWidth(m.v) > roiW - 2) {
      vSize -= 0.5
      pdf.setFontSize(vSize)
    }
    pdf.text(m.v, rx, roiTop + (isHero ? 9 : 8))

    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(6.4)
    pdf.text(m.n, rx, roiTop + 14)

    if (i < roiMetrics.length - 1) {
      setC(pdf, TRACK, 'draw')
      pdf.setLineWidth(0.18)
      const dividerX = rx + roiW + roiGap / 2
      pdf.line(dividerX, roiTop - 2, dividerX, roiTop + 16)
    }
  })

  y = roiTop + 21
  thinDiv(pdf, y)
  y += 6

  // ── Secondary metrics — full parity with the on-screen ROI grid ──
  y = renderMetricGrid(pdf, y, [
    { l: 'Recovered Labor Value', v: fmt(calculations.annualLaborSavingsLocal ?? cAny.annualLaborSavingsUSD) },
    { l: 'Process Efficiency Value', v: fmt(calculations.annualProcessSavingsLocal ?? cAny.annualProcessSavingsUSD) },
    { l: 'Payback Period', v: fmtMonths(calculations.paybackMonths) },
    { l: 'Operational Cost of Delay (90d)', v: fmt(calculations.costOfInaction90DaysLocal ?? calculations.costOfInaction90DaysIDR) },
    { l: '3-Year NPV', v: fmt(cAny.npv3YearLocal), n: 'net present value @ 10% discount' },
    { l: 'Annual Ongoing Cost', v: fmt(cAny.annualOngoingCostLocal), n: 'licenses, maintenance & support' },
    { l: 'Net Annual Savings', v: fmt(cAny.netAnnualSavingsLocal), n: 'after ongoing cost' },
    { l: 'Net Payback', v: fmtMonths(cAny.netPaybackMonths), n: 'on net savings' },
  ])

  // Phase E2.6 — same builder as the on-screen ROI tile grid caption, so
  // the labor-vs-process split reads identically on both surfaces.
  {
    const roiCaption = buildRoiTilesCaption(
      calculations.annualLaborSavingsLocal ?? cAny.annualLaborSavingsUSD,
      calculations.annualProcessSavingsLocal ?? cAny.annualProcessSavingsUSD,
    )
    if (roiCaption) {
      y = ensureSpace(pdf, y, 8)
      setC(pdf, LABEL, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(6.8)
      const capLines = pdf.splitTextToSize(roiCaption, CW)
      pdf.text(capLines, ML, y)
      y += capLines.length * 3.2 + 3
    }
  }

  // ── Scenario range (Conservative / Base / Optimistic) — only when at least
  // one scenario value exists; an all-"—" row is noise, not information. ──
  const effPct = Math.round((calculations.efficiencyFactor ?? 0.75) * 100)
  const scenario = cAny.scenarioThreeYearROI
  if (scenario && [scenario.low, scenario.base, scenario.high].some((v: unknown) => v != null)) {
    y += 2
    y = renderScenarioRange(pdf, y, scenario, effPct)
  }

  // ── ROI sensitivity summary (Phase E1.4) — static equivalent of the
  // on-screen tornado chart. No interactive slider in a static PDF (E2.4 is
  // screen-only), but the sensitivity pass itself is genuinely derivable and
  // adds value to the printed report. Uses the same shared, pure
  // getROISensitivity()/calculateROI() as the page and the slider — no
  // duplicated math. Only rendered when the underlying figures exist. ──
  if (calculations.hasEnoughDataForProjection) {
    const sensitivity = getROISensitivity(context)
    const lever = sensitivity[0]
    if (lever && lever.lowValueLocal != null && lever.highValueLocal != null) {
      y = ensureSpace(pdf, y, 12)
      y += 2
      setC(pdf, LABEL, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7.2)
      const sensitivityText =
        `Sensitivity — Business Value Created ranges from ${fmt(lever.lowValueLocal)} at ${lever.lowBoundLabel} efficiency to ` +
        `${fmt(lever.highValueLocal)} at ${lever.highBoundLabel} efficiency (base case ${effPct}%: ${fmt(calculations.totalAnnualSavingsLocal ?? cAny.totalAnnualSavingsUSD)}). ` +
        `Hourly rate and automation gap are fixed inputs for this assessment, not swept.`
      const sensitivityLines = pdf.splitTextToSize(sensitivityText, CW)
      pdf.text(sensitivityLines, ML, y)
      y += sensitivityLines.length * 3.6 + 4
    }
  }

  y = ensureSpace(pdf, y, 10)
  thinDiv(pdf, y)
  y += 4

  // ── Methodology — always rendered when the underlying figures exist, even
  // for low-confidence projections (those are exactly the reports that need
  // the working shown; the confidence banner above carries the caveat). ──
  if (calculations.assumedHourlyRateLocal != null) {
    y = ensureSpace(pdf, y, 40)
    tocMark('Methodology', true)
    y = sectionLabel(pdf, y, 'Methodology')

    const hrs = calculations.hoursReclaimedPerYear ?? 0
    const rateNote = calculations.smallTeamRateApplied ? ' (opp-cost)' : ' (industry)'

    const stepsRaw: [string, string][] = [
      ['Recovered team capacity per year',
        `${hrs} hrs = manual hrs/wk × 52 × gap × ${effPct}%`],
      ['Recovered labor value',
        `${fmt(calculations.annualLaborSavingsLocal)} = ${hrs} hrs × ${fmt(calculations.assumedHourlyRateLocal)}/hr${rateNote}`],
      ['Process efficiency value',
        `${fmt(calculations.annualProcessSavingsLocal)} = 20% of labor savings`],
      ['Business value created',
        `${fmt(calculations.totalAnnualSavingsLocal)} = labor + process`],
    ]
    if (calculations.assumedBudgetMidpointLocal != null) {
      stepsRaw.push(['Payback period',
        `${fmtMonths(calculations.paybackMonths)} = investment ÷ savings/yr × 12`])
      stepsRaw.push(['3-Year ROI',
        `${fmtPct(calculations.threeYearROIPercent)} = (savings×3 − investment) ÷ investment × 100`])
    }
    if (cAny.annualOngoingCostLocal != null) {
      stepsRaw.push(['Ongoing run cost',
        `${fmt(cAny.annualOngoingCostLocal)}/yr = ${Math.round((cAny.ongoingCostRate ?? 0.2) * 100)}% of initial investment`])
    }
    const steps: [string, string, string][] = stepsRaw.map(
      ([desc, result], i) => [String(i + 1).padStart(2, '0'), desc, result],
    )

    steps.forEach(([num, desc, result]) => {
      if (y > PAGE_H - 18) { pdf.addPage(); pageBg(pdf); pageFooter(pdf); y = 16 }

      thinDiv(pdf, y)
      y += 3

      setC(pdf, LABEL, 'text')
      pdf.setFont(F(), 'normal')
      pdf.setFontSize(7)
      pdf.text(num, ML, y + 3.5)

      setC(pdf, MUTED, 'text')
      pdf.setFontSize(8.5)
      pdf.text(desc, ML + 12, y + 3.5)

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
      pdf.text('✓  Investment fully recovered within 3 years.', ML + 7, y + 5.5)
      y += 13
    }

    // Assumptions line — centred
    y += 4
    y = ensureSpace(pdf, y, 8)
    setC(pdf, LABEL, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    pdf.text(
      `Labor rate: ${fmt(calculations.assumedHourlyRateLocal)}/hr  ·  Efficiency factor: ${effPct}%  ·  Confidence: ${calculations.confidenceLevel ?? 'medium'}  ·  FX as of ${cAny.fxAsOf ?? 'latest snapshot'}`,
      PAGE_W / 2, y, { align: 'center' },
    )
    y += 4
  }

  y = renderNextStepCallout(pdf, y, buildExecutiveInsight('financial', {
    hasBudgetInput: (calculations.assumedBudgetMidpointLocal ?? calculations.assumedBudgetMidpointUSD) != null,
    paybackMonths: calculations.paybackMonths,
    threeYearROIPercent: calculations.threeYearROIPercent,
  }), 'EXECUTIVE INSIGHT')

  // ════════════════════════════════════════════════════════════════════════════
  // OPERATIONAL IMPROVEMENT PRIORITIES + OPERATIONAL CONSTRAINTS (RISK REGISTER)
  // ════════════════════════════════════════════════════════════════════════════
  if (Array.isArray(roomForImprovement) && roomForImprovement.length > 0) {
    y = ensureSpace(pdf, y, SP.transitionGuard)
    y = renderTransition(pdf, y, 'This is where the greatest friction — and the fastest payoff — lies before and during adoption.')

    y = ensureSpace(pdf, y, 55)
    y = tocSection(y, 'Operational Improvement Priorities')

    const rfiCurrent = context.quantitative.currentAutomationPct ?? 0
    const rfiTarget = context.quantitative.targetAutomationPct ?? 0
    const rfiGap = rfiTarget - rfiCurrent
    const rootCauseClause = weakestKey === 'process'
      ? 'Closing this deficit starts with standardizing undocumented core workflows — the root cause of the lower Process score.'
      : `Closing this deficit starts with the ${DIM_LABELS[weakestKey] ?? cap(weakestKey)} improvements below.`
    y = renderNarrative(pdf, y, `${company} currently maintains ${fmtGap(rfiCurrent)} automation coverage against a strategic target of ${fmtGap(rfiTarget)}.${rfiGap > 0 ? ` This ${fmtGap(rfiGap)} gap is manual effort spent on routine, unautomated tasks.` : ''} ${rootCauseClause} Bridging this gap gives AI agents consistent, reliable inputs and steadily reduces operational friction.`)

    roomForImprovement.forEach((item) => {
      y = ensureSpace(pdf, y, measureImprovementBlockHeight(pdf, item))
      y = improvementBlock(pdf, item, y)
    })

    const topImprovement = roomForImprovement[0]
    y = renderNextStepCallout(pdf, y, buildExecutiveInsight('improvements', {
      topImprovementTitle: topImprovement?.title ?? null,
      topImprovementAction: topImprovement?.recommendedAction ?? null,
    }), 'EXECUTIVE INSIGHT')

    // C5 — Operational Constraints stands alone only with ≥2 risks. A single
    // risk was folded into the Executive Operational Diagnosis above; 0 risks
    // render nothing at all.
    if (risks.length >= 2) y = renderRiskRegister(pdf, y, risks, tocMark)
  } else if (risks.length >= 2) {
    y = ensureSpace(pdf, y, 45)
    y = renderRiskRegister(pdf, y, risks, tocMark)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AI ENABLEMENT + NEXT STEPS — closes the report by positioning AI as the
  // execution layer (buildAiEnablement, shared with the on-screen page),
  // then the product CTA sequence, placed AFTER the full analysis so the
  // reader has seen the financial case before being asked to act on it.
  // ════════════════════════════════════════════════════════════════════════════
  y = ensureSpace(pdf, y, SP.transitionGuard)
  y = renderTransition(pdf, y, 'Turning this analysis into results starts with where AI fits into the sequence above.')

  y = ensureSpace(pdf, y, 45)
  y = tocSection(y, 'AI Enablement')

  const topOpp = opportunities[0]
  const nsCurrent = context.quantitative.currentAutomationPct ?? 0
  const nsTarget = context.quantitative.targetAutomationPct ?? 0
  const nsGap = nsTarget - nsCurrent

  y = renderNarrative(pdf, y, buildAiEnablement({
    topOpportunityTitle: topOpp?.title ?? null,
    weakestLabel: DIM_LABELS[weakestKey] ?? cap(weakestKey),
  }))

  // C4 — rendered as a distinct tinted CTA panel (renderCtaSteps), NOT as the
  // same plain numbered rows the Methodology section uses.
  y = renderCtaSteps(pdf, y, 'Your Next Steps', [
    {
      num: '1',
      title: 'Review your opportunities',
      body: topOpp
        ? `Start with ${topOpp.title} — highest impact${topOpp.dataReadiness === 'ready' ? ', data ready' : ''}, ${topOpp.timeToValueWeeks}-week time to value. This is your fastest path to measurable ROI.`
        : 'Re-run the Deep Diagnostic to generate a prioritised opportunity list, then prioritise based on impact, data readiness, and time to value.',
    },
    {
      num: '2',
      title: 'Generate your Transformation Blueprint',
      body: 'Turn these findings into a deployment-ready architecture. Your Blueprint maps data sources, agent structure, and workflow sequencing.',
    },
    {
      num: '3',
      title: 'Deploy on Aivory™',
      body: `Launch your first agent, connect your channels, and start closing the${nsGap > 0 ? ` ${fmtGap(nsGap)}` : ''} automation gap (from ${fmtGap(nsCurrent)} automated today to your ${fmtGap(nsTarget)} target).`,
    },
    {
      num: '4',
      title: 'Speak with our advisory team',
      body: 'Prefer a guided walkthrough? Our advisory team offers a complimentary face-to-face session to debrief this report and align it with your roadmap — reach us at advisory@aivory.uk.',
    },
  ])

  // ════════════════════════════════════════════════════════════════════════════
  // CLOSING NOTE — was an unconditional pdf.addPage() regardless of how much
  // room remained after AI Enablement's next-step rows, so a short closing
  // (two narrative paragraphs + signature, ~110mm) routinely landed on a page
  // that was otherwise ~70% blank. Closing Note has no internal per-line page
  // -break guard (it's a single monolithic block, unlike the risk register or
  // improvement blocks), so `needed` here covers the WHOLE section rather
  // than just its opening line, per the ensureSpace doc comment.
  // ════════════════════════════════════════════════════════════════════════════
  const closingTop = y + 4
  y = ensureSpace(pdf, closingTop, 130)
  if (y === closingTop) {
    y = thinDiv(pdf, y) + 4
  }

  y = tocSection(y, 'Closing Note')

  const closingTopOpp = opportunities[0]
  const closingSavings = fmt(calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD)
  const lowConfidence =
    !calculations.hasEnoughDataForProjection ||
    (calculations.confidenceLevel ?? '').toLowerCase() === 'low'
  // "Isolated wins" only makes sense for teams with prior AI attempts — for
  // first-timers the honest framing is a first structured deployment.
  const foundationClause = isFirstAttempt
    ? `a "${scores.maturityLevel}" foundation ready for its first structured, low-risk AI deployments`
    : `a "${scores.maturityLevel}" foundation strong enough to move from isolated wins to systemic execution`

  y = renderNarrative(pdf, y, `${company} enters this next phase with a composite operational health score of ${Math.round(scores.composite)} — ${foundationClause}. The path forward is not abstract: it starts with ${closingTopOpp ? closingTopOpp.title.toLowerCase() : 'the highest-impact opportunity identified in this assessment'}${nsGap > 0 ? `, and closes the ${fmtGap(nsGap)} automation gap` : ''} one phase at a time. Every figure in this report traces back to the answers your team provided, and every recommendation is sized to what is realistically achievable within the next planning cycle.`)

  y += 2
  y = renderNarrative(pdf, y,
    (calculations.totalAnnualSavingsLocal ?? calculations.totalAnnualSavingsUSD) != null
      ? (lowConfidence
          ? `None of this requires a leap of faith. The next step is simply to turn this diagnostic into a deployment plan and begin validating the ${closingSavings} in estimated annual savings this analysis identified — an estimate that will sharpen as budget and workload inputs are confirmed.`
          : `None of this requires a leap of faith. The next step is simply to turn this diagnostic into a deployment plan, and begin compounding the ${closingSavings} in annual savings this analysis identified.`)
      : `None of this requires a leap of faith. The next step is simply to turn this diagnostic into a deployment plan and begin reclaiming the manual hours this analysis identified.`)

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

  // ════════════════════════════════════════════════════════════════════════════
  // CONTENTS — pass 2. Every section has now rendered, so `toc` holds real page
  // numbers for exactly the sections that were emitted. Jump back to the page
  // reserved after the editorial letter and fill it in.
  // ════════════════════════════════════════════════════════════════════════════
  pdf.setPage(contentsPageNumber)
  renderContents(pdf, toc)
  pdf.setPage(pdf.getNumberOfPages())

  pdf.save(`Business_Operations_Assessment_${companyName.replace(/\s+/g, '_')}.pdf`)
}
