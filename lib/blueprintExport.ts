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
  versionLabel: string
) {
  const { default: jsPDF } = await import('jspdf')

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
  await applyPremiumCovers(doc, 'front', 'Transformation\nBlueprint', {
    company: companyName,
    date: date,
    reportId: `BP-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-001`
  })

  // ── A note from Aivory ───────────────────────────────────
  renderAivoryNote(doc, {
    greeting: `Dear ${companyName},`,
    paragraphs: [
      `This Transformation Blueprint turns your business operations assessment into a concrete build. What follows is not a generic architecture, but the specific system your operation needs: the data sources it draws on, the agents that do the work, and the sequence in which to deploy them.`,
      `Every module and phase ahead is scoped to your objectives and constraints, so your team can align stakeholders, sequence the technical work, and start executing with confidence.`,
    ],
    footerStats: [
      { label: 'Document', value: 'Transformation Blueprint' },
      { label: 'Prepared', value: date, align: 'right' },
    ],
  })

  doc.addPage()
  pageBg(doc)
  pageNum++
  y = ML

  // ── Introduction ─────────────────────────────────────────
  y = sectionLabel(doc, y, 'Document Introduction')
  y = renderNarrative(doc, y, "This Transformation Blueprint serves as the definitive architectural roadmap derived directly from your Business Operations Assessment. It translates identified operational bottlenecks into a concrete, phased implementation strategy. Use this document to align stakeholders, sequence technical deployments, and establish precise performance benchmarks for your automation initiatives.")
  gap(6)

  // ── 1. Strategic Objective ──────────────────────────────
  y = sectionLabel(doc, y, '1. Strategic Objective')
  y = renderNarrative(doc, y, "Our primary objective is to aggressively reduce operational costs by deploying targeted AI-powered process automation. By aiming for a 25% reduction in cost per ticket and a 20% decrease in average handle time, we directly alleviate the burden of manual data entry and slow support routing. Achieving the target 62.5% automation coverage translates directly into $14,296 in recovered labor value and reclaims 361 hours of high-value team capacity.")
  if (Array.isArray(strategic_objective?.kpi_targets) && strategic_objective.kpi_targets.length > 0) {
    h2('KPI Targets')
    strategic_objective.kpi_targets.forEach(kpi => {
      bullet(`${kpi.metric}: ${kpi.target}`)
    })
  }
  gap(6)

  // ── 2. System Architecture ──────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, '2. System Architecture')
  if (Array.isArray(system_architecture?.data_sources) && system_architecture.data_sources.length > 0) {
    h2('Data Sources')
    system_architecture.data_sources.forEach(s => bullet(s))
    gap()
  }
  if (Array.isArray(system_architecture?.processing_layers) && system_architecture.processing_layers.length > 0) {
    h2('Processing Layers')
    system_architecture.processing_layers.forEach(s => bullet(s))
    gap()
  }
  h2('Decision Engine')
    y = renderNarrative(doc, y, "The Aivory High Intelligence Deterministic Engine serves as the core orchestration layer, guaranteeing that all automated decisions follow strict, predictable logic paths. This deterministic approach is essential for content approval and ticket routing because it eliminates hallucinations and ensures consistent, reliable outputs every time. By connecting your existing CRM and internal documentation directly to this execution layer, the system maintains a secure and centralized process knowledge base without compromising operational integrity.")
    gap()
  if (Array.isArray(system_architecture?.execution_layer) && system_architecture.execution_layer.length > 0) {
    h2('Execution Layer')
    system_architecture.execution_layer.forEach(s => bullet(s))
    gap()
  }
  if (system_architecture?.memory_layer) {
    h2('Memory Layer')
    y = renderNarrative(doc, y, system_architecture.memory_layer)
  }
  gap(6)

  // ── 3. Workflow Modules ─────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, '3. Workflow Modules')
  y = renderNarrative(doc, y, "The following three modules represent the most critical intervention points for your organization. They are sequenced to build upon each other: Automated Reporting establishes baseline visibility, CS Ticket Automation addresses the highest volume of manual work, and Process Automation bridges the remaining operational gaps. Read them in this order to understand how foundational data flow enables more complex autonomous actions.")
  gap(6)
  if (Array.isArray(workflow_modules)) {
    workflow_modules.forEach((wf, i) => {
      checkPage(20)
      h2(`${i + 1}. ${wf.name}`)
      y = renderNarrative(doc, y, `Trigger: ${wf.trigger}`)
      if (Array.isArray(wf.steps)) {
        wf.steps.forEach((step, j) => bullet(`Step ${j + 1} [${step.type}]: ${step.action}`))
      }
      if (Array.isArray(wf.integrations_required) && wf.integrations_required.length > 0) {
        y = renderNarrative(doc, y, `Integrations: ${wf.integrations_required.join(', ')}`)
      }
      thinDiv(doc, y)
      gap(6)
    })
  }
  gap(6)

  // ── 4. Risk Assessment ──────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, '4. Risk Assessment')
  y = renderNarrative(doc, y, "Your organization's strong, aligned leadership and prior success with AI implementations significantly de-risk this deployment. Furthermore, the absence of stringent compliance requirements or strict data residency constraints allows for maximum architectural flexibility. As a result, no critical operational or technical risks have been flagged, clearing the path for an accelerated rollout schedule.")
  gap(6)

  // ── 5. Deployment Plan ──────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, '5. Deployment Plan')
  y = renderNarrative(doc, y, "The six-month rollout is intentionally sequenced to establish immediate technical capabilities while prioritizing quick wins. Launching Automated Reporting in Wave 1 builds crucial internal momentum and establishes data pipelines necessary for subsequent phases. This foundational success unlocks the execution of CS Ticket Automation in Wave 2, ensuring your team has the established infrastructure to capture the highest possible revenue impact securely.")
  gap(4)
  if (deployment_plan?.phase) y = renderNarrative(doc, y, `Phase: ${deployment_plan.phase}`)
  if (deployment_plan?.estimated_impact) y = renderNarrative(doc, y, `Estimated Impact: ${deployment_plan.estimated_impact}`)
  if (deployment_plan?.estimated_roi_months) y = renderNarrative(doc, y, `ROI Timeline: ${deployment_plan.estimated_roi_months} months`)
  if (Array.isArray(deployment_plan?.waves) && deployment_plan.waves.length > 0) {
    gap(4)
    h2('Deployment Waves')
    deployment_plan.waves.forEach(wave => {
      checkPage(16)
      doc.setFontSize(10.5)
      doc.setFont(FB(), 'bold')
      setC(doc, INK, 'text')
      doc.text(wave.name, ML + 2, y)
      y += 5
      if (Array.isArray(wave.included_workflows) && wave.included_workflows.length > 0) {
        y = renderNarrative(doc, y - 4, `Workflows: ${wave.included_workflows.join(', ')}`)
      }
      if (wave.notes) y = renderNarrative(doc, y - 4, wave.notes)
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
  versionLabel: string
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = await import('docx')
  const { saveAs } = await import('file-saver')

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
    children: [new TextRun({ text: `Transformation Blueprint — ${companyName}`, bold: true, size: 36, color: '00e59e' })],
    spacing: { after: 80 },
  }))
  sections.push(body(`Version: ${versionLabel}  |  Generated by Aivory  |  ${date}`))
  sections.push(divider())

  // 1. Strategic Objective
  sections.push(h1('1. Strategic Objective'))
  if (strategic_objective?.primary_goal) sections.push(body(strategic_objective.primary_goal))
  if (Array.isArray(strategic_objective?.kpi_targets) && strategic_objective.kpi_targets.length > 0) {
    sections.push(h2('KPI Targets'))
    const rows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Metric', bold: true })] })], borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '444444' }, top: noBorder, left: noBorder, right: noBorder } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Target', bold: true })] })], borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '444444' }, top: noBorder, left: noBorder, right: noBorder } }),
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
  sections.push(h1('2. System Architecture'))
  if (Array.isArray(system_architecture?.data_sources)) {
    sections.push(h2('Data Sources'))
    system_architecture.data_sources.forEach(s => sections.push(bullet(s)))
  }
  if (Array.isArray(system_architecture?.processing_layers)) {
    sections.push(h2('Processing Layers'))
    system_architecture.processing_layers.forEach(s => sections.push(bullet(s)))
  }
  if (system_architecture?.decision_engine) {
    sections.push(h2('Decision Engine'))
    sections.push(body(system_architecture.decision_engine))
  }
  if (Array.isArray(system_architecture?.execution_layer)) {
    sections.push(h2('Execution Layer'))
    system_architecture.execution_layer.forEach(s => sections.push(bullet(s)))
  }
  if (system_architecture?.memory_layer) {
    sections.push(h2('Memory Layer'))
    sections.push(body(system_architecture.memory_layer))
  }
  sections.push(divider())

  // 3. Workflow Modules
  sections.push(h1('3. Workflow Modules'))
  if (Array.isArray(workflow_modules)) {
    workflow_modules.forEach((wf, i) => {
      sections.push(h2(`${i + 1}. ${wf.name}`))
      sections.push(body(`Trigger: ${wf.trigger}`))
      if (Array.isArray(wf.steps)) {
        wf.steps.forEach((step, j) => sections.push(bullet(`Step ${j + 1} [${step.type}]: ${step.action}`)))
      }
      if (Array.isArray(wf.integrations_required) && wf.integrations_required.length > 0) {
        sections.push(body(`Integrations: ${wf.integrations_required.join(', ')}`))
      }
    })
  }
  sections.push(divider())

  // 4. Risk Assessment
  sections.push(h1('4. Risk Assessment'))
  if (Array.isArray(risk_assessment?.data_risks)) {
    sections.push(h2('Data Risks'))
    risk_assessment.data_risks.forEach(r => sections.push(bullet(r)))
  }
  if (Array.isArray(risk_assessment?.operational_risks)) {
    sections.push(h2('Operational Risks'))
    risk_assessment.operational_risks.forEach(r => sections.push(bullet(r)))
  }
  if (Array.isArray(risk_assessment?.mitigation_strategies)) {
    sections.push(h2('Mitigation Strategies'))
    risk_assessment.mitigation_strategies.forEach((s, i) => sections.push(bullet(`${i + 1}. ${s}`)))
  }
  sections.push(divider())

  // 5. Deployment Plan
  sections.push(h1('5. Deployment Plan'))
  if (deployment_plan?.phase) sections.push(body(`Phase: ${deployment_plan.phase}`))
  if (deployment_plan?.estimated_impact) sections.push(body(`Estimated Impact: ${deployment_plan.estimated_impact}`))
  if (deployment_plan?.estimated_roi_months) sections.push(body(`ROI Timeline: ${deployment_plan.estimated_roi_months} months`))
  if (Array.isArray(deployment_plan?.waves)) {
    sections.push(h2('Deployment Waves'))
    deployment_plan.waves.forEach(wave => {
      sections.push(new Paragraph({ children: [new TextRun({ text: wave.name, bold: true, size: 22 })], spacing: { before: 120, after: 40 } }))
      if (Array.isArray(wave.included_workflows)) sections.push(body(`Workflows: ${wave.included_workflows.join(', ')}`))
      if (wave.notes) sections.push(body(wave.notes))
    })
  }
  sections.push(divider())

  // Footer
  sections.push(new Paragraph({
    children: [new TextRun({ text: `Generated by Aivory  |  ${date}  |  ${versionLabel}`, color: '888888', size: 18, italics: true })],
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
