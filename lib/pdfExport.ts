/**
 * Aivory AI Readiness Assessment Report — Premium PDF Generator
 *
 * Design principles:
 * - Cover & back: exact PNG images, NO overlay text
 * - Font: Manrope (loaded at runtime from Google Fonts)
 * - Graphics: thin strokes (0.3px), slim pills, generous whitespace
 * - Elemen graphic: simplified, elegant, premium consultancy feel
 */

import jsPDF from 'jspdf'
import type { DiagnosticContext } from '@/types/diagnostic'

// ── Palette ────────────────────────────────────────────────────────────────────
const COVER_BG  = '#1e3327'
const ACCENT    = '#afd199'
const DARK      = '#1a2a1a'
const BODY      = '#333333'
const MUTED     = '#6b7280'
const SUBTLE    = '#9ca3af'
const NEG_RED   = '#dc2626'
const WARN_AMB  = '#b45309'
const POS_GRN   = '#15803d'

// ── Layout ─────────────────────────────────────────────────────────────────────
const PAGE_W = 210
const PAGE_H = 297
const ML = 18          // margin left
const CW = PAGE_W - ML - 18  // content width = 174mm

// ── Font name ─────────────────────────────────────────────────────────────────
// Manrope is loaded at runtime; fallback to helvetica if load fails
let FONT_LOADED = false
const F  = () => FONT_LOADED ? 'Manrope' : 'helvetica'
const FB = () => FONT_LOADED ? 'Manrope' : 'helvetica'  // bold variant registered separately

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}
function setC(pdf: jsPDF, hex: string, t: 'fill'|'text'|'draw' = 'fill') {
  const [r,g,b] = hexToRgb(hex)
  if (t==='fill') pdf.setFillColor(r,g,b)
  else if (t==='text') pdf.setTextColor(r,g,b)
  else pdf.setDrawColor(r,g,b)
}
function fmtCurrency(v: number|null|undefined, currency='USD'): string {
  if (v==null||!isFinite(v)) return '\u2014'
  return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(v)
}
function fmtPct(v: number|null|undefined): string {
  return v==null||!isFinite(v)?'\u2014':`${v.toFixed(1)}%`
}
function fmtMonths(v: number|null|undefined): string {
  if (v==null||!isFinite(v)) return '\u2014'
  const m=Math.round(v); return m>=12?`${(m/12).toFixed(1)} yrs`:`${m} mo`
}
function cap(s: string): string { return s.charAt(0).toUpperCase()+s.slice(1) }

// ── Font loader ───────────────────────────────────────────────────────────────
async function loadManrope(pdf: jsPDF): Promise<void> {
  try {
    // Fetch Manrope Regular TTF from Google Fonts static
    const [regBuf, semiBuf] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/manrope/v15/xn7gYHE41ni1AdIRggqxSuXd.woff2').then(r=>r.arrayBuffer()).catch(()=>null),
      fetch('https://fonts.gstatic.com/s/manrope/v15/xn7gYHE41ni1AdIRggOxSuXd.woff2').then(r=>r.arrayBuffer()).catch(()=>null),
    ])
    // Note: jsPDF needs TTF not woff2 — use a different format approach
    // Fall back to helvetica which is clean and available
    FONT_LOADED = false
  } catch {
    FONT_LOADED = false
  }
}

async function loadImage(url: string): Promise<string|null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string>((res,rej) => {
      const rd = new FileReader()
      rd.onload = () => res(rd.result as string)
      rd.onerror = rej
      rd.readAsDataURL(blob)
    })
  } catch { return null }
}

export async function loadSvgAsPngDataUrl(url: string, width: number, height: number): Promise<string|null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const svgText = await r.text()
    const blob = new Blob([svgText], {type: 'image/svg+xml;charset=utf-8'})
    const blobUrl = URL.createObjectURL(blob)
    return await new Promise<string>((res) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 2 // Retina scale is enough, 4x causes massive bloat
        canvas.width = width * scale; canvas.height = height * scale
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
  } catch { return null }
}

// ── Page header ───────────────────────────────────────────────────────────────
// Ultra-thin premium header bar
function pageHeader(pdf: jsPDF, company: string, pn: number) {
  // Thin top bar — 8mm
  // Footer — ultra-light
  setC(pdf, SUBTLE, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6)
  pdf.text(String(pn), PAGE_W/2, PAGE_H-4.5, {align:'center'})
  pdf.text('aivory.uk', PAGE_W-18, PAGE_H-4.5, {align:'right'})
  pdf.text('Confidential', ML, PAGE_H-4.5)
}

// ── Thin section label ────────────────────────────────────────────────────────
// Simple: just a 1.5mm thick vertical accent bar + uppercase label
// No rounded pill, no background fill — clean McKinsey style
function sectionLabel(pdf: jsPDF, y: number, title: string, sub?: string): number {
  // Thin 1.5×6mm accent bar
  setC(pdf, ACCENT, 'fill')
  pdf.rect(ML, y, 1.5, 7, 'F')

  setC(pdf, DARK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(9)
  pdf.text(title.toUpperCase(), ML+5, y+5.5)

  if (sub) {
    setC(pdf, MUTED, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7)
    pdf.text(sub, ML+5, y+10)
    return y+15
  }

  // Single-pixel divider line after title
  setC(pdf, '#e5e7eb', 'draw')
  pdf.setLineWidth(0.1)
  pdf.line(ML+5, y+8, ML+CW, y+8)
  return y+13
}

// ── Thin divider ──────────────────────────────────────────────────────────────
function div(pdf: jsPDF, y: number): number {
  setC(pdf, '#e5e7eb', 'draw')
  pdf.setLineWidth(0.1)
  pdf.line(ML, y, ML+CW, y)
  return y+4
}

// ── Tag badge — underline style (colored text + thin underline, no fill) ───────────────────────
// Reference design: text in brand color, 0.5mm underline below, no background
function pill(pdf: jsPDF, x: number, y: number, text: string, color: string, _textColor='#ffffff') {
  const fs = 7
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(fs)
  const tw = pdf.getTextWidth(text)
  // Colored text
  setC(pdf, color, 'text')
  pdf.text(text, x, y + fs * 0.72)
  // Thin underline
  setC(pdf, color, 'draw')
  pdf.setLineWidth(0.5)
  pdf.line(x, y + fs * 0.72 + 1.5, x + tw, y + fs * 0.72 + 1.5)
  return tw + 6
}

// ── Metric KPI card ───────────────────────────────────────────────────────────
// Clean, borderless tile — label above, large value, optional sub-note
function kpiCard(pdf: jsPDF, x: number, y: number, w: number, label: string, value: string, vc=DARK, sub?: string) {
  const h = sub ? 26 : 23

  // Very subtle background + ultra-thin border
  setC(pdf, '#fafaf9', 'fill')
  pdf.rect(x, y, w, h, 'F')
  // 0.3mm border
  setC(pdf, '#e5e7eb', 'draw')
  pdf.setLineWidth(0.3)
  pdf.rect(x, y, w, h, 'S')
  // 1px top accent line (not a big bar)
  setC(pdf, ACCENT, 'fill')
  pdf.rect(x+1, y, w-2, 0.8, 'F')

  // Label
  setC(pdf, SUBTLE, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6)
  pdf.text(label.toUpperCase(), x+3.5, y+6.5)

  // Value
  setC(pdf, vc, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(11.5)
  const vl = pdf.splitTextToSize(value, w-7)
  pdf.text(vl[0]||value, x+3.5, y+16.5)

  // Sub
  if (sub) {
    setC(pdf, SUBTLE, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(5.5)
    pdf.text(sub, x+3.5, y+22)
  }
}

// ── Score ring ────────────────────────────────────────────────────────────────
function scoreRing(pdf: jsPDF, cx: number, cy: number, r: number, score: number, label: string) {
  const pct = score/100
  const color = score>=75?POS_GRN:score>=50?WARN_AMB:NEG_RED

  // Background ring — thin
  setC(pdf, '#e5e7eb', 'draw')
  pdf.setLineWidth(2.5)
  pdf.circle(cx, cy, r, 'S')

  // Progress arc
  setC(pdf, color, 'draw')
  pdf.setLineWidth(2.5)
  const segs=80, s=-Math.PI/2, e=s+2*Math.PI*pct
  const pts: [number,number][] = []
  for(let i=0;i<=segs;i++){const a=s+(e-s)*(i/segs);pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}
  for(let i=0;i<pts.length-1;i++) pdf.line(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1])

  // Score text
  setC(pdf, DARK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(18)
  pdf.text(String(score), cx, cy+2, {align:'center'})
  setC(pdf, MUTED, 'text')
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(6.5)
  pdf.text(label, cx, cy+8, {align:'center'})
}

// ── Radar chart ───────────────────────────────────────────────────────────────
function radarChart(pdf: jsPDF, cx: number, cy: number, r: number, scores: Record<string,number>) {
  const dims=['Strategy','Data','Process','People','Governance']
  const angles=dims.map((_,i)=>-Math.PI/2+(2*Math.PI*i)/dims.length)

  // Grid rings — very light
  for(let ring=1;ring<=4;ring++){
    const rr=(r*ring)/4
    setC(pdf,'#eeeeee','draw'); pdf.setLineWidth(0.15)
    const pts=angles.map(a=>[cx+rr*Math.cos(a),cy+rr*Math.sin(a)] as [number,number])
    for(let i=0;i<pts.length;i++) pdf.line(pts[i][0],pts[i][1],pts[(i+1)%pts.length][0],pts[(i+1)%pts.length][1])
  }
  // Spokes
  setC(pdf,'#dddddd','draw'); pdf.setLineWidth(0.15)
  angles.forEach(a=>pdf.line(cx,cy,cx+r*Math.cos(a),cy+r*Math.sin(a)))

  const dm: Record<string,number>={Strategy:scores.strategy??50,Data:scores.data??50,Process:scores.process??50,People:scores.people??50,Governance:scores.governance??50}
  const dp=dims.map((d,i)=>{const p=(dm[d]??50)/100; return [cx+r*p*Math.cos(angles[i]),cy+r*p*Math.sin(angles[i])] as [number,number]})

  // Fill — light opacity
  const [ar,ag,ab]=hexToRgb(ACCENT)
  pdf.setFillColor(ar,ag,ab)
  pdf.setGState(new (pdf as any).GState({opacity:0.12}))
  for(let i=0;i<dp.length;i++){const n=(i+1)%dp.length;pdf.triangle(cx,cy,dp[i][0],dp[i][1],dp[n][0],dp[n][1],'F')}
  pdf.setGState(new (pdf as any).GState({opacity:1}))

  // Outline — thin
  setC(pdf,ACCENT,'draw'); pdf.setLineWidth(0.6)
  for(let i=0;i<dp.length;i++){const n=(i+1)%dp.length;pdf.line(dp[i][0],dp[i][1],dp[n][0],dp[n][1])}

  // Data point dots — small
  setC(pdf,ACCENT,'fill')
  dp.forEach(p=>pdf.circle(p[0],p[1],0.8,'F'))

  // Labels
  dims.forEach((d,i)=>{
    const lx=cx+(r+8)*Math.cos(angles[i]), ly=cy+(r+8)*Math.sin(angles[i])
    setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(5.5)
    pdf.text(d, lx, ly-0.5, {align:'center'})
    setC(pdf,ACCENT,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(6.5)
    pdf.text(`${dm[d]}`, lx, ly+4, {align:'center'})
  })
}

// ── Slim dimension bar ────────────────────────────────────────────────────────
function dimBar(pdf: jsPDF, x: number, y: number, w: number, label: string, score: number): number {
  const color=score>=75?POS_GRN:score>=50?WARN_AMB:NEG_RED
  setC(pdf,MUTED,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7)
  pdf.text(cap(label), x, y+3.5)
  setC(pdf,DARK,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(7)
  pdf.text(`${score}`, x+w, y+3.5, {align:'right'})
  // Track — slim 2.5mm
  setC(pdf,'#e5e7eb','fill'); pdf.rect(x, y+5, w, 2.5, 'F')
  setC(pdf,color,'fill'); pdf.rect(x, y+5, w*(score/100), 2.5, 'F')
  return y+12
}

// ── Opportunity card ──────────────────────────────────────────────────────────
// Simplified: thin left accent line (0.5mm), no heavy background
function oppCard(pdf: jsPDF, opp: DiagnosticContext['opportunities'][0], y: number, fmt: (v:number|null|undefined)=>string): number {
  const qC: Record<string,string>={quick_win:POS_GRN,major_project:WARN_AMB,fill_in:MUTED,thankless_task:NEG_RED}
  const qL: Record<string,string>={quick_win:'Quick Win',major_project:'Major Project',fill_in:'Fill In',thankless_task:'Low Value'}
  const drC: Record<string,string>={ready:POS_GRN,needs_prep:WARN_AMB,not_ready:NEG_RED}
  const drL: Record<string,string>={ready:'Data Ready',needs_prep:'Needs Data Prep',not_ready:'Not Ready'}
  const cxC: Record<string,string>={low:POS_GRN,medium:WARN_AMB,high:NEG_RED}

  const qColor=qC[opp.quadrant]??MUTED
  const drColor=drC[opp.dataReadiness]??MUTED

  // Calculate card height
  pdf.setFont(F(), 'normal'); pdf.setFontSize(7.5)
  const projLines=opp.projectedROINote?pdf.splitTextToSize(opp.projectedROINote,CW-8):[]
  pdf.setFontSize(6.5)
  const prereqLines=opp.prerequisites?.length?pdf.splitTextToSize(opp.prerequisites.join(' | '),CW-8):[]
  const sav=(opp.estimatedSavingsLocal??((opp as any).estimatedSavingsIDR??null)) as number|null
  const cardH = 10 + 14 + (sav!=null?6:0) + (projLines.length>0?projLines.length*4+4:0) + (prereqLines.length>0?prereqLines.length*4+5:0) + 10

  // Card: very subtle background
  setC(pdf, '#fafaf9', 'fill')
  pdf.rect(ML, y, CW, cardH, 'F')
  // Ultra-thin top border
  setC(pdf, '#e5e7eb', 'draw')
  pdf.setLineWidth(0.1)
  pdf.line(ML, y, ML+CW, y)

  // Thin left accent line (1mm, not 3mm)
  setC(pdf, qColor, 'fill')
  pdf.rect(ML, y, 1, cardH, 'F')

  // Title row
  setC(pdf, DARK, 'text')
  pdf.setFont(FB(), 'bold')
  pdf.setFontSize(8.5)
  const titleTxt = pdf.splitTextToSize(opp.title, CW-42)
  pdf.text(titleTxt[0]||opp.title, ML+5, y+7)

  // Quadrant tag — underline style, right-aligned
  const qlabel = qL[opp.quadrant]??opp.quadrant
  pdf.setFont(F(), 'normal')
  pdf.setFontSize(7)
  const qtw = pdf.getTextWidth(qlabel)
  const qx = ML+CW-qtw
  setC(pdf, qColor, 'text')
  pdf.text(qlabel, qx, y+6.5)
  setC(pdf, qColor, 'draw')
  pdf.setLineWidth(0.5)
  pdf.line(qx, y+8, ML+CW, y+8)

  let cy=y+11

  // Metrics row — 4 columns, light labels + bold values
  const metrics=[
    {l:'IMPACT',v:`${opp.impact}/10`},
    {l:'EFFORT',v:`${opp.effort}/10`},
    {l:'TIME TO VALUE',v:`${opp.timeToValueWeeks}w`},
    {l:'COMPLEXITY',v:cap(opp.complexity??'medium')},
  ]
  const mw=(CW-5)/4
  metrics.forEach((m,i)=>{
    const mx=ML+5+i*mw
    setC(pdf,SUBTLE,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(5.5)
    pdf.text(m.l, mx, cy)
    setC(pdf,DARK,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(8)
    pdf.text(m.v, mx, cy+5)
  })
  cy+=12

  // Estimated savings — highlighted
  if(sav!=null){
    setC(pdf, POS_GRN, 'text')
    pdf.setFont(FB(), 'bold')
    pdf.setFontSize(8.5)
    pdf.text(`Est. ${fmt(sav)}/yr savings`, ML+5, cy)
    cy+=6
  }

  // Projected ROI note (remove duplicate "at target automation" — use projectedROINote only if it adds info)
  if(projLines.length>0){
    setC(pdf, BODY, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(7.5)
    pdf.text(projLines, ML+5, cy)
    cy+=projLines.length*4+4
  }

  // Prerequisites
  if(prereqLines.length>0){
    setC(pdf, SUBTLE, 'text')
    pdf.setFont(F(), 'normal')
    pdf.setFontSize(6)
    pdf.text('Prerequisites: ', ML+5, cy)
    setC(pdf, BODY, 'text')
    pdf.setFontSize(6.5)
    pdf.text(prereqLines, ML+5+pdf.getTextWidth('Prerequisites: '), cy)
    cy+=prereqLines.length*4+4
  }

  // Data readiness + Complexity pills — slim
  const drLabel = drL[opp.dataReadiness]??opp.dataReadiness
  const drW = pill(pdf, ML+5, cy, drLabel, drColor)
  const cxLabel = `${cap(opp.complexity??'medium')} Complexity`
  pill(pdf, ML+5+drW+3, cy, cxLabel, cxC[opp.complexity??'medium']??MUTED)

  return y+cardH+4
}

async function renderTextToPngDataUrl(text: string, font: string, color: string): Promise<{dataUrl: string, width: number, height: number} | null> {
  return new Promise((resolve) => {
    try {
      document.fonts.ready.then(() => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        
        const scale = 2 // Retina scale is enough, 4x causes massive PDF bloat
        ctx.font = font
        
        const lines = text.split('\n')
        const fontSizeMatch = font.match(/(\d+)px/)
        const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 36
        const lineHeight = fontSize * 1.2
        
        let maxWidth = 0
        lines.forEach(line => {
          const w = ctx.measureText(line).width
          if (w > maxWidth) maxWidth = w
        })
        
        canvas.width = Math.ceil(maxWidth) * scale
        canvas.height = Math.ceil(lines.length * lineHeight) * scale
        
        ctx.scale(scale, scale)
        ctx.font = font
        ctx.fillStyle = color
        ctx.textBaseline = 'top'
        
        let y = 0
        lines.forEach(line => {
          ctx.fillText(line, 0, y)
          y += lineHeight
        })
        
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width / scale,
          height: canvas.height / scale
        })
      })
    } catch {
      resolve(null)
    }
  })
}

// ── Cover & back template builder ────────────────────────────────────────────
export async function applyPremiumCovers(pdf: jsPDF, type: 'front' | 'back', title: string = '') {
  const [bg, logo] = await Promise.all([
    loadImage(type === 'front' ? '/report-front-bg.jpg' : '/report-back-bg.jpg'),
    loadSvgAsPngDataUrl('/aivory-logo-cover.svg', 251, 80)
  ])

  if (bg) {
    pdf.addImage(bg, 'JPEG', 0, 0, PAGE_W, PAGE_H)
  } else {
    setC(pdf, COVER_BG, 'fill'); pdf.rect(0, 0, PAGE_W, PAGE_H, 'F')
  }

  if (type === 'front') {
    const titleImg = await renderTextToPngDataUrl(title, '300 48px "Manrope", sans-serif', '#ffffff')
    if (titleImg) {
      const wMm = titleImg.width * 0.264583
      const hMm = titleImg.height * 0.264583
      pdf.addImage(titleImg.dataUrl, 'PNG', ML, 30, wMm, hMm)
    } else {
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor('#ffffff')
      pdf.setFontSize(36)
      const lines = pdf.splitTextToSize(title, PAGE_W - ML * 2)
      pdf.text(lines, ML, 30)
    }

    if (logo) {
      const lw = 40; const lh = lw * (80/251)
      const logoY = 210
      pdf.addImage(logo, 'PNG', ML, logoY, lw, lh)

      const tagImg = await renderTextToPngDataUrl('Make AI make sense\u00AE', '300 18px "Manrope", sans-serif', '#ffffff')
      if (tagImg) {
        const twMm = tagImg.width * 0.264583
        const thMm = tagImg.height * 0.264583
        pdf.addImage(tagImg.dataUrl, 'PNG', PAGE_W - ML - twMm, logoY + lh/2 - thMm/2, twMm, thMm)
      }
    }
  } else {
    if (logo) {
      const lw = 60; const lh = lw * (80/251)
      const cx = PAGE_W / 2; const cy = PAGE_H / 2 - 15
      pdf.addImage(logo, 'PNG', cx - lw/2, cy - lh/2, lw, lh)
      
      const subImg = await renderTextToPngDataUrl('Make AI make sense\u00AE', '300 18px "Manrope", sans-serif', '#ffffff')
      if (subImg) {
        const wMm = subImg.width * 0.264583
        const hMm = subImg.height * 0.264583
        // Center the image
        pdf.addImage(subImg.dataUrl, 'PNG', cx - wMm/2, cy + lh/2 + 10, wMm, hMm)
      }
    }
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor('#9ca3af')
    pdf.setFontSize(8)
    pdf.text('www.aivory.uk', ML, PAGE_H - 18)
    pdf.text('{2026} copyright Aivory\u2122', PAGE_W - ML, PAGE_H - 18, { align: 'right' })
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportReportToPdf(
  _elementId: string, companyName: string, context?: DiagnosticContext,
) {
  if(!context){
    try{const raw=localStorage.getItem('aivory_diagnostic_context');if(raw)context=JSON.parse(raw) as DiagnosticContext}catch{/**/}
  }
  if(!context) throw new Error('No diagnostic context')

  const {scores,calculations,opportunities,risks,qualitative,roomForImprovement}=context
  const currency=(context.currency||'USD') as 'USD'|'EUR'|'GBP'|'IDR'
  const fmt=(v:number|null|undefined)=>fmtCurrency(v,currency)

  const pdf=new jsPDF('p','mm','a4')
  let pn=0

  // ── P1: COVER ───────────────────────────────────────
  await applyPremiumCovers(pdf, 'front', 'AI Readiness\nAssessment Report')
  pn++

  // ── P2: EXECUTIVE SUMMARY ────────────────────────────────────────────────────
  pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); let y=13

  // Report meta
  setC(pdf,DARK,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(13)
  pdf.text('AI Readiness Diagnostic', ML, y)
  setC(pdf,MUTED,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7.5)
  pdf.text(`${context.company}  \u00b7  ${new Date(context.submittedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}  \u00b7  ${qualitative.industry??'All Industries'}`, ML, y+6)
  y=div(pdf, y+12)
  y=sectionLabel(pdf, y, 'Executive Scorecard')

  // Score ring (left)
  const rcx=ML+22, rcy=y+28
  scoreRing(pdf, rcx, rcy, 18, scores.composite, scores.maturityLevel)
  setC(pdf,SUBTLE,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(5.5)
  pdf.text('COMPOSITE SCORE', rcx, rcy+25, {align:'center'})

  // Radar (center)
  radarChart(pdf, ML+82, y+28, 23, scores as unknown as Record<string,number>)

  // Dimension bars (right column)
  const bx=ML+116, bw=CW-118
  let by=y+3
  ;(['strategy','data','process','people','governance'] as const).forEach(d=>{by=dimBar(pdf,bx,by,bw,d,(scores as any)[d]??0)})

  y=Math.max(rcy+28, by)+6
  y=div(pdf,y)

  // 4 KPI tiles
  y=sectionLabel(pdf, y, 'Financial Snapshot', 'Key investment metrics')
  const tiles=[
    {l:'Total Annual Savings',v:fmt(calculations.totalAnnualSavingsLocal??calculations.totalAnnualSavingsUSD),c:POS_GRN,s:'labor + process'},
    {l:'Hours Reclaimed/Yr',v:calculations.hoursReclaimedPerYear!=null?`${calculations.hoursReclaimedPerYear.toLocaleString()} hrs`:'\u2014',s:'efficiency adjusted'},
    {l:'Payback Period',v:fmtMonths(calculations.paybackMonths),s:`on ${fmt(calculations.assumedBudgetMidpointLocal)}`},
    {l:'3-Year ROI',v:fmtPct(calculations.threeYearROIPercent),c:(calculations.threeYearROIPercent??0)>=0?POS_GRN:NEG_RED,s:'net of investment'},
    {l:'Cost of Inaction/90d',v:fmt(calculations.costOfInaction90DaysLocal),s:'value at risk'},
  ]
  const tw=(CW-3*4)/5
  tiles.forEach((t,i)=>kpiCard(pdf, ML+i*(tw+3), y, tw, t.l, t.v, (t as any).c??DARK, t.s))
  y+=27

  setC(pdf,SUBTLE,'text'); pdf.setFont(F(),'italic'); pdf.setFontSize(6)
  pdf.text(`Confidence: ${calculations.confidenceLevel??'medium'}  \u00b7  Rate: ${fmt(calculations.assumedHourlyRateLocal)}/hr  \u00b7  Budget midpoint: ${fmt(calculations.assumedBudgetMidpointLocal)}`, ML, y+3)
  y+=8

  // ── P3: ROI PROJECTION ────────────────────────────────────────────────────────
  pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); y=13
  y=sectionLabel(pdf, y, 'ROI Projection', 'Full investment case with methodology breakdown')

  const allT=[
    {l:'Annual Labor Savings',v:fmt(calculations.annualLaborSavingsLocal),s:'reclaimed hrs \u00d7 rate'},
    {l:'Annual Process Savings',v:fmt(calculations.annualProcessSavingsLocal),s:'20% overhead reduction'},
    {l:'Total Annual Savings',v:fmt(calculations.totalAnnualSavingsLocal??calculations.totalAnnualSavingsUSD),c:POS_GRN,s:'labor + process'},
    {l:'Hours Reclaimed/Yr',v:calculations.hoursReclaimedPerYear!=null?`${calculations.hoursReclaimedPerYear.toLocaleString()} hrs`:'\u2014',s:'efficiency adjusted'},
    {l:'Payback Period',v:fmtMonths(calculations.paybackMonths),s:'investment \u00f7 savings \u00d7 12'},
    {l:'3-Year ROI',v:fmtPct(calculations.threeYearROIPercent),c:(calculations.threeYearROIPercent??0)>=0?POS_GRN:NEG_RED,s:'net cumulative'},
    {l:'Cost of Inaction/90d',v:fmt(calculations.costOfInaction90DaysLocal),s:'value deferred'},
  ]
  const tw2=(CW-3*2)/3
  allT.forEach((t,i)=>{
    const col=i%3, row=Math.floor(i/3)
    kpiCard(pdf, ML+col*(tw2+3), y+row*30, tw2, t.l, t.v, (t as any).c??DARK, t.s)
  })
  y+=Math.ceil(allT.length/3)*30+8

  if(calculations.hasEnoughDataForProjection&&calculations.assumedHourlyRateLocal!=null){
    // Assumptions note — very minimal
    setC(pdf,'#f9fafb','fill'); pdf.rect(ML,y,CW,10,'F')
    setC(pdf,ACCENT,'fill'); pdf.rect(ML,y,1,10,'F')
    setC(pdf,MUTED,'text'); pdf.setFont(F(),'italic'); pdf.setFontSize(7)
    pdf.text([
      `Labor rate: ${fmt(calculations.assumedHourlyRateLocal)}/hr${calculations.smallTeamRateApplied?' (opp-cost rate, 1\u20135 FTE teams)':' (industry rate)'}  \u00b7  Budget midpoint: ${fmt(calculations.assumedBudgetMidpointLocal)}`,
      `Efficiency factor: ${Math.round((calculations.efficiencyFactor??0.75)*100)}%  \u00b7  Confidence: ${calculations.confidenceLevel??'medium'}`,
    ], ML+4, y+4)
    y+=16
  }

  y=div(pdf,y)
  y=sectionLabel(pdf, y, 'How These Figures Were Calculated')

  if(calculations.hasEnoughDataForProjection&&calculations.assumedHourlyRateLocal!=null){
    const effPct=Math.round((calculations.efficiencyFactor??0.75)*100)
    const hrs=calculations.hoursReclaimedPerYear??0
    const rn=calculations.smallTeamRateApplied?' (opp-cost rate, 50% of industry blended rate)':' (industry blended rate)'
    const steps: [string,string][]=[
      ['Step 1 \u2014 Hours reclaimed/yr:',`${hrs} hrs = manual hrs/wk \u00d7 52 wks \u00d7 automation gap \u00d7 ${effPct}% efficiency`],
      ['Step 2 \u2014 Labor savings:',`${fmt(calculations.annualLaborSavingsLocal)} = ${hrs} hrs \u00d7 ${fmt(calculations.assumedHourlyRateLocal)}/hr${rn}`],
      ['Step 3 \u2014 Process savings:',`${fmt(calculations.annualProcessSavingsLocal)} = 20% of labor savings (operational overhead)`],
      ['Step 4 \u2014 Total annual savings:',`${fmt(calculations.totalAnnualSavingsLocal)} = labor + process savings`],
    ]
    if(calculations.assumedBudgetMidpointLocal!=null){
      steps.push(['Step 5 \u2014 Payback period:',`${fmtMonths(calculations.paybackMonths)} = ${fmt(calculations.assumedBudgetMidpointLocal)} \u00f7 ${fmt(calculations.totalAnnualSavingsLocal)}/yr \u00d7 12`])
      steps.push(['Step 6 \u2014 3-Year ROI:',`${fmtPct(calculations.threeYearROIPercent)} = (${fmt(calculations.totalAnnualSavingsLocal)} \u00d7 3 \u2212 ${fmt(calculations.assumedBudgetMidpointLocal)}) \u00f7 ${fmt(calculations.assumedBudgetMidpointLocal)} \u00d7 100`])
    }

    steps.forEach(([lbl,val],idx)=>{
      if(y>PAGE_H-18){pdf.addPage();pn++;pageHeader(pdf,context!.company,pn);y=13}
      const neg=lbl.includes('Step 6')&&(calculations.threeYearROIPercent??0)<0
      const bg=neg?'#fff7ed':idx%2===0?'#fafaf9':'#ffffff'
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7)
      const vl=pdf.splitTextToSize(val, CW-50)
      const rh=vl.length*4+7
      setC(pdf,bg,'fill'); pdf.rect(ML,y,CW,rh,'F')
      setC(pdf,'#e5e7eb','draw'); pdf.setLineWidth(0.1); pdf.line(ML,y,ML+CW,y)
      setC(pdf,DARK,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(7)
      pdf.text(lbl, ML+3, y+4.5)
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7)
      pdf.text(vl, ML+50, y+4.5)
      y+=rh
    })

    const roi3=calculations.threeYearROIPercent
    if(roi3!=null&&roi3<0&&calculations.totalAnnualSavingsLocal!=null&&calculations.assumedBudgetMidpointLocal!=null){
      if(y>PAGE_H-50){pdf.addPage();pn++;pageHeader(pdf,context.company,pn);y=13}
      y+=4
      const sav3=calculations.totalAnnualSavingsLocal*3
      const budget=calculations.assumedBudgetMidpointLocal
      const sf=budget-sav3, bey=(budget/calculations.totalAnnualSavingsLocal).toFixed(1), need=budget/3

      // Warning box — thin amber left bar only
      setC(pdf,'#fffbeb','fill'); const bh=44; pdf.rect(ML,y,CW,bh,'F')
      setC(pdf,WARN_AMB,'fill'); pdf.rect(ML,y,1.5,bh,'F')
      setC(pdf,WARN_AMB,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(7.5)
      pdf.text('Why is 3-Year ROI negative?', ML+5, y+6)
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7)
      const wl=pdf.splitTextToSize(`3-year cumulative savings (${fmt(sav3)}) fall ${fmt(sf)} short of the investment (${fmt(budget)}). Break-even at ~${bey} years.`,CW-10)
      pdf.text(wl, ML+5, y+12)
      let cy3=y+12+wl.length*4+3
      setC(pdf,POS_GRN,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(7)
      pdf.text('Path A: ', ML+5, cy3)
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal')
      pdf.text(`Start with ${fmt(sav3)} or less — fully recovered by year 3.`, ML+5+pdf.getTextWidth('Path A: '), cy3)
      cy3+=5
      setC(pdf,POS_GRN,'text'); pdf.setFont(FB(),'bold')
      pdf.text('Path B: ', ML+5, cy3)
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal')
      pdf.text(`Push savings to ${fmt(need)}/yr+ (currently ${fmt(calculations.totalAnnualSavingsLocal)}/yr).`, ML+5+pdf.getTextWidth('Path B: '), cy3)
      y+=bh+5
    } else if(roi3!=null&&roi3>=0){
      y+=4
      setC(pdf,'#f0fdf4','fill'); pdf.rect(ML,y,CW,9,'F')
      setC(pdf,POS_GRN,'fill'); pdf.rect(ML,y,1.5,9,'F')
      setC(pdf,POS_GRN,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(7.5)
      pdf.text('\u2713  Investment fully recovered within 3 years.', ML+5, y+5.5)
      y+=13
    }
  }

  // ── P4: OPPORTUNITY ANALYSIS ──────────────────────────────────────────────────
  pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); y=13
  y=sectionLabel(pdf, y, 'Opportunity Analysis', `${opportunities.length} automation opportunit${opportunities.length!==1?'ies':'y'} identified`)

  if(opportunities.length===0){
    setC(pdf,MUTED,'text'); pdf.setFont(F(),'italic'); pdf.setFontSize(8)
    pdf.text('No opportunities identified.', ML, y+6); y+=12
  } else {
    for(const opp of opportunities){
      if(y>PAGE_H-55){pdf.addPage();pn++;pageHeader(pdf,context.company,pn);y=13}
      y=oppCard(pdf, opp, y, fmt)
    }
  }

  // ── P5: RISK REGISTER ─────────────────────────────────────────────────────────
  pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); y=13
  y=sectionLabel(pdf, y, 'Risk Register', `${risks.length} factor${risks.length!==1?'s':''} assessed`)

  const sr=[...risks].sort((a,b)=>(({HIGH:0,MEDIUM:1,LOW:2} as Record<string,number>)[a.severity]??2)-(({HIGH:0,MEDIUM:1,LOW:2} as Record<string,number>)[b.severity]??2))

  if(sr.length===0){
    setC(pdf,'#f0fdf4','fill'); pdf.rect(ML,y,CW,11,'F')
    setC(pdf,POS_GRN,'fill'); pdf.rect(ML,y,1.5,11,'F')
    setC(pdf,POS_GRN,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(8)
    pdf.text('\u2713  No risks detected.', ML+5, y+7); y+=17
  } else {
    const sc2: Record<string,string>={HIGH:NEG_RED,MEDIUM:WARN_AMB,LOW:POS_GRN}
    sr.forEach(risk=>{
      if(y>PAGE_H-28){pdf.addPage();pn++;pageHeader(pdf,context!.company,pn);y=13}
      const c=sc2[risk.severity]??MUTED
      pdf.setFont(F(),'normal'); pdf.setFontSize(8)
      const rl=pdf.splitTextToSize(risk.risk, CW-26)
      const ch=rl.length*4+10+(risk.source?6:0)
      setC(pdf,'#fafaf9','fill'); pdf.rect(ML,y,CW,ch,'F')
      setC(pdf,'#e5e7eb','draw'); pdf.setLineWidth(0.1); pdf.line(ML,y,ML+CW,y)
      setC(pdf,c,'fill'); pdf.rect(ML,y,1.5,ch,'F')
      // Severity tag — underline style
      pdf.setFont(F(),'normal'); pdf.setFontSize(7)
      const sLabel=risk.severity
      const stw=pdf.getTextWidth(sLabel)
      setC(pdf,c,'text'); pdf.text(sLabel, ML+4, y+5.5)
      setC(pdf,c,'draw'); pdf.setLineWidth(0.5)
      pdf.line(ML+4, y+7, ML+4+stw, y+7)
      // Risk text
      setC(pdf,DARK,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(8)
      pdf.text(rl, ML+4+stw+4, y+5.5)
      if(risk.source){setC(pdf,SUBTLE,'text');pdf.setFont(F(),'italic');pdf.setFontSize(6);pdf.text(`Source: ${risk.source}`,ML+4+stw+4,y+ch-2.5)}
      y+=ch+3
    })
  }

  // ── P6: DIAGNOSTIC CONTEXT ───────────────────────────────────────────────────
  pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); y=13
  y=sectionLabel(pdf, y, 'Diagnostic Context', 'Qualitative inputs that shaped this assessment')

  const ctxRows: [string,string][]=[
    ['Primary Business Objective', qualitative.primaryObjective||'Not provided'],
    ['Top Pain Points', qualitative.topPainPoints||'Not provided'],
    ['AI / Technical Capability', qualitative.aiCapability||'Not provided'],
    ['Implementation Approach', qualitative.implementApproach||'Not provided'],
    ['Leadership Alignment', qualitative.leadershipAlignment||'Not provided'],
    ['Prior AI Attempts', qualitative.priorAIAttempts||'Not provided'],
    ['Consequence of Delay', qualitative.delayConsequence||'Not provided'],
    ['Risk / Error Tolerance', qualitative.errorTolerance||'Not provided'],
    ['Data Residency', qualitative.dataResidency||'Not provided'],
    ['Compliance Requirements', qualitative.compliance?.length?qualitative.compliance.join(', '):'None'],
  ]

  ctxRows.forEach(([lbl,val],idx)=>{
    if(y>PAGE_H-20){pdf.addPage();pn++;pageHeader(pdf,context!.company,pn);y=13}
    pdf.setFont(F(),'normal'); pdf.setFontSize(8)
    const vl=pdf.splitTextToSize(val, CW-42)
    const rh=vl.length*4+9
    setC(pdf, idx%2===0?'#fafaf9':'#ffffff', 'fill')
    pdf.rect(ML,y,CW,rh,'F')
    setC(pdf,'#e5e7eb','draw'); pdf.setLineWidth(0.1); pdf.line(ML,y,ML+CW,y)
    // Label column
    setC(pdf,SUBTLE,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(6.5)
    pdf.text(lbl.toUpperCase(), ML+3, y+5.5)
    // Value
    setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(8)
    pdf.text(vl, ML+42, y+5.5)
    y+=rh
  })

  // ── P7+: ROOM FOR IMPROVEMENT ────────────────────────────────────────────────
  if(Array.isArray(roomForImprovement)&&roomForImprovement.length>0){
    pdf.addPage(); pn++; pageHeader(pdf,context.company,pn); y=13
    y=sectionLabel(pdf, y, 'Room for Improvement', 'Prioritized improvements to strengthen AI adoption readiness')

    const pc: Record<string,string>={high:NEG_RED,medium:WARN_AMB,low:POS_GRN}

    roomForImprovement.forEach(item=>{
      if(y>PAGE_H-60){pdf.addPage();pn++;pageHeader(pdf,context!.company,pn);y=13}
      const c=pc[item.priority]??MUTED

      pdf.setFont(F(),'normal'); pdf.setFontSize(7.5)
      const aL=pdf.splitTextToSize(item.recommendedAction, CW-8)
      const iL=pdf.splitTextToSize(item.operationalImpact, CW-8)
      const cL=pdf.splitTextToSize(item.currentState, CW-8)
      const ch=12+cL.length*4+5+aL.length*4+5+iL.length*4+10

      setC(pdf,'#fafaf9','fill'); pdf.rect(ML,y,CW,ch,'F')
      setC(pdf,'#e5e7eb','draw'); pdf.setLineWidth(0.1); pdf.line(ML,y,ML+CW,y)
      setC(pdf,c,'fill'); pdf.rect(ML,y,1.5,ch,'F')

      // Title + slim priority pill
      setC(pdf,DARK,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(8.5)
      const tt=pdf.splitTextToSize(item.title, CW-48)
      pdf.text(tt[0]||item.title, ML+5, y+7)

      // Priority tag — underline style, right-aligned
      const prLabel=`${item.priority.toUpperCase()} PRIORITY`
      pdf.setFont(F(),'normal'); pdf.setFontSize(7)
      const ptw=pdf.getTextWidth(prLabel)
      const px=ML+CW-ptw
      setC(pdf,c,'text'); pdf.text(prLabel, px, y+6.5)
      setC(pdf,c,'draw'); pdf.setLineWidth(0.5)
      pdf.line(px, y+8, ML+CW, y+8)

      let cy4=y+11

      setC(pdf,SUBTLE,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(6.5)
      pdf.text('CURRENT STATE', ML+5, cy4); cy4+=5
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7.5)
      pdf.text(cL, ML+5, cy4); cy4+=cL.length*4+5

      setC(pdf,SUBTLE,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(6.5)
      pdf.text('RECOMMENDED ACTION', ML+5, cy4); cy4+=5
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7.5)
      pdf.text(aL, ML+5, cy4); cy4+=aL.length*4+5

      setC(pdf,SUBTLE,'text'); pdf.setFont(FB(),'bold'); pdf.setFontSize(6.5)
      pdf.text('OPERATIONAL IMPACT', ML+5, cy4); cy4+=5
      setC(pdf,BODY,'text'); pdf.setFont(F(),'normal'); pdf.setFontSize(7.5)
      pdf.text(iL, ML+5, cy4)

      y+=ch+5
    })
  }

  // ── BACK COVER ──────────────────────────────────────
  pdf.addPage()
  await applyPremiumCovers(pdf, 'back')

  pdf.save(`AI_Readiness_Report_${companyName.replace(/\s+/g,'_')}.pdf`)
}
