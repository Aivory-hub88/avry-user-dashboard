/**
 * API Route: POST /api/blueprints/generate
 * 
 * Generates a new blueprint version based on diagnostic results.
 * This route acts as a secure proxy to the VPS bridge, ensuring API keys
 * are not exposed to the frontend.
 * 
 * Requirements: 1.1, 1.2, 4.1, 4.2, 5.3, 5.6, 5.8
 */

import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'
import { createErrorResponse } from '@/types/errors'
import type { BlueprintV1 } from '@/types/blueprint'
import { formatLocalAmount, parseCurrencyCode } from '@/lib/resultFormatters'

export const maxDuration = 120

function extractSseContent(raw: string): { content: string; error: string | null } {
  let error: string | null = null
  const content = raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => {
      try {
        const data = JSON.parse(line.slice(6))
        // Surface error events instead of silently dropping them — a failed
        // generation used to look identical to an empty success here.
        if (data.type === 'error' && !error) {
          error = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        }
        return data.type === 'chunk' ? data.content || '' : ''
      } catch {
        return ''
      }
    })
    .join('')
    .trim()
  return { content, error }
}

function parseBlueprintContent(content: string): BlueprintV1 | null {
  try {
    return JSON.parse(content) as BlueprintV1
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return JSON.parse(match[1] || match[0]) as BlueprintV1
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
function deriveEstimatedRoiMonths(diagnostic: any): number {
  const calc = diagnostic?.calculations
  const months = calc?.netPaybackMonths ?? calc?.paybackMonths
  if (typeof months === 'number' && isFinite(months) && months > 0) {
    return Math.max(1, Math.round(months))
  }
  return 6
}

function buildBlueprintFromText(content: string, diagnostic: any): BlueprintV1 {
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

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json() as { diagnostic?: any; diagnostic_data?: any; locale?: 'en' | 'id' }
    const diagnostic = body.diagnostic || body.diagnostic_data
    const locale = body.locale === 'id' ? 'id' : 'en'

    if (!diagnostic) {
      return Response.json(
        createErrorResponse(
          'ValidationError',
          'Missing required fields',
          {
            required: ['diagnostic'],
            received: Object.keys(body)
          }
        ),
        { status: 400 }
      )
    }

    // Get VPS bridge configuration
    const config = getConfig()

    // Forward request to VPS bridge with 120s timeout (blueprint generation is slow)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(`${config.VPS_BRIDGE_URL}/blueprint/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Generate a transformation blueprint from this diagnostic data. Return a complete blueprint in strict JSON format. Do not include markdown formatting or wrappers like \`\`\`json. The JSON MUST match this TypeScript interface exactly:
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
${JSON.stringify(diagnostic)}`
            }
          ]
        }),
        signal: controller.signal
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return Response.json(
          createErrorResponse('TimeoutError', 'Blueprint generation timed out. Please try again.'),
          { status: 504 }
        )
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    // Handle VPS bridge errors
    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: 'Unknown error', message: 'Failed to parse error response' }
      }

      return Response.json(
        createErrorResponse(
          errorData.error || 'ServiceError',
          errorData.message || 'VPS bridge request failed',
          errorData.details
        ),
        { status: response.status }
      )
    }

    const raw = await response.text()
    const { content, error: sseError } = extractSseContent(raw)

    // A generation failure must be a visible failure, not a silent template.
    // Previously an SSE error event or empty stream fell through to
    // buildBlueprintFromText with empty text, producing a generic canned
    // blueprint that looked like a real AI result.
    if (!content) {
      return Response.json(
        createErrorResponse(
          'GenerationError',
          'Blueprint generation failed. Please try again.',
          sseError ? { upstream: sseError } : undefined
        ),
        { status: 502 }
      )
    }

    const parsed = parseBlueprintContent(content)
    if (parsed) {
      // Architecture Principle 2 ("the LLM never computes... must never be
      // the source of a number that reaches the page") — enforced here, not
      // just requested in the prompt below, so it holds regardless of what
      // the model actually returned. See §1.6 row 11 of
      // DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md.
      if (parsed.deployment_plan) {
        parsed.deployment_plan.estimated_roi_months = deriveEstimatedRoiMonths(diagnostic)
      }
      return Response.json(parsed)
    }

    // The model returned prose instead of JSON — salvage what we can, but
    // mark the result so the UI can tell the user this is a simplified
    // fallback rather than a full AI-generated blueprint.
    const fallback = buildBlueprintFromText(content, diagnostic)
    return Response.json({ ...fallback, fallback_generated: true })

  } catch (error) {
    // Handle configuration errors
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return Response.json(
        createErrorResponse(
          'ConfigurationError',
          'Server configuration error',
          { message: error.message }
        ),
        { status: 500 }
      )
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        createErrorResponse(
          'NetworkError',
          'Service temporarily unavailable. Please try again.',
          { message: error.message }
        ),
        { status: 503 }
      )
    }

    // Handle unexpected errors
    console.error('Blueprint generation error:', error)
    return Response.json(
      createErrorResponse(
        'InternalError',
        'An unexpected error occurred',
        { message: error instanceof Error ? error.message : 'Unknown error' }
      ),
      { status: 500 }
    )
  }
}
