/**
 * Blueprint generation — prompt building + result parsing, shared by the
 * enqueue route (app/api/blueprints/generate/route.ts) and the poll route
 * (app/api/blueprints/result/[jobId]/route.ts). Extracted out of the old
 * single synchronous route.ts when blueprint generation moved to the async
 * enqueue+poll pattern (2026-08-09) — see lib/blueprintQueue.js on the VPS
 * bridge for why: a single held HTTP request through Cloudflare can't
 * survive the ~100-120s edge timeout, but real generation takes 1-5+ minutes.
 */

import type { BlueprintV1, BlueprintV1DeploymentPlan } from '@/types/blueprint'
import { formatLocalAmount, parseCurrencyCode } from '@/lib/resultFormatters'

/**
 * The diagnostic object contains duplicated EN/ID projections, score-driver
 * explanations, and UI-only fields that can push the blueprint prompt above
 * 40 KB. Keep the evidence the blueprint model needs, but do not send the
 * entire browser storage object verbatim. This reduces latency and the chance
 * of hitting provider context/output timeouts without changing the blueprint
 * contract or the ROI source-of-truth.
 */
export function compactDiagnosticForBlueprint(diagnostic: any): Record<string, unknown> {
  const scores = diagnostic?.scores ?? {}
  const qualitative = diagnostic?.qualitative ?? {}
  const quantitative = diagnostic?.quantitative ?? {}
  const calculations = diagnostic?.calculations ?? {}
  const risks = Array.isArray(diagnostic?.risks) ? diagnostic.risks : []
  const opportunities = Array.isArray(diagnostic?.opportunities) ? diagnostic.opportunities : []
  const improvements = Array.isArray(diagnostic?.roomForImprovement) ? diagnostic.roomForImprovement : []

  return {
    diagnostic_id: diagnostic?.diagnostic_id,
    company: diagnostic?.company,
    currency: diagnostic?.currency,
    scores: {
      composite: scores.composite,
      maturityLevel: scores.maturityLevel,
      strategy: scores.strategy,
      data: scores.data,
      process: scores.process,
      people: scores.people,
      governance: scores.governance,
      security: scores.security,
    },
    qualitative: {
      industry: qualitative.industry,
      primaryObjective: qualitative.primaryObjective,
      topPainPoints: qualitative.topPainPoints,
      kpiBaseline: qualitative.kpiBaseline,
      processOwnership: qualitative.processOwnership,
      implementApproach: qualitative.implementApproach,
      leadershipAlignment: qualitative.leadershipAlignment,
    },
    quantitative: {
      timelineMonths: quantitative.timelineMonths,
      fteCountInScope: quantitative.fteCountInScope,
      currentAutomationPct: quantitative.currentAutomationPct,
      targetAutomationPct: quantitative.targetAutomationPct,
      totalManualHoursWeekly: quantitative.totalManualHoursWeekly,
      budgetMidpointUSD: quantitative.budgetMidpointUSD,
    },
    calculations: {
      paybackMonths: calculations.paybackMonths,
      netPaybackMonths: calculations.netPaybackMonths,
      totalAnnualSavingsLocal: calculations.totalAnnualSavingsLocal,
      annualLaborSavingsLocal: calculations.annualLaborSavingsLocal,
      threeYearROIPercent: calculations.threeYearROIPercent,
      netThreeYearROIPercent: calculations.netThreeYearROIPercent,
      missingInputs: calculations.missingInputs,
    },
    risks: risks.slice(0, 8).map((risk: any) => ({
      title: risk?.title ?? risk?.risk ?? risk?.name,
      severity: risk?.severity,
      detected: risk?.detected,
    })),
    opportunities: opportunities.slice(0, 8).map((opportunity: any) => ({
      id: opportunity?.id,
      title: opportunity?.title ?? opportunity?.name,
      impact: opportunity?.impact,
      effort: opportunity?.effort,
      priority: opportunity?.priority,
      dataReadiness: opportunity?.dataReadiness,
      prerequisites: opportunity?.prerequisites,
    })),
    roomForImprovement: improvements.slice(0, 8).map((item: any) => ({
      area: item?.area,
      title: item?.title,
      priority: item?.priority,
      currentState: item?.currentState,
      recommendedAction: item?.recommendedAction,
      operationalImpact: item?.operationalImpact,
      before: item?.before,
      after: item?.after,
    })),
    ai_analysis: diagnostic?.ai_analysis
      ? {
          summary: diagnostic.ai_analysis.summary,
          strengths: diagnostic.ai_analysis.strengths,
          constraints: diagnostic.ai_analysis.constraints,
          automation_opportunities: diagnostic.ai_analysis.automation_opportunities,
          recommended_next_step: diagnostic.ai_analysis.recommended_next_step,
        }
      : undefined,
  }
}

export function buildBlueprintPrompt(diagnostic: any, locale: 'en' | 'id'): string {
  return `Generate a transformation blueprint from this diagnostic data. Return a complete blueprint in strict JSON format. Do not include markdown formatting or wrappers like \`\`\`json. The JSON MUST match this TypeScript interface exactly:
interface BlueprintV1 {
  blueprint_id: string;
  version: string;
  status: 'draft' | 'published';
  organization: { name: string; industry: string; size: string };
  diagnostic_summary: { ai_readiness_score: number; maturity_level: string; primary_constraints: string[] };
  strategic_objective: { primary_goal: string; kpi_targets: { metric: string; current: string; target: string; expected_impact: string }[] };
  system_architecture: { data_sources: string[]; processing_layers: string[]; decision_engine: string; memory_layer: string; execution_layer: string[] };
  workflow_modules: { workflow_id: string; name: string; trigger: string; steps: { type: string; action: string }[]; integrations_required: string[] }[];
  risk_assessment: { data_risks: string[]; operational_risks: string[]; mitigation_strategies: string[] };
  deployment_plan: { phase: string; estimated_impact: string; estimated_roi_months: number; waves: { name: string; included_workflows: string[]; notes: string }[] };
}

IMPORTANT: The diagnostic includes a "roomForImprovement" array — each item has the area, the recommended action, its operational impact, and a concrete before/after. Use these improvement items to shape the blueprint's workflows, deployment phases, and expected operational outcomes (map each high-priority improvement to at least one workflow or phase). If the diagnostic includes an "ai_analysis" object (summary, strengths, constraints, automation_opportunities, recommended_next_step), treat it as prior analysis of this organisation and keep the blueprint consistent with it. Make sure to map the exact "composite" score and "maturityLevel" from the diagnostic data to "ai_readiness_score" and "maturity_level".

KPI TARGETS: Every kpi_targets entry must be grounded in a field that actually exists in the Diagnostic Data below — never invent a number. Prefer these pre-computed fields verbatim, do not recalculate or approximate them: "calculations.totalAnnualSavingsLocal", "calculations.annualLaborSavingsLocal", "calculations.paybackMonths"/"netPaybackMonths", "calculations.threeYearROIPercent"/"netThreeYearROIPercent". Where the user answered a concrete quantitative field directly (e.g. "quantitative.costCurrentPerTicket"/"costTargetPerTicket", "quantitative.currentAutomationPct"/"targetAutomationPct"), use those verbatim too. "current" is the real baseline value, "target" is the goal state, and "expected_impact" is the business outcome in plain language, citing the engine's own savings/ROI figures where relevant — expected_impact must NEVER be a copy of the target value. If none of the fields above are present for a given metric, use qualitative language (e.g. "meaningful reduction in manual cost") instead of a specific invented figure.

NOTE: "deployment_plan.estimated_roi_months" is overwritten server-side from "calculations.paybackMonths" after generation — estimate it for internal narrative consistency if you like, but it is not the number that reaches the user.

ARCHITECTURE GROUNDING: Describe system_architecture at the business-capability level only — Data → Understand → Decide → Act — never at the technical/implementation level. "data_sources" names the client's real operational data inputs grounded in the diagnostic (business systems, customer records, workflow/ticketing history, tracking data, and other structured or unstructured sources) — plain business language, not a product name. "processing_layers" describes the client's data preparation needs in plain business language (e.g. validation, normalisation, classification, enrichment of data to prepare relevant information for operational processes). "decision_engine" describes how operational context is evaluated to determine priority, action, and handling path based on business policy — a business description, not a specific engine, model, or vendor. "execution_layer" describes how the decided actions are carried out in plain business language (automated workflows, communications, system integrations, operational alerts). Under NO circumstances name any internal Aivory product (Workflow Builder, Console, Agents, etc.), any underlying execution platform (e.g. n8n), or any specific third-party tool or vendor (e.g. Slack, WhatsApp, Telegram, Gmail, HubSpot, Notion, Salesforce) anywhere in system_architecture — refer to integrations only by business function (e.g. "customer communication channels", "CRM integration", "helpdesk system"). Do NOT invent fictitious Aivory product names either, and do not mention VPS Bridge or Zeroclaw.

DEPLOYMENT WAVES: In deployment_plan.waves, "included_workflows" must contain the exact "name" values of workflows from workflow_modules (human-readable names, never workflow_id codes).

If the diagnostic data contains no risks (the risks array is empty or missing), do NOT hallucinate or invent risks. You MUST return empty arrays for data_risks, operational_risks, and mitigation_strategies.
${locale === 'id' ? `
LANGUAGE: Write every freeform narrative/text field VALUE in formal Bahasa Indonesia (business register) — this includes "organization.industry", "diagnostic_summary.maturity_level", "diagnostic_summary.primary_constraints", "strategic_objective.primary_goal", "strategic_objective.kpi_targets[].metric/current/target/expected_impact", "system_architecture.data_sources/processing_layers/decision_engine/memory_layer/execution_layer", "workflow_modules[].name/trigger/steps[].action/integrations_required", "risk_assessment.data_risks/operational_risks/mitigation_strategies", and "deployment_plan.phase/estimated_impact/waves[].name/notes". Do NOT translate fixed schema keys or literal enum values: "organization.size" ('micro'|'sme'|'mid-market'|'enterprise'), "status" ('draft'|'published'), "workflow_id" codes, and "steps[].type" ('ingestion'|'ai_processing'|'decision'|'execution'|'notification'|'human_review') must stay exactly as specified in the interface. Currency figures and dollar amounts stay as-is (do not convert currency).` : ''}

Diagnostic Data:
${JSON.stringify(compactDiagnosticForBlueprint(diagnostic))}`
}

/**
 * The model sometimes returns `deployment_plan` as an array of per-phase
 * objects (each with its own `phase`/`waves`/`estimated_roi_months`) instead
 * of the single object with one `waves` array the prompt's TypeScript
 * interface declares — a natural drift, since a real deployment plan does
 * have multiple phases, it just belongs in `waves`, not a top-level array.
 * Left unnormalized this silently breaks every downstream reader
 * (app/blueprint/page.tsx, lib/blueprintExport.ts, roadmap generation all
 * read `deployment_plan.phase`/`.waves` as a single object) and the
 * estimated_roi_months override below becomes a no-op — `Array.prototype`
 * doesn't serialize arbitrary named properties via JSON.stringify, so
 * setting `.estimated_roi_months` on an array is silently dropped.
 */
function normalizeDeploymentPlan(raw: any): BlueprintV1DeploymentPlan {
  if (!Array.isArray(raw)) {
    return {
      phase: typeof raw?.phase === 'string' ? raw.phase : 'Blueprint draft',
      estimated_impact: typeof raw?.estimated_impact === 'string' ? raw.estimated_impact : '',
      estimated_roi_months: typeof raw?.estimated_roi_months === 'number' ? raw.estimated_roi_months : 6,
      waves: Array.isArray(raw?.waves) ? raw.waves : [],
    }
  }

  const phases = raw.filter((p) => p && typeof p === 'object')
  const waves = phases.flatMap((p: any) => {
    if (Array.isArray(p.waves) && p.waves.length > 0) return p.waves
    // A phase with no waves of its own still carries useful information —
    // represent it as one wave named after the phase rather than dropping it.
    if (typeof p.phase === 'string') {
      return [{
        name: p.phase,
        included_workflows: [],
        notes: typeof p.estimated_impact === 'string' ? p.estimated_impact : '',
      }]
    }
    return []
  })
  const first = phases[0] || {}

  return {
    phase: typeof first.phase === 'string' ? first.phase : 'Blueprint draft',
    estimated_impact: phases
      .map((p: any) => (typeof p.estimated_impact === 'string' ? p.estimated_impact : ''))
      .filter(Boolean)
      .join(' '),
    estimated_roi_months: typeof first.estimated_roi_months === 'number' ? first.estimated_roi_months : 6,
    waves,
  }
}

export function parseBlueprintContent(content: string): BlueprintV1 | null {
  const normalize = (bp: BlueprintV1): BlueprintV1 => {
    if (bp && bp.deployment_plan !== undefined) {
      bp.deployment_plan = normalizeDeploymentPlan(bp.deployment_plan)
    }
    return bp
  }

  try {
    return normalize(JSON.parse(content) as BlueprintV1)
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return normalize(JSON.parse(match[1] || match[0]) as BlueprintV1)
    } catch {
      return null
    }
  }
}

/**
 * The one number in this route that must never come from an LLM or a
 * hardcoded constant when real data exists: derive it from the diagnostic
 * engine's own ROI projection (services/deepDiagnostic.ts `calculateROI`),
 * falling back to a generic default only when that projection genuinely
 * couldn't be computed (see §1.6 row 11 of DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md).
 */
export function deriveEstimatedRoiMonths(diagnostic: any): number {
  const calc = diagnostic?.calculations
  const months = calc?.netPaybackMonths ?? calc?.paybackMonths
  if (typeof months === 'number' && isFinite(months) && months > 0) {
    return Math.max(1, Math.round(months))
  }
  return 6
}

export function buildBlueprintFromText(content: string, diagnostic: any): BlueprintV1 {
  const company = typeof diagnostic?.company === 'string' && diagnostic.company.trim()
    ? diagnostic.company
    : 'Aivory Organisation'
  const qualitative = diagnostic?.qualitative || {}
  const scores = diagnostic?.scores || {}
  const opportunities = Array.isArray(diagnostic?.opportunities) ? diagnostic.opportunities : []
  const risks = Array.isArray(diagnostic?.risks) ? diagnostic.risks : []

  // ── Try to extract structured fields from the markdown LLM output ──────────
  // The LLM tends to write headers like "**Maturity Level:** Optimising (Score: 80/100)"
  // and "**Strategic Objectives** Transform operational efficiency through ...".
  const text = typeof content === 'string' ? content : ''
  const scoreMatch = text.match(/(?:Score|Readiness Score|AI Readiness)[^\d]{0,20}(\d{1,3})\s*\/\s*100/i)
    || text.match(/(\d{1,3})\s*\/\s*100/)
  const maturityMatch = text.match(/Maturity\s+Level[:\s*]+\s*(?:\*\*)?([A-Za-z][A-Za-z\s]{2,30}?)(?:\*\*|\(|\n|$)/i)

  // Extract the strategic objectives paragraph: between "Strategic Objectives" and the next "##" header
  const objectiveMatch = text.match(/Strategic Objectives?\*?\*?[:\s]*([\s\S]*?)(?=\n#{2,}|\*\*Current State|$)/i)
  const cleanedObjective = objectiveMatch
    ? objectiveMatch[1]
        .replace(/^[\s*#]+/, '')
        .replace(/\*\*/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
    : ''

  const fallbackScore = scores.composite ?? scores.overall ?? scores.ai_readiness_score ?? 0
  const extractedScore = scoreMatch ? Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10))) : fallbackScore
  const fallbackMaturity = scores.maturityLevel || 'Emerging'
  const extractedMaturity = maturityMatch ? maturityMatch[1].trim() : fallbackMaturity
  const fallbackObjective = qualitative.primaryObjective || 'Generate an AI implementation blueprint from the diagnostic.'
  const primaryGoal = cleanedObjective || fallbackObjective

  const currencyCode = parseCurrencyCode(diagnostic?.currency)
  const calc = diagnostic?.calculations || {}
  const roiKpi = typeof calc.totalAnnualSavingsLocal === 'number' && typeof calc.paybackMonths === 'number'
    ? {
        metric: 'Annual Operational Savings',
        current: formatLocalAmount(0, currencyCode),
        target: formatLocalAmount(calc.totalAnnualSavingsLocal, currencyCode),
        expected_impact: `Payback in ~${Math.round(calc.paybackMonths)} months, per the diagnostic's own ROI model`
      }
    : null

  return {
    blueprint_id: `BP_${Date.now()}`,
    version: '1',
    status: 'draft',
    organization: {
      name: company,
      industry: qualitative.industry || 'General',
      size: qualitative.companySize || 'sme'
    },
    diagnostic_summary: {
      ai_readiness_score: extractedScore,
      maturity_level: extractedMaturity,
      primary_constraints: risks.slice(0, 3).map((risk: any) =>
        typeof risk === 'string' ? risk : (risk?.title || risk?.name || risk?.description || 'Risk identified')
      )
    },
    strategic_objective: {
      primary_goal: primaryGoal,
      kpi_targets: [
        {
          metric: 'Operational Health Score',
          current: `${extractedScore}/100`,
          target: 'Improve through prioritised automation initiatives',
          expected_impact: 'Higher automation coverage and reduced manual workload'
        },
        ...(roiKpi ? [roiKpi] : [])
      ]
    },
    system_architecture: {
      data_sources: ['Business context'],
      processing_layers: ['Data validation and preparation'],
      decision_engine: 'Rule-based routing with AI-assisted decisions',
      memory_layer: 'Centralised operational data store',
      execution_layer: ['Automated workflows, communications, and system integrations']
    },
    workflow_modules: opportunities.slice(0, 3).map((opportunity: any, index: number) => ({
      workflow_id: `WF_${index + 1}`,
      name: typeof opportunity === 'string' ? opportunity : (opportunity?.title || opportunity?.name || `Workflow ${index + 1}`),
      trigger: 'Diagnostic opportunity selected',
      steps: [
        { type: 'ingestion', action: 'Collect relevant business context' },
        { type: 'ai_processing', action: 'Generate workflow recommendation' },
        { type: 'human_review', action: 'Review and approve implementation plan' }
      ],
      integrations_required: Array.isArray(opportunity?.integrations) ? opportunity.integrations : []
    })),
    risk_assessment: {
      data_risks: risks.slice(0, 3).map((risk: any) =>
        typeof risk === 'string' ? risk : (risk?.title || risk?.name || risk?.description || 'Risk identified')
      ),
      operational_risks: [],
      mitigation_strategies: ['Review generated blueprint before implementation']
    },
    deployment_plan: {
      phase: 'Blueprint draft',
      estimated_impact: 'Prioritised AI implementation plan generated from diagnostic results',
      estimated_roi_months: deriveEstimatedRoiMonths(diagnostic),
      waves: [
        { name: 'Validation', included_workflows: [], notes: 'Validate blueprint assumptions with stakeholders' }
      ]
    }
  }
}
