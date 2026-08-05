import { NextRequest, NextResponse } from 'next/server';
import { SERVICES } from '@/config/services';
import type { AiryRoadmap } from '@/types/roadmap';
import { formatLocalAmount, parseCurrencyCode } from '@/lib/resultFormatters';

/**
 * The fallback roadmap's KPI targets used to be hardcoded placeholders
 * ("3x investment", "40%", "10+ hours") that read to a user exactly like
 * computed figures even though this path only runs when the AI call
 * failed. Ground them in the diagnostic engine's own fields when present;
 * fall back to qualitative language (never an invented number) otherwise.
 * See §1.6 row 11 of DEEP-DIAGNOSTIC-EXPERIENCE-V2-PLANNING.md.
 */
function deriveFallbackKpiTargets(diagnosticContext: Record<string, any>) {
  const calc = diagnosticContext?.calculations;
  const quant = diagnosticContext?.quantitative;
  const currencyCode = parseCurrencyCode(diagnosticContext?.currency);

  const hoursSavedPerWeek = typeof calc?.hoursReclaimedPerYear === 'number'
    ? `${Math.max(1, Math.round(calc.hoursReclaimedPerYear / 52))}+ hours`
    : 'Meaningful reduction in manual hours';

  const automationCoverage = typeof quant?.targetAutomationPct === 'number'
    ? `${quant.targetAutomationPct}%`
    : 'Increased automation coverage';

  const roiOutcome = typeof calc?.netThreeYearROIPercent === 'number'
    ? `${Math.max(0, Math.round(calc.netThreeYearROIPercent))}% 3-yr ROI`
    : typeof calc?.totalAnnualSavingsLocal === 'number'
      ? `${formatLocalAmount(calc.totalAnnualSavingsLocal, currencyCode)}/yr savings`
      : 'Positive return on automation investment';

  return { hoursSavedPerWeek, automationCoverage, roiOutcome };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const source: string = body.source ?? 'direct';
    const blueprintId: string | undefined = body.blueprintId;
    const diagnosticContext: Record<string, any> = body.diagnosticContext ?? {};
    const blueprintContext: Record<string, any> = body.blueprintContext ?? {};
    const locale: 'en' | 'id' = body.locale === 'id' ? 'id' : 'en';

    // Build a prompt for Aivory to generate a structured roadmap
    const contextParts: string[] = [];

    if (diagnosticContext && Object.keys(diagnosticContext).length > 0) {
      contextParts.push(`DIAGNOSTIC RESULTS:\n${JSON.stringify(diagnosticContext, null, 2)}`);
    }

    if (blueprintContext && Object.keys(blueprintContext).length > 0) {
      contextParts.push(`BLUEPRINT DATA:\n${JSON.stringify(blueprintContext, null, 2)}`);
    }

    if (contextParts.length === 0) {
      contextParts.push('No diagnostic or blueprint data provided. Generate a generic business operations transformation roadmap for an SME.');
    }

    const prompt = `You are a business operations transformation consultant. Based on the following context, generate a phased transformation roadmap, with AI positioned as the execution layer where it accelerates the plan.

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

Generate 3-4 phases. Each phase should have 2-4 milestones and 2-3 KPIs. Be specific and actionable.

GROUNDING RULES (do not violate): every KPI "target" value must trace back to a field that is actually present in the DIAGNOSTIC RESULTS or BLUEPRINT DATA above — do not invent a number. Prefer these pre-computed fields verbatim, never recompute or approximate them: "calculations.totalAnnualSavingsLocal", "calculations.paybackMonths"/"netPaybackMonths", "calculations.threeYearROIPercent"/"netThreeYearROIPercent", "calculations.hoursReclaimedPerYear", and "quantitative.targetAutomationPct"/"currentAutomationPct" (the user's own answers). If none of these fields are present in the context above for a given KPI, use qualitative language (e.g. "meaningful reduction in manual hours") instead of a specific invented number.${locale === 'id' ? `

LANGUAGE: Write every freeform narrative/text field VALUE in formal Bahasa Indonesia (business register) — this includes "title", "phases[].name", "phases[].timeframe", "phases[].description", "phases[].milestones[].title/description", and "phases[].kpis[].label/target". Do NOT translate the fixed "id" slug fields ("phases[].id", "milestones[].id", "kpis[].id") — keep those exactly as specified in the schema. Currency figures and dollar amounts stay as-is (do not convert currency).` : ''}`;

    // Call Zeroclaw/VPS Bridge
    let roadmap: AiryRoadmap;

    try {
      const aiRes = await fetch(`${SERVICES.VPS_BRIDGE}/console/stream`, {
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

      // Bridge /console/stream returns SSE (data: {type:'chunk',content}) — accumulate it
      const sseText = await aiRes.text();
      let rawText = '';
      for (const line of sseText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt && typeof evt.content === 'string') rawText += evt.content;
        } catch { /* ignore non-JSON SSE lines */ }
      }

      // Extract JSON from the response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');

      const parsed = JSON.parse(jsonMatch[0]) as Partial<AiryRoadmap>;

      roadmap = {
        id: parsed.id || `roadmap-${Date.now()}`,
        title: parsed.title || 'Transformation Roadmap',
        createdAt: new Date().toISOString(),
        source: source as AiryRoadmap['source'],
        blueprintId,
        phases: Array.isArray(parsed.phases) ? parsed.phases : [],
      };
    } catch (aiErr) {
      // Fallback: generate a sensible default roadmap if AI call fails
      console.error('[roadmap/generate] AI call failed, using fallback:', aiErr);
      roadmap = buildFallbackRoadmap(source, blueprintId, diagnosticContext);
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

function buildFallbackRoadmap(source: string, blueprintId?: string, diagnosticContext: Record<string, any> = {}): AiryRoadmap {
  const kpiTargets = deriveFallbackKpiTargets(diagnosticContext);
  return {
    id: `roadmap-${Date.now()}`,
    title: 'Transformation Roadmap',
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
          { id: 'kpi-1-2', label: 'Time saved per week', target: kpiTargets.hoursSavedPerWeek },
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
          { id: 'kpi-2-2', label: 'Automation coverage', target: kpiTargets.automationCoverage },
        ],
      },
      {
        id: 'phase-3',
        name: 'Optimise & Measure',
        timeframe: 'Month 7–12',
        description: 'Refine workflows based on data, measure ROI, and plan next expansion.',
        milestones: [
          { id: 'm-3-1', title: 'Review KPI performance and optimise workflows', linkedWorkflowIds: [] },
          { id: 'm-3-2', title: 'Identify next automation opportunities', linkedWorkflowIds: [] },
          { id: 'm-3-3', title: 'Document learnings and update roadmap', linkedWorkflowIds: [] },
        ],
        kpis: [
          { id: 'kpi-3-1', label: 'ROI achieved', target: kpiTargets.roiOutcome },
          { id: 'kpi-3-2', label: 'Team AI adoption rate', target: '80%' },
        ],
      },
    ],
  };
}
