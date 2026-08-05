/**
 * Blueprint export utilities — PDF (jsPDF text-only) and DOCX (docx)
 * Only called client-side.
 */

import type { BlueprintV1 } from '@/types/blueprint'
import {
  applyPremiumCovers, renderAivoryNote, loadManrope, pageBg, pageFooter, sectionLabel,
  renderNarrative, spacedText, thinDiv, setC,
  INK, MUTED, LABEL, TRACK, RULE, CONTENT_C,
  PAGE_W, PAGE_H, ML, MR, CW, F, FB
} from '@/lib/pdfExport'

function dateStr() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 40)
}

// ── PDF export (text-only, no html2canvas) ────────────────
export async function exportBlueprintPDF(
  blueprint: BlueprintV1,
  versionLabel: string,
  locale: 'en' | 'id' = 'en'
) {
  const { default: jsPDF } = await import('jspdf')

  const tr = (en: string, id: string) => locale === 'id' ? id : en

  const companyName = blueprint.organization?.name || 'Company'
  const date = dateStr()
  const { strategic_objective, system_architecture, workflow_modules, risk_assessment, deployment_plan } = blueprint

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await loadManrope(doc)

  let y = ML
  let pageNum = 1

  const checkPage = (needed = 10) => {
    if (y + needed > PAGE_H - 14) {
      pageFooter(doc)
      doc.addPage()
      pageBg(doc)
      pageNum++
      y = ML
    }
    return y
  }

  // Helper for bullet points similar to renderNarrative but with a bullet
  const bullet = (text: string) => {
    setC(doc, CONTENT_C, 'text')
    doc.setFont(F(), 'normal')
    doc.setFontSize(10)
    doc.setLineHeightFactor(1.5)
    
    const bulletStr = '•'
    const bulletW = doc.getTextWidth(bulletStr) + 2
    
    const lines = doc.splitTextToSize(text, CW - bulletW)
    checkPage(lines.length * 5.2 + 8)
    
    doc.text(bulletStr, ML + 2, y + 4)
    doc.text(lines, ML + 2 + bulletW, y + 4)
    doc.setLineHeightFactor(1.15)
    y += lines.length * 5.2 + 4
  }

  const h2 = (text: string) => {
    checkPage(12)
    y += 4
    setC(doc, INK, 'text')
    doc.setFont(FB(), 'bold')
    doc.setFontSize(10.5)
    doc.text(text, ML, y)
    y += 6
  }

  const gap = (n = 4) => { y += n }

  // ── Cover page ──────────────────────────────────────────
  await applyPremiumCovers(doc, 'front', tr('Transformation\nBlueprint', 'Transformasi\nBlueprint'), {
    company: companyName,
    date: date,
    reportId: `BP-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-001`
  })

  // ── A note from Aivory ───────────────────────────────────
  renderAivoryNote(doc, {
    greeting: tr(`Dear ${companyName},`, `Kepada ${companyName},`),
    paragraphs: [
      tr(
        `This Transformation Blueprint turns your business operations assessment into a concrete build. What follows is not a generic architecture, but the specific system your operation needs: the data sources it draws on, the agents that do the work, and the sequence in which to deploy them.`,
        `Blueprint Transformasi ini mengubah asesmen operasional bisnis Anda menjadi rancangan bangun yang konkret. Yang mengikuti bukanlah arsitektur generik, melainkan sistem spesifik yang dibutuhkan operasi Anda: sumber data yang digunakan, agen yang menjalankan pekerjaan, dan urutan penerapannya.`
      ),
      tr(
        `Every module and phase ahead is scoped to your objectives and constraints, so your team can align stakeholders, sequence the technical work, and start executing with confidence.`,
        `Setiap modul dan fase berikut dirancang sesuai tujuan dan batasan Anda, sehingga tim Anda dapat menyelaraskan pemangku kepentingan, mengurutkan pekerjaan teknis, dan mulai mengeksekusi dengan percaya diri.`
      ),
    ],
    footerStats: [
      { label: tr('Document', 'Dokumen'), value: tr('Transformation Blueprint', 'Blueprint Transformasi') },
      { label: tr('Prepared', 'Disiapkan'), value: date, align: 'right' },
    ],
  }, locale)

  doc.addPage()
  pageBg(doc)
  pageNum++
  y = ML

  // ── Introduction ─────────────────────────────────────────
  y = sectionLabel(doc, y, tr('Document Introduction', 'Pendahuluan Dokumen'))
  y = renderNarrative(doc, y, tr(
    "This Transformation Blueprint serves as the definitive architectural roadmap derived directly from your Business Operations Assessment. It translates identified operational bottlenecks into a concrete, phased implementation strategy. Use this document to align stakeholders, sequence technical deployments, and establish precise performance benchmarks for your automation initiatives.",
    "Blueprint Transformasi ini menjadi peta jalan arsitektur definitif yang diturunkan langsung dari Asesmen Operasional Bisnis Anda. Dokumen ini menerjemahkan hambatan operasional yang teridentifikasi menjadi strategi implementasi bertahap yang konkret. Gunakan dokumen ini untuk menyelaraskan pemangku kepentingan, mengurutkan penerapan teknis, dan menetapkan tolok ukur kinerja yang presisi untuk inisiatif otomasi Anda."
  ), checkPage)
  gap(6)

  // ── 1. Strategic Objective ──────────────────────────────
  y = sectionLabel(doc, y, tr('1. Strategic Objective', '1. Tujuan Strategis'))
  // `primary_goal` is the LLM's actual generated objective for this blueprint —
  // prefer it over the generic fallback so this paragraph reflects real data
  // instead of unrelated hardcoded figures.
  y = renderNarrative(doc, y, strategic_objective?.primary_goal || tr(
    "Our primary objective is to reduce operational costs by deploying targeted AI-powered process automation, directly alleviating the burden of manual work and slow processes while reclaiming high-value team capacity.",
    "Tujuan utama kami adalah menekan biaya operasional melalui penerapan otomasi proses bertenaga AI yang tepat sasaran, secara langsung meringankan beban pekerjaan manual dan proses yang lambat sekaligus membebaskan kapasitas tim yang bernilai tinggi."
  ), checkPage)
  if (Array.isArray(strategic_objective?.kpi_targets) && strategic_objective.kpi_targets.length > 0) {
    h2(tr('KPI Targets', 'Target KPI'))
    strategic_objective.kpi_targets.forEach(kpi => {
      bullet(`${kpi.metric}: ${kpi.target}`)
    })
  }
  gap(6)

  // ── 2. System Architecture ──────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, tr('2. System Architecture', '2. Arsitektur Sistem'))
  if (Array.isArray(system_architecture?.data_sources) && system_architecture.data_sources.length > 0) {
    h2(tr('Data Sources', 'Sumber Data'))
    system_architecture.data_sources.forEach(s => bullet(s))
    gap()
  }
  if (Array.isArray(system_architecture?.processing_layers) && system_architecture.processing_layers.length > 0) {
    h2(tr('Processing Layers', 'Lapisan Pemrosesan'))
    system_architecture.processing_layers.forEach(s => bullet(s))
    gap()
  }
  // Kept in English in both locales — "Decision Engine" reads as a product/
  // technical term, not general prose, per product feedback.
  h2('Decision Engine')
  // `decision_engine` is the LLM's actual generated description — prefer it
  // over the fallback, which used to hardcode a non-existent product name
  // ("Aivory High Intelligence Deterministic Engine") the generation prompt
  // itself forbids inventing.
  y = renderNarrative(doc, y, system_architecture?.decision_engine || tr(
    "The decision engine serves as the core orchestration layer, guaranteeing that all automated decisions follow strict, predictable logic paths. This deterministic approach is essential for content approval and ticket routing because it eliminates hallucinations and ensures consistent, reliable outputs every time.",
    "Mesin keputusan bertindak sebagai lapisan orkestrasi inti, memastikan seluruh keputusan otomatis mengikuti alur logika yang ketat dan dapat diprediksi. Pendekatan deterministik ini penting untuk persetujuan konten dan perutean tiket karena menghilangkan halusinasi serta menjamin keluaran yang konsisten dan andal setiap saat."
  ), checkPage)
  gap()
  if (Array.isArray(system_architecture?.execution_layer) && system_architecture.execution_layer.length > 0) {
    h2(tr('Execution Layer', 'Lapisan Eksekusi'))
    system_architecture.execution_layer.forEach(s => bullet(s))
    gap()
  }
  if (system_architecture?.memory_layer) {
    h2(tr('Memory Layer', 'Lapisan Memori'))
    y = renderNarrative(doc, y, system_architecture.memory_layer, checkPage)
  }
  gap(6)

  // ── 3. Workflow Modules ─────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, tr('3. Workflow Modules', '3. Modul Alur Kerja'))
  if (Array.isArray(workflow_modules) && workflow_modules.length > 0) {
    // Count/order is derived from the real module list — the old copy named
    // exactly three fixed module names ("Automated Reporting", "CS Ticket
    // Automation", "Process Automation") that never matched what was
    // actually generated below it.
    y = renderNarrative(doc, y, tr(
      `The following ${workflow_modules.length} module${workflow_modules.length === 1 ? '' : 's'} represent the most critical intervention points for your organisation, sequenced to build on each other — read them in order to understand how foundational data flow enables more complex autonomous actions.`,
      `${workflow_modules.length} modul berikut merepresentasikan titik intervensi paling kritis bagi organisasi Anda, disusun secara berurutan agar saling membangun — baca sesuai urutan untuk memahami bagaimana alur data fondasional memungkinkan tindakan otonom yang lebih kompleks.`
    ), checkPage)
  }
  gap(6)
  if (Array.isArray(workflow_modules)) {
    workflow_modules.forEach((wf, i) => {
      checkPage(20)
      h2(`${i + 1}. ${wf.name}`)
      y = renderNarrative(doc, y, tr(`Trigger: ${wf.trigger}`, `Pemicu: ${wf.trigger}`), checkPage)
      if (Array.isArray(wf.steps)) {
        wf.steps.forEach((step, j) => bullet(`${tr('Step', 'Langkah')} ${j + 1} [${step.type}]: ${step.action}`))
      }
      if (Array.isArray(wf.integrations_required) && wf.integrations_required.length > 0) {
        y = renderNarrative(doc, y, tr(`Integrations: ${wf.integrations_required.join(', ')}`, `Integrasi: ${wf.integrations_required.join(', ')}`), checkPage)
      }
      thinDiv(doc, y)
      gap(6)
    })
  }
  gap(6)

  // ── 4. Risk Assessment ──────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, tr('4. Risk Assessment', '4. Penilaian Risiko'))
  // The PDF used to render one fixed, presumptuous paragraph here ("your
  // organisation's strong, aligned leadership... no critical risks have
  // been flagged") regardless of the actual generated risk data — the DOCX
  // export already lists the real data_risks/operational_risks/mitigation_
  // strategies arrays; mirror that here instead.
  const hasRisks = Array.isArray(risk_assessment?.data_risks) && risk_assessment.data_risks.length > 0
    || Array.isArray(risk_assessment?.operational_risks) && risk_assessment.operational_risks.length > 0
  if (hasRisks) {
    if (Array.isArray(risk_assessment?.data_risks) && risk_assessment.data_risks.length > 0) {
      h2(tr('Data Risks', 'Risiko Data'))
      risk_assessment.data_risks.forEach(r => bullet(r))
      gap()
    }
    if (Array.isArray(risk_assessment?.operational_risks) && risk_assessment.operational_risks.length > 0) {
      h2(tr('Operational Risks', 'Risiko Operasional'))
      risk_assessment.operational_risks.forEach(r => bullet(r))
      gap()
    }
    if (Array.isArray(risk_assessment?.mitigation_strategies) && risk_assessment.mitigation_strategies.length > 0) {
      h2(tr('Mitigation Strategies', 'Strategi Mitigasi'))
      risk_assessment.mitigation_strategies.forEach((s, i) => bullet(`${i + 1}. ${s}`))
    }
  } else {
    y = renderNarrative(doc, y, tr(
      "No critical operational or technical risks were flagged for this deployment.",
      "Tidak ada risiko operasional atau teknis kritis yang teridentifikasi untuk penerapan ini."
    ), checkPage)
  }
  gap(6)

  // ── 5. Deployment Plan ──────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, tr('5. Deployment Plan', '5. Rencana Penerapan'))
  if (deployment_plan?.phase) y = renderNarrative(doc, y, tr(`Phase: ${deployment_plan.phase}`, `Fase: ${deployment_plan.phase}`), checkPage)
  if (deployment_plan?.estimated_impact) y = renderNarrative(doc, y, tr(`Estimated Impact: ${deployment_plan.estimated_impact}`, `Dampak Perkiraan: ${deployment_plan.estimated_impact}`), checkPage)
  if (deployment_plan?.estimated_roi_months) y = renderNarrative(doc, y, tr(`ROI Timeline: ${deployment_plan.estimated_roi_months} months`, `Jadwal ROI: ${deployment_plan.estimated_roi_months} bulan`), checkPage)
  if (Array.isArray(deployment_plan?.waves) && deployment_plan.waves.length > 0) {
    gap(4)
    h2(tr('Deployment Waves', 'Gelombang Penerapan'))
    deployment_plan.waves.forEach(wave => {
      checkPage(16)
      doc.setFontSize(10.5)
      doc.setFont(FB(), 'bold')
      setC(doc, INK, 'text')
      doc.text(wave.name, ML + 2, y)
      y += 5
      if (Array.isArray(wave.included_workflows) && wave.included_workflows.length > 0) {
        y = renderNarrative(doc, y - 4, tr(`Workflows: ${wave.included_workflows.join(', ')}`, `Alur kerja: ${wave.included_workflows.join(', ')}`), checkPage)
      }
      if (wave.notes) y = renderNarrative(doc, y - 4, wave.notes, checkPage)
      gap(3)
    })
  }

  pageFooter(doc)
  doc.addPage()
  await applyPremiumCovers(doc, 'back')
  doc.save(`Aivory-Blueprint-${safeFilename(companyName)}-${versionLabel}-${date}.pdf`)
}

// ── DOCX export ───────────────────────────────────────────
export async function exportBlueprintDOCX(
  blueprint: BlueprintV1,
  versionLabel: string,
  locale: 'en' | 'id' = 'en'
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = await import('docx')
  const { saveAs } = await import('file-saver')

  const tr = (en: string, id: string) => locale === 'id' ? id : en

  const companyName = blueprint.organization?.name || 'Company'
  const date = dateStr()
  const { strategic_objective, system_architecture, workflow_modules, risk_assessment, deployment_plan } = blueprint

  const h1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 } })
  const h2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } })
  const body = (text: string) => new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 80 } })
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } })
  const divider = () => new Paragraph({ text: '', spacing: { after: 120 } })

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

  const sections: InstanceType<typeof Paragraph>[] = []

  // Title
  sections.push(new Paragraph({
    children: [new TextRun({ text: `${tr('Transformation Blueprint', 'Blueprint Transformasi')} — ${companyName}`, bold: true, size: 36, color: '00e59e' })],
    spacing: { after: 80 },
  }))
  sections.push(body(tr(`Version: ${versionLabel}  |  Generated by Aivory  |  ${date}`, `Versi: ${versionLabel}  |  Dibuat oleh Aivory  |  ${date}`)))
  sections.push(divider())

  // 1. Strategic Objective
  sections.push(h1(tr('1. Strategic Objective', '1. Tujuan Strategis')))
  if (strategic_objective?.primary_goal) sections.push(body(strategic_objective.primary_goal))
  if (Array.isArray(strategic_objective?.kpi_targets) && strategic_objective.kpi_targets.length > 0) {
    sections.push(h2(tr('KPI Targets', 'Target KPI')))
    const rows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: tr('Metric', 'Metrik'), bold: true })] })], borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '444444' }, top: noBorder, left: noBorder, right: noBorder } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: tr('Target', 'Target'), bold: true })] })], borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '444444' }, top: noBorder, left: noBorder, right: noBorder } }),
        ]
      }),
      ...strategic_objective.kpi_targets.map(kpi => new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(kpi.metric)], borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }),
          new TableCell({ children: [new Paragraph(kpi.target)], borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }),
        ]
      }))
    ]
    sections.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }) as unknown as InstanceType<typeof Paragraph>)
  }
  sections.push(divider())

  // 2. System Architecture
  sections.push(h1(tr('2. System Architecture', '2. Arsitektur Sistem')))
  if (Array.isArray(system_architecture?.data_sources)) {
    sections.push(h2(tr('Data Sources', 'Sumber Data')))
    system_architecture.data_sources.forEach(s => sections.push(bullet(s)))
  }
  if (Array.isArray(system_architecture?.processing_layers)) {
    sections.push(h2(tr('Processing Layers', 'Lapisan Pemrosesan')))
    system_architecture.processing_layers.forEach(s => sections.push(bullet(s)))
  }
  if (system_architecture?.decision_engine) {
    sections.push(h2('Decision Engine'))
    sections.push(body(system_architecture.decision_engine))
  }
  if (Array.isArray(system_architecture?.execution_layer)) {
    sections.push(h2(tr('Execution Layer', 'Lapisan Eksekusi')))
    system_architecture.execution_layer.forEach(s => sections.push(bullet(s)))
  }
  if (system_architecture?.memory_layer) {
    sections.push(h2(tr('Memory Layer', 'Lapisan Memori')))
    sections.push(body(system_architecture.memory_layer))
  }
  sections.push(divider())

  // 3. Workflow Modules
  sections.push(h1(tr('3. Workflow Modules', '3. Modul Alur Kerja')))
  if (Array.isArray(workflow_modules)) {
    workflow_modules.forEach((wf, i) => {
      sections.push(h2(`${i + 1}. ${wf.name}`))
      sections.push(body(tr(`Trigger: ${wf.trigger}`, `Pemicu: ${wf.trigger}`)))
      if (Array.isArray(wf.steps)) {
        wf.steps.forEach((step, j) => sections.push(bullet(`${tr('Step', 'Langkah')} ${j + 1} [${step.type}]: ${step.action}`)))
      }
      if (Array.isArray(wf.integrations_required) && wf.integrations_required.length > 0) {
        sections.push(body(tr(`Integrations: ${wf.integrations_required.join(', ')}`, `Integrasi: ${wf.integrations_required.join(', ')}`)))
      }
    })
  }
  sections.push(divider())

  // 4. Risk Assessment
  sections.push(h1(tr('4. Risk Assessment', '4. Penilaian Risiko')))
  if (Array.isArray(risk_assessment?.data_risks)) {
    sections.push(h2(tr('Data Risks', 'Risiko Data')))
    risk_assessment.data_risks.forEach(r => sections.push(bullet(r)))
  }
  if (Array.isArray(risk_assessment?.operational_risks)) {
    sections.push(h2(tr('Operational Risks', 'Risiko Operasional')))
    risk_assessment.operational_risks.forEach(r => sections.push(bullet(r)))
  }
  if (Array.isArray(risk_assessment?.mitigation_strategies)) {
    sections.push(h2(tr('Mitigation Strategies', 'Strategi Mitigasi')))
    risk_assessment.mitigation_strategies.forEach((s, i) => sections.push(bullet(`${i + 1}. ${s}`)))
  }
  sections.push(divider())

  // 5. Deployment Plan
  sections.push(h1(tr('5. Deployment Plan', '5. Rencana Penerapan')))
  if (deployment_plan?.phase) sections.push(body(tr(`Phase: ${deployment_plan.phase}`, `Fase: ${deployment_plan.phase}`)))
  if (deployment_plan?.estimated_impact) sections.push(body(tr(`Estimated Impact: ${deployment_plan.estimated_impact}`, `Dampak Perkiraan: ${deployment_plan.estimated_impact}`)))
  if (deployment_plan?.estimated_roi_months) sections.push(body(tr(`ROI Timeline: ${deployment_plan.estimated_roi_months} months`, `Jadwal ROI: ${deployment_plan.estimated_roi_months} bulan`)))
  if (Array.isArray(deployment_plan?.waves)) {
    sections.push(h2(tr('Deployment Waves', 'Gelombang Penerapan')))
    deployment_plan.waves.forEach(wave => {
      sections.push(new Paragraph({ children: [new TextRun({ text: wave.name, bold: true, size: 22 })], spacing: { before: 120, after: 40 } }))
      if (Array.isArray(wave.included_workflows)) sections.push(body(tr(`Workflows: ${wave.included_workflows.join(', ')}`, `Alur kerja: ${wave.included_workflows.join(', ')}`)))
      if (wave.notes) sections.push(body(wave.notes))
    })
  }
  sections.push(divider())

  // Footer
  sections.push(new Paragraph({
    children: [new TextRun({ text: tr(`Generated by Aivory  |  ${date}  |  ${versionLabel}`, `Dibuat oleh Aivory  |  ${date}  |  ${versionLabel}`), color: '888888', size: 18, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240 },
  }))

  const doc = new Document({
    sections: [{ properties: {}, children: sections }],
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '222222' } },
      }
    }
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `Aivory-Blueprint-${safeFilename(companyName)}-${date}.docx`)
}
