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

function buildBlueprintFromText(content: string, diagnostic: any): BlueprintV1 {
  const company = typeof diagnostic?.company === 'string' && diagnostic.company.trim()
    ? diagnostic.company
    : 'Aivory Organization'
  const qualitative = diagnostic?.qualitative || {}
  const scores = diagnostic?.scores || {}
  const opportunities = Array.isArray(diagnostic?.opportunities) ? diagnostic.opportunities : []
  const risks = Array.isArray(diagnostic?.risks) ? diagnostic.risks : []

  // ── Try to extract structured fields from the markdown LLM output ──────────
  // The LLM tends to write headers like "**Maturity Level:** Optimizing (Score: 80/100)"
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
          target: 'Improve through prioritized automation initiatives',
          expected_impact: 'Higher automation coverage and reduced manual workload'
        }
      ]
    },
    system_architecture: {
      data_sources: ['Business context'],
      processing_layers: ['Aivory Workflow Builder'],
      decision_engine: 'Rule-based routing with AI-assisted decisions',
      memory_layer: 'Centralized operational data store',
      execution_layer: ['Built with Aivory Workflow Builder, deployed to n8n for execution']
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
      estimated_impact: 'Prioritized AI implementation plan generated from diagnostic results',
      estimated_roi_months: 6,
      waves: [
        { name: 'Validation', included_workflows: [], notes: 'Validate blueprint assumptions with stakeholders' }
      ]
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json() as { diagnostic?: any; diagnostic_data?: any }
    const diagnostic = body.diagnostic || body.diagnostic_data

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

IMPORTANT: The diagnostic includes a "roomForImprovement" array — each item has the area, the recommended action, its operational impact, and a concrete before/after. Use these improvement items to shape the blueprint's workflows, deployment phases, and expected operational outcomes (map each high-priority improvement to at least one workflow or phase). If the diagnostic includes an "ai_analysis" object (summary, strengths, constraints, automation_opportunities, recommended_next_step), treat it as prior analysis of this organization and keep the blueprint consistent with it. Make sure to map the exact "composite" score and "maturityLevel" from the diagnostic data to "ai_readiness_score" and "maturity_level".

KPI TARGETS: For each kpi_targets entry, "current" is the baseline value taken from the diagnostic data (e.g. "$4.20 per ticket", "22% automation coverage"), "target" is the goal value (e.g. "$1.80 per ticket"), and "expected_impact" is the BUSINESS OUTCOME of reaching that target (e.g. "~57% lower support cost, ≈$22,500/yr saved") — expected_impact must NEVER be a copy of the target value.

ARCHITECTURE GROUNDING: Aivory's actual product suite is: Deep Diagnostic (business operations scoring), Transformation Blueprint, Transformation Roadmap, AI Console (assistant), Workflow Builder (designs automation workflows from natural language and DEPLOYS THEM TO n8n — automations execute on n8n, not on Aivory), Agents, Automation Templates, and Connectors (Slack, WhatsApp, Telegram, Gmail, HubSpot, Notion, Salesforce, and similar). The system_architecture must be honest and grounded in this reality: "processing_layers" should name the client's real processing needs (e.g. intent classification, data validation) plus "Aivory Workflow Builder" where workflow design fits; "decision_engine" describes the client's decision logic (rules, LLM-assisted routing); "execution_layer" must lead with exactly "Built with Aivory Workflow Builder, deployed to n8n for execution" as its first item, followed by the specific Connectors/integrations needed (each as a short, plain phrase). Recommend third-party tools by name where they genuinely fit (n8n, a CRM API, a helpdesk platform). Do NOT invent Aivory products that do not exist (there is no "Aivory Workflow Engine" runtime and no "Aivory High Intelligence Deterministic Engine" in the client's architecture), and do not mention VPS Bridge or Zeroclaw.

DEPLOYMENT WAVES: In deployment_plan.waves, "included_workflows" must contain the exact "name" values of workflows from workflow_modules (human-readable names, never workflow_id codes).

If the diagnostic data contains no risks (the risks array is empty or missing), do NOT hallucinate or invent risks. You MUST return empty arrays for data_risks, operational_risks, and mitigation_strategies.

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
