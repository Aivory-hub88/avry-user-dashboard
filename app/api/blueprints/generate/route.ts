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

function extractSseContent(raw: string): string {
  return raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => {
      try {
        const data = JSON.parse(line.slice(6))
        return data.type === 'chunk' ? data.content || '' : ''
      } catch {
        return ''
      }
    })
    .join('')
    .trim()
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

  const fallbackScore = scores.overall ?? scores.ai_readiness_score ?? 0
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
        { metric: 'AI readiness', target: 'Improve readiness through prioritized automation initiatives' }
      ]
    },
    system_architecture: {
      data_sources: ['Diagnostic context'],
      processing_layers: ['VPS Bridge', 'Zeroclaw AI Gateway'],
      decision_engine: 'AI-assisted blueprint generation',
      memory_layer: 'Supabase blueprint storage',
      execution_layer: ['Aivory Console']
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
              content: `Generate an AI system blueprint from this diagnostic data. Return a complete blueprint.\n\n${JSON.stringify(diagnostic)}`
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
    const content = extractSseContent(raw)
    const data = parseBlueprintContent(content) || buildBlueprintFromText(content, diagnostic)

    return Response.json(data)

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
