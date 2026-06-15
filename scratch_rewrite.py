import re

with open('/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/lib/blueprintExport.ts', 'r') as f:
    content = f.read()

new_imports = """
import type { BlueprintV1 } from '@/types/blueprint'
import {
  applyPremiumCovers, loadManrope, pageBg, pageFooter, sectionLabel,
  renderNarrative, spacedText, thinDiv, setC,
  INK, MUTED, LABEL, TRACK, RULE, CONTENT_C,
  PAGE_W, PAGE_H, ML, MR, CW, F, FB
} from '@/lib/pdfExport'
"""

new_export_pdf = """
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
  await applyPremiumCovers(doc, 'front', 'AI System\\nBlueprint', {
    company: companyName,
    date: date,
    eyebrow: 'AIVORY \u00b7 OUTPUT REPORT',
    reportId: `BP-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-001`
  })
  
  doc.addPage()
  pageBg(doc)
  pageNum++
  y = ML

  // ── 1. Strategic Objective ──────────────────────────────
  y = sectionLabel(doc, y, '1. Strategic Objective')
  if (strategic_objective?.primary_goal) {
    y = renderNarrative(doc, y, strategic_objective.primary_goal)
  }
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
  if (system_architecture?.decision_engine) {
    h2('Decision Engine')
    y = renderNarrative(doc, y, system_architecture.decision_engine)
    gap()
  }
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
  if (Array.isArray(risk_assessment?.data_risks) && risk_assessment.data_risks.length > 0) {
    h2('Data Risks')
    risk_assessment.data_risks.forEach(r => bullet(r))
    gap()
  }
  if (Array.isArray(risk_assessment?.operational_risks) && risk_assessment.operational_risks.length > 0) {
    h2('Operational Risks')
    risk_assessment.operational_risks.forEach(r => bullet(r))
    gap()
  }
  if (Array.isArray(risk_assessment?.mitigation_strategies) && risk_assessment.mitigation_strategies.length > 0) {
    h2('Mitigation Strategies')
    risk_assessment.mitigation_strategies.forEach((s, i) => bullet(`${i + 1}. ${s}`))
  }
  gap(6)

  // ── 5. Deployment Plan ──────────────────────────────────
  checkPage(20)
  y = sectionLabel(doc, y, '5. Deployment Plan')
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
"""

content = re.sub(r"import type \{ BlueprintV1 \} from '@/types/blueprint'.*?import \{ applyPremiumCovers \} from '@/lib/pdfExport'", new_imports.strip(), content, flags=re.DOTALL)

content = re.sub(r"export async function exportBlueprintPDF\(.*?\n// ── DOCX export ───────────────────────────────────────────", new_export_pdf.strip() + "\n\n// ── DOCX export ───────────────────────────────────────────", content, flags=re.DOTALL)

with open('/Users/ireichmann/Documents/Aivory V2/frontend/avry-user-dashboard/lib/blueprintExport.ts', 'w') as f:
    f.write(content)

