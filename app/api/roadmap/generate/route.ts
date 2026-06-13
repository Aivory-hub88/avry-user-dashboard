import { NextRequest, NextResponse } from 'next/server';
import { SERVICES } from '@/config/services';
import type { AiryRoadmap } from '@/types/roadmap';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const source: string = body.source ?? 'direct';
    const blueprintId: string | undefined = body.blueprintId;
    const diagnosticContext: Record<string, any> = body.diagnosticContext ?? {};
    const blueprintContext: Record<string, any> = body.blueprintContext ?? {};

    // Build a prompt for AIRA to generate a structured roadmap
    const contextParts: string[] = [];

    if (diagnosticContext && Object.keys(diagnosticContext).length > 0) {
      contextParts.push(`DIAGNOSTIC RESULTS:\n${JSON.stringify(diagnosticContext, null, 2)}`);
    }

    if (blueprintContext && Object.keys(blueprintContext).length > 0) {
      contextParts.push(`BLUEPRINT DATA:\n${JSON.stringify(blueprintContext, null, 2)}`);
    }

    if (contextParts.length === 0) {
      contextParts.push('No diagnostic or blueprint data provided. Generate a generic AI adoption roadmap for an SME.');
    }

    const prompt = `You are an AI strategy consultant. Based on the following context, generate a phased AI implementation roadmap.

${contextParts.join('\n\n')}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "id": "<uuid>",
  "title": "<roadmap title>",
  "createdAt": "<ISO timestamp>",
  "phases": [
    {
      "id": "phase-1",
      "name": "<phase name>",
      "timeframe": "<e.g. Month 1-3>",
      "description": "<brief description>",
      "milestones": [
        {
          "id": "m-1-1",
          "title": "<milestone title>",
          "description": "<optional detail>",
          "linkedWorkflowIds": []
        }
      ],
      "kpis": [
        {
          "id": "kpi-1-1",
          "label": "<metric name>",
          "target": "<target value>"
        }
      ]
    }
  ]
}

Generate 3-4 phases. Each phase should have 2-4 milestones and 2-3 KPIs. Be specific and actionable.`;

    // Call Zeroclaw/VPS Bridge
    let roadmap: AiryRoadmap;

    try {
      const aiRes = await fetch(`${SERVICES.VPS_BRIDGE}/api/console/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          session_id: `roadmap-${Date.now()}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!aiRes.ok) {
        throw new Error(`AI service returned ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const rawText: string = aiData.response || aiData.content || aiData.message || '';

      // Extract JSON from the response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');

      const parsed = JSON.parse(jsonMatch[0]) as Partial<AiryRoadmap>;

      roadmap = {
        id: parsed.id || `roadmap-${Date.now()}`,
        title: parsed.title || 'AI Implementation Roadmap',
        createdAt: new Date().toISOString(),
        source: source as AiryRoadmap['source'],
        blueprintId,
        phases: Array.isArray(parsed.phases) ? parsed.phases : [],
      };
    } catch (aiErr) {
      // Fallback: generate a sensible default roadmap if AI call fails
      console.error('[roadmap/generate] AI call failed, using fallback:', aiErr);
      roadmap = buildFallbackRoadmap(source, blueprintId);
    }

    return NextResponse.json({ success: true, roadmap });
  } catch (err: any) {
    console.error('[roadmap/generate]', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Failed to generate roadmap' },
      { status: 500 }
    );
  }
}

function buildFallbackRoadmap(source: string, blueprintId?: string): AiryRoadmap {
  return {
    id: `roadmap-${Date.now()}`,
    title: 'AI Implementation Roadmap',
    createdAt: new Date().toISOString(),
    source: source as AiryRoadmap['source'],
    blueprintId,
    phases: [
      {
        id: 'phase-1',
        name: 'Foundation & Quick Wins',
        timeframe: 'Month 1–3',
        description: 'Establish data infrastructure and deploy first automation workflows.',
        milestones: [
          { id: 'm-1-1', title: 'Audit existing data sources and integrations', linkedWorkflowIds: [] },
          { id: 'm-1-2', title: 'Deploy first automated workflow (highest ROI)', linkedWorkflowIds: [] },
          { id: 'm-1-3', title: 'Train team on AI tools and processes', linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-1-1', label: 'Manual tasks automated', target: '3+' },
          { id: 'kpi-1-2', label: 'Time saved per week', target: '10+ hours' },
        ],
      },
      {
        id: 'phase-2',
        name: 'Scale & Integrate',
        timeframe: 'Month 4–6',
        description: 'Expand automation coverage and integrate AI into core business processes.',
        milestones: [
          { id: 'm-2-1', title: 'Connect CRM and communication tools', linkedWorkflowIds: [] },
          { id: 'm-2-2', title: 'Deploy AI-assisted decision workflows', linkedWorkflowIds: [] },
          { id: 'm-2-3', title: 'Establish monitoring and alerting', linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-2-1', label: 'Workflows in production', target: '5+' },
          { id: 'kpi-2-2', label: 'Automation coverage', target: '40%' },
        ],
      },
      {
        id: 'phase-3',
        name: 'Optimize & Measure',
        timeframe: 'Month 7–12',
        description: 'Refine workflows based on data, measure ROI, and plan next expansion.',
        milestones: [
          { id: 'm-3-1', title: 'Review KPI performance and optimize workflows', linkedWorkflowIds: [] },
          { id: 'm-3-2', title: 'Identify next automation opportunities', linkedWorkflowIds: [] },
          { id: 'm-3-3', title: 'Document learnings and update roadmap', linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-3-1', label: 'ROI achieved', target: '3x investment' },
          { id: 'kpi-3-2', label: 'Team AI adoption rate', target: '80%' },
        ],
      },
    ],
  };
}
