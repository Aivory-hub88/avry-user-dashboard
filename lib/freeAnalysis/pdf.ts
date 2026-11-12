import { jsPDF } from 'jspdf';
import type { AssessmentStrings } from '@/lib/freeAnalysis/copy';
import { asset } from '@/lib/asset';

/**
 * A4 report for the free Business Operations Analysis.
 *
 * This exists alongside the 1080x1350 PNG cards rather than replacing them.
 * The cards are the on-screen preview and the social artefact — 4:5 is the
 * native LinkedIn/Instagram portrait ratio. The PDF is the thing that gets
 * forwarded to a budget holder, printed, and attached to the email.
 *
 * The deciding argument for having both is the hyperlink. A PNG cannot carry a
 * clickable CTA, so the moment the artefact is forwarded — the conversion event
 * this whole funnel exists for — the upgrade path is dead pixels and the reader
 * has to retype a URL. Here it is a real link annotation.
 *
 * Visually this is the card, on paper: the same cream radial ground, the same
 * Aivory signature mark, the same dotted dial, the same Doto numerals and
 * uppercase micro-labels. Everything is expressed in card pixels and scaled by
 * a single factor, so proportions match the PNG rather than merely rhyming with
 * it. What changes is composition — both cards' content has to land on one A4
 * page — and the fact that the text is real text, not pixels.
 */

// ── Page geometry, in points ─────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const SAFE_BOTTOM = PAGE_H - 28;      // nothing load-bearing in the last ~10mm

/**
 * The card's content box is 900px wide (1080 less its 90px side padding).
 * Every size below is written in those card pixels and multiplied by S, so the
 * PDF is the card at another scale instead of a second, independent design.
 */
const CARD_CONTENT_W = 900;
const S = CONTENT_W / CARD_CONTENT_W;
const px = (cardPx: number) => cardPx * S;

// ── Palette, lifted from the card ────────────────────────────────────────────
const INK = '#111111';
const BODY = '#333333';
const MUTED = '#777777';
const RULE = '#DCDCD7';
const DIAL_TICK = '#D6D6D1';
const NEEDLE = '#FF5757';
const GREEN = '#6B9B5E';
const AMBER = '#D9942F';
const RED = '#FF5757';

let FONT_LOADED = false;
let DOTO_LOADED = false;
const F = () => (FONT_LOADED ? 'Manrope' : 'helvetica');
const FD = () => (DOTO_LOADED ? 'Doto' : 'courier');

export interface AssessmentPdfDimension {
  label: string;
  score: number;
  driverLabel: string;
  driverScore: number;
}

export interface AssessmentPdfInsight {
  title: string;
  driver: string;
  desc: string;
  type: 'strength' | 'blocker';
}

export interface AssessmentPdfInput {
  companyName: string;
  industryLabel: string;
  sizeLabel: string;
  score: number;
  maturity: string;
  quickNote: { title: string; body: string };
  profile: AssessmentPdfDimension[];
  strengths: string[];
  blockers: string[];
  insights: AssessmentPdfInsight[];
  narrative: string;
  closingHook: { finding: string; decline: string };
  diagnosticId: string;
  /** Passed in rather than read from the clock, so callers stay testable. */
  generatedAt: Date;
  /** Absolute, because a forwarded PDF has no origin to resolve against. */
  upgradeUrl: string;
  /** Chrome strings follow the language the visitor read the results in. */
  strings: AssessmentStrings['pdf'];
  /** Card headings, also localised. */
  labels: AssessmentStrings['card'];
  locale: 'en' | 'id';
}

// ── Asset loading ────────────────────────────────────────────────────────────
async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

/**
 * Embeds the real Manrope + Doto TTFs so the text is in the brand faces rather
 * than Helvetica. Same pattern as the dashboard's lib/pdfExport.ts. Falls back
 * silently — a Helvetica report still beats no report.
 *
 * Serving these from public/fonts also fixes the PNG path: html-to-image cannot
 * read cssRules from the cross-origin Google Fonts stylesheet, which is what
 * made card capture take 30s+.
 */
async function loadFonts(pdf: jsPDF): Promise<void> {
  FONT_LOADED = false;
  DOTO_LOADED = false;
  try {
    const [regular, bold, doto] = await Promise.all([
      fetchAsBase64(asset('/fonts/Manrope-Regular.ttf')),
      fetchAsBase64(asset('/fonts/Manrope-Bold.ttf')),
      fetchAsBase64(asset('/fonts/Doto-Regular.ttf')),
    ]);
    if (regular && bold) {
      pdf.addFileToVFS('Manrope-Regular.ttf', regular);
      pdf.addFont('Manrope-Regular.ttf', 'Manrope', 'normal');
      pdf.addFileToVFS('Manrope-Bold.ttf', bold);
      pdf.addFont('Manrope-Bold.ttf', 'Manrope', 'bold');
      FONT_LOADED = true;
    }
    if (doto) {
      pdf.addFileToVFS('Doto-Regular.ttf', doto);
      pdf.addFont('Doto-Regular.ttf', 'Doto', 'normal');
      DOTO_LOADED = true;
    }
  } catch {
    /* keep the Helvetica fallback */
  }
}

/**
 * The Aivory signature mark, as the same pre-rasterised PNG the report email
 * uses (public/aivory-signature.png) — not a live SVG-to-canvas rasterisation.
 *
 * That was the previous approach and it was the bug: rasterising the SVG via
 * Image()+canvas on every PDF build is a second, fragile render path that can
 * fail independently of the on-screen report cards (which the browser renders
 * natively via a plain <img> tag and never touches canvas for). When it failed
 * here, the catch swallowed it silently and jsPDF fell back to drawing the
 * word "AIVORY" in plain Helvetica — which is what shipped to a live report.
 * Fetching the already-rasterised PNG removes that whole failure path: it is
 * the exact asset already proven to render, decoded once, embedded as-is.
 */
async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const base64 = await fetchAsBase64(asset('/aivory-signature.png'));
    if (!base64) return null;
    const dataUrl = `data:image/png;base64,${base64}`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo failed to decode'));
      img.src = dataUrl;
    });
    const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * The card's `radial-gradient(120% 90% at 28% 0%, #fff 0%, #fbfaf7 45%, #f2f0ea 100%)`.
 *
 * jsPDF has no gradient primitive, so this paints concentric ellipses outward-in
 * from the same focus. Vector rather than a raster fill, so it stays a ~40KB file
 * and prints without banding artefacts from a compressed image.
 */
function paintCardGround(pdf: jsPDF): void {
  const OUTER: [number, number, number] = [242, 240, 234];   // #f2f0ea
  const MID: [number, number, number] = [251, 250, 247];     // #fbfaf7
  const INNER: [number, number, number] = [255, 255, 255];   // #ffffff

  pdf.setFillColor(OUTER[0], OUTER[1], OUTER[2]);
  pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');

  const cx = PAGE_W * 0.28;
  const cy = 0;
  const rx = PAGE_W * 1.2;
  const ry = PAGE_H * 0.9;

  const STEPS = 64;
  for (let i = STEPS; i >= 1; i--) {
    const t = i / STEPS;                       // 1 = outer edge, 0 = focus
    const colour = t > 0.45
      ? mix(MID, OUTER, (t - 0.45) / 0.55)
      : mix(INNER, MID, t / 0.45);
    pdf.setFillColor(colour[0], colour[1], colour[2]);
    pdf.ellipse(cx, cy, rx * t, ry * t, 'F');
  }
}

function microLabel(pdf: jsPDF, text: string, x: number, y: number, size = px(13)): void {
  pdf.setFont(F(), 'bold');
  pdf.setFontSize(size);
  pdf.setTextColor(INK);
  pdf.text(text.toUpperCase(), x, y, { charSpace: size * 0.08 });
}

function rule(pdf: jsPDF, y: number, colour = RULE, width = 0.5): void {
  pdf.setDrawColor(colour);
  pdf.setLineWidth(width);
  pdf.line(MARGIN, y, MARGIN + CONTENT_W, y);
}

/** Draws wrapped text and returns the y just past it. Text flows; never clips. */
function paragraph(
  pdf: jsPDF, text: string, x: number, y: number, width: number,
  opts: { size?: number; colour?: string; bold?: boolean; leading?: number } = {},
): number {
  const size = opts.size ?? px(17);
  const leading = opts.leading ?? size * 1.4;
  pdf.setFont(F(), opts.bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(opts.colour ?? INK);
  const lines = pdf.splitTextToSize(text, width) as string[];
  lines.forEach((line, i) => pdf.text(line, x, y + i * leading));
  return y + lines.length * leading;
}

/**
 * The card's dial, unit for unit.
 *
 * The card draws it as a 200-unit SVG viewBox rendered into a 176px box, so
 * every radius here is that viewBox's own number scaled by U. Getting this by
 * eye does not work: the needle has to run from r79 to r96 so that it *crosses*
 * the r84-r92 tick ring rather than floating inside or outside it, and the
 * figure has to sit where the card's absolutely-positioned overlay puts it.
 */
function drawDial(pdf: jsPDF, cx: number, cy: number, box: number, score: number, scoreLabelText: string): void {
  const U = box / 200;              // one unit of the card's viewBox, in points
  const TO_UNITS = 200 / 176;       // the overlay is positioned in the 176px box

  // 60 rim ticks, r84 -> r92, round caps
  pdf.setLineCap(1);
  pdf.setDrawColor(DIAL_TICK);
  pdf.setLineWidth(2.5 * U);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    pdf.line(cx + Math.cos(a) * 84 * U, cy + Math.sin(a) * 84 * U,
             cx + Math.cos(a) * 92 * U, cy + Math.sin(a) * 92 * U);
  }

  // Needle at score/100 of a full clockwise turn from twelve o'clock, r79 -> r96
  const na = (score / 100) * Math.PI * 2 - Math.PI / 2;
  pdf.setDrawColor(NEEDLE);
  pdf.setLineWidth(4 * U);
  pdf.line(cx + Math.cos(na) * 79 * U, cy + Math.sin(na) * 79 * U,
           cx + Math.cos(na) * 96 * U, cy + Math.sin(na) * 96 * U);
  pdf.setLineCap(0);

  // Raised dome, r70, with the card's bevel ring at r69
  pdf.setFillColor(253, 252, 250);
  pdf.circle(cx, cy, 70 * U, 'F');
  pdf.setDrawColor('#E9E7E1');
  pdf.setLineWidth(2 * U);
  pdf.circle(cx, cy, 69 * U, 'S');

  // "SCORE" — 12px at 58px from the top of the 176px box, wide tracking
  const scoreLabelSize = 12 * TO_UNITS * U;
  pdf.setFont(F(), 'normal');
  pdf.setFontSize(scoreLabelSize);
  pdf.setTextColor('#999999');
  pdf.text(scoreLabelText, cx, cy + (67.6 * TO_UNITS - 100) * U,
    { align: 'center', charSpace: scoreLabelSize * 0.18 });

  // The figure — 46px Doto at 78px from the top, line-height 1
  pdf.setFont(FD(), 'normal');
  pdf.setFontSize(46 * TO_UNITS * U);
  pdf.setTextColor(INK);
  pdf.text(String(score), cx, cy + (114.8 * TO_UNITS - 100) * U, { align: 'center' });
}

function bandColour(score: number): string {
  if (score >= 67) return GREEN;
  if (score <= 33) return RED;
  return AMBER;
}

/**
 * Where the last piece of content ended on the most recent build, and the line
 * it must stay above. Exposed so the one-page rule can be checked by measuring
 * rather than by eyeballing a render.
 */
export let lastContentBottom = 0;
export const PDF_SAFE_BOTTOM = SAFE_BOTTOM;

export async function buildAssessmentPdf(input: AssessmentPdfInput): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  const [, logo] = await Promise.all([loadFonts(pdf), loadLogo()]);

  // Document furniture — this is what the file looks like in a file list and in
  // an email client's attachment preview.
  pdf.setProperties({
    title: input.strings.docTitle(input.companyName),
    subject: input.strings.docSubject(input.score, input.maturity),
    author: 'Aivory',
    creator: 'Aivory Free Analysis',
    keywords: 'business operations, operational maturity, analysis, Aivory',
  });

  paintCardGround(pdf);

  let y = MARGIN;

  // ── Header: signature mark left, title right ────────────────────────────────
  const logoH = px(38);
  if (logo) {
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN, y, logoH * logo.ratio, logoH);
  } else {
    pdf.setFont(F(), 'bold');
    pdf.setFontSize(px(30));
    pdf.setTextColor(INK);
    pdf.text('AIVORY', MARGIN, y + logoH * 0.72, { charSpace: 1.4 });
  }

  pdf.setFont(F(), 'normal');
  pdf.setFontSize(px(22));
  pdf.setTextColor(INK);
  pdf.text(input.labels.quickAssessment.toUpperCase(), MARGIN + CONTENT_W, y + px(14), { align: 'right' });
  pdf.text(input.labels.ofBusinessOperations.toUpperCase(), MARGIN + CONTENT_W, y + px(14) + px(22) * 1.35, { align: 'right' });

  y += logoH + px(14);
  rule(pdf, y, INK, 0.8);

  // ── Company info grid ───────────────────────────────────────────────────────
  y += px(24);
  const cols = [
    { label: input.labels.companyName, value: input.companyName || '—' },
    { label: input.labels.industryCategory, value: input.industryLabel || '—' },
    { label: input.labels.industrySize, value: input.sizeLabel || '—' },
  ];
  const colW = CONTENT_W / 3;
  let metaBottom = y;
  cols.forEach((c, i) => {
    const x = MARGIN + i * colW;
    microLabel(pdf, c.label, x, y);
    // Long company names reflow onto a second line instead of being clipped —
    // the fixed-height PNG card truncates them with an ellipsis.
    const end = paragraph(pdf, c.value, x, y + px(18), colW - px(24), { size: px(16), colour: BODY });
    metaBottom = Math.max(metaBottom, end);
  });
  y = metaBottom + px(14);
  rule(pdf, y);

  // ── Maturity chip, dial and quick note ──────────────────────────────────────
  y += px(20);
  const chipLabel = input.maturity.toUpperCase();
  pdf.setFont(FD(), 'normal');
  pdf.setFontSize(px(15));
  const chipW = pdf.getTextWidth(`>> ${chipLabel} <<`) + px(36);
  const chipH = px(25);
  pdf.setFillColor(INK);
  pdf.roundedRect(MARGIN, y, chipW, chipH, chipH / 2, chipH / 2, 'F');
  pdf.setTextColor('#FFFFFF');
  pdf.text(`>> ${chipLabel} <<`, MARGIN + chipW / 2, y + chipH * 0.68, { align: 'center' });

  y += chipH + px(16);
  const dialBox = px(150);
  drawDial(pdf, MARGIN + dialBox / 2, y + dialBox / 2, dialBox, input.score, input.labels.score.toUpperCase());

  const noteX = MARGIN + dialBox + px(28);
  const noteW = MARGIN + CONTENT_W - noteX;
  let noteY = paragraph(pdf, input.quickNote.title, noteX, y + px(24), noteW, { size: px(22), bold: true });
  noteY = paragraph(pdf, input.quickNote.body, noteX, noteY + px(8), noteW, { size: px(16), colour: BODY });

  y = Math.max(y + dialBox, noteY) + px(18);

  // ── Five-dimension profile ──────────────────────────────────────────────────
  microLabel(pdf, input.labels.operationalProfile, MARGIN, y, px(12));
  y += px(20);

  input.profile.forEach(d => {
    const colour = bandColour(d.score);
    pdf.setFont(F(), 'bold');
    pdf.setFontSize(px(15));
    pdf.setTextColor(INK);
    pdf.text(d.label.toUpperCase(), MARGIN, y, { charSpace: px(15) * 0.02 });

    pdf.setFont(FD(), 'normal');
    pdf.setFontSize(px(15));
    pdf.setTextColor(BODY);
    pdf.text(`${d.score}/100`, MARGIN + CONTENT_W, y, { align: 'right' });

    const barY = y + px(8);
    const barH = px(6);
    pdf.setFillColor(228, 226, 220);
    pdf.roundedRect(MARGIN, barY, CONTENT_W, barH, barH / 2, barH / 2, 'F');
    if (d.score > 0) {
      pdf.setFillColor(colour);
      pdf.roundedRect(MARGIN, barY, (CONTENT_W * d.score) / 100, barH, barH / 2, barH / 2, 'F');
    }

    // The driver line belongs to the bar above it, so it sits close to that bar
    // and clear of the next dimension's label.
    pdf.setFont(F(), 'normal');
    pdf.setFontSize(px(12));
    pdf.setTextColor(MUTED);
    pdf.text(`${d.driverLabel} · ${d.driverScore}/3`, MARGIN, barY + barH + px(12));

    y = barY + barH + px(12) + px(23);
  });

  // ── Strengths / constraints ─────────────────────────────────────────────────
  y += px(2);
  rule(pdf, y);
  y += px(18);
  const halfW = CONTENT_W / 2 - px(20);
  microLabel(pdf, input.labels.workingForYou, MARGIN, y, px(12));
  microLabel(pdf, input.labels.holdingYouBack, MARGIN + CONTENT_W / 2 + px(20), y, px(12));
  const listTop = y + px(18);
  const renderList = (items: string[], x: number) => {
    let ly = listTop;
    if (!items.length) {
      return paragraph(pdf, '—', x, ly, halfW, { size: px(16), colour: MUTED });
    }
    items.forEach(item => { ly = paragraph(pdf, item, x, ly, halfW, { size: px(16), colour: BODY }) + px(2); });
    return ly;
  };
  y = Math.max(
    renderList(input.strengths, MARGIN),
    renderList(input.blockers, MARGIN + CONTENT_W / 2 + px(20)),
  ) + px(14);

  rule(pdf, y);
  y += px(22);

  // ── Insights ────────────────────────────────────────────────────────────────
  input.insights.forEach(ins => {
    pdf.setFont(F(), 'bold');
    pdf.setFontSize(px(17));
    pdf.setTextColor(INK);
    pdf.text(ins.title.toUpperCase(), MARGIN, y, { charSpace: px(17) * 0.01 });

    pdf.setFont(F(), 'normal');
    pdf.setFontSize(px(13));
    pdf.setTextColor(MUTED);
    pdf.text(ins.driver, MARGIN + CONTENT_W, y, { align: 'right' });

    // A red rule marks a constraint, standing in for the card's red arrow.
    rule(pdf, y + px(8), ins.type === 'blocker' ? RED : INK, ins.type === 'blocker' ? 1 : 0.6);

    y = paragraph(pdf, ins.desc, MARGIN, y + px(23), CONTENT_W, { size: px(16), colour: BODY }) + px(14);
  });

  // ── Notes ───────────────────────────────────────────────────────────────────
  microLabel(pdf, input.labels.notes, MARGIN, y, px(12));
  y = paragraph(pdf, input.narrative, MARGIN, y + px(18), CONTENT_W, { size: px(16) }) + px(18);

  // ── Closing hook + clickable CTA ────────────────────────────────────────────
  const btnLabel = input.strings.ctaButton;
  pdf.setFont(F(), 'bold');
  pdf.setFontSize(px(16));
  const btnW = pdf.getTextWidth(btnLabel) + px(48);
  const btnH = px(38);

  const hookTop = y;
  const padX = px(22);
  const findingEnd = hookTop + px(26)
    + (pdf.splitTextToSize(input.closingHook.finding, CONTENT_W - padX * 2) as string[]).length * px(18) * 1.4;
  const declineEnd = findingEnd + px(8)
    + (pdf.splitTextToSize(input.closingHook.decline, CONTENT_W - padX * 2) as string[]).length * px(15) * 1.4;
  const btnY = declineEnd + px(12);
  const boxH = btnY + btnH + px(20) - hookTop;

  // A white panel on the cream ground reads as a foreign element pasted onto the
  // page. Tinting it a shade lighter than the ground lifts it without breaking
  // the card's material, and the rule is a hairline rather than a heavy outline.
  pdf.setFillColor(250, 249, 245);
  pdf.roundedRect(MARGIN, hookTop, CONTENT_W, boxH, px(10), px(10), 'F');
  pdf.setDrawColor(RULE);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(MARGIN, hookTop, CONTENT_W, boxH, px(10), px(10), 'S');

  paragraph(pdf, input.closingHook.finding, MARGIN + padX, hookTop + px(26), CONTENT_W - padX * 2,
    { size: px(18), bold: true, leading: px(18) * 1.4 });
  paragraph(pdf, input.closingHook.decline, MARGIN + padX, findingEnd + px(8), CONTENT_W - padX * 2,
    { size: px(15), colour: BODY, leading: px(15) * 1.4 });

  pdf.setFillColor(INK);
  pdf.roundedRect(MARGIN + padX, btnY, btnW, btnH, px(5), px(5), 'F');
  pdf.setFont(F(), 'bold');
  pdf.setFontSize(px(16));
  pdf.setTextColor('#FFFFFF');
  pdf.text(btnLabel, MARGIN + padX + btnW / 2, btnY + btnH * 0.64, { align: 'center' });

  // The whole point of shipping a PDF rather than only a PNG.
  pdf.link(MARGIN + padX, btnY, btnW, btnH, { url: input.upgradeUrl });

  const contentBottom = hookTop + boxH;

  // ── Footer, matching the card's ─────────────────────────────────────────────
  const footY = SAFE_BOTTOM;
  rule(pdf, footY - px(26));
  pdf.setFont(F(), 'normal');
  pdf.setFontSize(px(13));
  pdf.setTextColor(MUTED);
  const stamp = input.generatedAt.toLocaleDateString(input.locale === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  pdf.text(`${input.labels.rights} · ${input.strings.generated} ${stamp} · ${input.strings.ref} ${input.diagnosticId}`, MARGIN, footY);
  if (logo) {
    const fh = px(24);
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN + CONTENT_W - fh * logo.ratio, footY - fh * 0.78, fh * logo.ratio, fh);
  }

  lastContentBottom = contentBottom;
  return pdf;
}
